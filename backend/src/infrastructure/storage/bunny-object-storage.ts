import { createHash } from 'node:crypto';

import { AppError } from '../../common/errors/app-error.js';
import { signBunnyCdnFileUrl } from './bunny-token.js';
import {
  assertAllowedUpload,
  buildObjectKey,
  type ObjectStorage,
  type StoredObject,
  type StoredObjectInput,
} from './object-storage.shared.js';

export interface BunnyObjectStorageOptions {
  storageZoneName: string;
  storageAccessKey: string;
  /** Hostname from Bunny storage zone “FTP & HTTP API” (e.g. storage.bunnycdn.com). */
  storageHostname: string;
  /** Pull zone origin, e.g. https://cyrlo-ride.b-cdn.net (no trailing slash). */
  cdnBaseUrl: string;
  /** Pull zone Token Authentication key (Advanced / HS256). */
  cdnTokenKey: string;
  signedUrlTtlSeconds: number;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

/**
 * Bunny Edge Storage upload + CDN token-authenticated download URLs.
 * Upload: PUT https://{hostname}/{zone}/{path} with AccessKey header.
 */
export class BunnyObjectStorage implements ObjectStorage {
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;

  constructor(private readonly options: BunnyObjectStorageOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? (() => new Date());
  }

  async put(input: StoredObjectInput): Promise<StoredObject> {
    assertAllowedUpload(input.contentType, input.body.length);
    const storageKey = buildObjectKey(input);
    const checksumSha256 = createHash('sha256').update(input.body).digest('hex');
    const url = this.storageObjectUrl(storageKey);

    const response = await this.fetchImpl(url, {
      method: 'PUT',
      headers: {
        AccessKey: this.options.storageAccessKey,
        'Content-Type': 'application/octet-stream',
        Checksum: checksumSha256.toUpperCase(),
        accept: 'application/json',
      },
      body: new Uint8Array(input.body),
    });

    if (response.status !== 201 && response.status !== 200) {
      const detail = await response.text().catch(() => '');
      throw new AppError({
        status: 502,
        code: 'provider_error',
        message: 'Bunny storage upload failed',
        details: { status: response.status, detail: detail.slice(0, 200) },
      });
    }

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
    const expiresAtUnixSeconds =
      Math.floor(this.now().getTime() / 1000) + Math.max(1, Math.trunc(expiresInSeconds));
    return signBunnyCdnFileUrl({
      cdnBaseUrl: this.options.cdnBaseUrl,
      storageKey,
      securityKey: this.options.cdnTokenKey,
      expiresAtUnixSeconds,
    });
  }

  private storageObjectUrl(storageKey: string): string {
    const host = this.options.storageHostname.replace(/^https?:\/\//, '').replace(/\/+$/, '');
    const zone = encodeURIComponent(this.options.storageZoneName);
    const path = storageKey
      .split('/')
      .filter((part) => part.length > 0)
      .map((part) => encodeURIComponent(part))
      .join('/');
    return `https://${host}/${zone}/${path}`;
  }
}
