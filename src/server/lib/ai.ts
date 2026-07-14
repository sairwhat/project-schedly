const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

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

export async function extractScheduleFromImage(imageUrl: string) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL || "google/gemma-4-26b-a4b-it:free";

  console.log("[AI] Fetching image from:", imageUrl);
  console.log("[AI] Model:", model);
  console.log("[AI] API key present:", !!apiKey);

  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) {
    throw new Error(`Failed to fetch image: ${imageResponse.status}`);
  }

  const contentType = imageResponse.headers.get("content-type") || "image/jpeg";
  const arrayBuffer = await imageResponse.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");

  console.log("[AI] Image fetched:", arrayBuffer.byteLength, "bytes,", contentType);

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
    console.error("[AI] API error:", response.status, JSON.stringify(data));
    throw new Error(`AI API error: ${response.status} - ${data?.error?.message || "Unknown"}`);
  }

  const text = data.choices?.[0]?.message?.content;
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
