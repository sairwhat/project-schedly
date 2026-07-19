import { type NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { auth } from "@/server/lib/auth";
import { db } from "@/server/db/client";
import { extractScheduleFromImage, extractScheduleFromText } from "@/server/lib/ai";
import { ocrImage } from "@/server/lib/ocr";
import { extractionResultSchema } from "@/server/validators/ai.schema";
import { detectImageMime, checkRateLimit, validateCsrf } from "@/server/lib/security";
import { auditLog } from "@/server/lib/audit";
import fs from "fs/promises";
import path from "path";

const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

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
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateCheck = checkRateLimit(`upload:${session.user.id}`, 10, 60_000);
  if (!rateCheck.allowed) {
    return NextResponse.json({ error: "Too many uploads. Try again later." }, { status: 429 });
  }

  if (!validateCsrf(request)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 403 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 400 });
    }

    if (file.size === 0) {
      return NextResponse.json({ error: "File is empty" }, { status: 400 });
    }

    const buffer = new Uint8Array(await file.arrayBuffer());
    const detectedMime = detectImageMime(buffer);

    if (!detectedMime) {
      return NextResponse.json({ error: "File must be an image (JPEG, PNG, GIF, WebP, or BMP)" }, { status: 400 });
    }

    const ext = file.name.split(".").pop() || "jpg";
    const key = `schedules/${session.user.id}/${crypto.randomUUID()}.${ext}`;

    const stored = await storeFile(buffer, detectedMime, key);

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

    auditLog("upload.create", { userId: session.user.id, uploadId: upload.id, fileName: file.name });

    let classes: ReturnType<typeof extractionResultSchema.parse>["classes"] = [];
    let metadata = { totalClasses: 0, confidence: 0, notes: null as string | null };

    if (process.env.OPENROUTER_API_KEY) {
      try {
        const ocrText = await ocrImage(Buffer.from(buffer));
        console.log("[UPLOAD_API] OCR text:", ocrText.substring(0, 200));

        if (ocrText.length > 20) {
          const raw = await extractScheduleFromText(ocrText);
          const parsed = extractionResultSchema.parse(raw);

          const validClasses = parsed.classes.filter(
            (c) => c.subject && c.days.length > 0 && c.startTime && c.endTime
          );

          classes = validClasses;
          metadata = {
            totalClasses: validClasses.length,
            confidence: parsed.metadata.confidence,
            notes: parsed.metadata.notes,
          };
        } else {
          metadata.notes = "OCR returned insufficient text — try a clearer image.";
        }
      } catch (ocrAiErr) {
        console.error("[UPLOAD_API] OCR+AI extraction error, falling back to vision AI:", ocrAiErr);

        try {
          const origin = new URL(request.url).origin;
          const absoluteUrl = stored.url.startsWith("http")
            ? stored.url
            : `${origin}${stored.url}`;
          const raw = await extractScheduleFromImage(absoluteUrl);
          const parsed = extractionResultSchema.parse(raw);

          const validClasses = parsed.classes.filter(
            (c) => c.subject && c.days.length > 0 && c.startTime && c.endTime
          );

          classes = validClasses;
          metadata = {
            totalClasses: validClasses.length,
            confidence: parsed.metadata.confidence,
            notes: parsed.metadata.notes,
          };
        } catch (visionErr) {
          console.error("[UPLOAD_API] Vision AI fallback also failed:", visionErr);
        }
      }
    } else {
      metadata.notes = "AI extraction not configured — add classes manually.";
    }

    const result = { classes, metadata };

    await db.upload.update({
      where: { id: upload.id },
      data: {
        status: "completed",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        aiResult: result as any,
      },
    });

    return NextResponse.json({
      uploadId: upload.id,
      fileUrl: stored.url,
      classes,
      metadata,
    });
  } catch (error) {
    console.error("[UPLOAD_API] Error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
