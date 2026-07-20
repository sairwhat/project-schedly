import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/server/lib/auth";
import { db } from "@/server/db/client";
import { uploadService } from "@/server/services/upload.service";
import { uploadRepository } from "@/server/repositories/upload.repository";
import { aiService } from "@/server/services/ai.service";
import { detectImageMime, checkRateLimit, validateCsrf } from "@/server/lib/security";
import { auditLog } from "@/server/lib/audit";

export const maxDuration = 60;

async function runBackgroundProcessing(uploadId: string, imageUrl: string) {
  if (!process.env.OPENROUTER_API_KEY) {
    await uploadService.updateStatus(uploadId, "completed");
    return;
  }

  try {
    const record = await uploadRepository.findById(uploadId);
    const fileData = record?.fileData;
    let imageBuffer: Buffer | undefined;
    if (fileData) {
      const comma = fileData.indexOf(",");
      const b64 = comma > -1 ? fileData.slice(comma + 1) : fileData;
      imageBuffer = Buffer.from(b64, "base64");
    }

    const result = await aiService.processImage(imageUrl, imageBuffer);

    if (!result.success) {
      console.error("[UPLOAD_API] AI extraction error:", result.error.message);
      await uploadService.updateStatus(uploadId, "completed");
      return;
    }

    const validClasses = result.data.classes.filter(
      (c) => c.subject && c.days.length > 0 && c.startTime && c.endTime
    );

    const metadata = {
      totalClasses: validClasses.length,
      confidence: result.data.metadata.confidence,
      notes: result.data.metadata.notes,
    };

    await uploadRepository.updateAiResult(
      uploadId,
      { classes: validClasses, metadata } as never,
      "completed"
    );
  } catch (err) {
    console.error("[UPLOAD_API] Background AI processing failed:", err);
    await uploadService.updateStatus(uploadId, "completed");
  }
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

    const uploadId = crypto.randomUUID();
    const base64 = Buffer.from(buffer).toString("base64");
    const dataUri = `data:${detectedMime};base64,${base64}`;

    const upload = await db.upload.create({
      data: {
        id: uploadId,
        userId: session.user.id,
        fileUrl: `/api/upload/${uploadId}/image`,
        fileName: file.name,
        fileSize: file.size,
        mimeType: detectedMime,
        status: "processing",
      },
    });

    // Store the image bytes separately so a missing migration column
    // can never block the upload from succeeding.
    try {
      await db.upload.update({
        where: { id: uploadId },
        data: { fileData: dataUri },
      });
    } catch (e) {
      console.error("[UPLOAD_API] Could not persist fileData (migration may be pending):", e);
    }

    auditLog("upload.create", { userId: session.user.id, uploadId: upload.id, fileName: file.name });

    // Respond immediately so the request never times out on the client.
    // AI extraction runs in the background and the client polls for status.
    const origin = new URL(request.url).origin;
    const absoluteUrl = `${origin}/api/upload/${upload.id}/image`;

    void runBackgroundProcessing(upload.id, absoluteUrl);

    return NextResponse.json({
      uploadId: upload.id,
      fileUrl: `/api/upload/${upload.id}/image`,
      status: "processing",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[UPLOAD_API] Error:", error);
    const uid = session?.user?.id ?? "NO_SESSION_USER";
    return NextResponse.json({ error: `Upload failed: ${message} [uid=${uid}]` }, { status: 500 });
  }
}
