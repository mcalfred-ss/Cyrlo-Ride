import { beforeEach, describe, expect, it } from 'vitest';

import {
  clearMemorySession,
  getAccessToken,
  getMemorySession,
  setMemorySession,
} from './session-store';

describe('memory session store', () => {
  beforeEach(() => {
    clearMemorySession();
  });

  it('keeps tokens only in memory', () => {
    setMemorySession({ accessToken: 'a', refreshToken: 'r' });
    expect(getAccessToken()).toBe('a');
    expect(getMemorySession()?.refreshToken).toBe('r');
    expect(localStorage.getItem('accessToken')).toBeNull();
    clearMemorySession();
    expect(getAccessToken()).toBeNull();
  });
});
