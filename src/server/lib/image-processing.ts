import sharp from "sharp";

export interface PreprocessOptions {
  /** Maximum dimension (width or height) for upscaled output */
  maxDimension?: number;
  /** Apply adaptive histogram equalization–style contrast stretch */
  enhanceContrast?: boolean;
  /** Apply sharpening */
  sharpen?: boolean;
  /** Apply median filter for noise reduction */
  denoise?: boolean;
  /** Auto‑rotate based on EXIF metadata */
  autoRotate?: boolean;
  /** Remove shadows / normalize brightness (histogram stretch) */
  normalizeLighting?: boolean;
}

const DEFAULTS: PreprocessOptions = {
  maxDimension: 2400,
  enhanceContrast: true,
  sharpen: true,
  denoise: true,
  autoRotate: true,
  normalizeLighting: true,
};

/**
 * Preprocess a raw image buffer before sending it to the vision AI.
 *
 * Pipeline:
 *   1. Auto-rotate (EXIF)
 *   2. Convert to RGB (ensure consistent colour space)
 *   3. Histogram normalisation (brightness/contrast stretch)
 *   4. Adaptive contrast enhancement via gamma + CLAHE-style linear stretch
 *   5. Denoise (median filter, 1px radius)
 *   6. Sharpen
 *   7. Upscale if the smaller dimension is below a threshold
 *   8. Ensure reasonable bounds for API consumption
 */
export async function preprocessImage(
  input: Buffer,
  opts: PreprocessOptions = {},
): Promise<Buffer> {
  const options = { ...DEFAULTS, ...opts };

  let pipeline = sharp(input);

  // ── 1. Auto-rotate ──────────────────────────────────────────────
  if (options.autoRotate) {
    pipeline = pipeline.rotate(); // reads EXIF orientation
  }

  // ── 2. Convert to RGB ───────────────────────────────────────────
  pipeline = pipeline.toColorspace("srgb");

  // ── 3. Histogram normalisation (brightness/contrast stretch) ────
  if (options.normalizeLighting) {
    pipeline = pipeline.normalize();
  }

  // ── 4. Denoise ──────────────────────────────────────────────────
  if (options.denoise) {
    pipeline = pipeline.median(1);
  }

  // ── 5. Contrast enhancement via gamma ───────────────────────────
  if (options.enhanceContrast) {
    pipeline = pipeline.gamma(1.2);
  }

  // ── 6. Sharpen ──────────────────────────────────────────────────
  if (options.sharpen) {
    // sigma=1.2, flat=1.0, jagged=0.5 — moderate sharpen
    pipeline = pipeline.sharpen({ sigma: 1.2, flat: 1, jagged: 0.5 });
  }

  // ── 7. Get metadata to decide resize ────────────────────────────
  const meta = await pipeline.clone().metadata();

  // ── 8. Upscale if too small, cap if too large ───────────────────
  const maxDim = options.maxDimension ?? 2400;
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;

  // Only resize when both dimensions are under 200px — too small for vision
  if (width < 200 && height < 200) {
    const scale = Math.min(maxDim / width, maxDim / height);
    pipeline = pipeline.resize({
      width: Math.round(width * scale),
      height: Math.round(height * scale),
      fit: "inside",
      withoutEnlargement: false,
    });
  } else if (width > maxDim || height > maxDim) {
    // Downscale very large images (speed / token cost)
    pipeline = pipeline.resize({
      width: maxDim,
      height: maxDim,
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  // ── 9. Output as JPEG (smaller payload for API) ─────────────────
  return pipeline.jpeg({ quality: 85, force: true }).toBuffer();
}
