import { NextResponse } from "next/server";

export async function GET() {
  try {
    const { headers } = await import("next/headers");
    const { auth } = await import("@/server/lib/auth");
    const { syllabusService } = await import("@/server/services/syllabus.service");

    const h = await headers();
    const session = await auth.api.getSession({ headers: h });

    return NextResponse.json({
      hasSession: !!session,
      userId: session?.user?.id,
      isAdmin: session?.user ? (session.user as any).isAdmin : false,
      headers: Object.fromEntries(h.entries()),
    });
  } catch (err) {
    return NextResponse.json({ 
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined
    }, { status: 500 });
  }
}