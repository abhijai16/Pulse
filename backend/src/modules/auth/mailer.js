// gmail SMTP. uses an App Password (not the account password) —
// set EMAIL_USER and EMAIL_APP_PASSWORD in .env.
//
// single shared transporter at module load. nodemailer pools the
// connection internally; reusing it avoids a TLS handshake per send.
//
// if creds are missing we still export sendMail — it just logs and
// resolves, so the demo runs even when someone forgot the env vars.
import nodemailer from 'nodemailer';

const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_APP_PASSWORD = process.env.EMAIL_APP_PASSWORD;
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const FROM_ADDRESS = process.env.EMAIL_FROM || EMAIL_USER || 'no-reply@pulse.local';
const FROM_NAME = process.env.EMAIL_FROM_NAME || 'Pulse';

let transporter = null;
let transportReady = false;

if (EMAIL_USER && EMAIL_APP_PASSWORD) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465, // implicit TLS on 465, STARTTLS otherwise
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

// generic send. all the templates (otp, volunteer request, etc.)
// are thin wrappers around this.
export async function sendMail({ to, subject, text, html, tag = 'mail' }) {
  // always log the payload. useful in dev, and a safety net when SMTP
  // fails so the demo doesn't get stuck. `tag` lets us grep one kind
  // of mail in the console (e.g. `[email-otp]`).
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
    // don't crash the caller. the log line above means a dev can
    // still see what would have been sent during the demo.
    console.error(`[mailer] ${tag} SMTP send failed for ${to}:`, err.message);
    return { sent: false, reason: 'smtp_error', error: err.message };
  }
}

// ===== templates =====

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
  // also dump the code on its own line so a dev can grep it out
  // even when the subject/HTML hides it
  console.log(`[email-otp] code for ${to}: ${code} (ttl=${ttlMinutes}m)`);
  return sendMail({
    to,
    subject: 'Your Pulse verification code',
    text: otpText(code, ttlMinutes),
    html: otpHtml(code, ttlMinutes),
    tag: 'email-otp',
  });
}

// "help needed nearby" email — goes to verified users within 200m of
// a medical/harassment incident. recipient is a real person, not the
// reporter. link points at the public tracking page.
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

// exposed so a future health check can verify the transport without
// actually sending anything
export async function verifyTransport() {
  if (!transportReady) return { ok: false, reason: 'no_credentials' };
  try {
    await transporter.verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
