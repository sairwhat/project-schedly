import { preprocessImage } from "./image-processing";
import { PipelineLogger } from "./structured-logger";
import { incrementUsage, saveLimitSnapshot } from "./usage-counter";
import { OPENROUTER_KEYS, openRouterServiceFor, isOpenRouterEnabled } from "./openrouter-keys";
import { GEMINI_KEYS, geminiServiceFor } from "./gemini-keys";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

const GEMINI_GENERATE_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent";

/**
 * Confidence below this threshold triggers a single fallback vision-model
 * re-extraction. High-confidence results skip the fallback entirely, keeping
 * the common path to a single AI call.
 */
const CONFIDENCE_THRESHOLD = Number(process.env.AI_CONFIDENCE_THRESHOLD ?? 0.75);

/* ===== Vision Models (Image Understanding) =====
 * Ordered primary -> fallback. The fallback is ONLY used when the primary
 * errors out (rate limit / outage) — not on low confidence. Keeps the common
 * path to a single AI call for fast uploads.
 *
 * PRIMARY provider: Google Gemini (gemini-flash-latest) — fastest free vision
 * model we use (~3-10s responses vs ~49s on OpenRouter's free tier) with a
 * ~1,500 requests/day quota, so the common path stays quick.
 *
 * OpenRouter models below are the fallback chain, used only when Gemini is
 * exhausted or down (OpenRouter free tier: ~50 requests/day). */
const VISION_MODELS = [
  "google/gemma-4-26b-a4b-it:free",                        // Fallback (fast, accurate)
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",    // Last resort (only on errors)
];

/* ===== Validation/Reasoning Models =====
 * Used only as a last resort when the vision model fails to produce a usable
 * result (no classes at all). Primary is a reasoning model, Gemma as fallback.
 * (Note: `tencent/hy3:free` no longer exists on OpenRouter and was removed.) */
const VALIDATION_MODELS = [
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free", // Primary (reasoning)
  "google/gemma-4-26b-a4b-it:free",                      // Fallback
];

const RETRY_DELAYS = [1000];

/**
 * Single, concise extraction prompt. Day abbreviation expansion is delegated to
 * the deterministic normalizer (src/server/lib/day-normalizer.ts), so the model
 * only returns raw day tokens — shrinking its failure surface and token usage.
 * One pass, low latency.
 */
