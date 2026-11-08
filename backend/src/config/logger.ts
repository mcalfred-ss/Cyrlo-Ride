import pino from 'pino';

import { env } from './env.js';

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers["x-api-key"]',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      '*.password',
      '*.otp',
      '*.code',
      '*.token',
      '*.refreshToken',
      '*.accessToken',
      '*.authorization',
      '*.apiKey',
      '*.VYNFY_API_KEY',
      '*.SMS_API_KEY',
      '*.CYRLO_MAPS_API_KEY',
      '*.MAPS_API_KEY',
      '*.MAPBOX_ACCESS_TOKEN',
      '*.mapboxPublicToken',
      '*.latitude',
      '*.longitude',
      'req.body.latitude',
      'req.body.longitude',
    ],
    censor: '[redacted]',
  },
});
