import type { PrismaClient, UserRole, UserStatus } from '@prisma/client';

export interface UserMeRecord {
  id: string;
  phoneNumber: string;
  role: UserRole;
  status: UserStatus;
  displayName: string | null;
  passengerProfile: { fullName: string | null } | null;
  riderProfile: {
    fullName: string;
    verificationStatus: string;
    availability: string;
    vehicleRegistration: string | null;
    vehicleDescription: string | null;
  } | null;
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
        passengerProfile: { select: { fullName: true } },
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
