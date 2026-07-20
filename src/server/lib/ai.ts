const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

/* ===== Vision Models (Image Understanding) ===== */
const VISION_MODELS = [
  "google/gemma-4-26b-a4b-it:free",             // Primary
  "google/gemma-4-31b-it:free",                  // Fallback 1
  "nvidia/nemotron-nano-12b-v2-vl:free",          // Fallback 2
];

/* ===== Reasoning & Validation Models ===== */
const VALIDATION_MODELS = [
  "tencent/hy3:free",                             // Primary
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free", // Fallback
];

const RETRY_DELAYS = [1000, 3000];

const SCHEDULE_EXTRACTION_PROMPT = `You are a schedule extraction AI. Analyze the provided schedule image and extract all classes into structured JSON.

For each class, extract:
- subject: The full name of the subject/course
- courseCode: The course code (e.g., "MATH 201")
- instructor: The instructor's name
- room: The room number or location
- section: The section number or identifier
- block: The block/group identifier (e.g., "BSCS-1A")
- day: The day of the week (e.g., "Monday", "Tuesday")
- startTime: 24-hour format "HH:MM"
- endTime: 24-hour format "HH:MM"
- notes: Any additional notes about the class

Convert any 12-hour time (with AM/PM) to 24-hour. Examples: "9:00 AM" -> "09:00", "1:00 PM" -> "13:00", "12:00 AM" -> "00:00", "12:00 PM" -> "12:00"

IMPORTANT: Understand the schedule as a structured timetable. Detect table rows, columns, merged cells, time slots, and day headers. Understand relationships between rows and columns rather than reading text line-by-line.

Return ONLY valid JSON in this exact format:
{
  "semester": "1st Semester 2026",
  "classes": [
    {
      "subject": "Programming 2",
      "courseCode": "CS102",
      "day": "Monday",
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
- If a field is not visible, set it to null
- If the image is not a schedule, return {"semester": null, "classes": [], "metadata": {"totalClasses": 0, "confidence": 0, "notes": "not_a_schedule"}}
- Extract ALL visible classes, even if partially visible
- Do not include any text before or after the JSON
- Never invent missing information — leave unknown fields as null`;

const VALIDATION_PROMPT = `You are a schedule validation AI. Review the extracted class data below and validate every field.

For each class, check:
1. Valid day name (Monday-Sunday, normalized to proper case)
2. Valid time format (HH:MM, 24-hour)
3. No duplicate classes (same subject + same day + same time)
4. No impossible times (endTime must be after startTime)
5. No overlapping classes on the same day
6. Missing fields that should be flagged
7. Malformed course codes
8. Impossible values

Automatically normalize:
- Mon → Monday, TUE → Tuesday, etc.
- 7-9 → 07:00-09:00
- Rm301 → Room 301
- Any 12h time with AM/PM → 24h format

For each class, assign a confidence score (0-1) for each field:
- subject confidence
- courseCode confidence
- day confidence
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
      "day": "Monday",
      "day_confidence": 0.99,
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
  "issues": [
    {"type": "normalized", "message": "Normalized TUE → Tuesday for class 1", "classIndex": 0}
  ],
  "overallConfidence": 0.97
}

If no issues, return "issues": [].`;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchImageAsBase64(imageUrl: string) {
  console.log("[AI] Fetching image from:", imageUrl);

  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "image/jpeg";
  const arrayBuffer = await response.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");

  console.log("[AI] Image fetched:", arrayBuffer.byteLength, "bytes,", contentType);

  return { base64, contentType };
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

  const { base64, contentType } = await fetchImageAsBase64(imageUrl);

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

export { VISION_MODELS, VALIDATION_MODELS };
