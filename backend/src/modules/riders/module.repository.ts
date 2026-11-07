import type {
  PrismaClient,
  RiderDocumentKind,
  RiderVerificationStatus,
  VehicleCategory,
  VehicleVerificationStatus,
} from '@prisma/client';

import { AppError } from '../../common/errors/app-error.js';

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
    driversLicenceNumber: string;
    driversLicenceExpiry: Date;
  }) {
    try {
      return await this.prisma.riderProfile.create({
        data: {
          userId: input.userId,
          fullName: input.fullName,
          driversLicenceNumber: input.driversLicenceNumber,
          driversLicenceExpiry: input.driversLicenceExpiry,
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
    return this.prisma.riderWallet.upsert({
      where: { riderId },
      create: { riderId, tokenBalance: 0 },
      update: {},
    });
  }

  async loadOperationalSnapshot(riderId: string) {
    const [user, profile, location, approvedZone, activeTrip] = await Promise.all([
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
    ]);

    if (!user || !profile) return null;

    return {
      userStatus: user.status,
      riderVerificationStatus: profile.verificationStatus,
      hasApprovedVehicle: profile.vehicles.some((v) => v.verificationStatus === 'APPROVED'),
      hasApprovedActiveZone: Boolean(approvedZone),
      availability: profile.availability,
      onActiveTrip: Boolean(activeTrip),
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
