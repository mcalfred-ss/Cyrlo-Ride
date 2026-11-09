import { AppError } from '../../common/errors/app-error.js';
import { notImplemented } from '../../common/errors/not-implemented.js';
import type { AuditService } from '../audit/module.service.js';
import type { UpdatePassengerProfileInput } from './module.schema.js';
import type { UsersRepository } from './module.repository.js';

export interface UsersServiceDeps {
  audit?: AuditService;
}

export interface UsersService {
  getMe(userId: string): Promise<{
    id: string;
    phoneNumber: string;
    role: string;
    status: string;
    displayName: string | null;
    passengerProfile: { fullName: string | null } | null;
    riderProfile: {
      fullName: string;
      verificationStatus: string;
      availability: string;
      vehicleRegistration: string | null;
      vehicleDescription: string | null;
    } | null;
  }>;
  deleteMe(
    userId: string,
    ip?: string,
  ): Promise<{ id: string; status: 'DELETED'; sessionsRevoked: number }>;
  updatePassengerProfile(input: UpdatePassengerProfileInput): Promise<never>;
}

export class UsersServiceImpl implements UsersService {
  constructor(
    private readonly repository: UsersRepository,
    private readonly deps: UsersServiceDeps = {},
  ) {}

  async getMe(userId: string) {
    const user = await this.repository.findMe(userId);
    if (!user || user.status === 'DELETED') {
      throw new AppError({
        status: 401,
        code: 'UNAUTHORIZED',
        message: 'Authentication is required',
      });
    }
    if (user.status === 'SUSPENDED') {
      throw new AppError({
        status: 403,
        code: 'FORBIDDEN',
        message: 'Account is suspended',
      });
    }

    return {
      id: user.id,
      phoneNumber: user.phoneNumber,
      role: user.role,
      status: user.status,
      displayName: user.displayName,
      passengerProfile: user.role === 'PASSENGER' ? user.passengerProfile : null,
      riderProfile: user.role === 'RIDER' ? user.riderProfile : null,
    };
  }

  async deleteMe(userId: string, ip?: string) {
    const deleted = await this.repository.markDeleted(userId);
    if (!deleted) {
      throw new AppError({
        status: 401,
        code: 'UNAUTHORIZED',
        message: 'Authentication is required',
      });
    }

    if (this.deps.audit) {
      await this.deps.audit.record({
        actorId: userId,
        action: 'user.account.deleted',
        entityType: 'user',
        entityId: userId,
        metadata: {
          sessionsRevoked: deleted.sessionsRevoked,
        },
        ipAddress: ip,
      });
    }

    return {
      id: deleted.id,
      status: 'DELETED' as const,
      sessionsRevoked: deleted.sessionsRevoked,
    };
  }

  async updatePassengerProfile(_input: UpdatePassengerProfileInput): Promise<never> {
    notImplemented('updatePassengerProfile');
  }
}
