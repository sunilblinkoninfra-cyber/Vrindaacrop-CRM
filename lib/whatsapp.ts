import { env } from "@/lib/env";

export type WhatsAppResult = { ok: boolean; simulated: boolean; error?: string };

/**
 * Send a WhatsApp template message via the Meta Cloud API. If WhatsApp is not
 * enabled/configured the send is simulated (returns ok+simulated) so the flow
 * works end-to-end in dev.
 *
 * Uses a pre-approved template (env.whatsapp.templateName) with body params.
 */
export async function sendWhatsApp(to: string, params: string[]): Promise<WhatsAppResult> {
  if (!env.whatsapp.enabled || !env.whatsapp.accessToken || !env.whatsapp.phoneNumberId) {
    return { ok: true, simulated: true };
  }

  const url = `https://graph.facebook.com/v20.0/${env.whatsapp.phoneNumberId}/messages`;
  const body = {
    messaging_product: "whatsapp",
    to: to.replace(/[^\d+]/g, ""),
    type: "template",
    template: {
      name: env.whatsapp.templateName,
      language: { code: "en" },
      components: [
        {
          type: "body",
          parameters: params.map((text) => ({ type: "text", text })),
        },
      ],
    },
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.whatsapp.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, simulated: false, error: text };
    }
    return { ok: true, simulated: false };
  } catch (e) {
    return { ok: false, simulated: false, error: (e as Error).message };
  }
}
