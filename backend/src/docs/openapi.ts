import { APP_VERSION } from '../config/constants.js';

export const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'Cyrlo Ride API',
    version: APP_VERSION,
    description:
      'Live routes only. Booking, payments, and other business endpoints are specified in docs/API_DOCUMENTATION.md and are not implemented yet.',
  },
  servers: [{ url: '/api/v1' }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
    schemas: {
      Health: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              service: { type: 'string' },
              version: { type: 'string' },
              time: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
      ErrorEnvelope: {
        type: 'object',
        properties: {
          success: { type: 'boolean', enum: [false] },
          error: {
            type: 'object',
            properties: {
              code: { type: 'string' },
              message: { type: 'string' },
              requestId: { type: 'string' },
              details: {},
            },
            required: ['code', 'message'],
          },
        },
        required: ['success', 'error'],
      },
    },
  },
  paths: {
    '/health': {
      get: {
        summary: 'Liveness check',
        responses: {
          '200': {
            description: 'Process is up',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Health' } } },
          },
        },
      },
    },
    '/health/ready': {
      get: {
        summary: 'Readiness check',
        responses: {
          '200': { description: 'Database is reachable' },
          '503': {
            description: 'Database is unavailable',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } },
            },
          },
        },
      },
    },
  },
};
