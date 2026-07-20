import { extractScheduleFromImage, validateExtractedData } from "@/server/lib/ai";
import {
  aiValidationResultSchema,
  transformAiOutputToInternal,
  type ExtractionResult,
} from "@/server/validators/ai.schema";
import { ok, fail, type Result } from "@/server/lib/errors";

export const aiService = {
  async processImage(imageUrl: string): Promise<Result<ExtractionResult>> {
    try {
      // 1. Vision extraction (returns AI output format per architecture doc)
      const raw = await extractScheduleFromImage(imageUrl);

      // 2. Try validation/reasoning step using Hy3
      if (process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_VALIDATION_ENABLED !== "false") {
        try {
          const validated = await validateExtractedData(raw as Record<string, unknown>);
          const validatedParsed = aiValidationResultSchema.safeParse(validated);

          if (validatedParsed.success) {
            const transformed = transformAiOutputToInternal(validatedParsed.data);
            return ok(transformed);
          } else {
            console.warn("[AI] Validation AI returned unparseable result, using raw extraction");
          }
        } catch (valErr) {
          console.warn("[AI] Validation AI failed, falling back to raw extraction:", valErr);
        }
      }

      // 3. Fallback: transform raw AI output to internal format
      const aiClasses = (raw as Record<string, unknown>)?.classes as Record<string, unknown>[] | undefined;
      if (Array.isArray(aiClasses) && aiClasses.length > 0) {
        const transformed = {
          semester: (raw as Record<string, unknown>)?.semester as string ?? null,
          classes: aiClasses.map((c: Record<string, unknown>) => ({
            subject: String(c.subject ?? ""),
            code: c.courseCode ? String(c.courseCode) : (c.code as string ?? null),
            instructor: c.instructor as string ?? null,
            room: c.room as string ?? null,
            section: c.section as string ?? null,
            days: [String(c.day ?? "").toLowerCase()],
            startTime: c.startTime as string ?? "00:00",
            endTime: c.endTime as string ?? "00:00",
          })),
          metadata: {
            totalClasses: aiClasses.length,
            confidence: ((raw as Record<string, unknown>)?.metadata as Record<string, unknown>)?.confidence as number ?? 0.5,
            notes: ((raw as Record<string, unknown>)?.metadata as Record<string, unknown>)?.notes as string ?? null,
          },
        };
        return ok(transformed as ExtractionResult);
      }

      return fail("AI_PROCESSING_FAILED", "AI returned data in an unrecognized format");
    } catch (err) {
      const message = err instanceof Error ? err.message : "AI processing failed";
      return fail("AI_PROCESSING_FAILED", message);
    }
  },
};
