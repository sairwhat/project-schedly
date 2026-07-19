import { extractScheduleFromImage } from "@/server/lib/ai";
import { extractionResultSchema } from "@/server/validators/ai.schema";
import type { Result } from "@/server/lib/errors";
import { ok, fail } from "@/server/lib/errors";

export interface AiProcessingResult {
  classes: Array<{
    subject: string;
    code: string | null;
    instructor: string | null;
    room: string | null;
    section: string | null;
    days: string[];
    startTime: string;
    endTime: string;
  }>;
  metadata: {
    totalClasses: number;
    confidence: number;
    notes: string | null;
  };
}

export const aiService = {
  async processImage(imageUrl: string): Promise<Result<AiProcessingResult>> {
    try {
      const raw = await extractScheduleFromImage(imageUrl);
      const parsed = extractionResultSchema.safeParse(raw);

      if (!parsed.success) {
        return fail("AI_PROCESSING_FAILED", "AI returned data in an unexpected format");
      }

      if (parsed.data.metadata.error) {
        return fail("AI_PROCESSING_FAILED", parsed.data.metadata.error);
      }

      return ok(parsed.data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "AI processing failed";
      return fail("AI_PROCESSING_FAILED", message);
    }
  },
};
