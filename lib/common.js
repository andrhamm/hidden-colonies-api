import { decryptAndVerify, signAndEncrypt } from './cookie';
import { dynamodb, dynamodbMarshall, dynamodbUnmarshall } from './aws-clients';
import { getCurrentUserSub } from './cognito';
import { simpleError } from './api';
import { sortCardsForDisplay } from './deck';

export function getPlayerIndex(event, game) {
  const currentUuid = getCurrentUserSub(event);

  const { players } = game;

  return players.findIndex(({ uuid }) => currentUuid === uuid);
}

export async function loadGame(event, {
  DYNAMODB_TABLE_NAME_GAMES,
  ENCRYPTION_KEY,
  SIGNING_KEY,
}) {
  const { id } = event.pathParameters;

  const [partitionKey, sortKeyStr] = decryptAndVerify(id, { ENCRYPTION_KEY, SIGNING_KEY }).split('::');
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

  const game = {
    id,
    ...dynamodbUnmarshall(gameMarshalled),
  };

  console.log(`Loaded game: ${JSON.stringify(game, null, 2)}`);

  return game;
}

export function isMyTurn(turn, firstPlayer, playerIndex) {
  const turnMod = firstPlayer === playerIndex ? 0 : 1;
  return turn % 2 === turnMod;
}

export function sanitizeGame(game, playerIndex, {
  ENCRYPTION_KEY,
  SIGNING_KEY,
}) {
  console.log(`Sanitizing game: ${JSON.stringify(game, null, 2)}`);

  const {
    id,
    turn,
    firstPlayer,
    players,
    turns,
    cards,
    createdAt,
    updatedAt,
    completedAt,
  } = game;


  const {
    hands: { [playerIndex]: hand },
    played,
    discarded,
  } = cards;

  return {
    id: signAndEncrypt(id, { ENCRYPTION_KEY, SIGNING_KEY }),
    isMyTurn: isMyTurn(turn, firstPlayer, playerIndex),
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
      hand: sortCardsForDisplay(hand),
      played,
      discarded,
    },
    createdAt,
    updatedAt,
    completedAt,
  };
}
