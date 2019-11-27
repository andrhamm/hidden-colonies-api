const ENV = process.env.NODE_ENV || 'development';

const config = {
  [ENV]: true,
  env: ENV,
  vars: process.env,
};

module.exports = config;
