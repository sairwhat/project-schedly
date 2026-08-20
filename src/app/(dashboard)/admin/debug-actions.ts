"use server";

import { headers } from "next/headers";
import { auth } from "@/server/lib/auth";

export async function debugGetSessionDirect() {
  try {
    const h = await headers();
    const cookieHeader = h.get("cookie") || "";

    let result: unknown = null;
    let error: string | null = null;

    try {
      result = await auth.api.getSession({
        headers: h,
        query: { disableCookieCache: true },
      });
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : String(e);
    }

    const session = result as { user?: Record<string, unknown> } | null;
    const userId = session?.user?.id ?? "none";
    const isAdmin = session?.user?.isAdmin ?? "none";
    const found = result !== null;

    return `OK cookieLen=${cookieHeader.length} found=${found} userId=${userId} isAdmin=${isAdmin} error=${error}`;
  } catch (e: unknown) {
    return `OUTER err=${e instanceof Error ? e.message : String(e)}`;
  }
}