const SCHEDULE_EXTRACTION_PROMPT = `Treat the uploaded image as a structured class schedule, not plain OCR text. Analyze the complete table layout (rows, columns, merged cells, headers, relationships) first, then extract only valid class entries.

UNIQUE KEY: a class is (subject + room + startTime + endTime). If the same class meets on multiple days with identical room and time, MERGE the days into one record's days array — never create duplicate records. Only split when time or room differs.

Parse day tokens in ANY format (M, T, W, TH, F, SAT, SUN, MW, TF, TTH, MWF, MTW, etc.) and return them as a days ARRAY of raw tokens (e.g. ["MWF"], ["TTH"]). Do NOT expand to full names — pass the original tokens through.

For each real class extract:
- subject, courseCode, instructor, room, section, block
- days: array of raw day tokens
- startTime / endTime: 24-hour "HH:MM" (convert 12h AM/PM)
- notes

Rules:
- 24-hour "HH:MM" time only
- READ TIMES EXACTLY AS PRINTED. Do NOT round, shift, estimate, or "correct" them — the minutes must match the image (e.g. "7:30" is 07:30, never 07:35 or 08:00).
- Convert AM/PM carefully: a class printed as 7:30-9:00 AM is 07:30–09:00; PM classes are 13:00–23:59. Never swap the two halves of the day.
- If a time is faint or hard to read, output your best exact reading of what is printed — never leave it blank and never invent a different time.
- days is always an ARRAY
- Unseen fields -> null (never guess)
- Ignore duplicate OCR text, headers, decorative elements
- If not a schedule -> {"semester": null, "classes": [], "metadata": {"totalClasses": 0, "confidence": 0, "notes": "not_a_schedule"}}

Return ONLY valid JSON:
{
  "semester": "1st Semester 2026",
  "classes": [
    {"subject": "Programming 2", "courseCode": "CS102", "days": ["MW"], "startTime": "07:30", "endTime": "09:00", "room": "Lab 301", "instructor": "Prof. Santos", "section": "BSCS-1A", "block": "BSCS-1A", "notes": null}
  ],
  "metadata": {"totalClasses": 1, "confidence": 0.95, "notes": null}
}`;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Parse a header value into a finite integer, or null if absent/invalid. */
function toFiniteInt(value: string | null): number | null {
  if (!value) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function fetchAndPreprocessImage(imageUrl: string) {
  const stage = "preprocess";
  PipelineLogger.info(stage, "Fetching image", { imageUrl });

  const t0 = performance.now();
  const response = await fetch(imageUrl);
  if (!response.ok) {
    PipelineLogger.error(stage, "Failed to fetch image", { imageUrl, status: response.status });
    throw new Error(`Failed to fetch image: ${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "image/jpeg";
  const arrayBuffer = await response.arrayBuffer();
  const rawBuffer = Buffer.from(arrayBuffer);

  PipelineLogger.debug(stage, "Image fetched", {
    bytes: rawBuffer.length,
    contentType,
    fetchMs: Math.round(performance.now() - t0),
  });

  const pt0 = performance.now();
  // Preprocess the image before AI analysis (OpenCV + sharp).
  const processedBuffer = await preprocessImage(rawBuffer);
  PipelineLogger.info(stage, "Image preprocessed", {
    outBytes: processedBuffer.length,
    preprocessMs: Math.round(performance.now() - pt0),
  });

  const base64 = processedBuffer.toString("base64");
  return { base64, contentType: "image/jpeg" };
}

async function callOpenRouter(
  model: string,
  messages: unknown[],
  temperature = 0.1,
  apiKey = process.env.OPENROUTER_API_KEY,
) {
  if (!apiKey) throw new Error("No OpenRouter API key configured");

  const response = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
      "X-Title": "Schedly",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: 2048,
    }),
  });

  // Persist the provider-side rate-limit snapshot (free-model daily cap) so the
  // admin Limits dashboard shows the real number even for failed attempts.
  const whichService = openRouterServiceFor(apiKey);
  void saveLimitSnapshot(whichService, {
    remaining: toFiniteInt(response.headers.get("x-ratelimit-remaining")),
    limit: toFiniteInt(response.headers.get("x-ratelimit-limit")),
    resetAt: response.headers.get("x-ratelimit-reset"),
  });

  // Read the body as text first so a non-JSON response (HTML error page,
  // gateway failure, truncated payload) doesn't throw a raw SyntaxError that
  // escapes as "Unexpected token ... is not valid JSON".
  const bodyText = await response.text();
  let data: unknown;
  try {
    data = bodyText ? JSON.parse(bodyText) : null;
  } catch {
    const snippet = bodyText.slice(0, 200).replace(/\s+/g, " ");
    throw new Error(
      `AI provider returned a non-JSON response (status ${response.status}): ${snippet || "(empty)"}`,
    );
  }

  if (!response.ok) {
    const status = response.status;
    const msg = (data as { error?: { message?: string } })?.error?.message || "Unknown";
    console.error(`[AI] API error: ${status} on ${model}:`, msg);

    if (status === 429) {
      const retryAfter = (data as { error?: { metadata?: { retry_after_seconds_raw?: number } } })?.error?.metadata?.retry_after_seconds_raw || 10;
      throw { code: "RATE_LIMITED", model, retryAfter, message: msg };
    }

    throw new Error(`AI API error: ${status} - ${msg}`);
  }

  // Track which OpenRouter key served this call (cap dashboard).
  void incrementUsage(whichService);

  return data;
}

function parseAiResponse(data: unknown) {
  const obj = data as { choices?: { message: { content: string } }[] };
  const first = obj.choices?.[0];
  const text = first?.message?.content;

  if (!text) {
    console.error("[AI] No content in response:", JSON.stringify(data));
    throw new Error("No response from AI");
  }

  const jsonMatch = String(text).match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`No JSON in AI response. Snippet: ${String(text).slice(0, 200)}`);
  }

  try {
    return JSON.parse(jsonMatch[0]) as Record<string, unknown>;
  } catch {
    throw new Error(`AI response contained malformed JSON. Snippet: ${jsonMatch[0].slice(0, 200)}`);
  }
}

/**
 * Google Gemini (free tier: ~1,500 requests/day, vision included) — PRIMARY
 * extraction provider: fastest free responses (~3-10s vs ~49s on OpenRouter's
 * free tier) and the highest daily quota, so the common path stays quick.
 * OpenRouter remains as the fallback chain so its 50 free-requests/day cap
 * can never hard-block user uploads.
 */
async function callGemini(
  parts: Record<string, unknown>[],
  opts: { prompt: string; temperature?: number; maxOutputTokens?: number },
  apiKey: string,
): Promise<Record<string, unknown>> {
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");

  const response = await fetch(`${GEMINI_GENERATE_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: opts.prompt }] },
      contents: [{ role: "user", parts }],
      generationConfig: {
        temperature: opts.temperature ?? 0.1,
        maxOutputTokens: opts.maxOutputTokens ?? 8192,
        responseMimeType: "application/json",
      },
    }),
  });

  // Track Gemini daily usage per key (cap dashboard). Counted on ANY provider
  // response because Google charges quota for failed requests too (429/503).
  void incrementUsage(geminiServiceFor(apiKey));

  const bodyText = await response.text();
  let data: unknown;
  try {
    data = bodyText ? JSON.parse(bodyText) : null;
  } catch {
    throw new Error(`Gemini returned a non-JSON response (status ${response.status})`);
  }

  if (!response.ok) {
    const status = response.status;
    const msg = (data as { error?: { message?: string } })?.error?.message || "Unknown";
    console.error(`[AI] Gemini API error: ${status}:`, msg);
    throw new Error(`Gemini API error: ${status} - ${msg}`);
  }

  const text = (data as { candidates?: { content?: { parts?: { text?: string }[] } }[] })
    .candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("No response from Gemini");

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`No JSON in Gemini response. Snippet: ${text.slice(0, 200)}`);

  try {
    return JSON.parse(jsonMatch[0]) as Record<string, unknown>;
  } catch {
    throw new Error(`Gemini response contained malformed JSON. Snippet: ${jsonMatch[0].slice(0, 200)}`);
  }
}

// Test-only re-exports (used by ai-response.test.ts to assert error handling).
export const callOpenRouterTest = callOpenRouter;
export const parseAiResponseTest = parseAiResponse;

