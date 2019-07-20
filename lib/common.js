import { decryptAndVerify, signAndEncrypt } from './cookie';
import { dynamodb, dynamodbMarshall, dynamodbUnmarshall } from './aws-clients';
import { getCurrentUserSub } from './cognito';
import { simpleError } from './api';
import {
  sortCardsForDisplay, isWagerCard, validPlay, splitCard, calculateScore,
} from './deck';

export function getPlayerIndex(event, game) {
  const currentUuid = getCurrentUserSub(event);

  const { players } = game;

  return players.findIndex(({ uuid }) => currentUuid === uuid);
}

export function splitKey(key) {
  const [partitionKey, sortKey] = key.split('::');
  const [opponentUuid] = sortKey.split(':');

  return {
    partitionKey,
    sortKey,
    opponentUuid,
  };
}

export async function loadGameByKey(key, uuid, {
  DYNAMODB_TABLE_NAME_GAMES,
}) {
  const {
    partitionKey,
    sortKey,
    opponentUuid,
  } = splitKey(key);

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
    key,
    ...dynamodbUnmarshall(gameMarshalled),
  };

  console.log(`Loaded game by key: ${JSON.stringify(game, null, 2)}`);

  return game;
}

export async function loadGame(id, uuid, {
  DYNAMODB_TABLE_NAME_GAMES,
  DYNAMODB_INDEX_NAME_GAMES_ID,
}) {
  const { Items: results } = await dynamodb.query({
    TableName: DYNAMODB_TABLE_NAME_GAMES,
    IndexName: DYNAMODB_INDEX_NAME_GAMES_ID,
    ExpressionAttributeValues: dynamodbMarshall({
      ':id': id,
    }),
    KeyConditionExpression: 'id = :id',
  }).promise();

  if (results.length > 1) {
    throw new Error('Multiple results where only 1 was expected!');
  }

  if (results.length === 0) {
    return null;
  }

  const { key } = dynamodbUnmarshall(results[0]);

  console.log(`Loaded game key by id: ${JSON.stringify(key, null, 2)}`);

  return loadGameByKey(key, uuid, { DYNAMODB_TABLE_NAME_GAMES });
}

export async function loadGameByEncryptedKey(encryptedKey, uuid, {
  DYNAMODB_TABLE_NAME_GAMES,
  ENCRYPTION_KEY,
  SIGNING_KEY,
}) {
  const key = decryptAndVerify(encryptedKey, { ENCRYPTION_KEY, SIGNING_KEY });

  return loadGameByKey(key, uuid, {
    DYNAMODB_TABLE_NAME_GAMES,
    ENCRYPTION_KEY,
    SIGNING_KEY,
  });
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

export function getScoring(cards, scoresTotalOnly = false) {
  const gameOver = cards.deck.length < 1;
  const scores = cards.played.map(calculateScore);

  const tied = scores[0].score === scores[1].score;
  // eslint-disable-next-line no-nested-ternary
  const winner = tied ? -1 : (scores[0].score > scores[1].score ? 0 : 1);

  return {
    ...gameOver && { winner },
    tied,
    scores: scoresTotalOnly ? scores.map(({ score }) => score) : scores,
  };
}

export function sanitizeGame(game, currentUuid, {
  ENCRYPTION_KEY,
  SIGNING_KEY,
}) {
  console.log(`Sanitizing game: ${JSON.stringify(game, null, 2)}`);

  const {
    id,
    key,
    turn,
    firstPlayer,
    players,
    turns,
    cards,
    settings,
    createdAt,
    updatedAt,
    completedAt,
  } = game;

  const {
    liveScoring,
  } = settings;

  const playerIdx = players.findIndex(({ uuid }) => currentUuid === uuid);

  const {
    deck,
    hands: { [playerIdx]: hand },
    played,
    discarded,
    categories,
    suits,
  } = cards;

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

  const {
    winner,
    tied,
    scores,
  } = getScoring(cards);

  const scoring = {
    ...completedAt && { winner },
    tied,
    scores,
  };

  return {
    id,
    key: signAndEncrypt(key, { ENCRYPTION_KEY, SIGNING_KEY }),
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
      ...(liveScoring || deck.length < 8) && { deckCount: deck.length },
      hand: richHand,
      played: richPlayed,
      discarded: richDiscarded,
      suits: suits || categories,
    },
    ...(liveScoring || completedAt) && { scoring },
    settings,
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
    key,
    turn,
    firstPlayer,
    players,
    createdAt,
    updatedAt,
    completedAt,
  } = game;

  const playerIndex = players.findIndex(({ uuid }) => currentUuid === uuid);

  return {
    id,
    key: signAndEncrypt(key, { ENCRYPTION_KEY, SIGNING_KEY }),
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
