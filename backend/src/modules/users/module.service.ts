import { AppError } from '../../common/errors/app-error.js';
import type { AuditService } from '../audit/module.service.js';
import type { UpdatePassengerProfileInput } from './module.schema.js';
import type {
  PassengerProfileRecord,
  UsersRepository,
} from './module.repository.js';

export interface UsersServiceDeps {
  audit?: AuditService;
}

export type PassengerProfileView = {
  fullName: string | null;
  dateOfBirth: string | null;
  gender: 'MALE' | 'FEMALE' | null;
  homeLocation: string | null;
  homeLatitude: number | null;
  homeLongitude: number | null;
};

export type UserMeView = {
  id: string;
  phoneNumber: string;
  role: string;
  status: string;
  displayName: string | null;
  passengerProfile: PassengerProfileView | null;
  riderProfile: {
    fullName: string;
    verificationStatus: string;
    availability: string;
    vehicleRegistration: string | null;
    vehicleDescription: string | null;
  } | null;
};

export interface UsersService {
  getMe(userId: string): Promise<UserMeView>;
  deleteMe(
    userId: string,
    ip?: string,
  ): Promise<{ id: string; status: 'DELETED'; sessionsRevoked: number }>;
  updatePassengerProfile(
    userId: string,
    input: UpdatePassengerProfileInput,
    ip?: string,
  ): Promise<PassengerProfileView>;
}

function toNumber(value: { toString(): string } | null | undefined): number | null {
  if (value == null) return null;
  const n = Number(value.toString());
  return Number.isFinite(n) ? n : null;
}

function toDateOnly(value: Date | null | undefined): string | null {
  if (!value) return null;
  return value.toISOString().slice(0, 10);
}

function mapPassengerProfile(profile: PassengerProfileRecord | null): PassengerProfileView | null {
  if (!profile) return null;
  return {
    fullName: profile.fullName,
    dateOfBirth: toDateOnly(profile.dateOfBirth),
    gender: profile.gender,
    homeLocation: profile.homeLocation,
    homeLatitude: toNumber(profile.homeLatitude),
    homeLongitude: toNumber(profile.homeLongitude),
  };
}

export class UsersServiceImpl implements UsersService {
  constructor(
    private readonly repository: UsersRepository,
    private readonly deps: UsersServiceDeps = {},
  ) {}

  async getMe(userId: string): Promise<UserMeView> {
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
      passengerProfile:
        user.role === 'PASSENGER' ? mapPassengerProfile(user.passengerProfile) : null,
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

  async updatePassengerProfile(
    userId: string,
    input: UpdatePassengerProfileInput,
    ip?: string,
  ): Promise<PassengerProfileView> {
    const role = await this.repository.findRole(userId);
    if (!role) {
      throw new AppError({
        status: 401,
        code: 'UNAUTHORIZED',
        message: 'Authentication is required',
      });
    }
    if (role !== 'PASSENGER') {
      throw new AppError({
        status: 403,
        code: 'FORBIDDEN',
        message: 'Only passenger accounts can update this profile',
      });
    }

    const profile = await this.repository.upsertPassengerProfile(userId, {
      fullName: input.fullName,
      dateOfBirth: new Date(`${input.dateOfBirth}T00:00:00.000Z`),
      gender: input.gender,
      homeLocation: input.homeLocation,
      homeLatitude: input.homeLatitude ?? null,
      homeLongitude: input.homeLongitude ?? null,
    });

    if (this.deps.audit) {
      await this.deps.audit.record({
        actorId: userId,
        action: 'user.passenger_profile.updated',
        entityType: 'passenger_profile',
        entityId: userId,
        metadata: {
          fullName: input.fullName,
          gender: input.gender,
        },
        ipAddress: ip,
      });
    }

    return mapPassengerProfile(profile)!;
  }
}
