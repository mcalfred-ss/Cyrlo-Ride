import { createHash, randomUUID } from 'node:crypto';

import { AppError } from '../../common/errors/app-error.js';

export interface StoredObjectInput {
  riderId: string;
  kind: string;
  vehicleId?: string;
  contentType: string;
  body: Buffer;
}

export interface StoredObject {
  storageKey: string;
  contentType: string;
  sizeBytes: number;
  checksumSha256: string;
}

export interface ObjectStorage {
  put(input: StoredObjectInput): Promise<StoredObject>;
  getSignedDownloadUrl(storageKey: string, expiresInSeconds?: number): Promise<string>;
}

const ALLOWED_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

export const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;

export function assertAllowedUpload(contentType: string, sizeBytes: number): void {
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    throw new AppError({
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Unsupported document type',
    });
  }
  if (sizeBytes <= 0 || sizeBytes > MAX_DOCUMENT_BYTES) {
    throw new AppError({
      status: 400,
      code: 'VALIDATION_ERROR',
      message: `Document must be between 1 byte and ${MAX_DOCUMENT_BYTES} bytes`,
    });
  }
}

export function buildObjectKey(input: {
  riderId: string;
  kind: string;
  vehicleId?: string;
  contentType: string;
}): string {
  const ext =
    input.contentType === 'application/pdf'
      ? 'pdf'
      : input.contentType === 'image/png'
        ? 'png'
        : input.contentType === 'image/webp'
          ? 'webp'
          : 'jpg';
  const vehiclePart = input.vehicleId ? `vehicles/${input.vehicleId}/` : '';
  return `riders/${input.riderId}/${vehiclePart}${input.kind.toLowerCase()}/${randomUUID()}.${ext}`;
}

/** In-memory storage for tests. Never used in production. */
export class MemoryObjectStorage implements ObjectStorage {
  readonly objects = new Map<string, { body: Buffer; contentType: string }>();

  async put(input: StoredObjectInput): Promise<StoredObject> {
    assertAllowedUpload(input.contentType, input.body.length);
    const storageKey = buildObjectKey(input);
    this.objects.set(storageKey, { body: input.body, contentType: input.contentType });
    return {
      storageKey,
      contentType: input.contentType,
      sizeBytes: input.body.length,
      checksumSha256: createHash('sha256').update(input.body).digest('hex'),
    };
  }

  async getSignedDownloadUrl(storageKey: string, _expiresInSeconds = 60): Promise<string> {
    if (!this.objects.has(storageKey)) {
      throw new AppError({
        status: 404,
        code: 'NOT_FOUND',
        message: 'Document not found',
      });
    }
    return `memory://signed/${encodeURIComponent(storageKey)}`;
  }
}

export class UnconfiguredObjectStorage implements ObjectStorage {
  async put(): Promise<StoredObject> {
    throw new AppError({
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
      message:
        'Object storage is not configured. Set STORAGE_PROVIDER=bunny with BUNNY_STORAGE_ZONE_NAME, BUNNY_STORAGE_ACCESS_KEY, BUNNY_STORAGE_HOSTNAME, BUNNY_CDN_BASE_URL, and BUNNY_CDN_TOKEN_KEY.',
    });
  }

  async getSignedDownloadUrl(): Promise<string> {
    throw new AppError({
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
      message:
        'Object storage is not configured. Set STORAGE_PROVIDER=bunny with BUNNY_STORAGE_ZONE_NAME, BUNNY_STORAGE_ACCESS_KEY, BUNNY_STORAGE_HOSTNAME, BUNNY_CDN_BASE_URL, and BUNNY_CDN_TOKEN_KEY.',
    });
  }
}
