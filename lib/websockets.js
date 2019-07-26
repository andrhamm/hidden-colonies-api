import pMap from 'p-map';
import {
  AWS, dynamodb, dynamodbMarshall, dynamodbUnmarshall, ses,
} from './aws-clients';

export async function getUuidForConnection(connectionId, { DYNAMODB_TABLE_NAME_USERS }) {
  const {
    Item: connectionMarshalled,
  } = await dynamodb.getItem({
    TableName: DYNAMODB_TABLE_NAME_USERS,
    Key: dynamodbMarshall({ partitionKey: `c:${connectionId}` }),
  }).promise();

  const { uuid } = dynamodbUnmarshall(connectionMarshalled);

  return uuid;
}

export async function updateConnections(event, uuidIn, { DYNAMODB_TABLE_NAME_USERS }) {
  const { eventType, connectionId, connectedAt } = event.requestContext;

  const isConnect = eventType === 'CONNECT';

  let uuid = uuidIn;

  if (!uuid || !isConnect) {
    uuid = await getUuidForConnection(connectionId, { DYNAMODB_TABLE_NAME_USERS });
  }

  let connectionParams = { partitionKey: `c:${connectionId}` };
  const TableName = DYNAMODB_TABLE_NAME_USERS;
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

export function sendEventWss(connectionIds, event, data, { ts: tsIn, WSS_BASE, concurrency = 4 }) {
  const endpoint = `https://${WSS_BASE}`;

  const apig = new AWS.ApiGatewayManagementApi({
    apiVersion: '2018-11-29',
    endpoint,
  });

  const connections = Array.isArray(connectionIds) ? connectionIds : [connectionIds];

  return pMap(connections, (connectionId) => {
    const ts = tsIn || Date.now();

    return apig
      .postToConnection({
        ConnectionId: connectionId,
        Data: JSON.stringify({ event, data, ts }),
      })
      .promise();
  }, { concurrency });
}

export function sendEventEmail(email, name, event, data, { SES_EMAIL_DOMAIN }) {
  const { gameId, isInvite } = data;
  // TODO: prod URL
  const gameUrl = `http://${SES_EMAIL_DOMAIN}:3000/games/${gameId}`;
  const subject = isInvite ? 'You\'ve been invited to a game of Hidden Colonies!' : 'Come back to Hidden Colonies, it\'s your turn!';

  const html = `Click <a href="${gameUrl}" >here</a> to join the game in progress!`;
  const text = `Click the link below to join the game in progress!\n\n${gameUrl}`;
  return ses.sendEmail({
    Destination: {
      ToAddresses: [
        `${name} <${email}>`,
      ],
    },
    Message: {
      Body: {
        Html: {
          Data: html,
          Charset: 'UTF-8',
        },
        Text: {
          Data: text,
          Charset: 'UTF-8',
        },
      },
      Subject: {
        Data: subject,
        Charset: 'UTF-8',
      },
    },
    Source: SES_EMAIL_DOMAIN,
    ReplyToAddresses: [
      `no-reply@${SES_EMAIL_DOMAIN}`,
    ],
    ReturnPath: 'STRING_VALUE',
    ReturnPathArn: 'STRING_VALUE',
    SourceArn: 'STRING_VALUE',
    Tags: [
      {
        Name: 'gameEvent',
        Value: event,
      },
    ],
  }).promise();
}

export async function echo(event, message, { WSS_BASE }) {
  try {
    await sendEventWss(
      event.requestContext.connectionId,
      'echo',
      message || event.body,
      { WSS_BASE },
    );
  } catch (e) {
    console.log(e);
  }
}

export async function getUsers(uuidsIn, { DYNAMODB_TABLE_NAME_USERS }) {
  const uuids = [...new Set(uuidsIn)];

  if (uuids.length < 1) {
    return {};
  }

  let reqItems = {
    [DYNAMODB_TABLE_NAME_USERS]: {
      Keys: uuids.map(uuid => dynamodbMarshall({ partitionKey: `u:${uuid}` })),
      ExpressionAttributeNames: {
        '#UUID': 'uuid',
        '#NAME': 'name',
      },
      ProjectionExpression: '#UUID, #NAME, email, username, connections',
      // ConsistentRead: true,
    },
  };

  const users = [];
  let usersPage;

  do {
    /* eslint-disable no-await-in-loop */
    console.log(`batchGetItem: ${JSON.stringify(reqItems, null, 2)}`);
    const resp = await dynamodb.batchGetItem({ RequestItems: reqItems }).promise();

    console.log(`resp: ${JSON.stringify(resp, null, 2)}`);

    ({
      Responses: {
        [DYNAMODB_TABLE_NAME_USERS]: usersPage,
      },
      UnprocessedKeys: reqItems,
    } = resp);
    /* eslint-enable no-await-in-loop */

    if (usersPage.length) {
      users.push(...usersPage);
    }

    if (reqItems && reqItems[DYNAMODB_TABLE_NAME_USERS]) {
      console.log(`looping for UnprocessedKeys (${reqItems[DYNAMODB_TABLE_NAME_USERS].length})`);
    }
  } while (reqItems[DYNAMODB_TABLE_NAME_USERS]);

  const connectionMap = users.reduce((acc, userMarshalled) => {
    const {
      connections: connectionsM,
    } = userMarshalled;

    const connections = connectionsM ? connectionsM.SS : [];

    const {
      uuid,
      name,
      email,
      username,
    } = dynamodbUnmarshall(userMarshalled);

    acc[uuid] = {
      uuid,
      name,
      email,
      username,
      connections,
    };

    return acc;
  }, {});

  console.log(`connectionMap: ${JSON.stringify(connectionMap, null, 2)}`);

  return connectionMap;
}

export async function getUserForConnection(connectionId, { DYNAMODB_TABLE_NAME_USERS }) {
  const uuid = await getUuidForConnection(connectionId, { DYNAMODB_TABLE_NAME_USERS });

  const users = await getUsers([uuid], { DYNAMODB_TABLE_NAME_USERS });

  return users && users[uuid] ? users[uuid] : null;
}
