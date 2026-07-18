import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

const publicRoutes = ["/login", "/register", "/"];
const publicApiRoutes = ["/api/auth", "/api/version", "/api/admin/apk", "/api/admin/apk-download"];
const verificationRoutes = ["/verify-email"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublicApi = publicApiRoutes.some((route) => pathname.startsWith(route));
  if (isPublicApi) return NextResponse.next();

  const isVerification = verificationRoutes.some((route) => pathname.startsWith(route));
  const isPublic = publicRoutes.some((route) => pathname === route || pathname.startsWith(route + "/"));

  const sessionCookie = getSessionCookie(request);

  if (!sessionCookie && !isPublic) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callback", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (sessionCookie && (pathname === "/" || pathname === "/login" || pathname === "/register")) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|images|uploads|.*\\.(?:jpg|jpeg|png|gif|svg|webp|ico)).*)",
  ],
};
