import { signAndEncrypt, decryptAndVerify } from '../lib/cookie';
import { dealNewGame } from '../lib/deck';
import { dynamodb, dynamodbMarshall, dynamodbUnmarshall } from '../lib/aws-clients';
import {
  getCurrentUserSub, getUserByUsername, getUserAttribute, getUserBySub,
} from '../lib/cognito';
import { simpleError, simpleResponse } from '../lib/api';
/* eslint-disable no-underscore-dangle */

const {
  COGNITO_USER_POOL_ID,
  DYNAMODB_TABLE_NAME_GAMES,
  ENCRYPTION_KEY,
  SIGNING_KEY,
} = process.env;

const cookieKeys = {
  encryptionKey: ENCRYPTION_KEY,
  signingKey: SIGNING_KEY,
};

export const post = async (event) => {
  console.log(`post event: ${JSON.stringify(event, null, 2)}`);

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
    return simpleError(401, 'User not found.');
  }

  if (!opponentUser) {
    return simpleError(400, 'Opponent not found.');
  }

  const opponentUuid = getUserAttribute(opponentUser, 'sub');

  if (uuid === opponentUuid) {
    return simpleError(400, 'Invalid opponent.');
  }

  const cards = dealNewGame();
  const { hands: [hand], played, discarded } = cards;
  const createdAt = Date.now();
  const partitionKey = [uuid, opponentUuid].sort().join(':');
  const sortKey = createdAt;
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
    id: signAndEncrypt(id, cookieKeys),
    turn: 0,
    firstPlayer,
    turns: [],
    cards,
    createdAt,
  };

  const gameSecret = {
    id,
    partitionKey,
    players,
    sortKey,
    cards,
  };

  await dynamodb.putItem({
    TableName: DYNAMODB_TABLE_NAME_GAMES,
    ExpressionAttributeNames: {
      '#SORT': 'sortKey',
    },
    Item: dynamodbMarshall({
      ...gameCommon,
      ...gameSecret,
    }),
    ConditionExpression: 'attribute_not_exists(#SORT)',
    // ReturnValues only supports ALL_OLD or NONE for putItem
  }).promise();

  // cookies._colonies.games.push({
  //   id: gameId,
  //   opponent,
  //   cards,
  //   createdAt: Date.now(),
  // });

  // const setCookieHeader = writeCookies(cookies, cookieKeys);
  return simpleResponse(event, {
    ...gameCommon,
    players: players.reduce((acc, player) => {
      const { username, first } = player;
      acc.push({
        username,
        first,
      });
      return acc;
    }, []),
    cards: {
      hand,
      played,
      discarded,
    },
  });
};

export const get = async (event) => {
  console.log(`get event: ${JSON.stringify(event, null, 2)}`);
  const { id } = event.pathParameters;

  const [partitionKey, sortKeyStr] = decryptAndVerify(id, cookieKeys).split('::');
  const sortKey = +sortKeyStr;
  const uuid = getCurrentUserSub(event);

  if (!partitionKey.split(':').includes(uuid)) {
    return simpleError(400, 'Invalid game id.');
  }

  const {
    Item: gameMarshalled,
  } = await dynamodb.getItem({
    TableName: DYNAMODB_TABLE_NAME_GAMES,
    Key: dynamodbMarshall({
      partitionKey,
      sortKey,
    }),
  }).promise();

  const {
    turn,
    firstPlayer,
    players,
    turns,
    cards,
  } = dynamodbUnmarshall(gameMarshalled);

  const { hands: [hand], played, discarded } = cards;

  return simpleResponse(event, {
    id,
    turn,
    firstPlayer,
    players: players.reduce((acc, player) => {
      const { username, first } = player;
      acc.push({
        username,
        first,
      });
      return acc;
    }, []),
    turns,
    cards: {
      hand,
      played,
      discarded,
    },
  });
};
