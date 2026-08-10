import {
  SESv2Client,
  SendEmailCommand,
} from "@aws-sdk/client-sesv2";
import { env, isSesConfigured } from "@/lib/env";
import { unsubscribeUrl } from "@/lib/email/render";

let client: SESv2Client | null = null;

function getClient(): SESv2Client {
  if (!client) {
    client = new SESv2Client({
      region: env.aws.region,
      credentials: {
        accessKeyId: env.aws.accessKeyId,
        secretAccessKey: env.aws.secretAccessKey,
      },
    });
  }
  return client;
}

export type SendArgs = {
  to: string;
  subject: string;
  html: string;
  leadId: string;
  /** correlation tag written into SES so webhook events map back to the lead. */
  tags?: Record<string, string>;
};

export type SendResult = { messageId: string; simulated: boolean };

/**
 * Send a single email through SES. If SES is not configured (no AWS creds) the
 * send is *simulated* — a fake message id is returned so the whole outreach flow
 * can be exercised in dev without real delivery.
 */
export async function sendEmail(args: SendArgs): Promise<SendResult> {
  if (!isSesConfigured()) {
    return { messageId: `sim-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, simulated: true };
  }

  const command = new SendEmailCommand({
    FromEmailAddress: `${env.aws.fromName} <${env.aws.fromEmail}>`,
    Destination: { ToAddresses: [args.to] },
    ConfigurationSetName: env.aws.configurationSet || undefined,
    EmailTags: args.tags
      ? Object.entries(args.tags).map(([Name, Value]) => ({ Name, Value }))
      : [{ Name: "leadId", Value: args.leadId }],
    Content: {
      Simple: {
        Subject: { Data: args.subject, Charset: "UTF-8" },
        Body: { Html: { Data: args.html, Charset: "UTF-8" } },
        Headers: [
          { Name: "List-Unsubscribe", Value: `<${unsubscribeUrl(args.leadId)}>` },
          { Name: "List-Unsubscribe-Post", Value: "List-Unsubscribe=One-Click" },
        ],
      },
    },
  });

  const res = await getClient().send(command);
  return { messageId: res.MessageId ?? `ses-${Date.now()}`, simulated: false };
}

/** Send a plain notification email (owner alerts). */
export async function sendNotificationEmail(to: string, subject: string, html: string): Promise<SendResult> {
  if (!isSesConfigured()) {
    return { messageId: `sim-notify-${Date.now()}`, simulated: true };
  }
  const command = new SendEmailCommand({
    FromEmailAddress: `${env.aws.fromName} <${env.aws.fromEmail}>`,
    Destination: { ToAddresses: [to] },
    Content: {
      Simple: {
        Subject: { Data: subject, Charset: "UTF-8" },
        Body: { Html: { Data: html, Charset: "UTF-8" } },
      },
    },
  });
  const res = await getClient().send(command);
  return { messageId: res.MessageId ?? `ses-${Date.now()}`, simulated: false };
}
