import { NextResponse } from "next/server";

export async function GET() {
  try {
    const { headers } = await import("next/headers");
    const { auth } = await import("@/server/lib/auth");
    const { syllabusService } = await import("@/server/services/syllabus.service");

    const h = await headers();
    const session = await auth.api.getSession({ headers: h });

    if (!session) {
      return NextResponse.json({ error: "No session", userId: null });
    }

    const uploads = await syllabusService.getUploadsByUser(session.user.id);
    return NextResponse.json({ 
      success: true, 
      userId: session.user.id,
      isAdmin: (session.user as any).isAdmin,
      uploadsCount: uploads.length,
      uploads 
    });
  } catch (err) {
    return NextResponse.json({ 
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined
    }, { status: 500 });
  }
}