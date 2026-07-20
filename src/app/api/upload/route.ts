import { type NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { auth } from "@/server/lib/auth";
import { db } from "@/server/db/client";
import { uploadService } from "@/server/services/upload.service";
import { uploadRepository } from "@/server/repositories/upload.repository";
import { aiService } from "@/server/services/ai.service";
import { detectImageMime, checkRateLimit, validateCsrf } from "@/server/lib/security";
import { auditLog } from "@/server/lib/audit";
import fs from "fs/promises";
import path from "path";

const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

export const maxDuration = 60;

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

  // Verify the session's user actually exists in the database.
  // A stale better-auth cookie cache can reference a user that no longer
  // exists, which would otherwise violate the uploads_user_id_fkey.
  const dbUser = await db.user.findUnique({ where: { id: session.user.id } });
  if (!dbUser) {
    return NextResponse.json(
      { error: "Your session is invalid. Please sign out and sign in again." },
      { status: 401 }
    );
  }

  const rateCheck = checkRateLimit(`upload:${session.user.id}`, 10, 60_000);
  if (!rateCheck.allowed) {
    return NextResponse.json({ error: "Too many uploads. Try again later." }, { status: 429 });
  }

  if (!validateCsrf(request)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 403 });
  }

  try {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (formErr) {
      console.error("[UPLOAD_API] Failed to parse form data:", formErr);
      return NextResponse.json(
        { error: "Invalid upload request. Make sure you are sending a multipart/form-data file." },
        { status: 400 }
      );
    }
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

    // Process AI extraction within the request (maxDuration=60s).
    // On serverless this keeps the function alive until extraction completes,
    // which is more reliable than a background task that gets frozen.
    const origin = new URL(request.url).origin;
    const absoluteUrl = stored.url.startsWith("http")
      ? stored.url
      : `${origin}${stored.url}`;

    let classes: Record<string, unknown>[] = [];
    let metadata = { totalClasses: 0, confidence: 0, notes: null as string | null };

    if (process.env.OPENROUTER_API_KEY) {
      try {
        const result = await aiService.processImage(absoluteUrl);
        if (result.success) {
          const valid = result.data.classes.filter(
            (c: { subject?: string; days?: unknown[]; startTime?: string; endTime?: string }) =>
              c.subject && c.days && c.days.length > 0 && c.startTime && c.endTime
          );
          classes = valid;
          metadata = {
            totalClasses: valid.length,
            confidence: result.data.metadata.confidence,
            notes: result.data.metadata.notes,
          };
          await uploadRepository.updateAiResult(
            upload.id,
            { classes: valid, metadata } as never,
            "completed"
          );
        } else {
          console.error("[UPLOAD_API] AI extraction error:", result.error.message);
          await uploadService.updateStatus(upload.id, "completed");
        }
      } catch (aiErr) {
        console.error("[UPLOAD_API] AI extraction error:", aiErr);
        await uploadService.updateStatus(upload.id, "completed");
      }
    } else {
      await uploadService.updateStatus(upload.id, "completed");
    }

    return NextResponse.json({
      uploadId: upload.id,
      fileUrl: stored.url,
      classes,
      metadata,
      status: "completed",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[UPLOAD_API] Error:", error);
    return NextResponse.json({ error: `Upload failed: ${message}` }, { status: 500 });
  }
}
