import { preprocessImage } from "./image-processing";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

/* ===== Vision Models (Image Understanding) ===== */
const VISION_MODELS = [
  "google/gemma-4-26b-a4b-it:free",             // Primary
  "google/gemma-4-31b-it:free",                  // Fallback 1
  "nvidia/nemotron-nano-12b-v2-vl:free",          // Fallback 2
  ...(process.env.NODE_ENV === "development"
    ? ["poolside/laguna-m.1:free", "openai/gpt-oss-20b:free"]
    : []),
];

/* ===== Reasoning & Validation Models ===== */
const VALIDATION_MODELS = [
  "tencent/hy3:free",                             // Primary
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free", // Fallback
  ...(process.env.NODE_ENV === "development"
    ? ["poolside/laguna-m.1:free"]
    : []),
];

const RETRY_DELAYS = [1000, 3000];

const SCHEDULE_EXTRACTION_PROMPT = `Treat the uploaded image as a structured class schedule, not plain OCR text. Prioritize fast and efficient processing while maintaining high extraction accuracy. Process the schedule in a single extraction pass whenever possible. Use fallback models only if extraction fails or confidence falls below the defined threshold.

STEP 1 — ANALYZE TABLE STRUCTURE:
First analyze the complete table layout before extracting any data. Identify headers, rows, columns, merged cells, day columns, time columns, and their relationships. Understand how subjects, rooms, instructors, and times map to each cell.

STEP 2 — EXTRACT CLASSES:
Identify a unique class using (subject + room + startTime + endTime). Merge matching meeting days into a single record using a days array. Only create separate records when the subject, room, or time differs.

STEP 3 — NORMALIZE DAY ABBREVIATIONS:
Correctly interpret standard academic day abbreviations without guessing. Never guess or expand day abbreviations incorrectly. Use these standard mappings:
- M, MON → "Monday"
- T, TUE → "Tuesday"
- W, WED → "Wednesday"
- TH, THU → "Thursday"
- F, FRI → "Friday"
- SAT, SA → "Saturday"
- SUN, SU → "Sunday"
- MW → ["Monday", "Wednesday"]
- TF → ["Tuesday", "Thursday"]
- TTH, TH → ["Tuesday", "Thursday"] or ["Thursday"] depending on context
- MWF → ["Monday", "Wednesday", "Friday"]
- MTW → ["Monday", "Tuesday", "Wednesday"]

STEP 4 — SELF-VALIDATION:
Before returning, perform a lightweight validation pass:
- Normalize all day names to full names
- Normalize all times to 24-hour HH:MM format
- Remove duplicate classes
- Preserve original subject names exactly as written
- If any value cannot be determined confidently, return null instead of guessing

For each class, extract:
- subject: The full name of the subject/course (preserve original spelling exactly)
- courseCode: The course code (e.g., "MATH 201")
- instructor: The instructor's name
- room: The room number or location
- section: The section number or identifier
- block: The block/group identifier (e.g., "BSCS-1A")
- days: Array of meeting days (expand abbreviations to full day names)
- startTime: 24-hour format "HH:MM"
- endTime: 24-hour format "HH:MM"
- notes: Any additional notes about the class

Convert any 12-hour time (with AM/PM) to 24-hour. Examples: "9:00 AM" -> "09:00", "1:00 PM" -> "13:00", "12:00 AM" -> "00:00", "12:00 PM" -> "12:00"

Return ONLY valid JSON in this exact format:
{
  "semester": "1st Semester 2026",
  "classes": [
    {
      "subject": "Programming 2",
      "courseCode": "CS102",
      "days": ["Monday", "Wednesday"],
      "startTime": "07:30",
      "endTime": "09:00",
      "room": "Lab 301",
      "instructor": "Prof. Santos",
      "section": "BSCS-1A",
      "block": "BSCS-1A",
      "notes": null
    }
  ],
  "metadata": {
    "totalClasses": 1,
    "confidence": 0.95,
    "notes": "Any observations about the schedule"
  }
}

Rules:
- Use full day names (Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday)
- Use 24-hour time format (HH:MM)
- Use a days ARRAY (never a single day string)
- Preserve original subject names exactly as written
- If a field is not visible, set it to null
- If the image is not a schedule, return {"semester": null, "classes": [], "metadata": {"totalClasses": 0, "confidence": 0, "notes": "not_a_schedule"}}
- NEVER create duplicate classes
- Ignore duplicate OCR detections, repeated text, headers, and decorative elements
- If any value cannot be determined confidently, return null instead of guessing`;

