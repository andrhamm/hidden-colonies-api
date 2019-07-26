// import pMap from 'p-map';
// import PQueue from 'p-queue';
// import _pick from 'lodash.pick';
//
// import {
//   AWS, dynamodb, dynamodbMarshall, dynamodbUnmarshall,
// } from '../lib/aws-clients';
//
import { Validator } from 'jsonschema';
import { getUuidForConnection, getUsers, sendEventWss } from '../lib/websockets';
import { loadGameByEncryptedKey, appendGameChat } from '../lib/common';

const wsSchema = require('../api/ws-websocket-chat-received.json');

const {
  DYNAMODB_TABLE_NAME_GAMES,
  DYNAMODB_TABLE_NAME_USERS,
  ENCRYPTION_KEY,
  SIGNING_KEY,
  WSS_BASE,
} = process.env;

export async function handler(event, context, callback) {
  console.log(`event: ${JSON.stringify(event, null, 2)}`);

  const { requestContext: { connectionId, requestTimeEpoch }, body } = event;

  const action = JSON.parse(body);

  const jsonschema = new Validator();
  const { errors } = jsonschema.validate(action, wsSchema);

  if (errors.length > 0) {
    console.log(`errors: ${JSON.stringify(errors, null, 2)}`);

    const err = { message: 'Unprocessable entity', errors, action };
    await sendEventWss(connectionId, 'error', err, { WSS_BASE });

    // this doesn't really do what we want right now, but we dont
    // want an "Internal server error" websocket message so...
    callback(null, {
      statusCode: 422,
      body: JSON.stringify(err),
    });
    return;
  }

  const {
    // guid: actionGuid,
    data,
  } = action;

  const {
    'game.key': encryptedGameKey,
    msg,
  } = data;

  const uuid = await getUuidForConnection(connectionId, { DYNAMODB_TABLE_NAME_USERS });

  const game = await loadGameByEncryptedKey(encryptedGameKey, uuid, {
    DYNAMODB_TABLE_NAME_GAMES,
    ENCRYPTION_KEY,
    SIGNING_KEY,
  });

  // TODO: rate limit this chat based on existing game chat history ^

  console.log(`game: ${JSON.stringify(game, null, 2)}`);

  const opponentIdx = game.players.findIndex(p => p.uuid !== uuid);
  const { uuid: opponentUuid } = game.players[opponentIdx];

  const [
    {
      [opponentUuid]: {
        connections: opponentConnections,
      },
    },
  ] = await Promise.all([
    getUsers([opponentUuid], { DYNAMODB_TABLE_NAME_USERS }),
    appendGameChat(game.key, { uuid, msg, ts: requestTimeEpoch }, { DYNAMODB_TABLE_NAME_GAMES }),
  ]);

  console.log(`opponentConnections: ${JSON.stringify(opponentConnections, null, 2)}`);

  await sendEventWss(
    opponentConnections,
    'newGameChat',
    {
      ...data,
      player: opponentIdx,
    },
    {
      WSS_BASE,
      ts: requestTimeEpoch,
      concurrency: 4,
    },
  );

  callback(null, {
    statusCode: 200,
    body: 'OK.',
  });
}
