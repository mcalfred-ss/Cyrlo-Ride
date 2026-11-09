import { env } from '../../config/env.js';
import { BunnyObjectStorage } from './bunny-object-storage.js';
import {
  MemoryObjectStorage,
  UnconfiguredObjectStorage,
  type ObjectStorage,
} from './object-storage.shared.js';

export {
  assertAllowedUpload,
  buildObjectKey,
  MAX_DOCUMENT_BYTES,
  MemoryObjectStorage,
  UnconfiguredObjectStorage,
  type ObjectStorage,
  type StoredObject,
  type StoredObjectInput,
} from './object-storage.shared.js';

function bunnyConfigured(): boolean {
  return (
    env.STORAGE_PROVIDER.trim().toLowerCase() === 'bunny' &&
    env.BUNNY_STORAGE_ZONE_NAME.trim().length > 0 &&
    env.BUNNY_STORAGE_ACCESS_KEY.trim().length > 0 &&
    env.BUNNY_STORAGE_HOSTNAME.trim().length > 0 &&
    env.BUNNY_CDN_BASE_URL.trim().length > 0 &&
    env.BUNNY_CDN_TOKEN_KEY.trim().length > 0
  );
}

export function createObjectStorage(): ObjectStorage {
  if (bunnyConfigured()) {
    return new BunnyObjectStorage({
      storageZoneName: env.BUNNY_STORAGE_ZONE_NAME.trim(),
      storageAccessKey: env.BUNNY_STORAGE_ACCESS_KEY.trim(),
      storageHostname: env.BUNNY_STORAGE_HOSTNAME.trim(),
      cdnBaseUrl: env.BUNNY_CDN_BASE_URL.trim(),
      cdnTokenKey: env.BUNNY_CDN_TOKEN_KEY.trim(),
      signedUrlTtlSeconds: env.OBJECT_STORAGE_SIGNED_URL_TTL_SECONDS,
    });
  }

  if (env.NODE_ENV === 'test') return new MemoryObjectStorage();
  return new UnconfiguredObjectStorage();
}