function isRateLimited(err: unknown): err is { retryAfter: number; model: string } {
  return (
    !!err &&
    typeof err === "object" &&
    "code" in err &&
    (err as { code: unknown }).code === "RATE_LIMITED"
  );
}

/**
 * Runs `call(model)` across the model list, retrying transient errors on the
 * SAME model and escalating to the next model only after that model is
 * exhausted. Returns the first successful result, or throws the last error.
 */
async function runWithModelFallback<T>(
  call: (model: string) => Promise<T>,
  models: string[],
): Promise<T> {
  let lastError: unknown;

  for (const model of models) {
    let exhausted = false;
    for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
      try {
        PipelineLogger.debug("extract", `Attempt ${attempt + 1}/${RETRY_DELAYS.length + 1}`, { model });
        return await call(model);
      } catch (err) {
        lastError = err;
        if (isRateLimited(err)) {
          console.log(`[AI] Rate limited on ${err.model}`);
          if (attempt < RETRY_DELAYS.length) {
            const delay = Math.min(Math.max(err.retryAfter * 1000, RETRY_DELAYS[attempt]!), 5000);
            await sleep(delay);
            continue;
          }
          exhausted = true;
          break;
        }
        if (attempt < RETRY_DELAYS.length) {
          console.log(`[AI] Transient error, retrying in ${RETRY_DELAYS[attempt]}ms...`);
          await sleep(RETRY_DELAYS[attempt]!);
          continue;
        }
        exhausted = true;
        break;
      }
    }
    if (!exhausted) break;
    console.log(`[AI] Model ${model} exhausted, escalating to next model`);
  }

  const message = lastError instanceof Error ? lastError.message : "AI request failed after all retries";
  throw new Error(message);
}

/**
 * Runs `call(model, apiKey)` across every configured OpenRouter key (in order),
 * escalating to the next key only after the previous key is exhausted across
 * all models. Returns the first successful result, or throws the last error.
 */
async function runWithOpenRouterKeys<T>(
  call: (model: string, apiKey: string) => Promise<T>,
  models: string[],
): Promise<T> {
  if (OPENROUTER_KEYS.length === 0) throw new Error("No OpenRouter API key configured");

  let lastError: unknown;
  for (let i = 0; i < OPENROUTER_KEYS.length; i++) {
    const apiKey = OPENROUTER_KEYS[i]!;
    PipelineLogger.info("extract", `Trying OpenRouter key ${i + 1}/${OPENROUTER_KEYS.length}`);
    try {
      return await runWithModelFallback((model) => call(model, apiKey), models);
    } catch (err) {
      lastError = err;
      console.log(`[AI] OpenRouter key ${i + 1} exhausted, trying next key`);
    }
  }

  const message =
    lastError instanceof Error ? lastError.message : "All OpenRouter keys failed";
  throw new Error(message);
}

/**
 * Runs `call(apiKey)` across every configured Gemini key (in order), retrying
 * each key once on a transient failure before escalating to the next key.
 * Returns the first successful result, or throws the last error.
 */
async function runWithGeminiKeys<T>(
  call: (apiKey: string) => Promise<T>,
): Promise<T> {
  if (GEMINI_KEYS.length === 0) throw new Error("No Gemini API key configured");

  let lastError: unknown;
  for (let i = 0; i < GEMINI_KEYS.length; i++) {
    const apiKey = GEMINI_KEYS[i]!;
    PipelineLogger.info("extract", `Trying Gemini key ${i + 1}/${GEMINI_KEYS.length}`);
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        return await call(apiKey);
      } catch (err) {
        lastError = err;
        console.log(
          `[AI] Gemini key ${i + 1} attempt ${attempt} failed:`,
          err instanceof Error ? err.message : err,
        );
        if (attempt < 2) await sleep(1500);
      }
    }
  }

  const message = lastError instanceof Error ? lastError.message : "All Gemini keys failed";
  throw new Error(message);
}

export interface ExtractResult {
  data: Record<string, unknown>;
  model: string;
}

export async function extractScheduleFromImage(
  imageUrl: string,
  preloaded?: { base64: string; contentType: string },
): Promise<ExtractResult> {
  const configuredModel = process.env.OPENROUTER_MODEL;

  // Custom model first (still keeps the fallback chain behind it).
  const models = configuredModel
    ? [configuredModel, ...VISION_MODELS.filter((m) => m !== configuredModel)]
    : VISION_MODELS;

  PipelineLogger.info("extract", "Starting vision extraction", { models });

  const { base64, contentType } = preloaded ?? (await fetchAndPreprocessImage(imageUrl));

  // Gemini with multi-key rotation (key 1 -> key 2 -> ... -> key N) is the
  // PRIMARY provider: fastest responses (~3-10s) and the largest free quota
  // (~1,500 requests/day), so the common path is a single fast call. Free
  // tier sometimes returns transient 503 (high demand); each key is retried
  // once. OpenRouter stays as the fallback chain so its smaller free quota
  // (~50/day) rests unless Gemini is exhausted or down.
  if (GEMINI_KEYS.length > 0) {
    try {
      const data = await runWithGeminiKeys((apiKey) =>
        callGemini(
          [
            { inline_data: { mime_type: contentType, data: base64 } },
            { text: "Extract the classes from this image exactly as the system instructions describe. Return ONLY valid JSON." },
          ],
          { prompt: SCHEDULE_EXTRACTION_PROMPT },
          apiKey,
        ),
      );
      PipelineLogger.info("extract", "Vision extraction complete (Gemini)", {
        model: "gemini-flash-latest",
      });
      return { data, model: "gemini-flash-latest" };
    } catch (err) {
      PipelineLogger.error("extract", "All Gemini keys failed", {}, err);
    }
  }

  // OpenRouter fallback (keys 1-N, models in order). When OPENROUTER_DISABLED
  // is set, OpenRouter is skipped until its daily reset, letting its free
  // quota rest — Gemini handles everything in between.
  let usedModel = models[0]!;
  if ((await isOpenRouterEnabled()) && OPENROUTER_KEYS.length > 0) {
    try {
      const data = await runWithOpenRouterKeys(
        (model, apiKey) => {
          usedModel = model;
          return callOpenRouter(
            model,
            [
              {
                role: "user",
                content: [
                  { type: "text", text: SCHEDULE_EXTRACTION_PROMPT },
                  {
                    type: "image_url",
                    image_url: { url: `data:${contentType};base64,${base64}` },
                  },
                ],
              },
            ],
            0.1,
            apiKey,
          ).then(parseAiResponse);
        },
        models,
      );

      PipelineLogger.info("extract", "Vision extraction complete (OpenRouter)", { model: usedModel });
      return { data, model: usedModel };
    } catch (err) {
      PipelineLogger.error("extract", "All OpenRouter keys failed", {}, err);
    }
  }

  throw new Error("All AI providers failed (Gemini 1-N, OpenRouter 1-N)");
}

