"use server";

import { headers } from "next/headers";
import { auth } from "@/server/lib/auth";

export async function debugGetSessionDirect() {
  const h = await headers();
  const cookieHeader = h.get("cookie") || "";
  
  let result: unknown = null;
  let error: string | null = null;
  
  try {
    result = await auth.api.getSession({
      headers: h,
      query: { disableCookieCache: true },
    });
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return {
    cookieLen: cookieHeader.length,
    cookieNames: cookieHeader.split(";").map(p => p.trim().split("=")[0]),
    sessionFound: result !== null,
    userId: result ? (result as { user?: Record<string, unknown> })?.user?.id : null,
    isAdmin: result ? (result as { user?: Record<string, unknown> })?.user?.isAdmin : null,
    error,
  };
}
