import pino from 'pino';

import { env } from './env.js';

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      '*.password',
      '*.otp',
      '*.code',
      '*.token',
      '*.refreshToken',
      '*.accessToken',
      '*.authorization',
      '*.latitude',
      '*.longitude',
      'req.body.latitude',
      'req.body.longitude',
    ],
    censor: '[redacted]',
  },
});
