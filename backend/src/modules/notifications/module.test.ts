import { describe, expect, it } from 'vitest';

import { computeBackoffMs } from '../../jobs/notification-outbox-worker.js';
import { registerDeviceSchema, updatePreferencesSchema } from './module.schema.js';

describe('notification schemas and backoff', () => {
  it('validates device registration and preferences', () => {
    expect(
      registerDeviceSchema.parse({
        token: 'a'.repeat(20),
        platform: 'ANDROID',
      }),
    ).toMatchObject({ provider: 'FCM', platform: 'ANDROID' });
    expect(updatePreferencesSchema.parse({ pushEnabled: false })).toEqual({
      pushEnabled: false,
    });
    expect(() => updatePreferencesSchema.parse({})).toThrow();
  });

  it('uses bounded exponential backoff with jitter', () => {
    const a = computeBackoffMs(1);
    const b = computeBackoffMs(8);
    expect(a).toBeGreaterThanOrEqual(5_000);
    expect(b).toBeLessThanOrEqual(300_000 + 1_000);
    expect(b).toBeGreaterThan(a);
  });
});
