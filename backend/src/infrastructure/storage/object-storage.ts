import { createHash, randomUUID } from 'node:crypto';

import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { AppError } from '../../common/errors/app-error.js';
import { env } from '../../config/env.js';

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
        'Object storage is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET.',
    });
  }

  async getSignedDownloadUrl(): Promise<string> {
    throw new AppError({
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
      message:
        'Object storage is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET.',
    });
  }
}

export class R2ObjectStorage implements ObjectStorage {
  private readonly client: S3Client;

  constructor(
    private readonly options: {
      accountId: string;
      accessKeyId: string;
      secretAccessKey: string;
      bucket: string;
      signedUrlTtlSeconds: number;
    },
  ) {
    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${options.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      },
    });
  }

  async put(input: StoredObjectInput): Promise<StoredObject> {
    assertAllowedUpload(input.contentType, input.body.length);
    const storageKey = buildObjectKey(input);
    const checksumSha256 = createHash('sha256').update(input.body).digest('hex');
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.options.bucket,
        Key: storageKey,
        Body: input.body,
        ContentType: input.contentType,
        ContentLength: input.body.length,
      }),
    );
    return {
      storageKey,
      contentType: input.contentType,
      sizeBytes: input.body.length,
      checksumSha256,
    };
  }

  async getSignedDownloadUrl(
    storageKey: string,
    expiresInSeconds = this.options.signedUrlTtlSeconds,
  ): Promise<string> {
    if (!storageKey.startsWith('riders/')) {
      throw new AppError({
        status: 400,
        code: 'VALIDATION_ERROR',
        message: 'Invalid storage key',
      });
    }
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.options.bucket,
        Key: storageKey,
      }),
      { expiresIn: expiresInSeconds },
    );
  }
}

export function createObjectStorage(): ObjectStorage {
  const configured =
    env.R2_ACCOUNT_ID.trim().length > 0 &&
    env.R2_ACCESS_KEY_ID.trim().length > 0 &&
    env.R2_SECRET_ACCESS_KEY.trim().length > 0 &&
    env.R2_BUCKET.trim().length > 0;

  if (!configured) {
    if (env.NODE_ENV === 'test') return new MemoryObjectStorage();
    return new UnconfiguredObjectStorage();
  }

  return new R2ObjectStorage({
    accountId: env.R2_ACCOUNT_ID,
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    bucket: env.R2_BUCKET,
    signedUrlTtlSeconds: env.R2_SIGNED_URL_TTL_SECONDS,
  });
}
