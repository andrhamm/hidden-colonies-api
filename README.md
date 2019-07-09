# ENDPOINTS

## Create a new game

```
Accept: application/json
Content-Type: application/json
POST /game
{ "opponent": "andrhamm" }
```

Where `opponent` is a valid username for an existing user.

## Fetch a game by ID

```
Accept: application/json
GET /game/{id}
```

## Submit a turn

```
Accept: application/json
Content-Type: application/json
POST /game/{id}/turn
{"action":"P0:3", "turn":0}
```

Client should first fetch the game to refresh the state. Turns can be submitted when `isMyTurn` is `true` and until `completedAt` is non-null.

Where `action` starts with `P` when playing or `D` when discarding, followed by the card to play or discard, optionally followed by `::` and an already discarded card to draw (otherwise draw is from the deck). When drawing from a discard pile, only the most recently discarded card from each category can be chosen.

Where `turn` is the value from the recently fetched version of the game.

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
