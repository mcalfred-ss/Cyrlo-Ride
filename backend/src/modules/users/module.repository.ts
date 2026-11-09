import type { PassengerGender, PrismaClient, UserRole, UserStatus } from '@prisma/client';

export interface PassengerProfileRecord {
  fullName: string | null;
  dateOfBirth: Date | null;
  gender: PassengerGender | null;
  homeLocation: string | null;
  homeLatitude: { toString(): string } | null;
  homeLongitude: { toString(): string } | null;
}

export interface UserMeRecord {
  id: string;
  phoneNumber: string;
  role: UserRole;
  status: UserStatus;
  displayName: string | null;
  passengerProfile: PassengerProfileRecord | null;
  riderProfile: {
    fullName: string;
    verificationStatus: string;
    availability: string;
    vehicleRegistration: string | null;
    vehicleDescription: string | null;
  } | null;
}

export interface UpsertPassengerProfileInput {
  fullName: string;
  dateOfBirth: Date;
  gender: PassengerGender;
  homeLocation: string;
  homeLatitude: number | null;
  homeLongitude: number | null;
}

/** Private to the users module. Do not import this from another module. */
export class UsersRepository {
  constructor(private readonly prisma: PrismaClient) {}

  protected database(): PrismaClient {
    return this.prisma;
  }

  async findMe(userId: string): Promise<UserMeRecord | null> {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        phoneNumber: true,
        role: true,
        status: true,
        displayName: true,
        passengerProfile: {
          select: {
            fullName: true,
            dateOfBirth: true,
            gender: true,
            homeLocation: true,
            homeLatitude: true,
            homeLongitude: true,
          },
        },
        riderProfile: {
          select: {
            fullName: true,
            verificationStatus: true,
            availability: true,
            vehicleRegistration: true,
            vehicleDescription: true,
          },
        },
      },
    });
  }

  async findRole(userId: string): Promise<UserRole | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, status: true },
    });
    if (!user || user.status === 'DELETED') return null;
    return user.role;
  }

  async upsertPassengerProfile(
    userId: string,
    input: UpsertPassengerProfileInput,
  ): Promise<PassengerProfileRecord> {
    const data = {
      fullName: input.fullName,
      dateOfBirth: input.dateOfBirth,
      gender: input.gender,
      homeLocation: input.homeLocation,
      homeLatitude: input.homeLatitude,
      homeLongitude: input.homeLongitude,
    };

    const [, profile] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { displayName: input.fullName },
      }),
      this.prisma.passengerProfile.upsert({
        where: { userId },
        create: { userId, ...data },
        update: data,
        select: {
          fullName: true,
          dateOfBirth: true,
          gender: true,
          homeLocation: true,
          homeLatitude: true,
          homeLongitude: true,
        },
      }),
    ]);

    return profile;
  }

  /**
   * Soft-deletes the account: status DELETED, frees the unique phone for re-signup,
   * and revokes active refresh sessions. Does not hard-delete financial rows.
   */
  async markDeleted(
    userId: string,
    now = new Date(),
  ): Promise<{
    id: string;
    status: 'DELETED';
    previousPhoneNumber: string;
    sessionsRevoked: number;
  } | null> {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true, status: true, phoneNumber: true },
      });
      if (!user || user.status === 'DELETED') {
        return null;
      }

      // phone_number is @unique — release it so the same number can re-register.
      const releasedPhone = `deleted:${now.getTime()}:${user.phoneNumber}`;
      await tx.user.update({
        where: { id: userId },
        data: {
          status: 'DELETED',
          phoneNumber: releasedPhone,
        },
      });

      const revoked = await tx.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      });

      return {
        id: user.id,
        status: 'DELETED' as const,
        previousPhoneNumber: user.phoneNumber,
        sessionsRevoked: revoked.count,
      };
    });
  }
}
