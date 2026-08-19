import { type NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { auth } from "@/server/lib/auth";
import { db } from "@/server/db/client";
import { syllabusService } from "@/server/services/syllabus.service";
import { checkRateLimitDb, validateCsrf } from "@/server/lib/security";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dbUser = await db.user.findUnique({ where: { id: session.user.id } });
  if (!dbUser) {
    return NextResponse.json(
      { error: "Your session is invalid. Please sign out and sign in again." },
      { status: 401 }
    );
  }

  const rateCheck = await checkRateLimitDb(`syllabus:${session.user.id}`, 10, 60_000);
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
    } catch {
      return NextResponse.json(
        { error: "Invalid upload request. Make sure you are sending a multipart/form-data file." },
        { status: 400 }
      );
    }
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const maxSize = 20 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json({ error: "File too large (max 20MB)" }, { status: 400 });
    }

    if (file.size === 0) {
      return NextResponse.json({ error: "File is empty" }, { status: 400 });
    }

    const buffer = new Uint8Array(await file.arrayBuffer());
    const { detectImageMime } = await import("@/server/lib/security");
    const detectedMime = file.type === "application/pdf"
      ? "application/pdf"
      : detectImageMime(buffer);

    if (!detectedMime) {
      return NextResponse.json(
        { error: "File must be an image (JPEG, PNG, GIF, WebP, BMP) or PDF" },
        { status: 400 }
      );
    }

    const { storeImage } = await import("@/server/services/file-store.service");
    const stored = await storeImage(
      session.user.id,
      buffer,
      detectedMime,
      file.name,
      { folder: "syllabi", status: "processing" }
    );

    const upload = await syllabusService.createUpload(session.user.id, {
      url: stored.url,
      objectKey: stored.uploadId,
      name: file.name,
      size: file.size,
      mimeType: detectedMime,
    });

    // Pass raw buffer directly to AI — avoids re-fetching from URL (404 fix)
    if (process.env.OPENROUTER_API_KEY || process.env.GEMINI_API_KEY) {
      const task = syllabusService.processWithAi(upload.id, Buffer.from(buffer), detectedMime);
      void waitUntil(task);
      void task.catch((err) => {
        console.error("[SYLLABUS_API] Background AI extraction failed:", err);
      });
    } else {
      const result = await syllabusService.processWithAi(upload.id, Buffer.from(buffer), detectedMime);
      if (!result.success) {
        console.error("[SYLLABUS_API] Dev mode extraction failed:", result.error);
      }
    }

    return NextResponse.json({
      uploadId: upload.id,
      fileUrl: stored.url,
      status: "processing",
    });
  } catch (error) {
    console.error("[SYLLABUS_API] Error:", error);
    return NextResponse.json(
      { error: "Upload failed. Please try again." },
      { status: 500 }
    );
  }
}