export async function validateExtractedData(extractedJson: Record<string, unknown>) {
  const configuredModel = process.env.OPENROUTER_VALIDATION_MODEL;
  const models = configuredModel
    ? [configuredModel, ...VALIDATION_MODELS.filter((m) => m !== configuredModel)]
    : VALIDATION_MODELS;

  PipelineLogger.info("validate", "Starting Hy3 re-validation", { models });

  const prompt =
    `Re-validate this extracted schedule JSON. Merge duplicates by (subject+room+startTime+endTime), ` +
    `normalize day tokens, fix impossible times, and return the same JSON schema with an "overallConfidence" field.\n\n` +
    JSON.stringify(extractedJson, null, 2);

  // Gemini first (fast, largest free quota), OpenRouter as the very last
  // resort — same order as vision extraction.
  if (GEMINI_KEYS.length > 0) {
    try {
      const data = await runWithGeminiKeys((apiKey) => callGemini([{ text: prompt }], { prompt }, apiKey));
      PipelineLogger.info("validate", "Re-validation complete (Gemini)", {
        model: "gemini-flash-latest",
      });
      return data;
    } catch (err) {
      PipelineLogger.error("validate", "All Gemini keys failed", {}, err);
    }
  }

  let usedModel = models[0]!;
  if ((await isOpenRouterEnabled()) && OPENROUTER_KEYS.length > 0) {
    try {
      const data = await runWithOpenRouterKeys(
        (model, apiKey) => {
          usedModel = model;
          return callOpenRouter(
            model,
            [{ role: "user", content: prompt }],
            0.1,
            apiKey,
          ).then(parseAiResponse);
        },
        models,
      );
      PipelineLogger.info("validate", "Hy3 re-validation complete", { model: usedModel });
      return data;
    } catch (err) {
      PipelineLogger.error("validate", "All OpenRouter keys failed", {}, err);
    }
  }

  throw new Error("All AI providers failed (Gemini 1-N, OpenRouter 1-N)");
}

/* ----------------------------------------------------------------------
   AI Schedule Suggestions (natural-language planning tips)
   ---------------------------------------------------------------------- */

const SUGGESTIONS_PROMPT = `You are a friendly classmate sharing practical study and life tips about this weekly class schedule (JSON). Read it like a person would and give 3-5 short, useful suggestions to help them plan their week.

Focus on:
- Best days/times to fit in appointments, errands, or study blocks
- Recurring free windows they could keep for a routine (study, gym, rest)
- Any day that looks overloaded and how to lighten it
- Long gaps before or after classes
- Anything genuinely useful about their free time

Rules:
- Talk naturally, like a friend giving advice — no corporate or robotic wording, no bullet-point jargon.
- Mention times in 12-HOUR format with AM/PM (e.g. "1 PM to 4 PM", never "13:00-16:00").
- Each suggestion must be a single short sentence (under 25 words), plain, specific, and personal ("you", "your").
- Vary the wording, examples, and sentence structure each time you're asked — do not repeat the same phrases from a previous answer.
- Do NOT invent classes, times, rooms, or people.
- Do NOT mention "AI", "algorithm", "analysis", or "assistant".
- Return ONLY valid JSON: {"suggestions": ["...", "..."]}`;

export type ScheduleSuggestionInput = {
  subject: string;
  days: string[];
  startTime: string;
  endTime: string;
};

/**
 * Generates natural-language planning suggestions for a schedule. Text-only
 * call against the same free models — no image needed.
 */
