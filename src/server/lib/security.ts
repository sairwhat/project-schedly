const IMAGE_MAGIC_BYTES: [number[], string][] = [
  [[0xFF, 0xD8, 0xFF], "image/jpeg"],
  [[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A], "image/png"],
  [[0x47, 0x49, 0x46, 0x38, 0x37, 0x61], "image/gif"],
  [[0x47, 0x49, 0x46, 0x38, 0x39, 0x61], "image/gif"],
  [[0x52, 0x49, 0x46, 0x46], "image/webp"], // RIFF header — verify WEBP at offset 8
  [[0x42, 0x4D], "image/bmp"],
];

const WEBP_MAGIC = [0x57, 0x45, 0x42, 0x50]; // "WEBP"

export function detectImageMime(buffer: Uint8Array): string | null {
  for (const [magic, mime] of IMAGE_MAGIC_BYTES) {
    if (magic.length > buffer.length) continue;
    if (magic.every((b, i) => buffer[i] === b)) {
      if (mime === "image/webp") {
        if (WEBP_MAGIC.every((b, i) => buffer[8 + i] === b)) return mime;
        continue;
      }
      return mime;
    }
  }
  return null;
}

// Simple in-memory sliding window rate limiter
const rateStore = new Map<string, number[]>();

const CLEANUP_INTERVAL = 60_000;
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  for (const [key, timestamps] of rateStore) {
    const valid = timestamps.filter((t) => now - t < 60_000);
    if (valid.length === 0) rateStore.delete(key);
    else rateStore.set(key, valid);
  }
}

export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number = 60_000,
): { allowed: boolean; remaining: number } {
  cleanup();
  const now = Date.now();
  const timestamps = rateStore.get(key) ?? [];
  const valid = timestamps.filter((t) => now - t < windowMs);
  valid.push(now);
  rateStore.set(key, valid);
  return {
    allowed: valid.length <= maxRequests,
    remaining: Math.max(0, maxRequests - valid.length),
  };
}

const CSRF_HEADER = "x-csrf-protection";
const CSRF_VALUE = "1";

export function validateCsrf(request: Request): boolean {
  return request.headers.get(CSRF_HEADER) === CSRF_VALUE;
}
