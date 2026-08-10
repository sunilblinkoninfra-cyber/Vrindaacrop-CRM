export { default } from "next-auth/middleware";

// Protect the CRM app routes; leave auth, tracking, webhooks, and unsubscribe public.
export const config = {
  matcher: [
    "/((?!api/auth|api/track|api/webhooks|api/unsubscribe|login|_next/static|_next/image|favicon.ico).*)",
  ],
};
