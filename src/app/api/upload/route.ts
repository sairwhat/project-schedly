import { type NextRequest } from "next/server";
import { put } from "@vercel/blob";
import { auth } from "@/server/lib/auth";
import { db } from "@/server/db/client";
import { extractScheduleFromImage } from "@/server/lib/ai";
import { extractionResultSchema } from "@/server/validators/ai.schema";
import { detectImageMime, checkRateLimit, validateCsrf } from "@/server/lib/security";
import fs from "fs/promises";
import path from "path";

const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

const encoder = new TextEncoder();

function progressJson(progress: number, message: string): string {
  return JSON.stringify({ type: "progress", progress, message }) + "\n";
}

function resultJson(data: Record<string, unknown>): string {
  return JSON.stringify({ type: "result", data }) + "\n";
}

function errorJson(error: string): string {
  return JSON.stringify({ type: "error", error }) + "\n";
}

type StoredFile = { url: string; key: string };

async function storeFile(buffer: Uint8Array, mime: string, key: string): Promise<StoredFile> {
  const blob = new Blob([Buffer.from(buffer)], { type: mime });

  if (BLOB_TOKEN) {
    const result = await put(key, blob, {
      access: "public",
      addRandomSuffix: false,
      token: BLOB_TOKEN,
    });
    return { url: result.url, key };
  }

  const target = path.join(UPLOAD_DIR, key);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, Buffer.from(buffer));
  return { url: `/uploads/${key}`, key };
}

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return new Response(errorJson("Unauthorized"), {
      status: 401,
      headers: { "Content-Type": "application/x-ndjson" },
    });
  }

  const rateCheck = checkRateLimit(`upload:${session.user.id}`, 10, 60_000);
  if (!rateCheck.allowed) {
    return new Response(errorJson("Too many uploads. Try again later."), {
      status: 429,
      headers: { "Content-Type": "application/x-ndjson" },
    });
  }

  if (!validateCsrf(request)) {
    return new Response(errorJson("Invalid request"), {
      status: 403,
      headers: { "Content-Type": "application/x-ndjson" },
    });
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const formData = await request.formData();
        const file = formData.get("file") as File | null;

        if (!file) {
          controller.enqueue(encoder.encode(errorJson("No file provided")));
          controller.close();
          return;
        }

        const maxSize = 10 * 1024 * 1024;
        if (file.size > maxSize) {
          controller.enqueue(encoder.encode(errorJson("File too large (max 10MB)")));
          controller.close();
          return;
        }

        if (file.size === 0) {
          controller.enqueue(encoder.encode(errorJson("File is empty")));
          controller.close();
          return;
        }

        const buffer = new Uint8Array(await file.arrayBuffer());
        const detectedMime = detectImageMime(buffer);

        if (!detectedMime) {
          controller.enqueue(encoder.encode(errorJson("File must be an image (JPEG, PNG, GIF, WebP, or BMP)")));
          controller.close();
          return;
        }

        controller.enqueue(encoder.encode(progressJson(10, "Validating image...")));

        const ext = file.name.split(".").pop() || "jpg";
        const key = `schedules/${session.user.id}/${crypto.randomUUID()}.${ext}`;

        controller.enqueue(encoder.encode(progressJson(20, "Storing image...")));
        const stored = await storeFile(buffer, detectedMime, key);

        controller.enqueue(encoder.encode(progressJson(30, "Creating upload record...")));
        const upload = await db.upload.create({
          data: {
            userId: session.user.id,
            fileUrl: stored.url,
            fileName: file.name,
            fileSize: file.size,
            mimeType: detectedMime,
            status: "processing",
          },
        });

        let classes: ReturnType<typeof extractionResultSchema.parse>["classes"] = [];
        let metadata = { totalClasses: 0, confidence: 0, notes: null as string | null };

        if (process.env.OPENROUTER_API_KEY) {
          try {
            const origin = new URL(request.url).origin;
            const absoluteUrl = stored.url.startsWith("http")
              ? stored.url
              : `${origin}${stored.url}`;

            controller.enqueue(encoder.encode(progressJson(40, "AI is analyzing your schedule...")));

            const raw = await extractScheduleFromImage(absoluteUrl);
            const parsed = extractionResultSchema.parse(raw);

            controller.enqueue(encoder.encode(progressJson(90, "Finalizing results...")));

            const validClasses = parsed.classes.filter(
              (c) => c.subject && c.days.length > 0 && c.startTime && c.endTime
            );

            classes = validClasses;
            metadata = {
              totalClasses: validClasses.length,
              confidence: parsed.metadata.confidence,
              notes: parsed.metadata.notes,
            };
          } catch (aiErr) {
            console.error("[UPLOAD_API] AI extraction error:", aiErr);
            controller.enqueue(encoder.encode(progressJson(90, "AI extraction failed. You can add classes manually.")));
            metadata.notes = "AI extraction failed — add classes manually.";
          }
        } else {
          metadata.notes = "AI extraction not configured — add classes manually.";
        }

        const result = { classes, metadata };

        await db.upload.update({
          where: { id: upload.id },
          data: {
            status: "completed",
            aiResult: result as never,
          },
        });

        controller.enqueue(encoder.encode(progressJson(100, "Complete!")));
        controller.enqueue(encoder.encode(resultJson({
          uploadId: upload.id,
          fileUrl: stored.url,
          classes,
          metadata,
        })));
        controller.close();
      } catch (error) {
        console.error("[UPLOAD_API] Error:", error);
        try {
          controller.enqueue(encoder.encode(errorJson("Upload failed")));
        } catch { /* stream already closed */ }
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "application/x-ndjson" },
  });
}
