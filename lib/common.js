import { decryptAndVerify, signAndEncrypt } from './cookie';
import { dynamodb, dynamodbMarshall, dynamodbUnmarshall } from './aws-clients';
import { getCurrentUserSub } from './cognito';
import { simpleError } from './api';
import {
  sortCardsForDisplay, isWagerCard, validPlay, splitCard,
} from './deck';

export function getPlayerIndex(event, game) {
  const currentUuid = getCurrentUserSub(event);

  const { players } = game;

  return players.findIndex(({ uuid }) => currentUuid === uuid);
}

export async function loadGame(encryptedId, uuid, {
  DYNAMODB_TABLE_NAME_GAMES,
  ENCRYPTION_KEY,
  SIGNING_KEY,
}) {
  const id = decryptAndVerify(encryptedId, { ENCRYPTION_KEY, SIGNING_KEY });
  const [partitionKey, sortKey] = id.split('::');
  const [opponentUuid] = sortKey.split(':');

  if (partitionKey !== uuid && opponentUuid !== uuid) {
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

export async function loadGames(event, {
  DYNAMODB_TABLE_NAME_GAMES,
  DYNAMODB_INDEX_NAME_GAMES_OPPONENT,
}) {
  const uuid = getCurrentUserSub(event);

  // NOTE: this is an eventually consistent read
  // on a global secondary index (consistent reads
  // on GSIs are not supported)
  // Fields returned are only those projected onto the index
  // ... meaning a subsequent call to getItem is required to
  // get all of the job's fields
  const [{ Items: asPlayer1 }, { Items: asPlayer2 }] = await Promise.all([
    // TODO: paginate
    dynamodb.query({
      TableName: DYNAMODB_TABLE_NAME_GAMES,
      ExpressionAttributeValues: dynamodbMarshall({
        ':uuid': uuid,
      }),
      KeyConditionExpression: 'partitionKey = :uuid',
    }).promise(),
    dynamodb.query({
      TableName: DYNAMODB_TABLE_NAME_GAMES,
      IndexName: DYNAMODB_INDEX_NAME_GAMES_OPPONENT,
      ExpressionAttributeValues: dynamodbMarshall({
        ':uuid': uuid,
      }),
      KeyConditionExpression: 'opponentPartitionKey = :uuid',
    }).promise(),
  ]);

  const results = [
    ...asPlayer1,
    ...asPlayer2,
  ].map(dynamodbUnmarshall);

  console.log(`results: ${JSON.stringify(results)}`);

  return results;
}

export function isMyTurn(turn, firstPlayer, playerIndex) {
  const turnMod = firstPlayer === playerIndex ? 0 : 1;
  return turn % 2 === turnMod;
}

export function sanitizeGame(game, currentUuid, {
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

  const playerIdx = players.findIndex(({ uuid }) => currentUuid === uuid);

  const {
    hands: { [playerIdx]: hand },
    played,
    discarded,
    categories,
    suits,
  } = cards;

  // TODO: provide detailed list of all possible allowed actions the user could do
  // hand: [
  //   { card: "0:6", canPlay: true, opponentCouldPlay: true,
  //     playAction: "P0:6", discardAction: "D0:6" }
  // ]
  const richHand = sortCardsForDisplay(hand).reduce((acc, card) => {
    const [suitIdx, cardIdx] = splitCard(card);
    const label = isWagerCard(cardIdx) ? 'multiplier' : cardIdx.toString();

    const canPlay = validPlay([suitIdx, cardIdx], played[playerIdx]);
    const opponentCouldPlay = validPlay([suitIdx, cardIdx], played[playerIdx === 0 ? 1 : 0]);

    const actionDiscard = `D${card}`;
    const actionPlay = `P${card}`;

    acc.push({
      suit: suitIdx,
      card: cardIdx,
      label,
      ...canPlay && { actionPlay },
      actionDiscard,
      opponentCouldPlay,
    });

    return acc;
  }, []);

  const richPlayed = played.reduce((acc, playerCards) => {
    const richPlayerCards = playerCards.reduce((pacc, playerSuitCards) => {
      const richPlayerSuitCards = playerSuitCards.map((playerCard) => {
        const [suitIdx, cardIdx] = splitCard(playerCard);
        const label = isWagerCard(cardIdx) ? 'multiplier' : cardIdx.toString();

        return {
          suit: suitIdx,
          card: cardIdx,
          label,
        };
      });
      pacc.push(richPlayerSuitCards);
      return pacc;
    }, []);
    acc.push(richPlayerCards);
    return acc;
  }, []);

  const richDiscarded = discarded.reduce((acc, suitCards, suitIdx) => {
    const richDiscardPile = suitCards.map((discardCard, pileIdx) => {
      const [_suitIdx, cardIdx] = splitCard(discardCard);
      const label = isWagerCard(cardIdx) ? 'multiplier' : cardIdx.toString();

      const canDraw = pileIdx === 0;

      return {
        suit: suitIdx,
        card: cardIdx,
        label,
        ...canDraw && { draw: discardCard },
      };
    });

    acc.push(richDiscardPile);
    return acc;
  }, []);

  return {
    id: signAndEncrypt(id, { ENCRYPTION_KEY, SIGNING_KEY }),
    isMyTurn: isMyTurn(turn, firstPlayer, playerIdx),
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
      hand: richHand,
      played: richPlayed,
      discarded: richDiscarded,
      suits: suits || categories,
    },
    createdAt,
    updatedAt,
    completedAt,
  };
}

export function sanitizeGameShort(game, currentUuid, {
  ENCRYPTION_KEY,
  SIGNING_KEY,
}) {
  console.log(`Sanitizing game (short): ${JSON.stringify(game, null, 2)}`);

  const {
    id,
    turn,
    firstPlayer,
    players,
    createdAt,
    updatedAt,
    completedAt,
  } = game;

  const playerIndex = players.findIndex(({ uuid }) => currentUuid === uuid);

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
    createdAt,
    updatedAt,
    completedAt,
  };
}

export function sanitizeGameList(games, currentUuid, {
  ENCRYPTION_KEY, SIGNING_KEY,
}) {
  return games.map(game => sanitizeGameShort(game, currentUuid, { ENCRYPTION_KEY, SIGNING_KEY }));
}
