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
}