export async function generateScheduleSuggestions(
  classes: ScheduleSuggestionInput[],
): Promise<string[]> {
  const models = VISION_MODELS;
  const fullText = `${SUGGESTIONS_PROMPT}\n\nWeekly schedule:\n${JSON.stringify(classes, null, 2)}`;
  let data: Record<string, unknown>;

  // Gemini first (fast, largest free quota), OpenRouter as fallback.
  if (GEMINI_KEYS.length > 0) {
    try {
      data = await runWithGeminiKeys((apiKey) =>
        callGemini([{ text: fullText }], { prompt: SUGGESTIONS_PROMPT, temperature: 0.9 }, apiKey),
      );
    } catch (err) {
      PipelineLogger.error("suggest", "Gemini failed", {}, err);
      if ((await isOpenRouterEnabled()) && OPENROUTER_KEYS.length === 0) return [];
      data = await runWithOpenRouterKeys(
        (model, apiKey) =>
          callOpenRouter(
            model,
            [{ role: "user", content: fullText }],
            0.9,
            apiKey,
          ).then(parseAiResponse),
        models,
      );
    }
  } else if ((await isOpenRouterEnabled()) && OPENROUTER_KEYS.length > 0) {
    data = await runWithOpenRouterKeys(
      (model, apiKey) =>
        callOpenRouter(
          model,
          [{ role: "user", content: fullText }],
          0.9,
          apiKey,
        ).then(parseAiResponse),
      models,
    );
  } else {
    return [];
  }

  const suggestions = (data as { suggestions?: unknown })?.suggestions;
  if (!Array.isArray(suggestions)) return [];
  return suggestions
    .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    .slice(0, 5);
}

/* ----------------------------------------------------------------------
   Schedule Consistency Check
   ---------------------------------------------------------------------- */

export interface ConsistencyIssue {
  type: "missing_field" | "invalid_time" | "invalid_day" | "impossible_value" | "malformed_code";
  classIndex: number;
  field: string;
  message: string;
}

const VALID_DAYS = new Set(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]);
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export function checkScheduleConsistency(data: {
  classes?: Array<{
    subject?: string | null;
    courseCode?: string | null;
    days?: string[] | null;
    day?: string | null;
    startTime?: string | null;
    endTime?: string | null;
    instructor?: string | null;
    room?: string | null;
    section?: string | null;
  }>;
}): { issues: ConsistencyIssue[]; score: number } {
  const issues: ConsistencyIssue[] = [];

  for (let i = 0; i < (data.classes ?? []).length; i++) {
    const c = data.classes![i]!;

    const daysList = c.days ?? (c.day ? [c.day] : []);

    if (!c.subject || c.subject.trim() === "") {
      issues.push({ type: "missing_field", classIndex: i, field: "subject", message: `Class ${i + 1} is missing subject` });
    }
    if (!daysList.length) {
      issues.push({ type: "missing_field", classIndex: i, field: "days", message: `Class ${i + 1} is missing days` });
    } else {
      for (const d of daysList) {
        if (!VALID_DAYS.has(d.toLowerCase().trim())) {
          issues.push({ type: "invalid_day", classIndex: i, field: "days", message: `Class ${i + 1} has invalid day "${d}"` });
        }
      }
    }
    if (!c.startTime || c.startTime.trim() === "") {
      issues.push({ type: "missing_field", classIndex: i, field: "startTime", message: `Class ${i + 1} is missing startTime` });
    } else if (!TIME_PATTERN.test(c.startTime)) {
      issues.push({ type: "invalid_time", classIndex: i, field: "startTime", message: `Class ${i + 1} has invalid startTime "${c.startTime}"` });
    }
    if (!c.endTime || c.endTime.trim() === "") {
      issues.push({ type: "missing_field", classIndex: i, field: "endTime", message: `Class ${i + 1} is missing endTime` });
    } else if (!TIME_PATTERN.test(c.endTime)) {
      issues.push({ type: "invalid_time", classIndex: i, field: "endTime", message: `Class ${i + 1} has invalid endTime "${c.endTime}"` });
    }

    if (c.startTime && c.endTime && TIME_PATTERN.test(c.startTime) && TIME_PATTERN.test(c.endTime)) {
      const startMin = parseInt(c.startTime.split(":")[0]!) * 60 + parseInt(c.startTime.split(":")[1]!);
      const endMin = parseInt(c.endTime.split(":")[0]!) * 60 + parseInt(c.endTime.split(":")[1]!);
      if (endMin <= startMin) {
        issues.push({ type: "impossible_value", classIndex: i, field: "endTime", message: `Class ${i + 1} ends before it starts (${c.startTime} → ${c.endTime})` });
      }
    }

    if (c.courseCode && c.courseCode.trim() !== "") {
      const code = c.courseCode.trim();
      if (!/^[A-Za-z0-9\s/-]+$/.test(code) || code.length < 3) {
        issues.push({ type: "malformed_code", classIndex: i, field: "courseCode", message: `Class ${i + 1} has malformed courseCode "${code}"` });
      }
    }
  }

  const totalChecks = (data.classes ?? []).length * 5;
  const failed = issues.length;
  const score = totalChecks > 0 ? Math.max(0, 1 - failed / totalChecks) : 1;

  return { issues, score };
}

/* ----------------------------------------------------------------------
   Conflict Detection (overlapping classes on same day)
   ---------------------------------------------------------------------- */

export interface Conflict {
  classA: number;
  classB: number;
  day: string;
  message: string;
}

