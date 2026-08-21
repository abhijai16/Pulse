import crypto from 'crypto';

// AES-256-GCM. key from env, padded/truncated to 32 bytes.
const KEY = Buffer.from(
  process.env.ENCRYPTION_KEY || 'pulse-demo-key-replace-me-in-production-32b!',
  'utf8'
).slice(0, 32);

if (KEY.length < 32) {
  // pad out to 32 bytes if someone set a short string
  const padded = Buffer.alloc(32);
  KEY.copy(padded);
  process.env.ENCRYPTION_KEY = padded.toString('base64');
}

export function encryptField(plaintext) {
  if (plaintext == null) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decryptField(payload) {
  if (!payload) return null;
  const buf = Buffer.from(payload, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}
