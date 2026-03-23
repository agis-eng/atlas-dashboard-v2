import { getRedis, REDIS_KEYS } from "@/lib/redis";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const nodemailer = require("nodemailer");

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      accountId,
      to,
      cc,
      bcc,
      subject,
      text,
      html,
      inReplyTo,
      references,
    } = body;

    if (!to || !subject || !text) {
      return Response.json(
        { error: "to, subject, and text are required" },
        { status: 400 }
      );
    }

    // Load email settings from Redis
    const redis = getRedis();
    const settings = (await redis.get(REDIS_KEYS.emailSettings("default"))) as any;

    if (!settings?.accounts?.length) {
      return Response.json(
        { error: "No email accounts configured" },
        { status: 400 }
      );
    }

    // Find the account to send from
    const account = accountId
      ? settings.accounts.find((a: any) => a.id === accountId)
      : settings.accounts.find((a: any) => a.type === "smtp" && a.smtp?.host);

    if (!account || !account.smtp?.host) {
      return Response.json(
        { error: "No SMTP account found or configured" },
        { status: 400 }
      );
    }

    const transporter = nodemailer.createTransport({
      host: account.smtp.host,
      port: account.smtp.port || 587,
      secure: account.smtp.secure ?? true,
      auth: {
        user: account.smtp.username || account.email,
        pass: account.smtp.password,
      },
      tls: { rejectUnauthorized: false },
    });

    const mailOptions: Record<string, unknown> = {
      from: `${account.name} <${account.email}>`,
      to,
      subject,
      text,
      html: html || text,
    };

    if (cc) mailOptions.cc = cc;
    if (bcc) mailOptions.bcc = bcc;
    if (inReplyTo) mailOptions.inReplyTo = inReplyTo;
    if (references) mailOptions.references = Array.isArray(references) ? references.join(" ") : references;

    const info = await transporter.sendMail(mailOptions);

    return Response.json({
      success: true,
      messageId: info.messageId,
      from: account.email,
    });
  } catch (error: any) {
    console.error("Email send error:", error);
    return Response.json(
      { error: error.message || "Failed to send email" },
      { status: 500 }
    );
  }
}
