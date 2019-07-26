import jwt from 'jsonwebtoken';
import { updateConnections, echo } from '../lib/websockets';

const {
  DYNAMODB_TABLE_NAME_USERS,
  ENCRYPTION_KEY,
  WSS_BASE,
} = process.env;

const encryptionSecret = Buffer.from(ENCRYPTION_KEY, 'base64');

export const routeConnect = async (event, context, callback) => {
  console.log(`$connect event: ${JSON.stringify(event, null, 2)}`);

  const { token } = event.queryStringParameters;

  if (!token) {
    callback('Unauthorized: No token provided');
    return;
  }

  let uuid;
  try {
    ({ uuid } = jwt.verify(token, encryptionSecret));
  } catch (e) {
    callback('Unauthorized: Invalid token.');
    return;
  }

  await updateConnections(event, uuid, { DYNAMODB_TABLE_NAME_USERS });
  // NOTE: calling postToConnection would throw an exception

  callback(null, {
    statusCode: 200,
    body: 'Connected.',
  });
};

export const routeDefault = async (event, context, callback) => {
  console.log(`$default event: ${JSON.stringify(event, null, 2)}`);

  await echo(event, null, { WSS_BASE });

  callback(null, {
    statusCode: 200,
    body: 'OK.',
  });
};

export const routeDisconnect = async (event, context, callback) => {
  console.log(`$disonnect event: ${JSON.stringify(event, null, 2)}`);

  // NOTE: calling postToConnection would be pointless since the client has disconneted
  await updateConnections(event, null, { DYNAMODB_TABLE_NAME_USERS });

  callback(null, {
    statusCode: 200,
    body: 'Disconnected.',
  });
};
