import jwt from 'jsonwebtoken';
import { simpleResponse } from '../lib/api';
import { getCurrentUserSub } from '../lib/cognito';
import { generateAllow, generateDeny } from '../lib/aws-clients';

const {
  ENCRYPTION_KEY,
} = process.env;

const encryptionSecret = Buffer.from(ENCRYPTION_KEY, 'base64');

export function handler(event, context, callback) {
  console.log(`event: ${JSON.stringify(event, null, 2)}`);

  const { token } = event.queryStringParameters;

  if (!token) {
    callback(null, generateDeny('user', event.methodArn, { reason: 'Missing token' }));
    return;
  }

  let uuid;
  try {
    ({ uuid } = jwt.verify(token, encryptionSecret));
  } catch (e) {
    callback(null, generateDeny('user', event.methodArn, { reason: 'Invalid token.' }));
    return;
  }

  if (!uuid) {
    callback(null, generateDeny('user', event.methodArn, { reason: 'Invalid token content' }));
  } else {
    // TODO: prevent multiple uses of this token (cache for the lifetime of the token, 30 seconds)
    console.log(`Decoded JWT: uuid=${uuid}`);
    callback(null, generateAllow('user', event.methodArn));
  }
}

export const getToken = async (event) => {
  console.log(`event: ${JSON.stringify(event, null, 2)}`);

  const uuid = getCurrentUserSub(event);

  const payload = { uuid };
  const token = jwt.sign(payload, encryptionSecret, {
    expiresIn: '30s',
  });

  return simpleResponse(event, null, 204, {
    'X-HC-Token': token,
  });
};
