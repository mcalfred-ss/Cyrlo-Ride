import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import type { AdminMe } from '../api/types';
import { privilegedAccessToken } from '../test/jwt';
import { clearMemorySession, setMemorySession } from './session-store';
import { RequireMfaSession } from './RequireMfaSession';

const me: AdminMe = {
  id: '11111111-1111-1111-1111-111111111111',
  phoneNumber: '+233244000001',
  role: 'ADMIN',
  status: 'ACTIVE',
  displayName: 'Ops',
  staffRole: 'OPERATIONS_ADMIN',
  mfaEnabled: true,
};

vi.mock('./AuthProvider', () => ({
  useAuth: () => mockAuth,
}));

let mockAuth: {
  phase: string;
  me: AdminMe | null;
  staffRole: AdminMe['staffRole'] | null;
};

describe('RequireMfaSession', () => {
  beforeEach(() => {
    clearMemorySession();
    mockAuth = {
      phase: 'authenticated',
      me,
      staffRole: 'OPERATIONS_ADMIN',
    };
  });

  it('allows permitted routes when MFA session is present', () => {
    setMemorySession({
      accessToken: privilegedAccessToken({ staffRole: 'OPERATIONS_ADMIN' }),
      refreshToken: 'refresh-token-value-20chars',
    });
    render(
      <MemoryRouter initialEntries={['/riders']}>
        <Routes>
          <Route element={<RequireMfaSession />}>
            <Route path="/riders" element={<div>riders-ok</div>} />
          </Route>
          <Route path="/forbidden" element={<div>forbidden</div>} />
          <Route path="/login" element={<div>login</div>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('riders-ok')).toBeInTheDocument();
  });

  it('blocks unauthorized direct navigation', () => {
    setMemorySession({
      accessToken: privilegedAccessToken({ staffRole: 'OPERATIONS_ADMIN' }),
      refreshToken: 'refresh-token-value-20chars',
    });
    render(
      <MemoryRouter initialEntries={['/finance']}>
        <Routes>
          <Route element={<RequireMfaSession />}>
            <Route path="/finance" element={<div>finance-ok</div>} />
          </Route>
          <Route path="/forbidden" element={<div>forbidden</div>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('forbidden')).toBeInTheDocument();
  });

  it('redirects anonymous users to login', () => {
    mockAuth = { phase: 'anonymous', me: null, staffRole: null };
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<RequireMfaSession />}>
            <Route path="/" element={<div>home</div>} />
          </Route>
          <Route path="/login" element={<div>login</div>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('login')).toBeInTheDocument();
  });
});
