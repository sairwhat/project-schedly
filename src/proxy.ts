import { getSessionCookie } from "better-auth/cookies";
import { auth } from "@/server/lib/auth";
import { type NextRequest, NextResponse } from "next/server";

const publicRoutes = ["/login", "/register", "/"];
const publicApiRoutes = ["/api/auth"];
const verificationRoutes = ["/verify-email"];
const emailVerificationEnabled = process.env.RESEND_API_KEY === "true" || !!process.env.RESEND_API_KEY;

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublicApi = publicApiRoutes.some((route) => pathname.startsWith(route));
  if (isPublicApi) {
    return NextResponse.next();
  }

  const isVerification = verificationRoutes.some((route) =>
    pathname.startsWith(route)
  );

  const isPublic = publicRoutes.some(
    (route) => pathname === route || pathname.startsWith(route + "/")
  );

  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");

  const sessionCookie = getSessionCookie(request);

  if (!sessionCookie && !isPublic) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callback", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (sessionCookie && (pathname === "/login" || pathname === "/register")) {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      return NextResponse.next();
    }
    if (!emailVerificationEnabled || session.user.emailVerified) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    return NextResponse.redirect(
      new URL(
        `/verify-email/pending?email=${encodeURIComponent(session.user.email)}`,
        request.url
      )
    );
  }

  if (sessionCookie && !isPublic && !isVerification) {
    const session = await auth.api.getSession({ headers: request.headers });
    if (session && emailVerificationEnabled && !session.user.emailVerified) {
      return NextResponse.redirect(
        new URL(
          `/verify-email/pending?email=${encodeURIComponent(session.user.email)}`,
          request.url
        )
      );
    }
    if (session && isAdminRoute && !(session.user as Record<string, unknown>).isAdmin) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  if (sessionCookie && isVerification && !pathname.includes("/success")) {
    const session = await auth.api.getSession({ headers: request.headers });
    if (session?.user?.emailVerified) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|images|uploads|.*\\.(?:jpg|jpeg|png|gif|svg|webp|ico)).*)",
  ],
};
