const pino = require('pino');
const { env, isProd } = require('../config/env');

const logger = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL,
  redact: ['req.headers.authorization', 'req.headers.cookie', 'password', '*.password'],
  ...(isProd
    ? {}
    : { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } } }),
});

module.exports = logger;
