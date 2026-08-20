import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/server/lib/auth";
import { db } from "@/server/db/client";
import { syllabusService } from "@/server/services/syllabus.service";
import { checkRateLimitDb, validateCsrf } from "@/server/lib/security";

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });

    return NextResponse.json({
      hasSession: !!session,
      userId: session?.user?.id,
      isAdmin: session?.user ? (session.user as any).isAdmin : false,
      headers: Object.fromEntries(request.headers.entries()),
    });
  } catch (err) {
    return NextResponse.json({ 
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined
    }, { status: 500 });
  }
}