const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

const FALLBACK_MODELS = [
  "google/gemma-4-26b-a4b-it:free",
  "google/gemma-4-31b-it:free",
  "nvidia/llama-nemotron-rerank-vl-1b-v2:free",
  "nvidia/nemotron-3.5-content-safety:free",
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
];

const RETRY_DELAYS = [1000, 3000];

const SCHEDULE_EXTRACTION_PROMPT = `You are a schedule extraction AI. Analyze the provided image of a class schedule and extract all classes into structured JSON.

For each class, extract:
- subject: The full name of the subject/course
- code: The course code (e.g., "MATH 201")
- instructor: The instructor's name
- room: The room number or location
- section: The section number or identifier
- days: Array of lowercase day names ["monday", "tuesday", ...]
- startTime: 24-hour format "HH:MM"
- endTime: 24-hour format "HH:MM"
- Convert any 12-hour time (with AM/PM) to 24-hour based on the AM/PM shown on the schedule. Examples: "9:00 AM" -> "09:00", "1:00 PM" -> "13:00", "12:00 AM" -> "00:00", "12:00 PM" -> "12:00"

Return ONLY valid JSON in this exact format:
{
  "classes": [
    {
      "subject": "...",
      "code": "...",
      "instructor": "...",
      "room": "...",
      "section": "...",
      "days": ["monday", "wednesday", "friday"],
      "startTime": "09:00",
      "endTime": "10:30"
    }
  ],
  "metadata": {
    "totalClasses": 1,
    "confidence": 0.95,
    "notes": "Any observations about the schedule"
  }
}

Rules:
- Use lowercase for days (monday, tuesday, wednesday, thursday, friday, saturday, sunday)
- Use 24-hour time format (HH:MM)
- If a field is not visible, set it to null
- If the image is not a schedule, return {"classes": [], "metadata": {"totalClasses": 0, "confidence": 0, "notes": "not_a_schedule"}}
- Extract ALL visible classes, even if partially visible
- Do not include any text before or after the JSON`;

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

async function callOpenRouter(model: string, base64: string, contentType: string) {
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
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: SCHEDULE_EXTRACTION_PROMPT },
            {
              type: "image_url",
              image_url: {
                url: `data:${contentType};base64,${base64}`,
              },
            },
          ],
        },
      ],
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

interface OpenRouterChoice {
  message: { content: string };
}

interface OpenRouterResponse {
  choices?: OpenRouterChoice[];
}

function parseAiResponse(data: unknown) {
  const obj = data as OpenRouterResponse;
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

  return JSON.parse(jsonMatch[0]) as unknown;
}

export async function extractScheduleFromImage(imageUrl: string) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const configuredModel = process.env.OPENROUTER_MODEL;
  const models = configuredModel
    ? [configuredModel, ...FALLBACK_MODELS.filter((m) => m !== configuredModel)]
    : FALLBACK_MODELS;

  console.log("[AI] API key present:", !!apiKey);
  console.log("[AI] Model priority:", models.join(", "));

  const { base64, contentType } = await fetchImageAsBase64(imageUrl);

  let lastError: unknown;

  for (const model of models) {
    for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
      try {
        console.log(`[AI] Attempt ${attempt + 1}/${RETRY_DELAYS.length + 1} with model: ${model}`);
        const data = await callOpenRouter(model, base64, contentType);
        return parseAiResponse(data);
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
}
