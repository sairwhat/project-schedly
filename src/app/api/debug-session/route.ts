import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/server/lib/auth";

export async function GET() {
  const h = await headers();
  const cookieHeader = h.get("cookie") || "";
  
  const cookieNames = cookieHeader.split(";").map(p => p.trim().split("=")[0]);
  
  let sessionResult: unknown = null;
  let sessionError: string | null = null;
  let sessionStack: string | null = null;
  
  try {
    sessionResult = await auth.api.getSession({
      headers: h,
      query: { disableCookieCache: true },
    });
  } catch (e) {
    sessionError = e instanceof Error ? e.message : String(e);
    sessionStack = e instanceof Error ? e.stack ?? null : null;
  }

  return NextResponse.json({
    cookieLen: cookieHeader.length,
    cookieNames,
    sessionResult: sessionResult ? {
      userId: (sessionResult as { user?: Record<string, unknown> })?.user?.id,
      isAdmin: (sessionResult as { user?: Record<string, unknown> })?.user?.isAdmin,
    } : null,
    sessionError,
    sessionStack: sessionStack?.split("\n").slice(0, 5).join("\n"),
  });
}
