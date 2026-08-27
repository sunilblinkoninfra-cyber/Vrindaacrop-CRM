import {
  SESv2Client,
  SendEmailCommand,
} from "@aws-sdk/client-sesv2";
import nodemailer from "nodemailer";
import { env, isSesConfigured, isSmtpConfigured } from "@/lib/env";
import { unsubscribeUrl } from "@/lib/email/render";

let sesClient: SESv2Client | null = null;
let smtpTransporter: nodemailer.Transporter | null = null;

function getSesClient(): SESv2Client {
  if (!sesClient) {
    sesClient = new SESv2Client({
      region: env.aws.region,
      credentials: {
        accessKeyId: env.aws.accessKeyId,
        secretAccessKey: env.aws.secretAccessKey,
      },
    });
  }
  return sesClient;
}

function getSmtpTransporter(): nodemailer.Transporter {
  if (!smtpTransporter) {
    smtpTransporter = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.secure,
      auth: {
        user: env.smtp.user,
        pass: env.smtp.pass,
      },
    });
  }
  return smtpTransporter;
}

export type OutboundSenderInfo = {
  provider: "smtp" | "ses" | "simulated";
  fromEmail: string;
  fromName: string;
  host?: string;
  isConfigured: boolean;
};

export function getActiveOutboundSender(): OutboundSenderInfo {
  if (isSmtpConfigured()) {
    const fromEmail = env.smtp.fromEmail || env.smtp.user || "sales@vrindaacorp.com";
    const fromName = env.smtp.fromName || "VrindaaCorp Services";
    return {
      provider: "smtp",
      fromEmail,
      fromName,
      host: env.smtp.host,
      isConfigured: true,
    };
  }
  if (isSesConfigured()) {
    const fromEmail = env.aws.fromEmail || "outreach@vrindaacorp.com";
    const fromName = env.aws.fromName || "VrindaaCorp Services";
    return {
      provider: "ses",
      fromEmail,
      fromName,
      isConfigured: true,
    };
  }
  return {
    provider: "simulated",
    fromEmail: "sales@vrindaacorp.com",
    fromName: "VrindaaCorp Services (Simulated)",
    isConfigured: false,
  };
}

export type SendArgs = {
  to: string;
  subject: string;
  html: string;
  leadId: string;
  /** correlation tag written into SES / headers so webhook events map back to the lead. */
  tags?: Record<string, string>;
};

export type SendResult = { messageId: string; simulated: boolean; fromEmail: string };

/**
 * Send a single email through Microsoft 365 / Gmail (SMTP) or AWS SES.
 * If neither is configured (no creds), the send is *simulated*.
 */
export async function sendEmail(args: SendArgs): Promise<SendResult> {
  const activeSender = getActiveOutboundSender();

  // 1. Check Microsoft 365 / Gmail / SMTP provider first
  if (isSmtpConfigured()) {
    const transport = getSmtpTransporter();
    const fromEmail = activeSender.fromEmail;
    const fromName = activeSender.fromName;
    const fromAddr = `"${fromName}" <${fromEmail}>`;

    const info = await transport.sendMail({
      from: fromAddr,
      replyTo: fromEmail,
      to: args.to,
      subject: args.subject,
      html: args.html,
      headers: {
        "List-Unsubscribe": `<${unsubscribeUrl(args.leadId)}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        "X-Lead-ID": args.leadId,
      },
    });
    return { messageId: info.messageId || `smtp-${Date.now()}`, simulated: false, fromEmail };
  }

  // 2. Check AWS SES provider
  if (isSesConfigured()) {
    const fromEmail = activeSender.fromEmail;
    const fromName = activeSender.fromName;

    const command = new SendEmailCommand({
      FromEmailAddress: `"${fromName}" <${fromEmail}>`,
      ReplyToAddresses: [fromEmail],
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

    const res = await getSesClient().send(command);
    return { messageId: res.MessageId ?? `ses-${Date.now()}`, simulated: false, fromEmail };
  }

  // 3. Fallback to simulation mode if no credentials configured
  return {
    messageId: `sim-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    simulated: true,
    fromEmail: activeSender.fromEmail,
  };
}

/** Send a plain notification email (owner alerts). */
export async function sendNotificationEmail(to: string, subject: string, html: string): Promise<SendResult> {
  const activeSender = getActiveOutboundSender();

  if (isSmtpConfigured()) {
    const transport = getSmtpTransporter();
    const fromEmail = activeSender.fromEmail;
    const fromName = activeSender.fromName;
    const fromAddr = `"${fromName}" <${fromEmail}>`;

    const info = await transport.sendMail({
      from: fromAddr,
      replyTo: fromEmail,
      to,
      subject,
      html,
    });
    return { messageId: info.messageId || `smtp-notify-${Date.now()}`, simulated: false, fromEmail };
  }

  if (isSesConfigured()) {
    const fromEmail = activeSender.fromEmail;
    const fromName = activeSender.fromName;

    const command = new SendEmailCommand({
      FromEmailAddress: `"${fromName}" <${fromEmail}>`,
      ReplyToAddresses: [fromEmail],
      Destination: { ToAddresses: [to] },
      Content: {
        Simple: {
          Subject: { Data: subject, Charset: "UTF-8" },
          Body: { Html: { Data: html, Charset: "UTF-8" } },
        },
      },
    });
    const res = await getSesClient().send(command);
    return { messageId: res.MessageId ?? `ses-${Date.now()}`, simulated: false, fromEmail };
  }

  return { messageId: `sim-notify-${Date.now()}`, simulated: true, fromEmail: activeSender.fromEmail };
}
