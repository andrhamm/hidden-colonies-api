import jwt from 'jsonwebtoken';
import {
  AWS, dynamodb, dynamodbMarshall, dynamodbUnmarshall,
} from '../lib/aws-clients';

const {
  DYNAMODB_TABLE_NAME_USERS,
  ENCRYPTION_KEY,
  WSS_BASE,
} = process.env;

const encryptionSecret = Buffer.from(ENCRYPTION_KEY, 'base64');

async function updateConnections(event, uuidIn) {
  const { eventType, connectionId, connectedAt } = event.requestContext;

  const isConnect = eventType === 'CONNECT';

  let uuid = uuidIn;

  let connectionParams = { partitionKey: `c:${connectionId}` };
  const TableName = DYNAMODB_TABLE_NAME_USERS;

  if (!isConnect) {
    const {
      Item: connectionMarshalled,
    } = await dynamodb.getItem({
      TableName,
      Key: dynamodbMarshall(connectionParams),
    }).promise();

    ({ uuid } = dynamodbUnmarshall(connectionMarshalled));
  }

  const setOperation = isConnect ? 'ADD' : 'DELETE';
  const userPromise = dynamodb.updateItem({
    TableName,
    Key: dynamodbMarshall({
      partitionKey: `u:${uuid}`,
    }),
    ExpressionAttributeValues: {
      ':connectionId': {
        SS: [connectionId],
      },
    },
    UpdateExpression: `${setOperation} connections :connectionId`,
    ReturnValues: 'NONE',
  }).promise();

  const promises = [userPromise];

  if (isConnect) {
    connectionParams = {
      ...connectionParams,
      connectionId,
      uuid,
      connectedAt,
    };
  }

  const connectionOperation = isConnect ? 'putItem' : 'deleteItem';
  const connectionOperationKey = isConnect ? 'Item' : 'Key';
  const connectionPromise = dynamodb[connectionOperation]({
    TableName,
    [connectionOperationKey]: dynamodbMarshall(connectionParams),
  }).promise();

  promises.push(connectionPromise);

  try {
    await Promise.all(promises);
  } catch (e) {
    console.log(e);
    throw e;
  }
}

async function echo(event, message) {
  const endpoint = `https://${WSS_BASE}`;
  console.log(`ApiGatewayManagementApi endpoint: ${endpoint}`);

  const apig = new AWS.ApiGatewayManagementApi({
    apiVersion: '2018-11-29',
    endpoint,
  });

  try {
    await apig
      .postToConnection({
        ConnectionId: event.requestContext.connectionId,
        Data: message || `message received: ${event.body}`,
      })
      .promise();
  } catch (e) {
    console.log(e);
  }
}

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

  await updateConnections(event, uuid);
  // NOTE: calling postToConnection would throw an exception

  callback(null, {
    statusCode: 200,
    body: 'Connected.',
  });
};

export const routeDefault = async (event, context, callback) => {
  console.log(`$default event: ${JSON.stringify(event, null, 2)}`);

  await echo(event);

  callback(null, {
    statusCode: 200,
    body: 'OK.',
  });
};

export const routeDisconnect = async (event, context, callback) => {
  console.log(`$disonnect event: ${JSON.stringify(event, null, 2)}`);

  // NOTE: calling postToConnection would be pointless since the client has disconneted
  await updateConnections(event);

  callback(null, {
    statusCode: 200,
    body: 'Disconnected.',
  });
};
