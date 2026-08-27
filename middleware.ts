import { withAuth } from "next-auth/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";

// Admin-only sections: only ADMIN and OWNER roles may enter.
const OWNER_ADMIN_PREFIXES = ["/import", "/campaigns", "/templates", "/settings"];

/**
 * Public login endpoint gets its own rate-limit middleware (5 attempts/min/IP).
 * We can't wrap the NextAuth credentials callback directly, so we intercept
 * here. Non-login paths fall through to the withAuth guard below.
 */
function loginRateLimit(req: NextRequest) {
  if (
    req.method === "POST" &&
    req.nextUrl.pathname === "/api/auth/callback/credentials"
  ) {
    return rateLimit(req, { bucket: "login", limit: 5, windowSeconds: 60 });
  }
  return null;
}

export default withAuth(
  function middleware(req) {
    const limited = loginRateLimit(req);
    if (limited) return limited;

    const role = (req.nextauth.token as { role?: string } | null)?.role;
    const path = req.nextUrl.pathname;
    if (role === "AGENT" && OWNER_ADMIN_PREFIXES.some((p) => path === p || path.startsWith(p + "/"))) {
      return NextResponse.redirect(new URL("/leads", req.url));
    }
    return NextResponse.next();
  },
  {
    callbacks: {
      // The login endpoint itself is public; everything else requires a session.
      authorized: ({ token, req }) =>
        req.nextUrl.pathname.startsWith("/api/auth") ? true : Boolean(token),
    },
  }
);

// Protect CRM app routes; leave auth, tracking, webhooks, unsubscribe, inbound
// capture, cron, and static assets (images, fonts, logo) public.
export const config = {
  matcher: [
    "/((?!api/auth|api/track|api/webhooks|api/unsubscribe|api/inbound|api/cron|login|_next/static|_next/image|favicon.ico|logo.png|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|woff|woff2|ttf)$).*)",
  ],
};
