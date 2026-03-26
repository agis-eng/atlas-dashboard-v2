import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { decryptSessionFromCookie } from "@/lib/session";

const PUBLIC_PATHS = ["/login", "/register"];
const PUBLIC_PREFIXES = ["/api/auth/", "/api/twilio/", "/_next/", "/favicon.ico"];

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Let public paths through immediately
  if (isPublic(pathname)) {
    // If already authenticated, redirect away from /login and /register
    if (pathname === "/login" || pathname === "/register") {
      const cookieValue = request.cookies.get("atlas_session")?.value;
      const session = await decryptSessionFromCookie(cookieValue);
      if (session) {
        return NextResponse.redirect(new URL("/", request.url));
      }
    }
    return NextResponse.next();
  }

  // All other routes require authentication
  const cookieValue = request.cookies.get("atlas_session")?.value;
  const session = await decryptSessionFromCookie(cookieValue);

  if (!session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Pass userId downstream via header so API routes can trust it
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-user-id", session.userId);
  requestHeaders.set("x-user-email", session.email);
  requestHeaders.set("x-user-name", session.name);
  requestHeaders.set("x-user-profile", session.profile);

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
