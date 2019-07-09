import { dynamodb, dynamodbMarshall, dynamodbUnmarshall } from '../lib/aws-clients';
import { loadGame, sanitizeGame, getPlayerIndex } from '../lib/common';
import { simpleError, simpleResponse } from '../lib/api';
import { isWagerCard } from '../lib/deck';

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

  const timestamp = event.requestContext.requestTimeEpoch;

  const game = await loadGame(event, {
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

  const { turn: turnIn, action } = JSON.parse(event.body);

  if (turn !== turnIn) {
    return simpleError(event, 400, 'Invalid turn number specified.');
  }

  const playerIndex = getPlayerIndex(event, game);

  // validate it is this player's turn
  const turnMod = firstPlayer === playerIndex ? 0 : 1;
  if (turn % 2 !== turnMod) {
    return simpleError(event, 400, 'It is not your turn.');
  }

  // validate action
  const actionPattern = new RegExp(/^(P|D)(([0-4]):([0-9]|1[01]))(::(([0-4]):([0-9]|1[01])))?$/);
  const match = action.match(actionPattern);

  if (!match) {
    return simpleError(event, 400, 'Invalid turn action specified.');
  }

  const {
    1: playOrDiscard,
    2: actionCard,
    3: actionCardCategory,
    4: actionCardCardId,
    6: drawCard,
    7: drawCardCategory,
  } = match;

  // validate actionCard is in current hand
  const actionCardHandIndex = cards.hands[playerIndex].findIndex(card => card === actionCard);
  if (actionCardHandIndex === -1) {
    return simpleError(event, 400, 'Invalid action card specified. Not in hand.');
  }

  cards.hands[playerIndex].splice(actionCardHandIndex, 1);

  if (playOrDiscard === 'P') {
    // validate the card can be played
    const [_topCardCategory, topCardCardId] = (cards.played[playerIndex][actionCardCategory][0] || '').split(':');

    if (topCardCardId !== undefined) {
      if ((isWagerCard(actionCardCardId) && !isWagerCard(topCardCardId))
        || actionCardCardId < topCardCardId
      ) {
        return simpleError(event, 400, 'Invalid action card specified. Destination prohibited.');
      }
    }

    cards.played[playerIndex].unshift(actionCard);
  } else {
    cards.discarded[actionCardCategory].unshift(actionCard);
  }

  // validate drawCard is on top of its category's discard pile
  let drawnCard;
  if (drawCard) {
    const topDiscard = cards.discarded[drawCardCategory][0];
    if (topDiscard !== drawCard) {
      return simpleError(event, 400, 'Invalid draw card specified.');
    }
    drawnCard = cards.discarded[drawCardCategory].shift();
  } else {
    // draw from deck
    drawnCard = cards.deck.shift();
  }

  cards.hands[playerIndex].push(drawnCard);

  // add this turn to turns array
  turns.unshift({
    player: playerIndex,
    action,
    createdAt: timestamp,
  });

  // TODO: return score, winner

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
      ExpressionAttributeNames: {
        '#CARDS': 'cards',
        '#TURN': 'turn',
        '#TURNS': 'turns',
        '#UP': 'updatedAt',
        '#END': 'completedAt',
      },
      ExpressionAttributeValues: dynamodbMarshall({
        ':cards': cards,
        ':turn': turn,
        ':turns': turns,
        ':ts': timestamp,
        ':one': 1,
      }),
      UpdateExpression: 'SET #TURN = :turn + :one, #CARDS = :cards, #TURNS = :turns, #UP = :ts, #END = :ts',
      ConditionExpression: '#TURN = :turn',
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
      ...sanitizeGame(gameUpdated, playerIndex, ENCRYPTION_OPTS),
      drawnCard,
    },
  );
};
