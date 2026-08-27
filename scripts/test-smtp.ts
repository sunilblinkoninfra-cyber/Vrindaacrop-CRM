import "dotenv/config";
import nodemailer from "nodemailer";
import { env, isSmtpConfigured } from "@/lib/env";

async function testSmtp() {
  console.log("\n==========================================");
  console.log("   VrindaaCorp CRM - SMTP Test Utility   ");
  console.log("==========================================\n");

  console.log("1. Checking SMTP Configuration in .env:");
  console.log(` - SMTP_HOST:       ${env.smtp.host || "(not set)"}`);
  console.log(` - SMTP_PORT:       ${env.smtp.port || "(not set)"}`);
  console.log(` - SMTP_SECURE:     ${env.smtp.secure}`);
  console.log(` - SMTP_USER:       ${env.smtp.user ? env.smtp.user : "(not set)"}`);
  console.log(` - SMTP_PASS:       ${env.smtp.pass ? "******** (" + env.smtp.pass.length + " chars)" : "(not set)"}`);
  console.log(` - SMTP_FROM_EMAIL: ${env.smtp.fromEmail || "(not set)"}`);
  console.log(` - SMTP_FROM_NAME:  ${env.smtp.fromName || "(not set)"}`);

  if (!isSmtpConfigured()) {
    console.error("\n❌ Error: SMTP is not fully configured. Please ensure SMTP_USER and SMTP_PASS are set in .env.");
    process.exit(1);
  }

  console.log("\n2. Connecting to SMTP Server & Verifying Credentials...");
  const transporter = nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: env.smtp.secure,
    auth: {
      user: env.smtp.user,
      pass: env.smtp.pass,
    },
  });

  try {
    await transporter.verify();
    console.log("✅ SMTP Connection Successful! Credentials are valid.");
  } catch (error: any) {
    console.error("\n❌ SMTP Connection Failed:");
    console.error(error.message || error);
    if (error.code === "EAUTH") {
      console.error("\nTip: Authentication failed. For Gmail, make sure 2FA is ON and you are using a 16-character App Password (without spaces), NOT your regular Gmail password.");
    }
    process.exit(1);
  }

  const targetEmail = process.argv[2] || env.smtp.user;
  console.log(`\n3. Sending a test email to: ${targetEmail}...`);

  try {
    const info = await transporter.sendMail({
      from: `${env.smtp.fromName} <${env.smtp.fromEmail}>`,
      to: targetEmail,
      subject: "VrindaaCorp CRM — SMTP Test Email",
      html: `
        <div style="font-family: sans-serif; padding: 20px; line-height: 1.6; color: #333;">
          <h2 style="color: #0f172a;">🎉 SMTP Configuration Successful!</h2>
          <p>This is a test email sent from <strong>VrindaaCorp CRM</strong> via <code>${env.smtp.host}</code>.</p>
          <p>Your outreach campaigns and notification system are now ready to send live emails.</p>
          <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
          <small style="color: #64748b;">Sent at ${new Date().toISOString()}</small>
        </div>
      `,
    });

    console.log(`✅ Test email delivered successfully!`);
    console.log(` - Message ID: ${info.messageId}`);
    console.log(` - Response:   ${info.response}`);
    console.log("\n🚀 You are ready to start the CRM and Worker!\n");
  } catch (sendError: any) {
    console.error("\n❌ Failed to send test email:");
    console.error(sendError.message || sendError);
    process.exit(1);
  }
}

testSmtp();