export function detectConflicts(data: {
  classes?: Array<{
    days?: string[] | null;
    day?: string | null;
    startTime?: string | null;
    endTime?: string | null;
    subject?: string | null;
  }>;
}): Conflict[] {
  const conflicts: Conflict[] = [];

  for (let i = 0; i < (data.classes ?? []).length; i++) {
    for (let j = i + 1; j < (data.classes ?? []).length; j++) {
      const a = data.classes![i]!;
      const b = data.classes![j]!;

      if (!a.startTime || !b.startTime || !a.endTime || !b.endTime) continue;

      const daysA = a.days ?? (a.day ? [a.day] : []);
      const daysB = b.days ?? (b.day ? [b.day] : []);
      if (!daysA.length || !daysB.length) continue;

      if (!TIME_PATTERN.test(a.startTime) || !TIME_PATTERN.test(a.endTime) ||
          !TIME_PATTERN.test(b.startTime) || !TIME_PATTERN.test(b.endTime)) continue;

      const aStart = parseInt(a.startTime.split(":")[0]!) * 60 + parseInt(a.startTime.split(":")[1]!);
      const aEnd = parseInt(a.endTime.split(":")[0]!) * 60 + parseInt(a.endTime.split(":")[1]!);
      const bStart = parseInt(b.startTime.split(":")[0]!) * 60 + parseInt(b.startTime.split(":")[1]!);
      const bEnd = parseInt(b.endTime.split(":")[0]!) * 60 + parseInt(b.endTime.split(":")[1]!);

      if (aStart < bEnd && aEnd > bStart) {
        const normA = daysA.map((d: string) => d.toLowerCase().trim());
        const normB = daysB.map((d: string) => d.toLowerCase().trim());
        const sharedDays = normA.filter((d: string) => normB.includes(d));
        if (sharedDays.length > 0) {
          conflicts.push({
            classA: i,
            classB: j,
            day: sharedDays[0]!,
            message: `"${a.subject || `Class ${i + 1}`}" overlaps with "${b.subject || `Class ${j + 1}`}" on ${sharedDays[0]} (${a.startTime}-${a.endTime} vs ${b.startTime}-${b.endTime})`,
          });
        }
      }
    }
  }

  return conflicts;
}

/* ----------------------------------------------------------------------
   Complete validation pipeline
   ---------------------------------------------------------------------- */

export interface ValidationResult {
  consistency: { issues: ConsistencyIssue[]; score: number };
  conflicts: Conflict[];
  hasConflicts: boolean;
  hasConsistencyIssues: boolean;
}

export function validateSchedule(data: Record<string, unknown>): ValidationResult {
  const consistency = checkScheduleConsistency(data as Parameters<typeof checkScheduleConsistency>[0]);
  const conflicts = detectConflicts(data as Parameters<typeof detectConflicts>[0]);

  return {
    consistency,
    conflicts,
    hasConflicts: conflicts.length > 0,
    hasConsistencyIssues: consistency.issues.length > 0,
  };
}

export { VISION_MODELS, VALIDATION_MODELS, CONFIDENCE_THRESHOLD };

/* ----------------------------------------------------------------------
   Syllabus Extraction
   ---------------------------------------------------------------------- */

const SYLLABUS_EXTRACTION_PROMPT = `You are an academic syllabus parser. Extract ALL requirements, activities, and important dates from this syllabus.

For EACH task/requirement found, extract:
- subject: the full course/subject name (e.g. "Programming 2", "IT Fundamentals")
- courseCode: the course code if shown (e.g. "CS102", "IT101"). null if not visible.
- taskName: the specific task name (e.g. "Programming Project 1", "Midterm Exam", "Lab Activity 3")
- taskType: one of "assignment", "exam", "quiz", "project", "activity", "reading", "lab", "presentation", "other"
- importance: how important this task is for the student's grade. Use "high" for major graded requirements (exams, major projects, capstones, major papers). Use "medium" for quizzes, assignments, and graded activities. Use "low" for minor items (attendance, participation, extra credit, ungraded readings). Be smart — do NOT mark everything high.
- dueDate: ONLY if an EXACT calendar date is explicitly written (e.g. "August 25", "Sept 15", "09/15/2026"). Use "YYYY-MM-DD" format. If the syllabus says "Week 3", "during midterms", "TBA", or any vague/relative reference — set dueDate to null.
- dateNote: If dueDate is null, write the original text as-is (e.g. "Week 3", "During midterms", "TBA", "Week 5-8"). This preserves the context so the user can set the real date. null if dueDate has an exact date.
- description: any additional details, instructions, or context about the task (max 500 chars). null if none.
- instructor: instructor/professor name if mentioned anywhere in the syllabus. null if not.

CRITICAL RULES:
1. DO NOT invent, estimate, or guess dates. If the syllabus says "Week 5", do NOT convert it to a calendar date. Set dueDate=null and dateNote="Week 5".
2. ONLY set dueDate when an EXACT date is written (e.g. "August 25", "September 15, 2026").
3. Extract EVERY requirement: assignments, projects, quizzes, exams, lab activities, presentations, readings, participation requirements, grading deadlines.
4. If a task has multiple parts (e.g. "Project Part 1", "Project Part 2"), create SEPARATE entries for each.
5. If the image is not a syllabus, return {"tasks": [], "metadata": {"confidence": 0, "notes": "not_a_syllabus"}}.

Return ONLY valid JSON:
{
  "tasks": [
    {"subject": "IT Fundamentals", "courseCode": "IT101", "taskName": "Quiz 1", "taskType": "quiz", "importance": "medium", "dueDate": null, "dateNote": "Week 3", "description": null, "instructor": "Prof. Reyes"},
    {"subject": "IT Fundamentals", "courseCode": "IT101", "taskName": "Laboratory Activity 1", "taskType": "lab", "importance": "medium", "dueDate": "2026-08-28", "dateNote": null, "description": "Chapter 1 hands-on exercise", "instructor": "Prof. Reyes"},
    {"subject": "IT Fundamentals", "courseCode": "IT101", "taskName": "Midterm Examination", "taskType": "exam", "importance": "high", "dueDate": "2026-09-15", "dateNote": null, "description": "Covers weeks 1-8", "instructor": "Prof. Reyes"},
    {"subject": "Programming 2", "courseCode": "CS102", "taskName": "Programming Project", "taskType": "project", "importance": "high", "dueDate": "2026-10-20", "dateNote": null, "description": "Group project — CRUD application", "instructor": "Prof. Santos"}
  ],
  "metadata": {
    "totalTasks": 4,
    "confidence": 0.95,
    "notes": null
  }
}`;

