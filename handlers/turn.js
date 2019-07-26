import { dynamodb, dynamodbMarshall, dynamodbUnmarshall } from '../lib/aws-clients';
import {
  loadGameByEncryptedKey, sanitizeGame, getPlayerIndex, isMyTurn, getScoring,
} from '../lib/common';
import { getCurrentUserSub } from '../lib/cognito';
import { simpleError, simpleResponse } from '../lib/api';
import { validPlay, sortCardsForDisplay } from '../lib/deck';

const {
  DYNAMODB_TABLE_NAME_GAMES,
  ENCRYPTION_KEY,
  SIGNING_KEY,
} = process.env;

const ENCRYPTION_OPTS = {
  ENCRYPTION_KEY,
  SIGNING_KEY,
};

export const post = async (event) => {
  console.log(`event: ${JSON.stringify(event, null, 2)}`);

  if (!event.headers['content-type'].startsWith('application/json')) {
    return simpleError(event, 415, 'Invalid content-type. Must begin with "application/json"');
  }

  const { idOrEncryptedKey: encryptedKey } = event.pathParameters;

  const uuid = getCurrentUserSub(event);

  const game = await loadGameByEncryptedKey(encryptedKey, uuid, {
    DYNAMODB_TABLE_NAME_GAMES,
    ...ENCRYPTION_OPTS,
  });

  const {
    turn,
    firstPlayer,
    turns,
    cards,
    partitionKey,
    sortKey,
  } = game;

  if (cards.deck.length < 1) {
    return simpleError(event, 400, 'Game over!');
  }

  const { turn: turnIn, action, draw: drawIn } = JSON.parse(event.body);

  if (turn !== turnIn) {
    return simpleError(event, 400, 'Invalid turn number specified.');
  }

  const playerIdx = getPlayerIndex(event, game);

  // validate it is this player's turn
  if (!isMyTurn(turn, firstPlayer, playerIdx)) {
    return simpleError(event, 400, 'It is not your turn.');
  }

  // next player's turn
  const playerTurn = playerIdx === 0 ? 1 : 0;

  // validate action
  const actionPattern = new RegExp(/^(P|D)(([0-4]):([0-9]|1[01]))(::(([0-4]):([0-9]|1[01])))?$/);
  const match = action.match(actionPattern);

  if (!match) {
    return simpleError(event, 400, 'Invalid turn action specified.');
  }

  /* eslint-disable prefer-const */
  let {
    1: playOrDiscard,
    2: actionCard,
    3: actionCardSuitIdx,
    4: actionCardCardIdx,
    6: drawCard,
    7: drawCardSuitIdx,
    8: _drawCardIdx,
  } = match;

  if (drawIn) {
    drawCard = drawIn;
    ([_drawCardIdx, drawCardSuitIdx] = drawIn);
  }
  /* eslint-enable prefer-const */

  // validate actionCard is in current hand
  const actionCardHandIndex = cards.hands[playerIdx].findIndex(card => card === actionCard);
  if (actionCardHandIndex === -1) {
    return simpleError(event, 400, 'Invalid action card specified. Not in hand.');
  }

  cards.hands[playerIdx].splice(actionCardHandIndex, 1);

  if (playOrDiscard === 'P') {
    // validate the card can be played
    if (!validPlay([actionCardSuitIdx, actionCardCardIdx], cards.played[playerIdx])) {
      return simpleError(event, 400, 'Invalid action card specified. Destination prohibited.');
    }

    cards.played[playerIdx][actionCardSuitIdx].unshift(actionCard);
  } else {
    cards.discarded[actionCardSuitIdx].unshift(actionCard);
  }

  // validate drawCard is on top of its suit's discard pile
  let drawnCard;
  if (drawCard) {
    const topDiscard = cards.discarded[drawCardSuitIdx][0];
    if (topDiscard !== drawCard) {
      return simpleError(event, 400, 'Invalid draw card specified.');
    }
    drawnCard = cards.discarded[drawCardSuitIdx].shift();
  } else {
    // draw from deck
    drawnCard = cards.deck.shift();
  }

  cards.hands[playerIdx].push(drawnCard);

  cards.hands = cards.hands.map(sortCardsForDisplay);

  const timestamp = event.requestContext.requestTimeEpoch;

  // add this turn to turns array
  turns.push({
    turn,
    player: playerIdx,
    action,
    createdAt: timestamp,
  });

  let expressionAttrVals = {
    ':playerTurn': playerTurn,
    ':cards': cards,
    ':turn': turn,
    ':turns': turns,
    ':ts': timestamp,
    ':one': 1,
  };
  let updateExpression = 'SET turn = :turn + :one, cards = :cards, turns = :turns, playerTurn = :playerTurn, updatedAt = :ts, completedAt = :ts';

  // game over, return score, winner
  const gameOver = cards.deck.length < 1;

  if (gameOver) {
    const {
      winner,
      scores,
    } = getScoring(cards, true);

    console.log(`Game over, winner is player ${winner} (${scores.toString()})`);

    expressionAttrVals = {
      ...expressionAttrVals,
      ':winner': winner,
      ':scores': scores,
      ':score': scores[0],
      ':opponentScore': scores[1],
    };
    updateExpression += ', winner = :winner, scores = :scores, score = :score, opponentScore = :opponentScore';
  }

  // update card positions, update turn number
  console.log('Updating game...');
  let gameUpdatedMarshalled;
  try {
    ({ Attributes: gameUpdatedMarshalled } = await dynamodb.updateItem({
      TableName: DYNAMODB_TABLE_NAME_GAMES,
      Key: dynamodbMarshall({
        partitionKey,
        sortKey,
      }),
      // ExpressionAttributeNames: {
      //   '#CARDS': 'cards',
      //   '#TURN': 'turn',
      //   '#TURNS': 'turns',
      //   '#UP': 'updatedAt',
      //   '#END': 'completedAt',
      //   ...gameOver && {
      //     '#SCORES': 'scores',
      //     '#SCORE'
      //   },
      // },
      ExpressionAttributeValues: dynamodbMarshall(expressionAttrVals),
      UpdateExpression: updateExpression,
      ConditionExpression: 'turn = :turn',
      ReturnValues: 'ALL_NEW',
    }).promise());
  } catch (e) {
    console.log(e);
    if (e.code === 'ConditionalCheckFailedException') {
      return simpleError(event, 400, 'Invalid turn number specified.');
    }
    return simpleError(event, 500, 'An unknown error occurred.');
  }

  console.log(`Game updated: ${JSON.stringify(gameUpdatedMarshalled)}`);

  const gameUpdated = dynamodbUnmarshall(gameUpdatedMarshalled);

  return simpleResponse(
    event,
    {
      ...sanitizeGame(gameUpdated, uuid, ENCRYPTION_OPTS),
      drawnCard,
    },
  );
};
