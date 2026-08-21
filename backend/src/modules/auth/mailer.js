// Gmail SMTP transport. Uses an App Password (NOT the account password)
// — set EMAIL_USER and EMAIL_APP_PASSWORD in the environment.
//
// We deliberately create a single shared transporter at module load
// rather than per-send. Nodemailer's SMTP transport is built around a
// connection pool; reusing it avoids a TLS handshake on every email.
//
// If creds are missing we still export `sendMail` — it just logs a
// warning and resolves. That keeps the demo runnable when someone
// forgets to set env vars, and lets callers always log the payload
// as a fallback.
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
    '[mailer] EMAIL_USER / EMAIL_APP_PASSWORD not set — emails will NOT be sent. ' +
    'Falling back to server-console log only.',
  );
}

// Generic send. All concrete templates (OTP, volunteer request, etc.)
// are thin wrappers around this — it owns the transport, the fallback
// logging, and the never-throw contract.
export async function sendMail({ to, subject, text, html, tag = 'mail' }) {
  // Always log the payload — useful in dev, and acts as a safety net
  // when the SMTP send fails so the demo never gets stuck. The `tag`
  // lets us grep one kind of mail in the console (e.g. `[email-otp]`).
  console.log(`[${tag}] -> ${to} | ${subject}`);

  if (!transportReady) return { sent: false, reason: 'no_credentials' };

  try {
    const info = await transporter.sendMail({
      from: `"${FROM_NAME}" <${FROM_ADDRESS}>`,
      to,
      subject,
      text,
      html,
    });
    console.log(`[mailer] ${tag} sent to ${to} (messageId=${info.messageId})`);
    return { sent: true, messageId: info.messageId };
  } catch (err) {
    // Don't crash the caller — the console log above means a developer
    // can still see what would have been sent during the demo.
    console.error(`[mailer] ${tag} SMTP send failed for ${to}:`, err.message);
    return { sent: false, reason: 'smtp_error', error: err.message };
  }
}

// ===== Templates =====

// OTP verification email (10-minute code, 6 digits).
const OTP_TTL_MIN_DEFAULT = 10;

const otpText = (code, minutes) =>
  `Your Pulse verification code is: ${code}\n\n` +
  `It expires in ${minutes} minutes. If you didn't request this, ignore this email.\n`;

const otpHtml = (code, minutes) => `
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

export async function sendOtp({ to, code, ttlMinutes = OTP_TTL_MIN_DEFAULT }) {
  // Also dump the code on its own line so the dev can grab it from
  // a single `grep` even when subject/HTML rendering hides the rest.
  console.log(`[email-otp] code for ${to}: ${code} (ttl=${ttlMinutes}m)`);
  return sendMail({
    to,
    subject: 'Your Pulse verification code',
    text: otpText(code, ttlMinutes),
    html: otpHtml(code, ttlMinutes),
    tag: 'email-otp',
  });
}

// "Help needed nearby" notification for verified users within 200m of a
// medical or harassment incident. The recipient is a real person, not
// the reporter — the link points at the public tracking page.
const APP_URL = process.env.APP_URL || 'http://localhost:5173';

const volunteerText = ({ name, incident, appUrl }) => {
  const link = `${appUrl}/track/${incident.tracking_id}`;
  return [
    `Hi ${name},`,
    '',
    `A ${incident.category} incident was just reported ${incident.location_label ? `near ${incident.location_label}` : 'near you'} ` +
      `and you're within 200 m of it. If you can help, open the tracking page and tap "I'm responding" so the dispatcher can see backup is on the way.`,
    '',
    `Tracking ID: ${incident.tracking_id}`,
    `Tracking link: ${link}`,
    '',
    `If this isn't for you, just ignore this email.`,
    `— Pulse`,
  ].join('\n');
};

const volunteerHtml = ({ name, incident, appUrl }) => {
  const link = `${appUrl}/track/${incident.tracking_id}`;
  return `
    <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <h2 style="margin: 0 0 16px; color: #111;">Help needed nearby</h2>
      <p style="margin: 0 0 16px; color: #444; font-size: 15px; line-height: 1.5;">
        Hi ${name}, a <strong>${incident.category}</strong> incident was just reported${
          incident.location_label ? ` near <strong>${incident.location_label}</strong>` : ' near you'
        } and you're within 200 m of it.
      </p>
      <p style="margin: 0 0 24px; color: #444; font-size: 15px; line-height: 1.5;">
        If you can help, open the tracking page and tap <strong>“I'm responding”</strong> so the dispatcher can see backup is on the way.
      </p>
      <a href="${link}" style="display: inline-block; padding: 12px 20px; background: #111; color: #fff; border-radius: 8px; text-decoration: none; font-weight: 600;">
        Open tracking page
      </a>
      <p style="margin: 24px 0 0; color: #888; font-size: 13px;">
        Tracking ID: ${incident.tracking_id}<br/>
        If this isn't for you, just ignore this email.
      </p>
    </div>
  `;
};

export async function sendVolunteerRequest({ to, name, incident }) {
  return sendMail({
    to,
    subject: `Help needed nearby — ${incident.tracking_id}`,
    text: volunteerText({ name, incident, appUrl: APP_URL }),
    html: volunteerHtml({ name, incident, appUrl: APP_URL }),
    tag: 'volunteer',
  });
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
