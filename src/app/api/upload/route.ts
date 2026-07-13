import { type NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { auth } from "@/server/lib/auth";
import { db } from "@/server/db/client";
import { extractScheduleFromImage } from "@/server/lib/ai";
import { extractionResultSchema } from "@/server/validators/ai.schema";
import fs from "fs/promises";
import path from "path";

const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

type StoredFile = { url: string; key: string };

async function storeFile(file: File, key: string): Promise<StoredFile> {
  if (BLOB_TOKEN) {
    const blob = await put(key, file, {
      access: "public",
      addRandomSuffix: false,
      token: BLOB_TOKEN,
    });
    return { url: blob.url, key };
  }

  const target = path.join(UPLOAD_DIR, key);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(target, buffer);
  return { url: `/uploads/${key}`, key };
}

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "File must be an image" }, { status: 400 });
    }

    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 400 });
    }

    const ext = file.name.split(".").pop() || "jpg";
    const key = `schedules/${session.user.id}/${crypto.randomUUID()}.${ext}`;

    const stored = await storeFile(file, key);

    const upload = await db.upload.create({
      data: {
        userId: session.user.id,
        fileUrl: stored.url,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
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
    console.error("[UPLOAD_API] Error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
