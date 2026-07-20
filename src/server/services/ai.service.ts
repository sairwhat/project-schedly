import { extractScheduleFromImage, validateExtractedData, validateSchedule } from "@/server/lib/ai";
import { normalizeDays } from "@/server/lib/day-mapping";
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
            // 2a. Run schedule consistency check + conflict detection
            const scheduleCheck = validateSchedule(validatedParsed.data as unknown as Record<string, unknown>);

            const transformed = transformAiOutputToInternal(validatedParsed.data);

            // Attach validation metadata
            transformed.metadata = {
              ...transformed.metadata,
              consistencyScore: scheduleCheck.consistency.score,
              hasConflicts: scheduleCheck.hasConflicts,
              conflicts: scheduleCheck.conflicts,
              consistencyIssues: scheduleCheck.consistency.issues,
            };

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
        const fallbackMeta = ((raw as Record<string, unknown>)?.metadata as Record<string, unknown>) ?? {};
        const baseConf = (fallbackMeta.confidence as number) ?? 0.5;
        const transformed = {
          semester: (raw as Record<string, unknown>)?.semester as string ?? null,
          classes: aiClasses.map((c: Record<string, unknown>) => {
            // Authoritative day expansion via normalizeDays (prefers raw dayCodes)
            const dayInput = Array.isArray(c.dayCodes)
              ? (c.dayCodes as string[])
              : Array.isArray(c.days)
                ? (c.days as string[])
                : c.day
                  ? [String(c.day)]
                  : [];
            const normalized = normalizeDays(dayInput);
            const days = normalized.days as ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
            const confidence = normalized.uncertain ? Math.min(baseConf, normalized.confidence, 0.5) : baseConf;
            return {
              subject: String(c.subject ?? ""),
              code: c.courseCode ? String(c.courseCode) : (c.code as string ?? null),
              instructor: c.instructor as string ?? null,
              room: c.room as string ?? null,
              section: c.section as string ?? null,
              block: c.block as string ?? null,
              notes: c.notes as string ?? null,
              days,
              startTime: c.startTime as string ?? "00:00",
              endTime: c.endTime as string ?? "00:00",
              confidence,
            };
          }),
          metadata: {
            totalClasses: aiClasses.length,
            confidence: ((raw as Record<string, unknown>)?.metadata as Record<string, unknown>)?.confidence as number ?? 0.5,
            notes: ((raw as Record<string, unknown>)?.metadata as Record<string, unknown>)?.notes as string ?? null,
          },
        };

        // Reduce overall confidence if any class had uncertain day parsing
        const anyUncertain = transformed.classes.some((c) => (c as Record<string, unknown>).confidence !== undefined && (c.confidence as number) <= 0.5);
        if (anyUncertain) {
          transformed.metadata.confidence = Math.min(transformed.metadata.confidence, 0.5);
        }

        // Run consistency check + conflict detection on raw output
        const scheduleCheck = validateSchedule(raw as Record<string, unknown>);
        (transformed as Record<string, unknown>).metadata = {
          ...transformed.metadata,
          consistencyScore: scheduleCheck.consistency.score,
          hasConflicts: scheduleCheck.hasConflicts,
          conflicts: scheduleCheck.conflicts,
          consistencyIssues: scheduleCheck.consistency.issues,
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
