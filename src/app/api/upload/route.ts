import { type NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { auth } from "@/server/lib/auth";
import { db } from "@/server/db/client";
import { aiService } from "@/server/services/ai.service";
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

    let classes: Array<{ subject: string; code: string | null; instructor: string | null; room: string | null; section: string | null; days: string[]; startTime: string; endTime: string }> = [];
    let metadata = { totalClasses: 0, confidence: 0, notes: null as string | null };

    if (process.env.OPENROUTER_API_KEY) {
      try {
        const origin = new URL(request.url).origin;
        const absoluteUrl = stored.url.startsWith("http")
          ? stored.url
          : `${origin}${stored.url}`;

        const result = await aiService.processImage(absoluteUrl);

        if (result.success) {
          const validClasses = result.data.classes.filter(
            (c) => c.subject && c.days.length > 0 && c.startTime && c.endTime
          );

          classes = validClasses;
          metadata = {
            totalClasses: validClasses.length,
            confidence: result.data.metadata.confidence,
            notes: result.data.metadata.notes,
          };
        } else {
          console.error("[UPLOAD_API] AI extraction error:", result.error.message);
          metadata.notes = `AI extraction issue: ${result.error.message}`;
        }
      } catch (aiErr) {
        console.error("[UPLOAD_API] AI extraction error:", aiErr);
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
    const message = error instanceof Error ? error.message : String(error);
    console.error("[UPLOAD_API] Error:", error);
    const detail = process.env.NODE_ENV === "development" ? `: ${message}` : "";
    return NextResponse.json({ error: `Upload failed${detail}` }, { status: 500 });
  }
}
