import { notImplemented } from '../../common/errors/not-implemented.js';
import type { RequestOtpInput, VerifyOtpInput, RefreshSessionInput, LogoutInput } from './module.schema.js';
import type { AuthRepository } from './module.repository.js';

export interface AuthService {
  requestOtp(input: RequestOtpInput): Promise<never>;
  verifyOtp(input: VerifyOtpInput): Promise<never>;
  refresh(input: RefreshSessionInput): Promise<never>;
  logout(input: LogoutInput): Promise<never>;
}

export class AuthServiceImpl implements AuthService {
  constructor(private readonly repository: AuthRepository) {}

  async requestOtp(_input: RequestOtpInput): Promise<never> {
    notImplemented('requestOtp');
  }

  async verifyOtp(_input: VerifyOtpInput): Promise<never> {
    notImplemented('verifyOtp');
  }

  async refresh(_input: RefreshSessionInput): Promise<never> {
    notImplemented('refresh');
  }

  async logout(_input: LogoutInput): Promise<never> {
    notImplemented('logout');
  }
}
