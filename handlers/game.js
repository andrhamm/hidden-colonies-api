
import FunctionShield from '@puresec/function-shield';
import { dealNewGame } from '../lib/deck';
import { dynamodb, dynamodbMarshall } from '../lib/aws-clients';
import {
  getCurrentUserSub, getUserByUsername, getUserAttribute, getUserBySub, updateUser,
} from '../lib/cognito';
import { simpleError, simpleResponse, HiddenColoniesError } from '../lib/api';
import {
  loadGame, loadGameByEncryptedKey, loadGames, sanitizeGame, sanitizeGameList,
  isValidGameId, generateId,
} from '../lib/common';

FunctionShield.configure(
  {
    policy: {
      outbound_connectivity: 'block',
      read_write_tmp: 'block',
      create_child_process: 'block',
    },
    token: process.env.FUNCTION_SHIELD_TOKEN,
  },
);

const {
  COGNITO_USER_POOL_ID,
  DYNAMODB_TABLE_NAME_GAMES,
  DYNAMODB_INDEX_NAME_GAMES_OPPONENT,
  DYNAMODB_INDEX_NAME_GAMES_ID,
  DYNAMODB_TABLE_NAME_USERS,
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

  // eslint-disable-next-line prefer-const
  let { opponent: opponentUsername, liveScoring } = JSON.parse(event.body);

  liveScoring = !!liveScoring;

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

  const emailVerified = getUserAttribute(user, 'email_verified') === 'true';
  if (!emailVerified) {
    return simpleError(event, 409, 'You have not verified your account.');
  }

  if (!opponentUser) {
    return simpleError(event, 400, 'Opponent not found.');
  }

  const opponentEmailVerified = getUserAttribute(opponentUser, 'email_verified') === 'true';
  if (!opponentEmailVerified) {
    return simpleError(event, 409, 'Opponent has not verified their account.');
  }

  const opponentUuid = getUserAttribute(opponentUser, 'sub');

  if (uuid === opponentUuid) {
    return simpleError(event, 400, 'Invalid opponent.');
  }

  const userName = getUserAttribute(user, 'name');
  const userEmail = getUserAttribute(user, 'email');
  const opponentName = getUserAttribute(opponentUser, 'name');
  const opponentEmail = getUserAttribute(opponentUser, 'email');


  // TODO: validate no other active game with this opponent

  const cards = dealNewGame();
  const partitionKey = uuid;
  const sortKey = `${opponentUuid}:${timestamp}`;

  const opponentPartitionKey = opponentUuid;
  const opponentSortKey = `${uuid}:${timestamp}`;

  const key = `${partitionKey}::${sortKey}`;

  const id = generateId();

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
    playerTurn: firstPlayer,
    turns: [],
    cards,
    settings: {
      liveScoring,
    },
    createdAt: timestamp,
  };

  const gameSecret = {
    id,
    key,
    partitionKey,
    sortKey,
    opponentPartitionKey,
    opponentSortKey,
    players,
    cards,
  };

  const game = {
    ...gameCommon,
    ...gameSecret,
  };

  await Promise.all([
    dynamodb.putItem({
      TableName: DYNAMODB_TABLE_NAME_GAMES,
      ExpressionAttributeNames: {
        '#SORT': 'sortKey',
      },
      Item: dynamodbMarshall(game),
      ConditionExpression: 'attribute_not_exists(#SORT)',
      // ReturnValues only supports ALL_OLD or NONE for putItem
    }).promise(),
    updateUser(opponentUuid, {
      email: opponentEmail,
      name: opponentName,
      username: opponentUsername,
    }, { DYNAMODB_TABLE_NAME_USERS }),
    updateUser(uuid, {
      email: userEmail,
      name: userName,
      username: user.Username,
    }, { DYNAMODB_TABLE_NAME_USERS }),
  ]);

  return simpleResponse(event, sanitizeGame(game, uuid, ENCRYPTION_OPTS));
};

export const get = async (event) => {
  console.log(`get event: ${JSON.stringify(event, null, 2)}`);

  const uuid = getCurrentUserSub(event);

  const { idOrEncryptedKey } = event.pathParameters;

  const loadFn = isValidGameId(idOrEncryptedKey) ? loadGame : loadGameByEncryptedKey;

  let game;
  try {
    game = await loadFn(idOrEncryptedKey, uuid, {
      DYNAMODB_TABLE_NAME_GAMES,
      DYNAMODB_INDEX_NAME_GAMES_ID,
      ...ENCRYPTION_OPTS,
    });
  } catch (e) {
    if (e instanceof HiddenColoniesError) {
      return e.toAPIResponse(event);
    }
    throw e;
  }

  return simpleResponse(event, sanitizeGame(game, uuid, ENCRYPTION_OPTS));
};

export const list = async (event) => {
  console.log(`list event: ${JSON.stringify(event, null, 2)}`);

  const uuid = getCurrentUserSub(event);

  const games = await loadGames(event, {
    DYNAMODB_TABLE_NAME_GAMES,
    DYNAMODB_INDEX_NAME_GAMES_OPPONENT,
    ...ENCRYPTION_OPTS,
  });

  return simpleResponse(event, sanitizeGameList(games, uuid, ENCRYPTION_OPTS));
};
