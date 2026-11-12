import type {
  Prisma,
  PrismaClient,
  RiderAvailability,
  RiderDocumentKind,
  RiderVerificationStatus,
  UserStatus,
  VehicleCategory,
  VehicleVerificationStatus,
} from '@prisma/client';

import { AppError } from '../../common/errors/app-error.js';
import { IdempotencyKey } from '../../common/utils/idempotency.js';
import { RIDER_SIGNUP_TOKEN_BONUS } from '../../config/constants.js';

/** Private to the riders module. */
export class RidersRepository {
  constructor(private readonly prisma: PrismaClient) {}

  protected database(): PrismaClient {
    return this.prisma;
  }

  async findUser(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, phoneNumber: true, role: true, status: true, displayName: true },
    });
  }

  async findProfile(userId: string) {
    return this.prisma.riderProfile.findUnique({
      where: { userId },
      include: {
        vehicles: { orderBy: { createdAt: 'asc' } },
        documents: { where: { replacedAt: null }, orderBy: { createdAt: 'desc' } },
        identitySecrets: { select: { purpose: true, keyVersion: true, updatedAt: true } },
        reviewDecisions: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });
  }

  async createDraftProfile(input: {
    userId: string;
    fullName: string;
    driversLicenceNumber?: string | null;
    driversLicenceExpiry?: Date | null;
  }) {
    try {
      return await this.prisma.riderProfile.create({
        data: {
          userId: input.userId,
          fullName: input.fullName,
          driversLicenceNumber: input.driversLicenceNumber ?? null,
          driversLicenceExpiry: input.driversLicenceExpiry ?? null,
          verificationStatus: 'DRAFT',
          availability: 'OFFLINE',
          ghanaCardNumber: null,
        },
      });
    } catch (error) {
      throw new AppError({
        status: 409,
        code: 'CONFLICT',
        message: 'Rider onboarding already started for this account',
      });
    }
  }

  async updateProfile(
    userId: string,
    data: {
      fullName?: string;
      driversLicenceNumber?: string;
      driversLicenceExpiry?: Date;
      verificationStatus?: RiderVerificationStatus;
      verificationNotes?: string | null;
      submittedAt?: Date | null;
    },
  ) {
    return this.prisma.riderProfile.update({ where: { userId }, data });
  }

  async upsertIdentitySecret(input: {
    riderId: string;
    purpose: string;
    ciphertext: string;
    keyVersion: number;
  }) {
    return this.prisma.riderIdentitySecret.upsert({
      where: { riderId_purpose: { riderId: input.riderId, purpose: input.purpose } },
      create: input,
      update: {
        ciphertext: input.ciphertext,
        keyVersion: input.keyVersion,
      },
    });
  }

  async getIdentitySecret(riderId: string, purpose: string) {
    return this.prisma.riderIdentitySecret.findUnique({
      where: { riderId_purpose: { riderId, purpose } },
    });
  }

  async createVehicle(input: {
    riderId: string;
    category: VehicleCategory;
    registrationNumber: string;
    make: string;
    model: string;
    colour: string;
    capacity: number;
  }) {
    return this.prisma.riderVehicle.create({
      data: {
        ...input,
        verificationStatus: 'DRAFT',
      },
    });
  }

  async findVehicle(vehicleId: string) {
    return this.prisma.riderVehicle.findUnique({
      where: { id: vehicleId },
      include: {
        documents: { where: { replacedAt: null } },
        reviewDecisions: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });
  }

  async updateVehicle(
    vehicleId: string,
    data: Partial<{
      category: VehicleCategory;
      registrationNumber: string;
      make: string;
      model: string;
      colour: string;
      capacity: number;
      verificationStatus: VehicleVerificationStatus;
      rejectionReason: string | null;
      submittedAt: Date | null;
      reviewedAt: Date | null;
    }>,
  ) {
    return this.prisma.riderVehicle.update({ where: { id: vehicleId }, data });
  }

  async createDocument(input: {
    riderId: string;
    vehicleId?: string | null;
    kind: RiderDocumentKind;
    storageKey: string;
    contentType: string;
    sizeBytes: number;
    checksumSha256?: string;
    retainUntil?: Date | null;
  }) {
    return this.prisma.$transaction(async (tx) => {
      await tx.riderDocument.updateMany({
        where: {
          riderId: input.riderId,
          vehicleId: input.vehicleId ?? null,
          kind: input.kind,
          replacedAt: null,
        },
        data: { replacedAt: new Date() },
      });
      return tx.riderDocument.create({
        data: {
          riderId: input.riderId,
          vehicleId: input.vehicleId ?? null,
          kind: input.kind,
          storageKey: input.storageKey,
          contentType: input.contentType,
          sizeBytes: input.sizeBytes,
          checksumSha256: input.checksumSha256,
          retainUntil: input.retainUntil ?? null,
        },
      });
    });
  }

  async findDocument(documentId: string) {
    return this.prisma.riderDocument.findUnique({ where: { id: documentId } });
  }

  async listPendingApplications() {
    return this.prisma.riderProfile.findMany({
      where: { verificationStatus: 'PENDING_REVIEW' },
      orderBy: { submittedAt: 'asc' },
      include: {
        user: { select: { id: true, phoneNumber: true, status: true, role: true } },
        vehicles: true,
        documents: { where: { replacedAt: null } },
      },
    });
  }

  /**
   * Paginated rider directory: any account that has a rider_profile
   * (includes applicants still role=PASSENGER).
   */
  async listForAdminDirectory(input: {
    page: number;
    pageSize: number;
    q?: string;
    status?: UserStatus;
    verificationStatus?: RiderVerificationStatus;
    availability?: RiderAvailability;
  }): Promise<{
    total: number;
    items: Array<{
      id: string;
      phoneNumber: string;
      role: 'PASSENGER' | 'RIDER' | 'ADMIN';
      status: UserStatus;
      displayName: string | null;
      createdAt: Date;
      fullName: string;
      verificationStatus: RiderVerificationStatus;
      availability: RiderAvailability;
      submittedAt: Date | null;
    }>;
  }> {
    const uuidLike =
      input.q &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        input.q,
      )
        ? input.q
        : undefined;

    const profileFilter: Prisma.RiderProfileWhereInput = {
      ...(input.verificationStatus ? { verificationStatus: input.verificationStatus } : {}),
      ...(input.availability ? { availability: input.availability } : {}),
    };

    const where: Prisma.UserWhereInput = {
      riderProfile: { is: Object.keys(profileFilter).length ? profileFilter : {} },
      ...(input.status ? { status: input.status } : {}),
      ...(input.q
        ? {
            OR: [
              ...(uuidLike ? [{ id: uuidLike }] : []),
              { phoneNumber: { contains: input.q } },
              { displayName: { contains: input.q, mode: 'insensitive' as const } },
              {
                riderProfile: {
                  is: {
                    ...profileFilter,
                    fullName: { contains: input.q, mode: 'insensitive' as const },
                  },
                },
              },
            ],
          }
        : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        // Secondary id DESC keeps page windows stable when createdAt ties.
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        select: {
          id: true,
          phoneNumber: true,
          role: true,
          status: true,
          displayName: true,
          createdAt: true,
          riderProfile: {
            select: {
              fullName: true,
              verificationStatus: true,
              availability: true,
              submittedAt: true,
            },
          },
        },
      }),
    ]);

    return {
      total,
      items: rows.map((row) => ({
        id: row.id,
        phoneNumber: row.phoneNumber,
        role: row.role,
        status: row.status,
        displayName: row.displayName,
        createdAt: row.createdAt,
        fullName: row.riderProfile!.fullName,
        verificationStatus: row.riderProfile!.verificationStatus,
        availability: row.riderProfile!.availability,
        submittedAt: row.riderProfile!.submittedAt,
      })),
    };
  }

  async findForAdminProfile(riderId: string) {
    return this.prisma.user.findFirst({
      where: { id: riderId, riderProfile: { isNot: null } },
      select: {
        id: true,
        phoneNumber: true,
        role: true,
        status: true,
        displayName: true,
        createdAt: true,
        updatedAt: true,
        riderProfile: {
          select: {
            fullName: true,
            verificationStatus: true,
            availability: true,
            submittedAt: true,
            driversLicenceNumber: true,
            driversLicenceExpiry: true,
            verificationNotes: true,
            vehicles: {
              orderBy: { createdAt: 'asc' },
              select: {
                id: true,
                category: true,
                registrationNumber: true,
                make: true,
                model: true,
                colour: true,
                capacity: true,
                verificationStatus: true,
                rejectionReason: true,
                submittedAt: true,
                reviewedAt: true,
              },
            },
            location: {
              select: {
                sharingEnabled: true,
                recordedAt: true,
                receivedAt: true,
                // Exact coordinates intentionally not selected for directory/profile reads.
              },
            },
            wallet: { select: { tokenBalance: true } },
          },
        },
      },
    });
  }

  async addReviewDecision(input: {
    riderId: string;
    vehicleId?: string | null;
    actorId: string;
    decision: 'APPROVED' | 'REJECTED';
    reason?: string | null;
  }) {
    return this.prisma.riderReviewDecision.create({
      data: {
        riderId: input.riderId,
        vehicleId: input.vehicleId ?? null,
        actorId: input.actorId,
        decision: input.decision,
        reason: input.reason ?? null,
      },
    });
  }

  async setUserRole(userId: string, role: 'PASSENGER' | 'RIDER' | 'ADMIN') {
    return this.prisma.user.update({
      where: { id: userId },
      data: { role },
    });
  }

  async ensureWallet(riderId: string) {
    const bonus = RIDER_SIGNUP_TOKEN_BONUS;
    const key = IdempotencyKey.riderSignupBonus(riderId);

    return this.prisma.$transaction(async (tx) => {
      await tx.riderWallet.upsert({
        where: { riderId },
        create: { riderId, tokenBalance: 0 },
        update: {},
      });

      const existingBonus = await tx.tokenLedgerEntry.findUnique({
        where: { idempotencyKey: key },
      });
      if (existingBonus) {
        return tx.riderWallet.findUniqueOrThrow({ where: { riderId } });
      }

      const locked = await tx.$queryRaw<Array<{ token_balance: number }>>`
        SELECT token_balance
        FROM rider_wallets
        WHERE rider_id = ${riderId}::uuid
        FOR UPDATE
      `;
      const current = locked[0]?.token_balance ?? 0;
      const balanceAfter = current + bonus;
      await tx.tokenLedgerEntry.create({
        data: {
          riderId,
          type: 'ADJUSTMENT',
          tokenDelta: bonus,
          balanceAfter,
          idempotencyKey: key,
          reason: 'rider_signup_bonus',
        },
      });
      return tx.riderWallet.update({
        where: { riderId },
        data: { tokenBalance: balanceAfter },
      });
    });
  }

  async loadOperationalSnapshot(riderId: string) {
    const [user, profile, location, approvedZone, activeTrip, wallet] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: riderId },
        select: { status: true },
      }),
      this.prisma.riderProfile.findUnique({
        where: { userId: riderId },
        select: {
          verificationStatus: true,
          availability: true,
          vehicles: { select: { verificationStatus: true } },
        },
      }),
      this.prisma.riderLocation.findUnique({ where: { riderId } }),
      this.prisma.riderZoneApproval.findFirst({
        where: {
          riderId,
          status: 'APPROVED',
          zone: { isActive: true },
        },
        select: { id: true },
      }),
      this.prisma.booking.findFirst({
        where: {
          riderId,
          status: { in: ['ACCEPTED', 'IN_PROGRESS'] },
        },
        select: { id: true },
      }),
      this.prisma.riderWallet.findUnique({
        where: { riderId },
        select: { tokenBalance: true },
      }),
    ]);

    if (!user || !profile) return null;

    return {
      userStatus: user.status,
      riderVerificationStatus: profile.verificationStatus,
      hasApprovedVehicle: profile.vehicles.some((v) => v.verificationStatus === 'APPROVED'),
      hasApprovedActiveZone: Boolean(approvedZone),
      availability: profile.availability,
      onActiveTrip: Boolean(activeTrip),
      tokenBalance: wallet?.tokenBalance ?? 0,
      location: location
        ? {
            sharingEnabled: location.sharingEnabled,
            recordedAt: location.recordedAt,
            receivedAt: location.receivedAt,
          }
        : null,
    };
  }

  async updateAvailability(
    riderId: string,
    availability: 'OFFLINE' | 'AVAILABLE',
  ) {
    return this.prisma.$transaction(async (tx) => {
      const profile = await tx.riderProfile.update({
        where: { userId: riderId },
        data: { availability },
      });
      if (availability === 'OFFLINE') {
        await tx.riderLocation.updateMany({
          where: { riderId },
          data: { sharingEnabled: false },
        });
      } else {
        await tx.riderLocation.updateMany({
          where: { riderId },
          data: { sharingEnabled: true },
        });
      }
      return profile;
    });
  }
}
