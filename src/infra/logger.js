import log4js from 'log4js';

module.exports = ({ config }) => {
  log4js.configure(config.logging);

  return log4js.getLogger();
};