const VALIDATION_PROMPT = `You are a schedule validation AI. Treat the data below as a structured class schedule. Optimize for low latency and minimal API calls while maintaining validation quality.

STEP 1 — NORMALIZE:
- Expand all day abbreviations to full day name arrays using standard academic mappings (M=Monday, T=Tuesday, W=Wednesday, TH=Thursday, F=Friday, SAT=Saturday, SUN=Sunday, MW=Monday+Wednesday, TF=Tuesday+Thursday, TTH=Tuesday+Thursday, MWF=Monday+Wednesday+Friday, etc.)
- Normalize all times to 24-hour HH:MM format
- Normalize room formats (Rm301 → Room 301, etc.)
- Never generate validation warnings until all day abbreviations have been fully parsed and normalized

STEP 2 — DEDUPLICATE:
A class is uniquely identified by (subject + room + startTime + endTime). The days field is NOT part of the unique key. If two entries have the same subject, room, startTime, and endTime but different day codes, MERGE their days into one array.

STEP 3 — VALIDATE:
- No impossible times (endTime must be after startTime)
- No overlapping classes on the same day (only after final schedule is validated, compare normalized day + start time + end time + room + subject)
- Missing fields that should be flagged
- Malformed course codes
- Impossible values
- Preserve original subject names exactly as written

STEP 4 — CONFLICT DETECTION:
- Only compare normalized day, start time, end time, room, and subject AFTER the final schedule has been fully validated
- Do not report overlaps based on partially parsed or guessed day values
- Remove false positives

STEP 5 — CONFIDENCE SCORING:
For each class, assign a confidence score (0-1) for each field:
- subject confidence
- courseCode confidence
- days confidence
- startTime / endTime confidence
- room confidence
- instructor confidence

Return the corrected/validated JSON with confidence scores added to each class, plus a list of issues found.

Return ONLY valid JSON in this exact format:
{
  "validated": true,
  "semester": "1st Semester 2026",
  "classes": [
    {
      "subject": "Programming 2",
      "subject_confidence": 0.99,
      "courseCode": "CS102",
      "courseCode_confidence": 0.99,
      "days": ["Monday", "Wednesday"],
      "days_confidence": 0.99,
      "startTime": "07:30",
      "startTime_confidence": 0.99,
      "endTime": "09:00",
      "endTime_confidence": 0.99,
      "room": "Lab 301",
      "room_confidence": 0.95,
      "instructor": "Prof. Santos",
      "instructor_confidence": 0.95,
      "section": "BSCS-1A",
      "block": null,
      "notes": null
    }
  ],
  "issues": [],
  "overallConfidence": 0.97
}

If no issues, return "issues": [].

If any value cannot be determined confidently, return null instead of guessing. Never generate validation warnings until all day abbreviations have been fully parsed and normalized.`;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchAndPreprocessImage(imageUrl: string) {
  console.log("[AI] Fetching image from:", imageUrl);

  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "image/jpeg";
  const arrayBuffer = await response.arrayBuffer();
  const rawBuffer = Buffer.from(arrayBuffer);

  console.log("[AI] Image fetched:", rawBuffer.length, "bytes,", contentType);

  // ── Preprocess the image before AI analysis ──────────────────────
  console.log("[AI] Preprocessing image (auto-crop, denoise, sharpen, enhance, auto-rotate)...");
  const processedBuffer = await preprocessImage(rawBuffer);
  console.log("[AI] Preprocessed image:", processedBuffer.length, "bytes");

  const base64 = processedBuffer.toString("base64");
  return { base64, contentType: "image/jpeg" };
}

