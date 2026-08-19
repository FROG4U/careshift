import "server-only";
import nodemailer from "nodemailer";

/**
 * Outbound email (password resets).
 *
 * Configured entirely through env vars so no credentials live in the repo:
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
 *
 * If they're absent the app does NOT pretend to have sent anything —
 * `sendMail` returns false and the caller tells the user to contact their
 * manager. Silently swallowing a failed password reset would leave someone
 * waiting forever for an email that was never sent.
 */

export function mailConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS,
  );
}

let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT ?? 587);
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      // 465 is implicit TLS; 587 upgrades via STARTTLS.
      secure: port === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return transporter;
}

export async function sendMail(opts: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<boolean> {
  if (!mailConfigured()) {
    console.warn(
      "[mail] SMTP is not configured — refusing to pretend an email was sent.",
    );
    return false;
  }
  try {
    await getTransporter().sendMail({
      from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
      // Sending happens from a dedicated mail subdomain, which is not a real
      // mailbox. Point replies at one someone actually reads.
      ...(process.env.SMTP_REPLY_TO
        ? { replyTo: process.env.SMTP_REPLY_TO }
        : {}),
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
    });
    return true;
  } catch (err) {
    console.error("[mail] send failed:", err);
    return false;
  }
}

/** Plain, mobile-friendly reset email. */
export function resetEmail(name: string, link: string, minutes: number) {
  const text = `Hi ${name},

Someone asked to reset the password for your CareShift account.

Open this link to choose a new password:
${link}

The link works once and expires in ${minutes} minutes.

If you didn't ask for this you can ignore this email — your password hasn't changed.`;

  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.55;color:#1e293b">
  <p>Hi ${name},</p>
  <p>Someone asked to reset the password for your CareShift account.</p>
  <p style="margin:24px 0">
    <a href="${link}" style="background:#003146;color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:600;display:inline-block">Choose a new password</a>
  </p>
  <p style="font-size:13px;color:#64748b">Or paste this into your browser:<br><span style="word-break:break-all">${link}</span></p>
  <p style="font-size:13px;color:#64748b">The link works once and expires in ${minutes} minutes.</p>
  <p style="font-size:13px;color:#64748b">If you didn't ask for this you can ignore this email — your password hasn't changed.</p>
</div>`;

  return { text, html };
}
