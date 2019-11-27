import {
  createContainer, asClass, asFunction, // asValue
} from 'awilix';

import logger from './infra/logger';

import makeGamesService from './services/games';
import GamesRepository from './repositories/GamesRepository';

// @see https://github.com/talyssonoc/node-api-boilerplate/blob/master/src/container.js

export default function configureContainer() {
  const container = createContainer();

  // System
  container.register({
    logger: asFunction(logger).singleton(),
  });

  // Repositories
  container.register({
    gamesRepository: asClass(GamesRepository).singleton(),
  });

  // Database
  // container.register({
  //   database: asValue(database),
  //   UserModel: asValue(UserModel)
  // });

  // Services
  container.register({
    gamesService: asFunction(makeGamesService).scoped(),
  });

  // Actions
  // container.register({
  //   createUser: asClass(CreateUser),
  //   getAllUsers: asClass(GetAllUsers),
  //   getUser: asClass(GetUser),
  //   updateUser: asClass(UpdateUser),
  //   deleteUser: asClass(DeleteUser)
  // });

  // Serializers
  // container.register({
  //   userSerializer: asValue(UserSerializer)
  // });

  return container;
}
