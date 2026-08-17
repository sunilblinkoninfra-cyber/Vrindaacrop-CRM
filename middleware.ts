import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

// Admin-only sections: only ADMIN and OWNER roles may enter.
const OWNER_ADMIN_PREFIXES = ["/import", "/campaigns", "/templates", "/settings"];

export default withAuth(
  function middleware(req) {
    const role = (req.nextauth.token as { role?: string } | null)?.role;
    const path = req.nextUrl.pathname;
    if (role === "AGENT" && OWNER_ADMIN_PREFIXES.some((p) => path === p || path.startsWith(p + "/"))) {
      return NextResponse.redirect(new URL("/leads", req.url));
    }
    return NextResponse.next();
  },
  {
    callbacks: { authorized: ({ token }) => Boolean(token) },
  }
);

// Protect CRM app routes; leave auth, tracking, webhooks, unsubscribe, inbound
// capture, and the cron runner public (those authenticate via their own secrets).
export const config = {
  matcher: [
    "/((?!api/auth|api/track|api/webhooks|api/unsubscribe|api/inbound|api/cron|login|_next/static|_next/image|favicon.ico).*)",
  ],
};
