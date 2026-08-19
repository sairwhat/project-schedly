import { type NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/server/lib/security";

const publicRoutes = ["/login", "/register", "/"];
const publicApiRoutes = ["/api/auth", "/api/version", "/api/push", "/api/notifications", "/api/cron", "/api/admin/apk", "/api/admin/apk-download", "/api/upload", "/api/reminders/fire", "/api/integrations"];
const verificationRoutes = ["/verify-email"];

const SESSION_COOKIE_NAME =
  process.env.NODE_ENV === "production" ? "__Host-schedly-session" : "schedly-session";

function getSessionCookieFromRequest(request: NextRequest): string | null {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;
  const marker = `${SESSION_COOKIE_NAME}=`;
  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(marker)) {
      return trimmed.slice(marker.length);
    }
  }
  return null;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const method = request.method;
  if (["POST", "PUT", "DELETE", "PATCH"].includes(method)) {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const rateCheck = checkRateLimit(`global:${ip}:${method}`, 30, 10_000);
    if (!rateCheck.allowed) {
      return new NextResponse(
        JSON.stringify({ error: "Too many requests. Try again later." }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      );
    }
  }

  const isPublicApi = publicApiRoutes.some((route) => pathname.startsWith(route));
  if (isPublicApi) return NextResponse.next();

  const isVerification = verificationRoutes.some((route) => pathname.startsWith(route));
  const isPublic = publicRoutes.some((route) => pathname === route || pathname.startsWith(route + "/"));

  const sessionCookie = getSessionCookieFromRequest(request);

  if (!sessionCookie && !isPublic && !isVerification) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (sessionCookie && (pathname === "/" || pathname === "/login" || pathname === "/register")) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|images|uploads|offline.html|sw.js|manifest.webmanifest|.*\\.(?:jpg|jpeg|png|gif|svg|webp|ico)).*)",
  ],
};
