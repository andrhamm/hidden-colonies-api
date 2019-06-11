import crypto from 'crypto';
import cookie from 'cookie';

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

function decryptAndVerifyCookieValue(cookieValue, { encryptionKey }) {
  const decoded = decodeURIComponent(cookieValue);

  const verified = verify(decoded);

  const decrypted = decrypt(verified, encryptionKey);

  return decrypted;
}

function signAndEncryptCookieValue(cookieValue, { encryptionKey }) {
  const signed = sign(cookieValue);

  const encrypted = encrypt(signed, encryptionKey);

  const encoded = encodeURIComponent(encrypted);

  return encoded;
}

export function readCookies(cookieHeader, keys) {
  const cookies = cookie.parse(cookieHeader, {
    decode: val => decryptAndVerifyCookieValue(val, keys),
  });

  return cookies;
}

export function writeCookies(cookies, keys) {
  const setCookieHeader = Object.entries(cookies).map(
    ([name, value]) => cookie.serialize(name, value, {
      httpOnly: true,
      secure: true,
      encode: val => signAndEncryptCookieValue(val, keys),
    }),
  ).join('; ');

  return setCookieHeader;
}
