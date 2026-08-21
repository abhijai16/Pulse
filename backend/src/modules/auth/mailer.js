// Gmail SMTP transport. Uses an App Password (NOT the account password)
// — set EMAIL_USER and EMAIL_APP_PASSWORD in the environment.
//
// We deliberately create a single shared transporter at module load
// rather than per-send. Nodemailer's SMTP transport is built around a
// connection pool; reusing it avoids a TLS handshake on every OTP.
//
// If creds are missing we still export `sendOtp` — it just logs a
// warning and resolves. That keeps the demo runnable when someone
// forgets to set env vars, and lets otp.js always log the code to
// the console as a fallback.
import nodemailer from 'nodemailer';

const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_APP_PASSWORD = process.env.EMAIL_APP_PASSWORD;
// Override for development without touching code. Defaults to Gmail.
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
// Address shown as the sender. Falls back to EMAIL_USER.
const FROM_ADDRESS = process.env.EMAIL_FROM || EMAIL_USER || 'no-reply@pulse.local';
const FROM_NAME = process.env.EMAIL_FROM_NAME || 'Pulse';

let transporter = null;
let transportReady = false;

if (EMAIL_USER && EMAIL_APP_PASSWORD) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465, // implicit TLS for 465, STARTTLS otherwise
    auth: {
      user: EMAIL_USER,
      pass: EMAIL_APP_PASSWORD,
    },
  });
  transportReady = true;
} else {
  console.warn(
    '[mailer] EMAIL_USER / EMAIL_APP_PASSWORD not set — OTP emails will NOT be sent. ' +
    'Falling back to server-console log only.',
  );
}

const SUBJECT = 'Your Pulse verification code';

// Plain-text fallback for clients that strip HTML.
const textBody = (code, minutes) =>
  `Your Pulse verification code is: ${code}\n\n` +
  `It expires in ${minutes} minutes. If you didn't request this, ignore this email.\n`;

// Minimal, inline-styled HTML. No external assets — Gmail clips emails
// that pull remote resources, and OTP mail should never look like
// marketing anyway.
const htmlBody = (code, minutes) => `
  <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
    <h2 style="margin: 0 0 16px; color: #111;">Your Pulse verification code</h2>
    <p style="margin: 0 0 24px; color: #444; font-size: 15px; line-height: 1.5;">
      Enter this code to finish setting up your Pulse account. It expires in ${minutes} minutes.
    </p>
    <div style="font-size: 32px; letter-spacing: 8px; font-weight: 700; padding: 16px 24px; background: #f4f4f5; border-radius: 8px; text-align: center; color: #111;">
      ${code}
    </div>
    <p style="margin: 24px 0 0; color: #888; font-size: 13px;">
      If you didn't request this, you can safely ignore this email.
    </p>
  </div>
`;

export async function sendOtp({ to, code, ttlMinutes = 10 }) {
  // Always log the code — useful in dev, and acts as a safety net when
  // the SMTP send fails so the demo never gets stuck.
  console.log(`[email-otp] code for ${to}: ${code} (ttl=${ttlMinutes}m)`);

  if (!transportReady) return { sent: false, reason: 'no_credentials' };

  try {
    const info = await transporter.sendMail({
      from: `"${FROM_NAME}" <${FROM_ADDRESS}>`,
      to,
      subject: SUBJECT,
      text: textBody(code, ttlMinutes),
      html: htmlBody(code, ttlMinutes),
    });
    console.log(`[mailer] OTP sent to ${to} (messageId=${info.messageId})`);
    return { sent: true, messageId: info.messageId };
  } catch (err) {
    // Don't crash the request — the code is still in the store, and the
    // console.log above means a developer can still grab it for the demo.
    console.error(`[mailer] SMTP send failed for ${to}:`, err.message);
    return { sent: false, reason: 'smtp_error', error: err.message };
  }
}

// Exposed so a future test/health check can verify the transport
// without actually sending mail.
export async function verifyTransport() {
  if (!transportReady) return { ok: false, reason: 'no_credentials' };
  try {
    await transporter.verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