export interface SyllabusExtractResult {
  data: Record<string, unknown>;
  model: string;
}

export async function extractSyllabusFromImage(
  imageUrl: string,
  preloaded?: { base64: string; contentType: string },
): Promise<SyllabusExtractResult> {
  const configuredModel = process.env.OPENROUTER_MODEL;
  const models = configuredModel
    ? [configuredModel, ...VISION_MODELS.filter((m) => m !== configuredModel)]
    : VISION_MODELS;

  PipelineLogger.info("syllabus-extract", "Starting syllabus extraction", { models });

  const { base64, contentType } = preloaded ?? (await fetchAndPreprocessImage(imageUrl));

  // Gemini first (fast, largest free quota); OpenRouter as fallback.
  if (GEMINI_KEYS.length > 0) {
    try {
      const data = await runWithGeminiKeys((apiKey) =>
        callGemini(
          [
            { inline_data: { mime_type: contentType, data: base64 } },
            { text: "Extract all tasks from this syllabus exactly as the system instructions describe. Return ONLY valid JSON." },
          ],
          { prompt: SYLLABUS_EXTRACTION_PROMPT },
          apiKey,
        ),
      );
      PipelineLogger.info("syllabus-extract", "Syllabus extraction complete (Gemini)", {
        model: "gemini-flash-latest",
      });
      return { data, model: "gemini-flash-latest" };
    } catch (err) {
      PipelineLogger.error("syllabus-extract", "All Gemini keys failed", {}, err);
    }
  }

  let usedModel = models[0]!;
  if ((await isOpenRouterEnabled()) && OPENROUTER_KEYS.length > 0) {
    try {
      const data = await runWithOpenRouterKeys(
        (model, apiKey) => {
          usedModel = model;
          return callOpenRouter(
            model,
            [
              {
                role: "user",
                content: [
                  { type: "text", text: SYLLABUS_EXTRACTION_PROMPT },
                  {
                    type: "image_url",
                    image_url: { url: `data:${contentType};base64,${base64}` },
                  },
                ],
              },
            ],
            0.1,
            apiKey,
          ).then(parseAiResponse);
        },
        models,
      );

      PipelineLogger.info("syllabus-extract", "Syllabus extraction complete (OpenRouter)", { model: usedModel });
      return { data, model: usedModel };
    } catch (err) {
      PipelineLogger.error("syllabus-extract", "All OpenRouter keys failed", {}, err);
    }
  }

  throw new Error("All AI providers failed (Gemini 1-N, OpenRouter 1-N)");
}

/* ----------------------------------------------------------------------
   Syllabus Extraction — Text (for PDFs where we extracted text)
   ---------------------------------------------------------------------- */

export async function extractSyllabusFromText(
  pdfText: string,
): Promise<SyllabusExtractResult> {
  const configuredModel = process.env.OPENROUTER_MODEL;
  const models = configuredModel
    ? [configuredModel, ...VISION_MODELS.filter((m) => m !== configuredModel)]
    : VISION_MODELS;

  PipelineLogger.info("syllabus-extract-text", "Starting syllabus extraction from PDF text", { models });

  const truncatedText = pdfText.slice(0, 15000);

  // Gemini first (fast, largest free quota); OpenRouter as fallback.
  if (GEMINI_KEYS.length > 0) {
    try {
      const data = await runWithGeminiKeys((apiKey) =>
        callGemini(
          [
            { text: `Extract all tasks from this syllabus exactly as the system instructions describe. Return ONLY valid JSON.\n\n---\n\n${truncatedText}` },
          ],
          { prompt: SYLLABUS_EXTRACTION_PROMPT },
          apiKey,
        ).then(parseAiResponse)
      );

      PipelineLogger.info("syllabus-extract-text", "Syllabus extraction complete (Gemini)", {
        model: "gemini-flash-latest",
      });
      return { data, model: "gemini-flash-latest" };
    } catch (err) {
      PipelineLogger.error("syllabus-extract-text", "All Gemini keys failed", {}, err);
    }
  }

  let usedModel = models[0]!;
  if ((await isOpenRouterEnabled()) && OPENROUTER_KEYS.length > 0) {
    try {
      const data = await runWithOpenRouterKeys(
        (model, apiKey) => {
          usedModel = model;
          return callOpenRouter(
            model,
            [
              {
                role: "user",
                content: `${SYLLABUS_EXTRACTION_PROMPT}\n\n---\n\nHere is the extracted text from a syllabus PDF:\n\n${truncatedText}`,
              },
            ],
            0.1,
            apiKey,
          ).then(parseAiResponse);
        },
        models,
      );

      PipelineLogger.info("syllabus-extract-text", "Syllabus extraction complete (OpenRouter)", { model: usedModel });
      return { data, model: usedModel };
    } catch (err) {
      PipelineLogger.error("syllabus-extract-text", "All OpenRouter keys failed", {}, err);
    }
  }

  throw new Error("All AI providers failed (Gemini 1-N, OpenRouter 1-N)");
}

