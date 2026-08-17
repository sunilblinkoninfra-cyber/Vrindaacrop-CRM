// Central typed access to environment configuration.

export const env = {
  appUrl: process.env.APP_URL ?? "http://localhost:3000",

  aws: {
    region: process.env.AWS_REGION ?? "ap-south-1",
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "",
    configurationSet: process.env.SES_CONFIGURATION_SET ?? "",
    fromEmail: process.env.SES_FROM_EMAIL ?? "outreach@example.com",
    fromName: process.env.SES_FROM_NAME ?? "VrindaaCorp Services",
    webhookSecret: process.env.SES_WEBHOOK_SECRET ?? "",
  },

  verifier: {
    provider: (process.env.EMAIL_VERIFIER ?? "none") as "none" | "neverbounce" | "zerobounce",
    apiKey: process.env.EMAIL_VERIFIER_API_KEY ?? "",
  },

  ai: {
    // "anthropic" (hosted) or "local" (OpenAI-compatible endpoint, e.g. Ollama/vLLM/LM Studio)
    provider: (process.env.AI_PROVIDER ?? "anthropic") as "anthropic" | "local",
    apiKey: process.env.ANTHROPIC_API_KEY ?? "",
    model: process.env.AI_MODEL ?? "claude-opus-5",
    localBaseUrl: process.env.LOCAL_AI_BASE_URL ?? "", // e.g. http://localhost:11434/v1
    localModel: process.env.LOCAL_AI_MODEL ?? "",
  },

  websearch: {
    provider: (process.env.WEBSEARCH_PROVIDER ?? "none") as "none" | "serper" | "searxng",
    apiKey: process.env.WEBSEARCH_API_KEY ?? "",
    baseUrl: process.env.WEBSEARCH_BASE_URL ?? "", // for self-hosted SearXNG
  },

  company: {
    alertEmail: process.env.COMPANY_ALERT_EMAIL ?? "",
    unattendedHours: parseInt(process.env.UNATTENDED_HOURS ?? "24", 10),
  },

  inbound: {
    formSecret: process.env.INBOUND_FORM_SECRET ?? "",
    metaVerifyToken: process.env.META_VERIFY_TOKEN ?? "",
    metaAppSecret: process.env.META_APP_SECRET ?? "",
    metaPageToken: process.env.META_PAGE_TOKEN ?? "",
    googleLeadKey: process.env.GOOGLE_LEAD_KEY ?? "",
  },

  whatsapp: {
    enabled: process.env.WHATSAPP_ENABLED === "true",
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? "",
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN ?? "",
    templateName: process.env.WHATSAPP_TEMPLATE_NAME ?? "hot_lead_alert",
  },

  sending: {
    dailyCap: parseInt(process.env.DAILY_SEND_CAP ?? "1000", 10),
    escalationHours: parseInt(process.env.ESCALATION_HOURS ?? "48", 10),
  },
};

export function isSesConfigured(): boolean {
  return Boolean(env.aws.accessKeyId && env.aws.secretAccessKey);
}
