import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/server/lib/auth";
import { db } from "@/server/db/client";
import { syllabusService } from "@/server/services/syllabus.service";
import { checkRateLimitDb, validateCsrf } from "@/server/lib/security";
import { storeImage } from "@/server/services/file-store.service";

export async function POST(request: NextRequest) {
  const steps: string[] = [];
  
  try {
    steps.push("start");
    
    const session = await auth.api.getSession({ headers: request.headers });
    steps.push("auth");
    if (!session) {
      return NextResponse.json({ error: "Unauthorized", steps }, { status: 401 });
    }

    const dbUser = await db.user.findUnique({ where: { id: session.user.id } });
    steps.push("dbUser");
    if (!dbUser) {
      return NextResponse.json({ error: "Invalid session user", steps }, { status: 401 });
    }

    const rateCheck = await checkRateLimitDb(`syllabus:${session.user.id}`, 10, 60_000);
    steps.push("rateLimit");
    if (!rateCheck.allowed) {
      return NextResponse.json({ error: "Rate limited", steps }, { status: 429 });
    }

    if (!validateCsrf(request)) {
      steps.push("csrf-fail");
      return NextResponse.json({ error: "Invalid CSRF", steps }, { status: 403 });
    }
    steps.push("csrf-ok");

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      steps.push("formData-fail");
      return NextResponse.json({ error: "Invalid formData", steps }, { status: 400 });
    }
    steps.push("formData-ok");
    
    const file = formData.get("file") as File | null;
    steps.push("file-get");
    if (!file) {
      return NextResponse.json({ error: "No file", steps }, { status: 400 });
    }

    const maxSize = 20 * 1024 * 1024;
    if (file.size > maxSize) {
      steps.push("size-fail");
      return NextResponse.json({ error: "File too large", steps }, { status: 400 });
    }

    if (file.size === 0) {
      steps.push("empty-fail");
      return NextResponse.json({ error: "File empty", steps }, { status: 400 });
    }

    steps.push("buffer-start");
    const buffer = new Uint8Array(await file.arrayBuffer());
    steps.push("buffer-ok");

    const { detectImageMime } = await import("@/server/lib/security");
    steps.push("detect-import");
    const detectedMime = file.type === "application/pdf"
      ? "application/pdf"
      : detectImageMime(buffer);
    steps.push("detect-ok");

    if (!detectedMime) {
      steps.push("mime-fail");
      return NextResponse.json({ error: "Invalid mime", steps, detectedMime, fileType: file.type }, { status: 400 });
    }

    steps.push("storeImage-start");
    const stored = await storeImage(
      session.user.id,
      buffer,
      detectedMime,
      file.name,
      { folder: "syllabi", status: "processing", dbFallback: true }
    );
    steps.push("storeImage-ok");

    steps.push("createUpload-start");
    const upload = await syllabusService.createUpload(session.user.id, {
      url: stored.url,
      objectKey: stored.uploadId,
      name: file.name,
      size: file.size,
      mimeType: detectedMime,
    });
    steps.push("createUpload-ok");

    steps.push("processWithAi-start");
    // This is the line that might fail - let's see
    const task = syllabusService.processWithAi(upload.id, Buffer.from(buffer), detectedMime);
    steps.push("processWithAi-async");
    
    // Don't wait for it
    void task.catch((err) => {
      console.error("[DEBUG] Background AI extraction failed:", err);
    });

    return NextResponse.json({ 
      success: true, 
      steps,
      uploadId: upload.id,
      stored 
    });
  } catch (err) {
    steps.push("catch");
    return NextResponse.json({ 
      error: err instanceof Error ? err.message : String(err),
      steps,
      stack: err instanceof Error ? err.stack : undefined
    }, { status: 500 });
  }
}