async function callOpenRouter(model: string, messages: unknown[], options?: { structured?: boolean }) {
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

  const data = await response.json();

  if (!response.ok) {
    const status = response.status;
    const msg = data?.error?.message || "Unknown";
    console.error(`[AI] API error: ${status} on ${model}:`, msg);

    if (status === 429) {
      const retryAfter = data?.error?.metadata?.retry_after_seconds_raw || 10;
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
    throw new Error("No JSON in AI response");
  }

  return JSON.parse(jsonMatch[0]) as Record<string, unknown>;
}

function withRetry<T>(
  call: (model: string) => Promise<T>,
  models: string[],
): { run: () => Promise<T> } {
  return {
    async run() {
      let lastError: unknown;
      for (const model of models) {
        for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
          try {
            console.log(`[AI] Attempt ${attempt + 1}/${RETRY_DELAYS.length + 1} with model: ${model}`);
            return await call(model);
          } catch (err) {
            lastError = err;
            if (err && typeof err === "object" && "code" in err && (err as { code: unknown }).code === "RATE_LIMITED") {
              const rateErr = err as unknown as { retryAfter: number; model: string };
              console.log(`[AI] Rate limited on ${rateErr.model}, retrying in ${rateErr.retryAfter}s or switching model`);
              if (attempt < RETRY_DELAYS.length) {
                const delay = Math.min(Math.max(rateErr.retryAfter * 1000, RETRY_DELAYS[attempt]!), 5000);
                console.log(`[AI] Waiting ${delay}ms before retry ${attempt + 2}...`);
                await sleep(delay);
                continue;
              }
              break;
            }
            if (attempt < RETRY_DELAYS.length) {
              console.log(`[AI] Transient error, retrying in ${RETRY_DELAYS[attempt]}ms...`);
              await sleep(RETRY_DELAYS[attempt]!);
              continue;
            }
          }
        }
        console.log(`[AI] All retries exhausted for model: ${model}, trying next model`);
      }
      const message = lastError instanceof Error ? lastError.message : "AI extraction failed after all retries";
      throw new Error(message);
    },
  };
}

export async function extractScheduleFromImage(imageUrl: string) {
  const configuredModel = process.env.OPENROUTER_MODEL;

  // If a custom model is configured, try it first, then fall back to defaults
  const models = configuredModel
    ? [configuredModel, ...VISION_MODELS.filter((m) => m !== configuredModel)]
    : VISION_MODELS;

  console.log("[AI] Image extraction — models:", models.join(", "));

  const { base64, contentType } = await fetchAndPreprocessImage(imageUrl);

  return withRetry(
    (model) =>
      callOpenRouter(
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
      ).then(parseAiResponse),
    models,
  ).run();
}

export async function validateExtractedData(extractedJson: Record<string, unknown>) {
  const configuredModel = process.env.OPENROUTER_VALIDATION_MODEL;
  const models = configuredModel
    ? [configuredModel, ...VALIDATION_MODELS.filter((m) => m !== configuredModel)]
    : VALIDATION_MODELS;

  console.log("[AI] Validation — models:", models.join(", "));

  return withRetry(
    (model) =>
      callOpenRouter(model, [
        {
          role: "user",
          content: VALIDATION_PROMPT + "\n\n" + JSON.stringify(extractedJson, null, 2),
        },
      ]).then(parseAiResponse),
    models,
  ).run();
}

/* ──────────────────────────────────────────────────────────────
   Schedule Consistency Check
   ────────────────────────────────────────────────────────────── */

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

    // Support both days array and single day string
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

    // Check impossible times
    if (c.startTime && c.endTime && TIME_PATTERN.test(c.startTime) && TIME_PATTERN.test(c.endTime)) {
      const startMin = parseInt(c.startTime.split(":")[0]!) * 60 + parseInt(c.startTime.split(":")[1]!);
      const endMin = parseInt(c.endTime.split(":")[0]!) * 60 + parseInt(c.endTime.split(":")[1]!);
      if (endMin <= startMin) {
        issues.push({ type: "impossible_value", classIndex: i, field: "endTime", message: `Class ${i + 1} ends before it starts (${c.startTime} → ${c.endTime})` });
      }
    }

    // Check malformed course codes
    if (c.courseCode && c.courseCode.trim() !== "") {
      const code = c.courseCode.trim();
      if (!/^[A-Za-z0-9\s/-]+$/.test(code) || code.length < 3) {
        issues.push({ type: "malformed_code", classIndex: i, field: "courseCode", message: `Class ${i + 1} has malformed courseCode "${code}"` });
      }
    }
  }

  // Calculate consistency score (0-1)
  const totalChecks = (data.classes ?? []).length * 5;
  const failed = issues.length;
  const score = totalChecks > 0 ? Math.max(0, 1 - failed / totalChecks) : 1;

  return { issues, score };
}

/* ──────────────────────────────────────────────────────────────
   Conflict Detection (overlapping classes on same day)
   ────────────────────────────────────────────────────────────── */

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

      // Check overlap: a starts before b ends AND a ends after b starts
      if (aStart < bEnd && aEnd > bStart) {
        // Check if any day overlaps
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

/* ──────────────────────────────────────────────────────────────
   Complete validation pipeline
   ────────────────────────────────────────────────────────────── */

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

export { VISION_MODELS, VALIDATION_MODELS };
