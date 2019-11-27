import configureContainer from '../container';
import { getCurrentUserSub } from '../../lib/cognito';

const container = configureContainer();

const gamesService = container.resolve('gamesService');

export const handler = async (event) => {
  container.registerValue({
    // Imagine some auth middleware somewhere...
    // This makes currentUser available to all services!
    currentUserId: getCurrentUserSub(event),
  });

  return gamesService.getGames();
};