/* ----------------------------------------------------------------------
   Syllabus Summary
   ---------------------------------------------------------------------- */

const SYLLABUS_SUMMARY_PROMPT = (language: "english" | "tagalog") => {
  const langInstruction =
    language === "tagalog"
      ? "Write the summary in TAGALOG (Filipino) — natural, easy to understand, and using simple Taglish where it helps (e.g. 'exam', 'project', 'deadline' are fine in English)."
      : "Write the summary in clear, natural ENGLISH.";
  return `You are writing a friendly, human-sounding summary of a course syllabus. Do NOT sound like an AI — no "Here is a summary", no "In summary", no AI phrasing. Sound like a real person (the app's team) talking directly to the student who will read this.

${langInstruction}

Write in SECOND PERSON ("you" / "kayo"), as if directly talking to the student. Keep it warm, simple, and useful (150-300 words).

Structure the summary with these THREE sections in this exact order, each introduced by a short plain-text header line (in the summary language) followed by 1-2 flowing sentences:
1. About the course — what it is and its overall goal
2. Requirements — the main requirements the student must complete (exams, projects, quizzes, performances, activities)
3. Grading scheme — the breakdown and weight percentages if mentioned
4. Tips para maging successful — practical advice on how to succeed, in a supportive tone

CRITICAL FORMATTING RULES:
- PLAIN TEXT ONLY. NO markdown, NO asterisks (*), NO bullet points, NO dashes (-), NO numbered lists, NO bold, NO emojis.
- Section headers are plain words only (e.g. "About the Course", "Requirements", "Grading Scheme", "Tips para maging Successful") — no symbols, no punctuation after.
- After each header, write short flowing sentences, never lists.
- Use natural connecting words ("Una", "Bukod dito", "Para", "Tandaan", "Take note", "Also", "Don't forget").
- Do NOT invent details that are not in the syllabus.

Return ONLY valid JSON: {"summary": "<your full summary here>"}`;
};

export async function summarizeSyllabus(
  source: { type: "text"; text: string } | { type: "image"; imageUrl: string },
  language: "english" | "tagalog",
): Promise<{ summary: string; model: string }> {
  const configuredModel = process.env.OPENROUTER_MODEL;
  const models = configuredModel
    ? [configuredModel, ...VISION_MODELS.filter((m) => m !== configuredModel)]
    : VISION_MODELS;

  PipelineLogger.info("syllabus-summarize", "Starting syllabus summary", { language });

  let imagePart: { base64: string; contentType: string } | null = null;
  let text = "";
  if (source.type === "image") {
    imagePart = await fetchAndPreprocessImage(source.imageUrl);
  } else {
    text = source.text.slice(0, 15000);
  }

  const prompt = SYLLABUS_SUMMARY_PROMPT(language);
  const userContent = imagePart
    ? [
        { type: "text", text: prompt },
        {
          type: "image_url",
          image_url: { url: `data:${imagePart.contentType};base64,${imagePart.base64}` },
        },
      ]
    : `${prompt}\n\n---\n\nHere is the syllabus content:\n\n${text}`;

  const extractSummary = (data: Record<string, unknown>): string => {
    const summary = data.summary;
    if (typeof summary !== "string" || !summary.trim()) {
      throw new Error("No summary in AI response");
    }
    return summary.trim();
  };

  let usedModel = models[0]!;
  // Gemini first (fast, largest free quota); OpenRouter as fallback.
  if (GEMINI_KEYS.length > 0) {
    try {
      const data = await runWithGeminiKeys((apiKey) =>
        callGemini(
          imagePart
            ? [
                { inline_data: { mime_type: imagePart.contentType, data: imagePart.base64 } },
                { text: prompt },
              ]
            : [{ text: `${prompt}\n\n---\n\n${text}` }],
          { prompt: "" },
          apiKey,
        ).then(parseAiResponse),
      );
      PipelineLogger.info("syllabus-summarize", "Summary complete (Gemini)", {
        model: "gemini-flash-latest",
      });
      return { summary: extractSummary(data), model: "gemini-flash-latest" };
    } catch (err) {
      PipelineLogger.error("syllabus-summarize", "All Gemini keys failed", {}, err);
    }
  }

  if ((await isOpenRouterEnabled()) && OPENROUTER_KEYS.length > 0) {
    try {
      const data = await runWithOpenRouterKeys(
        (model, apiKey) => {
          usedModel = model;
          return callOpenRouter(model, [{ role: "user", content: userContent }], 0.3, apiKey).then(
            parseAiResponse,
          );
        },
        models,
      );
      PipelineLogger.info("syllabus-summarize", "Summary complete (OpenRouter)", { model: usedModel });
      return { summary: extractSummary(data), model: usedModel };
    } catch (err) {
      PipelineLogger.error("syllabus-summarize", "All OpenRouter keys failed", {}, err);
    }
  }

  throw new Error("All AI providers failed (Gemini 1-N, OpenRouter 1-N)");
}
