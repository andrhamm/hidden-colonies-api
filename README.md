# ENDPOINTS

## Create a new game

```
Accept: application/json
Content-Type: application/json
POST /games
{ "opponent": "andrhamm" }
```

Where `opponent` is a valid username for an existing user.

## Fetch a game by ID

```
Accept: application/json
GET /games/{id}
```

## Fetch recent games

```
Accept: application/json
GET /games
```

The response contains truncated game objects.

## Submit a turn

```
Accept: application/json
Content-Type: application/json
POST /games/{id}/turn
{"action":"P0:3", "draw": "4:1", "turn":0}
```

Client should first fetch the game to refresh the state. Turns can be submitted when `isMyTurn` is `true` and until `completedAt` is non-null.

Where `action` is the value from the `actionPlay` or `actionDiscard` properties from a card in the player's hand. If `actionPlay` property is missing or null, it means card cannot be played this turn.

Where `draw` (optional) is the value from the `draw` property from the top card of a discard pile. Omitting `draw` results in drawing from the deck. The `draw` property is missing or null from all but the first card in the `discarded` arrays, this means the card can not be drawn this turn.

Where `turn` is the value from the recently fetched version of the game.

---

# TODO

* signing of response secrets (meh)


# IDEAS

* "game server" concept
  * secret url that lists other users and the leaderboard for all games originating from the server
  * brackets / tournaments
* optionally enable realtime score visibility (off by default)
* AI opponent


# FLOWS

* new player
  * POST /player
  * {
      email,
    } + COOKIE if applicable
  * RESPONSE (if no existing player cookie):
  * {
      uuid,
      rooms
    }

* create a new room
  * POST /room
  * {
      name,
    }

* start a new game
  * POST /game
  * {
      // room,
      opponent, // invite opponent
      message, // short message to send to opponent
      live scoring enabled? // reveals scoring throughout the game
    }
  * RESPONSE:
  * {
      room id,
      game id,
      turn number, // the number of the turn
      turn, // whose turn it is, random (eventually based on previous winner)
      cards: {
        hand,
        played,
        discarded,
      }

      // in encrypted cookie
      deck,
      opponent hand,
    }

* begin a turn (refresh game)
  *

* submit a turn
  * POST /turn
  * {
      game id, // identifies the game (can have multiple games in progress)
      action, // play or discard a card from the hand
      card id, // the card id to play or discard
      draw, // the cardId of the card to draw if choosing the draw from a discard pile (if null, draw is from the deck)
    }




Data Access

GET all games by player -> query all partitions where sort key begins_with playerGuid, merge with query of GSI where opponent = playerGuid
GET all games (stats/details) by room -> query all partitions, merge
GET game by ID
GET player by ID

game {
  id,
  players: [ p1, p2 ],
  room id, // GSI
}
