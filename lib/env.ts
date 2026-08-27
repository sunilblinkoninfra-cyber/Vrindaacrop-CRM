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

  smtp: {
    host: process.env.SMTP_HOST ?? "smtp.office365.com",
    port: parseInt(process.env.SMTP_PORT ?? "587", 10),
    secure: process.env.SMTP_SECURE === "true",
    user: process.env.SMTP_USER ?? "",
    pass: process.env.SMTP_PASS ?? "",
    fromEmail: process.env.SMTP_FROM_EMAIL ?? process.env.SMTP_USER ?? process.env.SES_FROM_EMAIL ?? "",
    fromName: process.env.SMTP_FROM_NAME ?? process.env.SES_FROM_NAME ?? "VrindaaCorp Services",
  },

  imap: {
    host: process.env.IMAP_HOST ?? (process.env.SMTP_HOST?.includes("gmail.com") ? "imap.gmail.com" : process.env.SMTP_HOST?.replace(/^smtp\./, "imap.") ?? "imap.gmail.com"),
    port: parseInt(process.env.IMAP_PORT ?? "993", 10),
    secure: process.env.IMAP_SECURE !== "false",
    user: process.env.IMAP_USER ?? process.env.SMTP_USER ?? "",
    pass: process.env.IMAP_PASS ?? process.env.SMTP_PASS ?? "",
  },

  verifier: {
    provider: (process.env.EMAIL_VERIFIER ?? "none") as "none" | "neverbounce" | "zerobounce",
    apiKey: process.env.EMAIL_VERIFIER_API_KEY ?? "",
  },

  validation: {
    // Kill switch for the SMTP-probe batch job — Vercel/AWS blocks outbound
    // port 25 by default, so this can be turned off without a redeploy once
    // that's confirmed to be a dead end in production. Local checks (syntax,
    // disposable-domain, role, MX, typo) always run regardless of this flag.
    smtpProbeEnabled: process.env.SMTP_PROBE_ENABLED !== "false",
    revalidateDays: parseInt(process.env.EMAIL_REVALIDATE_DAYS ?? "30", 10),
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
    // Emergency upper bound. The database-backed SendingPlan is the primary
    // policy; this value can never be exceeded by the scheduler.
    dailyCap: parseInt(process.env.DAILY_SEND_CAP ?? "1000", 10),
    escalationHours: parseInt(process.env.ESCALATION_HOURS ?? "48", 10),
    schedulerMaxPerRun: parseInt(process.env.SCHEDULER_MAX_PER_RUN ?? "25", 10),
    schedulerIntervalMinutes: parseInt(process.env.SCHEDULER_INTERVAL_MINUTES ?? "5", 10),
    timezone: process.env.SEND_TIMEZONE ?? "Asia/Kolkata",
    sendWindowStart: process.env.SEND_WINDOW_START ?? "09:00",
    sendWindowEnd: process.env.SEND_WINDOW_END ?? "18:00",
  },
};

export function isSesConfigured(): boolean {
  return Boolean(env.aws.accessKeyId && env.aws.secretAccessKey);
}

export function isSmtpConfigured(): boolean {
  return Boolean(env.smtp.user && env.smtp.pass);
}

export function isImapConfigured(): boolean {
  return Boolean(env.imap.user && env.imap.pass);
}
