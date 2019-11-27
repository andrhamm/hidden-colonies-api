import assert from 'assert';

export default function makeGamesService({
  gamesRepository,
  currentUserId,
}) {
  assert(gamesRepository, 'opts.gamesRepository is required.');
  assert(currentUserId, 'opts.currentUserId is required.');

  return {
    // Gets games for the current user.
    getGames: async () => {
      const games = await gamesRepository.listByUserId(currentUserId);
      return games;
    },

    createGame: async (data) => {
      const newGame = await gamesRepository.create({
        // text: data.text,
        // userId: currentUser.id,
        // completed: false
      });

      return newGame;
    },

    // Updates a game if allowed
    // updateGame: async (gameId, data) => {
    //   const game = await gamesRepository.get(gameId);

    //   // Verify that we are allowed to modify this todo
    //   if (game.userId !== currentUser.id) {
    //     throw new Error('Forbidden!');
    //   }

    //   const updatedGame = await gamesRepository.update(gameId, {
    //     // text: data.text,
    //     // completed: data.completed
    //   });

    //   return updatedGame;
    // },
  };
}
