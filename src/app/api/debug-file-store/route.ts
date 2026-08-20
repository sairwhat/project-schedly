import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/server/lib/auth";
import { db } from "@/server/db/client";
import { storeImage } from "@/server/services/file-store.service";

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });

    if (!session) {
      return NextResponse.json({ error: "Unauthorized", step: "auth" }, { status: 401 });
    }

    const dbUser = await db.user.findUnique({ where: { id: session.user.id } });
    if (!dbUser) {
      return NextResponse.json({ error: "Invalid session user", step: "dbUser" }, { status: 401 });
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json({ error: "Invalid formData", step: "formData" }, { status: 400 });
    }
    
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file", step: "file" }, { status: 400 });
    }

    const buffer = new Uint8Array(await file.arrayBuffer());
    const { detectImageMime } = await import("@/server/lib/security");
    const detectedMime = file.type === "application/pdf"
      ? "application/pdf"
      : detectImageMime(buffer);

    if (!detectedMime) {
      return NextResponse.json({ error: "Invalid mime", step: "mime", detectedMime: detectedMime, fileType: file.type }, { status: 400 });
    }

    const stored = await storeImage(
      session.user.id,
      buffer,
      detectedMime,
      file.name,
      { folder: "syllabi", status: "processing" }
    );

    return NextResponse.json({ 
      success: true, 
      stored,
      step: "complete"
    });
  } catch (err) {
    return NextResponse.json({ 
      error: err instanceof Error ? err.message : String(err),
      step: "catch",
      stack: err instanceof Error ? err.stack : undefined
    }, { status: 500 });
  }
}