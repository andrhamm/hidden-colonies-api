import uuidv4 from 'uuid/v4';
import { readCookies, writeCookies } from '../lib/cookie';

const {
  ENCRYPTION_KEY,
  SIGNING_KEY,
} = process.env;

export const handler = async (event) => {
  console.log(`event: ${JSON.stringify(event, null, 2)}`);

  const cookieKeys = {
    encryptionKey: ENCRYPTION_KEY,
    signingKey: SIGNING_KEY,
  };

  const cookieHeader = event.headers.cookie || event.headers.Cookie || '';

  const cookies = readCookies(cookieHeader, cookieKeys);

  console.log(`cookies: ${JSON.stringify(cookies, null, 2)}`);

  const uuid = uuidv4();

  const setCookieHeader = writeCookies(cookies, cookieKeys);

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': setCookieHeader,
    },
    body: JSON.stringify({
      uuid,
    }),
  };
};
