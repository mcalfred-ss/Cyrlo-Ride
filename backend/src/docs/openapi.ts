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
      Coordinate: {
        type: 'object',
        additionalProperties: false,
        required: ['latitude', 'longitude'],
        properties: {
          latitude: { type: 'number', minimum: -90, maximum: 90 },
          longitude: { type: 'number', minimum: -180, maximum: 180 },
        },
      },
      ResolvedNearbyLandmark: {
        type: 'object',
        additionalProperties: false,
        required: [
          'name',
          'category',
          'latitude',
          'longitude',
          'distanceMeters',
          'source',
        ],
        properties: {
          name: { type: 'string' },
          category: { type: 'string' },
          latitude: { type: 'number' },
          longitude: { type: 'number' },
          distanceMeters: { type: 'number' },
          source: { type: 'string' },
        },
      },
      ResolvedLocation: {
        type: 'object',
        additionalProperties: false,
        required: [
          'formattedAddress',
          'locality',
          'neighbourhood',
          'city',
          'district',
          'region',
          'country',
          'latitude',
          'longitude',
          'source',
          'confidence',
          'approximate',
          'providerLabel',
          'catalogueTownId',
          'catalogueTownDistanceMeters',
        ],
        properties: {
          formattedAddress: { type: 'string' },
          locality: { type: ['string', 'null'] },
          neighbourhood: { type: ['string', 'null'] },
          city: { type: ['string', 'null'] },
          district: { type: ['string', 'null'] },
          region: { type: ['string', 'null'] },
          country: { type: ['string', 'null'] },
          latitude: { type: 'number' },
          longitude: { type: 'number' },
          source: {
            type: 'string',
            enum: [
              'provider',
              'catalogue',
              'provider+catalogue',
              'partial',
              'unavailable',
            ],
          },
          confidence: {
            type: 'string',
            enum: ['high', 'medium', 'low', 'approximate'],
          },
          approximate: { type: 'boolean' },
          providerLabel: { type: ['string', 'null'] },
          catalogueTownId: { type: ['string', 'null'] },
          catalogueTownDistanceMeters: { type: ['number', 'null'] },
        },
      },
      LocationResolveResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', enum: [true] },
          data: {
            type: 'object',
            required: ['location', 'nearbyLandmarks'],
            properties: {
              location: { $ref: '#/components/schemas/ResolvedLocation' },
              nearbyLandmarks: {
                type: 'array',
                items: { $ref: '#/components/schemas/ResolvedNearbyLandmark' },
              },
            },
          },
        },
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
    '/maps/location/resolve': {
      post: {
        summary: 'Resolve structured location and nearby landmarks',
        description:
          'Composes Cyrlo Maps reverse geocode with the Ashanti Open Admin town catalogue and verified landmarks. Does not invent missing address parts, does not move coordinates to town centroids, and does not use Ride service-zone polygons as community boundaries. Accra assets are out of scope.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                additionalProperties: false,
                required: ['latitude', 'longitude'],
                properties: {
                  latitude: { type: 'number', minimum: -90, maximum: 90 },
                  longitude: { type: 'number', minimum: -180, maximum: 180 },
                  landmarkLimit: {
                    type: 'integer',
                    minimum: 0,
                    maximum: 10,
                    description: 'Max nearby landmarks (default 5).',
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Structured location (possibly partial/approximate)',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/LocationResolveResponse' },
              },
            },
          },
          '401': {
            description: 'Missing or invalid JWT',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } },
            },
          },
          '400': {
            description: 'Invalid coordinates',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } },
            },
          },
        },
      },
    },
  },
};
