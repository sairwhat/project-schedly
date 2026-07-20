import { preprocessImage } from "./image-processing";
import { PipelineLogger } from "./structured-logger";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

/**
 * Confidence below this threshold triggers a single fallback vision-model
 * re-extraction. High-confidence results skip the fallback entirely, keeping
 * the common path to a single AI call.
 */
const CONFIDENCE_THRESHOLD = Number(process.env.AI_CONFIDENCE_THRESHOLD ?? 0.9);

/* ===== Vision Models (Image Understanding) =====
 * Ordered primary -> fallback. The primary is tried first; fallbacks are only
 * used when the primary fails or returns low-confidence output. */
const VISION_MODELS = [
  "google/gemma-4-26b-a4b-it:free",             // Primary
  "google/gemma-4-31b-it:free",                  // Fallback 1
  "nvidia/nemotron-nano-12b-v2-vl:free",          // Fallback 2
  ...(process.env.NODE_ENV === "development"
    ? ["poolside/laguna-m.1:free", "openai/gpt-oss-20b:free"]
    : []),
];

/* ===== Reasoning & Validation Models (Hy3) =====
 * Used only as a last resort when the vision models fail to produce a usable
 * result, or for deep re-validation of low-confidence extractions. */
const VALIDATION_MODELS = [
  "tencent/hy3:free",                             // Primary
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free", // Fallback
  ...(process.env.NODE_ENV === "development"
    ? ["poolside/laguna-m.1:free"]
    : []),
];

const RETRY_DELAYS = [1000, 3000];

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

async function callOpenRouter(model: string, messages: unknown[]) {
  const apiKey = process.env.OPENROUTER_API_KEY;

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
      temperature: 0.1,
      max_tokens: 4096,
    }),
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

  return data;
}

function parseAiResponse(data: unknown) {
  const obj = data as { choices?: { message: { content: string } }[] };
  const first = obj.choices?.[0];
  const text = first?.message?.content;
  console.log("[AI] Response:", String(text).substring(0, 200));

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

  let usedModel = models[0]!;
  const data = await runWithModelFallback(
    (model) => {
      usedModel = model;
      return callOpenRouter(model, [
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
      ]).then(parseAiResponse);
    },
    models,
  );

  PipelineLogger.info("extract", "Vision extraction complete", { model: usedModel });
  return { data, model: usedModel };
}

export async function validateExtractedData(extractedJson: Record<string, unknown>) {
  const configuredModel = process.env.OPENROUTER_VALIDATION_MODEL;
  const models = configuredModel
    ? [configuredModel, ...VALIDATION_MODELS.filter((m) => m !== configuredModel)]
    : VALIDATION_MODELS;

  PipelineLogger.info("validate", "Starting Hy3 re-validation", { models });

  let usedModel = models[0]!;
  const data = await runWithModelFallback(
    (model) => {
      usedModel = model;
      return callOpenRouter(model, [
        {
          role: "user",
          content:
            `Re-validate this extracted schedule JSON. Merge duplicates by (subject+room+startTime+endTime), ` +
            `normalize day tokens, fix impossible times, and return the same JSON schema with an "overallConfidence" field.\n\n` +
            JSON.stringify(extractedJson, null, 2),
        },
      ]).then(parseAiResponse);
    },
    models,
  );
  PipelineLogger.info("validate", "Hy3 re-validation complete", { model: usedModel });
  return data;
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
