import crypto from 'crypto';

export function allowedOrigin(event, allowedOrigins) {
  const { origin } = event.headers;

  const match = allowedOrigins.find(allowed => origin === allowed);

  return match || allowedOrigins[0];
}

// see https://gist.github.com/vlucas/2bd40f62d20c1d49237a109d491974eb
// encryptionKey must be 256 bits (32 bytes or 32 characters) and then base 64 encoded
function encrypt(text, encryptionKey) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(encryptionKey, 'base64'), iv);
  let encrypted = cipher.update(text);

  encrypted = Buffer.concat([encrypted, cipher.final()]);

  return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decrypt(text, encryptionKey) {
  const textParts = text.split(':');
  const iv = Buffer.from(textParts.shift(), 'hex');
  const encryptedText = Buffer.from(textParts.join(':'), 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(encryptionKey, 'base64'), iv);
  let decrypted = decipher.update(encryptedText);

  decrypted = Buffer.concat([decrypted, decipher.final()]);

  return decrypted.toString();
}

/* eslint-disable no-unused-vars */
export function sign(text, signingKey) {
  // TODO: sign
  return text;
}

export function verify(text, signingKey) {
  // TODO: sig verify, throw error if not valid sig
  return text;
}
/* eslint-enable no-unused-vars */

export function decryptAndVerify(cookieValue, {
  ENCRYPTION_KEY,
  // SIGNING_KEY,
}) {
  const decoded = decodeURIComponent(cookieValue);

  const verified = verify(decoded);

  const decrypted = decrypt(verified, ENCRYPTION_KEY);

  return JSON.parse(decrypted);
}

export function signAndEncrypt(value, {
  ENCRYPTION_KEY,
  // SIGNING_KEY,
}) {
  const json = JSON.stringify(value);

  const signed = sign(json);

  const encrypted = encrypt(signed, ENCRYPTION_KEY);

  const encoded = encodeURIComponent(encrypted);

  return encoded;
}

export function readCookies(cookieHeader, keys) {
  const cookies = cookie.parse(cookieHeader, {
    decode: val => decryptAndVerify(val, keys),
  });

  return cookies;
}

export function writeCookies(cookies, keys) {
  const setCookieHeader = Object.entries(cookies).map(
    ([name, value]) => cookie.serialize(name, value, {
      httpOnly: true,
      secure: true,
      encode: val => signAndEncrypt(val, keys),
    }),
  ).join('; ');

  return setCookieHeader;
}
