import { dealNewGame } from '../lib/deck';
import { dynamodb, dynamodbMarshall } from '../lib/aws-clients';
import {
  getCurrentUserSub, getUserByUsername, getUserAttribute, getUserBySub,
} from '../lib/cognito';
import { simpleError, simpleResponse } from '../lib/api';

import { loadGame, sanitizeGame, getPlayerIndex } from '../lib/common';
/* eslint-disable no-underscore-dangle */

const {
  COGNITO_USER_POOL_ID,
  DYNAMODB_TABLE_NAME_GAMES,
  ENCRYPTION_KEY,
  SIGNING_KEY,
} = process.env;

const ENCRYPTION_OPTS = {
  ENCRYPTION_KEY,
  SIGNING_KEY,
};

export const post = async (event) => {
  console.log(`post event: ${JSON.stringify(event, null, 2)}`);

  if (!event.headers['content-type'].startsWith('application/json')) {
    return simpleError(event, 415, 'Invalid content-type. Must begin with "application/json"');
  }

  const timestamp = event.requestContext.requestTimeEpoch;

  const uuid = getCurrentUserSub(event);

  const { opponent: opponentUsername } = JSON.parse(event.body);

  const [user, opponentUser] = await Promise.all([
    getUserBySub(COGNITO_USER_POOL_ID, uuid),
    getUserByUsername(COGNITO_USER_POOL_ID, opponentUsername),
  ]);

  console.log(`user: ${JSON.stringify(user, null, 2)}`);
  console.log(`opponentUser: ${JSON.stringify(opponentUser, null, 2)}`);

  if (!user) {
    // shouldn't ever happen but maybe forcing a logout+login will fix?
    return simpleError(event, 401, 'User not found.');
  }

  if (!opponentUser) {
    return simpleError(event, 400, 'Opponent not found.');
  }

  const opponentUuid = getUserAttribute(opponentUser, 'sub');

  if (uuid === opponentUuid) {
    return simpleError(event, 400, 'Invalid opponent.');
  }

  // TODO: validate no other active game with this opponent

  const cards = dealNewGame();
  const partitionKey = [uuid, opponentUuid].sort().join(':');
  const sortKey = timestamp;
  const id = `${partitionKey}::${sortKey}`;

  const firstPlayer = Math.floor(Math.random() * 2);

  const players = [
    {
      uuid,
      username: user.Username,
      first: firstPlayer === 0,
    },
    {
      uuid: opponentUuid,
      username: opponentUser.Username,
      first: firstPlayer === 1,
    },
  ];

  const gameCommon = {
    turn: 0,
    firstPlayer,
    turns: [],
    cards,
    createdAt: timestamp,
  };

  const gameSecret = {
    id,
    partitionKey,
    players,
    sortKey,
    cards,
  };

  const game = {
    ...gameCommon,
    ...gameSecret,
  };

  await dynamodb.putItem({
    TableName: DYNAMODB_TABLE_NAME_GAMES,
    ExpressionAttributeNames: {
      '#SORT': 'sortKey',
    },
    Item: dynamodbMarshall(game),
    ConditionExpression: 'attribute_not_exists(#SORT)',
    // ReturnValues only supports ALL_OLD or NONE for putItem
  }).promise();

  return simpleResponse(event, sanitizeGame(game, 0, ENCRYPTION_OPTS));
};

export const get = async (event) => {
  console.log(`get event: ${JSON.stringify(event, null, 2)}`);

  const game = await loadGame(event, {
    DYNAMODB_TABLE_NAME_GAMES,
    ...ENCRYPTION_OPTS,
  });

  const playerIndex = getPlayerIndex(event, game);

  // TODO: return card hints, which cards can be played

  return simpleResponse(event, sanitizeGame(game, playerIndex, ENCRYPTION_OPTS));
};
