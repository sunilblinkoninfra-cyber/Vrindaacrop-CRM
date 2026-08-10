export { default } from "next-auth/middleware";

// Protect the CRM app routes; leave auth, tracking, webhooks, unsubscribe and the
// cron runner public (cron is guarded by CRON_SECRET, not the login session).
export const config = {
  matcher: [
    "/((?!api/auth|api/track|api/webhooks|api/unsubscribe|api/cron|login|_next/static|_next/image|favicon.ico).*)",
  ],
};
