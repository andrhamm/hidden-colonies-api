import pMap from 'p-map';
import PQueue from 'p-queue';
// import _flatMap from 'lodash.flatmap';
import _pick from 'lodash.pick';

import {
  AWS, dynamodb, dynamodbMarshall, dynamodbUnmarshall,
} from '../lib/aws-clients';

import { getUsers, sendEventWss, sendEventEmail } from '../lib/websockets';

const {
  DYNAMODB_TABLE_NAME_USERS,
  WSS_BASE,
  SES_EMAIL_DOMAIN,
} = process.env;

export async function handler(event, context, callback) {
  console.log(`event: ${JSON.stringify(event, null, 2)}`);

  const { Records: recordsMarshalled } = event;

  const recordsFiltered = recordsMarshalled.filter(({ eventName }) => eventName === 'MODIFY' || eventName === 'INSERT');
  const recordFields = ['id', 'players', 'turn', 'playerTurn', 'updatedAt'];

  const notifyUsers = await pMap(recordsFiltered, (record) => {
    const {
      dynamodb: {
        NewImage: newImageMarshalled,
        OldImage: oldImageMarshalled,
      },
      eventName,
    } = record;

    const {
      id: gameId, players, turn, playerTurn, updatedAt,
    } = dynamodbUnmarshall(_pick(newImageMarshalled, recordFields));

    if (oldImageMarshalled) {
      const { turn: lastTurn } = dynamodbUnmarshall(_pick(oldImageMarshalled, ['turn']));

      if (lastTurn >= turn) {
        console.log(`skipping ${eventName} for ${gameId}, turn=${turn} lastTurn=${lastTurn}`);
        return null;
      }
    }

    const { uuid } = players[playerTurn];

    if (turn === 0 && playerTurn === 0) {
      // this player JUST created the game, they know its their turn
      // instead, notify the opponent they have been invited to a new game
      const { uuid: opponentUuid } = players[1];

      return [true, opponentUuid, gameId, updatedAt];
    }
    return [false, uuid, gameId];
  });

  console.log(`notifyUsers: ${JSON.stringify(notifyUsers, null, 2)}`);

  // eslint-disable-next-line no-unused-vars
  const uuids = notifyUsers.reduce((acc, notify) => {
    if (notify) {
      acc.push(notify[1]);
    }
    return acc;
  }, []);

  const userConnectionsMap = await getUsers(uuids, { DYNAMODB_TABLE_NAME_USERS });

  console.log(`userConnectionsMap: ${JSON.stringify(userConnectionsMap, null, 2)}`);

  if (Object.keys(userConnectionsMap).length < 1) {
    callback(null);
    return;
  }

  const queue = new PQueue({ concurrency: 8 });

  /* eslint-disable no-restricted-syntax, no-await-in-loop, no-loop-func, no-plusplus */
  for (const [isInvite, uuid, gameId, updatedAt] of notifyUsers) {
    const {
      name,
      email,
      connections,
    } = userConnectionsMap[uuid];

    const data = {
      isInvite,
      gameId,
    };

    if (connections && connections.length > 0) {
      for (const connectionId of connections) {
        console.log(`Queuing websocket to ${connectionId}`);
        await queue.add(() => sendEventWss(
          connectionId,
          'newGameTurn',
          data,
          { ts: updatedAt, WSS_BASE },
        ));
      }
    } else {
      console.log(`Queuing email to ${email}`);
      await queue.add(() => sendEventEmail(
        email,
        name,
        'newGameTurn',
        data,
        { SES_EMAIL_DOMAIN },
      ));
    }
  }

  let count = 0;
  queue.on('active', () => {
    console.log(`Working on item #${++count}.  Size: ${queue.size}  Pending: ${queue.pending}`);
  });

  /* eslint-enable no-restricted-syntax, no-await-in-loop, no-loop-func, no-plusplus */
  await queue.onIdle();

  callback(null);
}
