import {
  extractScheduleFromImage,
  validateExtractedData,
  CONFIDENCE_THRESHOLD,
} from "@/server/lib/ai";
import { aiValidationResultSchema } from "@/server/validators/ai.schema";
import { ok, fail, type Result } from "@/server/lib/errors";
import { PipelineLogger } from "@/server/lib/structured-logger";
import { extractionCache, computeImageHash } from "@/server/lib/image-cache";
import {
  buildResult,
  finalizeValidated,
  type ExtractionResult,
} from "@/server/lib/extraction-deterministic";

/** Fetch raw image bytes (needed for hashing/caching). */
async function fetchImageBytes(imageUrl: string): Promise<Buffer> {
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

export const aiService = {
  /**
   * Single-pass, low-latency extraction pipeline:
   *
   *   Upload -> image-hash cache lookup -> OpenCV/sharp preprocess
   *          -> Primary Vision Model (Gemma 4 26B) -> deterministic normalize + validate
   *          -> Confidence check
   *               >= threshold -> return (cache result)
   *               <  threshold -> retry with fallback Vision Model (escalate to Hy3 only if still unusable)
   *
   * Identical/near-identical uploads are served from cache, skipping all AI
   * calls. The Hy3 reasoning model runs ONLY on low-confidence/failed results.
   */
  async processImage(imageUrl: string): Promise<Result<ExtractionResult>> {
    const runId = crypto.randomUUID();
    const t0 = performance.now();
    PipelineLogger.info("pipeline", "Pipeline start", { runId, imageUrl });

    try {
      // 0. Cache lookup by perceptual image hash (skips all AI work on repeats).
      let imageBuffer: Buffer | null = null;
      let hash: string | null = null;
      if (process.env.AI_CACHE_ENABLED !== "false") {
        const ct0 = performance.now();
        imageBuffer = await fetchImageBytes(imageUrl);
        hash = await computeImageHash(imageBuffer);
        const cached = await extractionCache.get(hash);
        if (cached) {
          PipelineLogger.info("cache", "Cache hit — returning stored result", {
            runId,
            hash,
            model: cached.model,
            cacheMs: Math.round(performance.now() - ct0),
            totalMs: Math.round(performance.now() - t0),
          });
          return ok(cached.result as ExtractionResult);
        }
        PipelineLogger.debug("cache", "Cache miss", { runId, hash, cacheMs: Math.round(performance.now() - ct0) });
      }

      // 1. Primary vision extraction (single pass).
      const primary = await extractScheduleFromImage(
        imageUrl,
        imageBuffer ? { base64: imageBuffer.toString("base64"), contentType: "image/jpeg" } : undefined,
      );
      const raw = primary.data;

      const primaryResult = buildResult(raw);
      if (primaryResult) {
        // 2. Confidence gate — return immediately when confident.
        if (primaryResult.metadata.confidence >= CONFIDENCE_THRESHOLD) {
          await maybeCache(hash, imageBuffer, primaryResult, primary.model, runId, t0);
          return ok(primaryResult);
        }
        PipelineLogger.info("pipeline", "Primary confidence below threshold", {
          runId,
          confidence: primaryResult.metadata.confidence,
          threshold: CONFIDENCE_THRESHOLD,
        });
      } else {
        PipelineLogger.warn("pipeline", "Primary extraction produced no usable classes", { runId });
      }

      // 3. Fallback: try a stronger vision model via the same extraction path.
      if (process.env.OPENROUTER_API_KEY) {
        try {
          const fallback = await extractScheduleFromImage(imageUrl);
          const fallbackResult = buildResult(fallback.data);
          if (fallbackResult) {
            if (fallbackResult.metadata.confidence >= CONFIDENCE_THRESHOLD) {
              await maybeCache(hash, imageBuffer, fallbackResult, fallback.model, runId, t0);
              return ok(fallbackResult);
            }
            // Still low — send to Hy3 for a deep re-validation pass.
            if (process.env.OPENROUTER_VALIDATION_ENABLED !== "false") {
              const validated = await validateExtractedData(fallback.data);
              if (aiValidationResultSchema.safeParse(validated).success) {
                const res = finalizeValidated(validated);
                await maybeCache(hash, imageBuffer, res, `hy3:${fallback.model}`, runId, t0);
                return ok(res);
              }
            }
            await maybeCache(hash, imageBuffer, fallbackResult, fallback.model, runId, t0);
            return ok(fallbackResult);
          }
        } catch (fbErr) {
          PipelineLogger.warn("pipeline", "Fallback vision extraction failed", { runId }, fbErr);
        }
      }

      // 4. Last resort: Hy3 re-validation of the (low-confidence) primary output.
      if (primaryResult && process.env.OPENROUTER_VALIDATION_ENABLED !== "false") {
        try {
          const validated = await validateExtractedData(raw);
          if (aiValidationResultSchema.safeParse(validated).success) {
            const res = finalizeValidated(validated);
            await maybeCache(hash, imageBuffer, res, "hy3", runId, t0);
            return ok(res);
          }
        } catch (valErr) {
          PipelineLogger.warn("pipeline", "Hy3 validation failed, using primary result", { runId }, valErr);
        }
        await maybeCache(hash, imageBuffer, primaryResult, primary.model, runId, t0);
        return ok(primaryResult);
      }

      if (primaryResult) {
        await maybeCache(hash, imageBuffer, primaryResult, primary.model, runId, t0);
        return ok(primaryResult);
      }
      return fail("AI_PROCESSING_FAILED", "AI returned data in an unrecognized format");
    } catch (err) {
      const message = err instanceof Error ? err.message : "AI processing failed";
      PipelineLogger.error("pipeline", "Pipeline failed", { runId }, err);
      return fail("AI_PROCESSING_FAILED", message);
    }
  },
};

async function maybeCache(
  hash: string | null,
  imageBuffer: Buffer | null,
  result: ExtractionResult,
  model: string,
  runId: string,
  t0: number,
) {
  if (process.env.AI_CACHE_ENABLED === "false" || !imageBuffer || !hash) return;
  try {
    await extractionCache.set(hash, result, model);
    PipelineLogger.info("cache", "Result cached", {
      runId,
      hash,
      model,
      totalMs: Math.round(performance.now() - t0),
    });
  } catch (err) {
    PipelineLogger.warn("cache", "Failed to cache result", { runId }, err);
  }
}
