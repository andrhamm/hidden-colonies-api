# Notes

## `id` vs `key`

The value of `key` is an encrypted value that will be different on each response. For this reason, `id` is provided, which is a static unchanging 16 character string. Fetching a game by `id` will always be slower than `key`. This is because, on the backend, a query must first be run to retrieve the `key` given the `id`, then the normal `key`-based lookup is performed.

# ENDPOINTS

## Create a new game

```
Authorization: {Cognito Session Token i.e. "AWS4-HMAC-SHA256 Credential=..."}
Accept: application/json
Content-Type: application/json
POST /games
{ "opponent": "andrhamm", "liveScoring": true }
```

Where `opponent` is a valid username for an existing user.

Where `liveScoring` defaults to `false`. When enabled, the `scoring` property will be returned on every response. Additionally, `cards.deckCount` will similarly be returned (otherwise is only returned when there are fewer than 8 cards remaining).

## Fetch a game by ID or key

```
Authorization: {Cognito Session Token i.e. "AWS4-HMAC-SHA256 Credential=..."}
Accept: application/json
GET /games/{idOrKey}
```

Note: See note about `id` vs `key` in the Notes section.

## Fetch recent games

```
Authorization: {Cognito Session Token i.e. "AWS4-HMAC-SHA256 Credential=..."}
Accept: application/json
GET /games
```

The response contains truncated game objects.

## Submit a turn

```
Authorization: {Cognito Session Token i.e. "AWS4-HMAC-SHA256 Credential=..."}
Accept: application/json
Content-Type: application/json
POST /games/{key}/turn
{"action":"P0:3", "draw": "4:1", "turn":0}
```

Client should first fetch the game to refresh the state. Turns can be submitted when `isMyTurn` is `true` and until `completedAt` is non-null.

Where `action` is the value from the `actionPlay` or `actionDiscard` properties from a card in the player's hand. If `actionPlay` property is missing or null, it means card cannot be played this turn.

Where `draw` (optional) is the value from the `draw` property from the top card of a discard pile. Omitting `draw` results in drawing from the deck. The `draw` property is missing or null from all but the first card in the `discarded` arrays, this means the card can not be drawn this turn.

Where `turn` is the value from the recently fetched version of the game.

## Get a JWT

Retrieve a JWT that can be used to authenticate a websocket connection. These tokens expire within 30 seconds and are not intended to be used for anything else at this time.

```
Authorization: {Cognito Session Token i.e. "AWS4-HMAC-SHA256 Credential=..."}
GET /token
```

The response will be `HTTP Status: 204 No Content` (no body) and the token will be in the `X-HC-Token` header.


# Websockets

## Connect

```
const socketEndpoint = 'wss://colonies-wss.andrhamm.com?token={JWT}';

const socket = new WebSocket(socketEndpoint);

// Connection opened
socket.addEventListener('open', function (event) {
  console.log('sending hello to server');
  socket.send(JSON.stringify({
    "action": "sendChat",
    "data": {
      "game": `${GAME_KEY}`,
      "text": "Hello World",
    },
  }));
});

// Listen for messages
socket.addEventListener('message', function (event) {
  console.log('message from server ', event.data);
});
```

## ACTION: send a chat message for a game (WIP)

Note: max length of `msg` is 140 chars, like an OG tweet. Number of messages and/or chars per game, and/or per 1 minute period, will likely be limited at some point.

```
{
  "action": "sendGameChat",
  "guid": "{client-generated unique guid for this action}",
  "data": {
    "game.key": `${GAME_KEY}`,
    "msg": "Hello World",
    "msg.id": "{client-generated unique id for this message}"
  },
}
```

## EVENT: there is a new chat message for a game (WIP)

Note: you will receive these events for your opponents messages but also for own messages to serve as an acknowledgement.

```
{
  "event": "newGameChat",
  "data": {
    "game.id": "59gh2bkngpf3qez8",
    "msg": "Hello World",
    "msg.id": "{client-generated unique id for this message}",
    "player": 0,
  },
  "ts": 1562807525476,
}
```

## ERROR: too much chatting (WIP)

Note: you will receive these events only for own messages when they are invalid (too long, etc).

```
{
  "error": "invalidGameChat",
  "data": {
    "game.id": "59gh2bkngpf3qez8",
    "msg.id": "{client-generated unique id for this message}",
  },
  "ts": 1562807525476,
}
```

## ERROR: too much chatting (WIP)

Note: you will receive these events only for own messages. Failure to heed the rate limits could result in the websocket being closed by the server and a temporary ban. The `ttl` represents the time at which new chats will be allowed.

```
{
  "error": "stfu",
  "data": {
    "game.id": "59gh2bkngpf3qez8",
    "ttl": 1562807555476,
  },
  "ts": 1562807525476,
}
```

## EVENT: an opponent has finished their turn for a game (WIP)

Note: you will receive these events only when your opponent finishes their turns. The `game.id` should be used to find the game `key`, which should then be used to do a fetch for the updated game state.

```
{
  "event": "newGameTurn",
  "data": {
    "game.id": "59gh2bkngpf3qez8",
  },
  "ts": 1562807525476,
}
```

---

# TODO

* signing of response secrets (meh)
* websockets / email / browser / push notifications

# IDEAS

* "game server" concept
  * secret url that lists other users and the leaderboard for all games originating from the server
  * brackets / tournaments
* optionally enable realtime score visibility (off by default)
* AI opponent
