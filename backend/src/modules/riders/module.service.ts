import { AppError } from '../../common/errors/app-error.js';
import { encryptSecret, decryptSecret } from '../../common/security/secret-box.js';
import { env } from '../../config/env.js';
import { publishRiderAvailabilityUpdated } from '../../infrastructure/realtime/publisher.js';
import type { ObjectStorage } from '../../infrastructure/storage/object-storage.js';
import type { AuditService } from '../audit/module.service.js';
import { isVerificationEligible } from './eligibility.js';
import {
  evaluateGoOnlineEligibility,
  evaluateOperationalEligibility,
  IneligibilityReason,
} from './operational-eligibility.js';
import type { RidersRepository } from './module.repository.js';
import type {
  CreateVehicleInput,
  DocumentKind,
  ReviewRiderInput,
  ReviewVehicleInput,
  StartRiderOnboardingInput,
  UpdateAvailabilityInput,
  UpdateRiderOnboardingInput,
  UpdateVehicleInput,
} from './module.schema.js';

const GHANA_CARD_PURPOSE = 'GHANA_CARD_NUMBER';

const REQUIRED_RIDER_DOCS: DocumentKind[] = ['GHANA_CARD', 'DRIVERS_LICENCE', 'RIDER_PHOTO'];
const REQUIRED_VEHICLE_DOCS: DocumentKind[] = [
  'VEHICLE_REGISTRATION',
  'ROADWORTHINESS',
  'INSURANCE',
  'VEHICLE_PHOTO',
];

export interface RidersServiceDeps {
  storage: ObjectStorage;
  audit: AuditService;
  now?: () => Date;
}

export interface RidersService {
  startOnboarding(userId: string, input: StartRiderOnboardingInput, ip?: string): Promise<unknown>;
  updateOnboarding(userId: string, input: UpdateRiderOnboardingInput, ip?: string): Promise<unknown>;
  getMyApplication(userId: string): Promise<unknown>;
  createVehicle(userId: string, input: CreateVehicleInput, ip?: string): Promise<unknown>;
  updateVehicle(
    userId: string,
    vehicleId: string,
    input: UpdateVehicleInput,
    ip?: string,
  ): Promise<unknown>;
  uploadDocument(
    userId: string,
    input: {
      kind: DocumentKind;
      vehicleId?: string;
      contentType: string;
      body: Buffer;
    },
    ip?: string,
  ): Promise<unknown>;
  submitApplication(userId: string, ip?: string): Promise<unknown>;
  listPendingForOps(): Promise<unknown>;
  getApplicationForOps(riderId: string): Promise<unknown>;
  openDocumentForOps(
    actorId: string,
    documentId: string,
    ip?: string,
  ): Promise<{ url: string; expiresIn: number }>;
  revealGhanaCardForOps(
    actorId: string,
    riderId: string,
    ip?: string,
  ): Promise<{ ghanaCardNumber: string; keyVersion: number }>;
  reviewApplication(
    actorId: string,
    riderId: string,
    input: ReviewRiderInput,
    ip?: string,
  ): Promise<unknown>;
  reviewVehicle(
    actorId: string,
    vehicleId: string,
    input: ReviewVehicleInput,
    ip?: string,
  ): Promise<unknown>;
  setAvailability(
    riderId: string,
    input: UpdateAvailabilityInput,
    ip?: string,
  ): Promise<unknown>;
  getOperationalEligibility(riderId: string): Promise<unknown>;
  verificationEligibility(userId: string): Promise<boolean>;
}

export class RidersServiceImpl implements RidersService {
  private readonly now: () => Date;

  constructor(
    private readonly repository: RidersRepository,
    private readonly deps: RidersServiceDeps,
  ) {
    this.now = deps.now ?? (() => new Date());
  }

  async startOnboarding(userId: string, input: StartRiderOnboardingInput, ip?: string) {
    const user = await this.requireActiveNonAdmin(userId);
    const existing = await this.repository.findProfile(userId);
    const canHydrateAuthStub =
      existing &&
      existing.verificationStatus === 'DRAFT' &&
      !existing.submittedAt &&
      (!existing.fullName || existing.fullName.trim().length === 0) &&
      existing.identitySecrets.length === 0;

    if (existing && !canHydrateAuthStub) {
      throw new AppError({
        status: 409,
        code: 'CONFLICT',
        message: 'Rider onboarding already started for this account',
      });
    }

    if (!existing) {
      await this.repository.createDraftProfile({
        userId,
        fullName: input.fullName,
        driversLicenceNumber: input.driversLicenceNumber,
        driversLicenceExpiry: new Date(input.driversLicenceExpiry),
      });
    } else {
      await this.repository.updateProfile(userId, {
        fullName: input.fullName,
        driversLicenceNumber: input.driversLicenceNumber,
        driversLicenceExpiry: new Date(input.driversLicenceExpiry),
      });
    }

    await this.repository.upsertIdentitySecret({
      riderId: userId,
      purpose: GHANA_CARD_PURPOSE,
      ciphertext: encryptSecret(input.ghanaCardNumber, env.IDENTITY_ENCRYPTION_KEY),
      keyVersion: env.IDENTITY_ENCRYPTION_KEY_VERSION,
    });

    await this.deps.audit.record({
      actorId: userId,
      action: existing ? 'rider.application.updated' : 'rider.application.created',
      entityType: 'rider_profile',
      entityId: userId,
      metadata: { role: user.role },
      ipAddress: ip,
    });

    return this.publicApplicationView(userId);
  }

  async updateOnboarding(userId: string, input: UpdateRiderOnboardingInput, ip?: string) {
    await this.requireActiveNonAdmin(userId);
    const profile = await this.requireEditableProfile(userId);

    if (input.ghanaCardNumber) {
      await this.repository.upsertIdentitySecret({
        riderId: userId,
        purpose: GHANA_CARD_PURPOSE,
        ciphertext: encryptSecret(input.ghanaCardNumber, env.IDENTITY_ENCRYPTION_KEY),
        keyVersion: env.IDENTITY_ENCRYPTION_KEY_VERSION,
      });
    }

    await this.repository.updateProfile(userId, {
      fullName: input.fullName,
      driversLicenceNumber: input.driversLicenceNumber,
      driversLicenceExpiry: input.driversLicenceExpiry
        ? new Date(input.driversLicenceExpiry)
        : undefined,
      verificationNotes: profile.verificationStatus === 'REJECTED' ? null : undefined,
    });

    await this.deps.audit.record({
      actorId: userId,
      action: 'rider.application.updated',
      entityType: 'rider_profile',
      entityId: userId,
      ipAddress: ip,
    });

    return this.publicApplicationView(userId);
  }

  async getMyApplication(userId: string) {
    await this.requireActiveNonAdmin(userId);
    return this.publicApplicationView(userId);
  }

  async createVehicle(userId: string, input: CreateVehicleInput, ip?: string) {
    await this.requireActiveNonAdmin(userId);
    await this.requireEditableProfile(userId);
    const vehicle = await this.repository.createVehicle({
      riderId: userId,
      ...input,
    });
    await this.deps.audit.record({
      actorId: userId,
      action: 'rider.vehicle.created',
      entityType: 'rider_vehicle',
      entityId: vehicle.id,
      metadata: { category: input.category },
      ipAddress: ip,
    });
    return this.publicVehicleView(vehicle.id, userId);
  }

  async updateVehicle(
    userId: string,
    vehicleId: string,
    input: UpdateVehicleInput,
    ip?: string,
  ) {
    await this.requireActiveNonAdmin(userId);
    await this.requireEditableProfile(userId);
    const vehicle = await this.requireOwnedVehicle(userId, vehicleId);
    if (vehicle.verificationStatus === 'APPROVED') {
      throw new AppError({
        status: 409,
        code: 'CONFLICT',
        message: 'Approved vehicles cannot be edited without a new review cycle',
      });
    }

    const category = input.category ?? vehicle.category;
    const capacity = input.capacity ?? vehicle.capacity;
    assertCapacity(category, capacity);

    await this.repository.updateVehicle(vehicleId, {
      ...input,
      verificationStatus:
        vehicle.verificationStatus === 'REJECTED' ? 'DRAFT' : vehicle.verificationStatus,
      rejectionReason: vehicle.verificationStatus === 'REJECTED' ? null : vehicle.rejectionReason,
    });

    await this.deps.audit.record({
      actorId: userId,
      action: 'rider.vehicle.updated',
      entityType: 'rider_vehicle',
      entityId: vehicleId,
      ipAddress: ip,
    });
    return this.publicVehicleView(vehicleId, userId);
  }

  async uploadDocument(
    userId: string,
    input: {
      kind: DocumentKind;
      vehicleId?: string;
      contentType: string;
      body: Buffer;
    },
    ip?: string,
  ) {
    await this.requireActiveNonAdmin(userId);
    await this.requireEditableProfile(userId);
    if (input.vehicleId) {
      await this.requireOwnedVehicle(userId, input.vehicleId);
      if (
        !['VEHICLE_PHOTO', 'VEHICLE_REGISTRATION', 'ROADWORTHINESS', 'INSURANCE'].includes(
          input.kind,
        )
      ) {
        throw new AppError({
          status: 400,
          code: 'VALIDATION_ERROR',
          message: 'Document kind is not valid for a vehicle',
        });
      }
    } else if (
      !['GHANA_CARD', 'DRIVERS_LICENCE', 'RIDER_PHOTO'].includes(input.kind)
    ) {
      throw new AppError({
        status: 400,
        code: 'VALIDATION_ERROR',
        message: 'Document kind requires a vehicleId',
      });
    }

    const stored = await this.deps.storage.put({
      riderId: userId,
      kind: input.kind,
      vehicleId: input.vehicleId,
      contentType: input.contentType,
      body: input.body,
    });

    const doc = await this.repository.createDocument({
      riderId: userId,
      vehicleId: input.vehicleId,
      kind: input.kind,
      storageKey: stored.storageKey,
      contentType: stored.contentType,
      sizeBytes: stored.sizeBytes,
      checksumSha256: stored.checksumSha256,
    });

    await this.deps.audit.record({
      actorId: userId,
      action: 'rider.document.uploaded',
      entityType: 'rider_document',
      entityId: doc.id,
      metadata: { kind: input.kind, vehicleId: input.vehicleId ?? null, sizeBytes: stored.sizeBytes },
      ipAddress: ip,
    });

    return {
      id: doc.id,
      kind: doc.kind,
      contentType: doc.contentType,
      sizeBytes: doc.sizeBytes,
      createdAt: doc.createdAt.toISOString(),
    };
  }

  async submitApplication(userId: string, ip?: string) {
    const user = await this.requireActiveNonAdmin(userId);
    if (user.status === 'SUSPENDED') {
      throw new AppError({
        status: 403,
        code: 'FORBIDDEN',
        message: 'Suspended accounts cannot submit rider applications',
      });
    }
    const profile = await this.requireEditableProfile(userId);
    const secret = await this.repository.getIdentitySecret(userId, GHANA_CARD_PURPOSE);
    if (!secret) {
      throw new AppError({
        status: 400,
        code: 'VALIDATION_ERROR',
        message: 'Ghana Card number is required',
      });
    }

    const docs = profile.documents ?? [];
    for (const kind of REQUIRED_RIDER_DOCS) {
      if (!docs.some((doc) => doc.kind === kind && !doc.replacedAt)) {
        throw new AppError({
          status: 400,
          code: 'VALIDATION_ERROR',
          message: `Missing required document: ${kind}`,
        });
      }
    }

    const vehicles = profile.vehicles ?? [];
    if (vehicles.length === 0) {
      throw new AppError({
        status: 400,
        code: 'VALIDATION_ERROR',
        message: 'At least one vehicle is required',
      });
    }

    const now = this.now();
    for (const vehicle of vehicles) {
      if (vehicle.verificationStatus === 'APPROVED') continue;
      const vehicleDocs = docs.filter((doc) => doc.vehicleId === vehicle.id && !doc.replacedAt);
      for (const kind of REQUIRED_VEHICLE_DOCS) {
        if (!vehicleDocs.some((doc) => doc.kind === kind)) {
          throw new AppError({
            status: 400,
            code: 'VALIDATION_ERROR',
            message: `Vehicle ${vehicle.id} is missing required document: ${kind}`,
          });
        }
      }
      await this.repository.updateVehicle(vehicle.id, {
        verificationStatus: 'PENDING_REVIEW',
        submittedAt: now,
        rejectionReason: null,
      });
    }

    await this.repository.updateProfile(userId, {
      verificationStatus: 'PENDING_REVIEW',
      submittedAt: now,
      verificationNotes: null,
    });

    const action =
      profile.verificationStatus === 'REJECTED'
        ? 'rider.application.resubmitted'
        : 'rider.application.submitted';
    await this.deps.audit.record({
      actorId: userId,
      action,
      entityType: 'rider_profile',
      entityId: userId,
      ipAddress: ip,
    });

    return this.publicApplicationView(userId);
  }

  async listPendingForOps() {
    const rows = await this.repository.listPendingApplications();
    return rows.map((row) => ({
      riderId: row.userId,
      fullName: row.fullName,
      phoneNumber: row.user.phoneNumber,
      status: row.user.status,
      verificationStatus: row.verificationStatus,
      submittedAt: row.submittedAt?.toISOString() ?? null,
      vehicleCount: row.vehicles.length,
    }));
  }

  async getApplicationForOps(riderId: string) {
    const profile = await this.repository.findProfile(riderId);
    if (!profile) {
      throw new AppError({ status: 404, code: 'NOT_FOUND', message: 'Application not found' });
    }
    return {
      riderId: profile.userId,
      fullName: profile.fullName,
      verificationStatus: profile.verificationStatus,
      driversLicenceNumber: profile.driversLicenceNumber,
      driversLicenceExpiry: profile.driversLicenceExpiry?.toISOString() ?? null,
      submittedAt: profile.submittedAt?.toISOString() ?? null,
      hasEncryptedGhanaCard: profile.identitySecrets.some((s) => s.purpose === GHANA_CARD_PURPOSE),
      ghanaCardNumber: null,
      documents: profile.documents.map((doc) => ({
        id: doc.id,
        kind: doc.kind,
        vehicleId: doc.vehicleId,
        contentType: doc.contentType,
        sizeBytes: doc.sizeBytes,
        createdAt: doc.createdAt.toISOString(),
      })),
      vehicles: profile.vehicles.map((vehicle) => ({
        id: vehicle.id,
        category: vehicle.category,
        registrationNumber: vehicle.registrationNumber,
        make: vehicle.make,
        model: vehicle.model,
        colour: vehicle.colour,
        capacity: vehicle.capacity,
        verificationStatus: vehicle.verificationStatus,
        rejectionReason: vehicle.rejectionReason,
      })),
      reviewHistory: profile.reviewDecisions.map((decision) => ({
        id: decision.id,
        decision: decision.decision,
        reason: decision.reason,
        vehicleId: decision.vehicleId,
        createdAt: decision.createdAt.toISOString(),
        actorId: decision.actorId,
      })),
    };
  }

  async openDocumentForOps(actorId: string, documentId: string, ip?: string) {
    const doc = await this.repository.findDocument(documentId);
    if (!doc || doc.replacedAt) {
      throw new AppError({ status: 404, code: 'NOT_FOUND', message: 'Document not found' });
    }
    const url = await this.deps.storage.getSignedDownloadUrl(
      doc.storageKey,
      env.R2_SIGNED_URL_TTL_SECONDS,
    );
    await this.deps.audit.record({
      actorId,
      action: 'rider.document.viewed',
      entityType: 'rider_document',
      entityId: documentId,
      metadata: { kind: doc.kind, riderId: doc.riderId },
      ipAddress: ip,
    });
    return { url, expiresIn: env.R2_SIGNED_URL_TTL_SECONDS };
  }

  async revealGhanaCardForOps(actorId: string, riderId: string, ip?: string) {
    const secret = await this.repository.getIdentitySecret(riderId, GHANA_CARD_PURPOSE);
    if (!secret) {
      throw new AppError({
        status: 404,
        code: 'NOT_FOUND',
        message: 'Identity record not found',
      });
    }
    const ghanaCardNumber = decryptSecret(secret.ciphertext, env.IDENTITY_ENCRYPTION_KEY);
    await this.deps.audit.record({
      actorId,
      action: 'rider.identity.accessed',
      entityType: 'rider_identity_secret',
      entityId: riderId,
      metadata: { purpose: GHANA_CARD_PURPOSE, keyVersion: secret.keyVersion },
      ipAddress: ip,
    });
    return { ghanaCardNumber, keyVersion: secret.keyVersion };
  }

  async reviewApplication(
    actorId: string,
    riderId: string,
    input: ReviewRiderInput,
    ip?: string,
  ) {
    if (input.decision === 'REJECTED' && (!input.reason || input.reason.trim().length < 5)) {
      throw new AppError({
        status: 400,
        code: 'VALIDATION_ERROR',
        message: 'Rejection reason is required',
      });
    }
    const profile = await this.repository.findProfile(riderId);
    if (!profile || profile.verificationStatus !== 'PENDING_REVIEW') {
      throw new AppError({
        status: 409,
        code: 'CONFLICT',
        message: 'Application is not pending review',
      });
    }
    const now = this.now();
    if (input.decision === 'APPROVED') {
      const hasApprovedOrPendingVehicle = profile.vehicles.some(
        (vehicle) =>
          vehicle.verificationStatus === 'APPROVED' ||
          vehicle.verificationStatus === 'PENDING_REVIEW',
      );
      if (!hasApprovedOrPendingVehicle) {
        throw new AppError({
          status: 400,
          code: 'VALIDATION_ERROR',
          message: 'At least one vehicle must be reviewed with the application',
        });
      }
      for (const vehicle of profile.vehicles) {
        if (vehicle.verificationStatus === 'PENDING_REVIEW') {
          await this.repository.updateVehicle(vehicle.id, {
            verificationStatus: 'APPROVED',
            reviewedAt: now,
            rejectionReason: null,
          });
          await this.repository.addReviewDecision({
            riderId,
            vehicleId: vehicle.id,
            actorId,
            decision: 'APPROVED',
          });
        }
      }
      await this.repository.updateProfile(riderId, {
        verificationStatus: 'APPROVED',
        verificationNotes: null,
      });
      await this.repository.setUserRole(riderId, 'RIDER');
      await this.repository.ensureWallet(riderId);
    } else {
      await this.repository.updateProfile(riderId, {
        verificationStatus: 'REJECTED',
        verificationNotes: input.reason ?? null,
      });
      for (const vehicle of profile.vehicles) {
        if (vehicle.verificationStatus === 'PENDING_REVIEW') {
          await this.repository.updateVehicle(vehicle.id, {
            verificationStatus: 'REJECTED',
            rejectionReason: input.reason ?? null,
            reviewedAt: now,
          });
        }
      }
    }

    await this.repository.addReviewDecision({
      riderId,
      actorId,
      decision: input.decision,
      reason: input.reason ?? null,
    });
    await this.deps.audit.record({
      actorId,
      action:
        input.decision === 'APPROVED' ? 'rider.application.approved' : 'rider.application.rejected',
      entityType: 'rider_profile',
      entityId: riderId,
      metadata: { reason: input.reason ?? null },
      ipAddress: ip,
    });
    return this.getApplicationForOps(riderId);
  }

  async reviewVehicle(
    actorId: string,
    vehicleId: string,
    input: ReviewVehicleInput,
    ip?: string,
  ) {
    if (input.decision === 'REJECTED' && (!input.reason || input.reason.trim().length < 5)) {
      throw new AppError({
        status: 400,
        code: 'VALIDATION_ERROR',
        message: 'Rejection reason is required',
      });
    }
    const vehicle = await this.repository.findVehicle(vehicleId);
    if (!vehicle || vehicle.verificationStatus !== 'PENDING_REVIEW') {
      throw new AppError({
        status: 409,
        code: 'CONFLICT',
        message: 'Vehicle is not pending review',
      });
    }
    const now = this.now();
    await this.repository.updateVehicle(vehicleId, {
      verificationStatus: input.decision === 'APPROVED' ? 'APPROVED' : 'REJECTED',
      rejectionReason: input.decision === 'REJECTED' ? (input.reason ?? null) : null,
      reviewedAt: now,
    });
    await this.repository.addReviewDecision({
      riderId: vehicle.riderId,
      vehicleId,
      actorId,
      decision: input.decision,
      reason: input.reason ?? null,
    });
    await this.deps.audit.record({
      actorId,
      action: input.decision === 'APPROVED' ? 'rider.vehicle.approved' : 'rider.vehicle.rejected',
      entityType: 'rider_vehicle',
      entityId: vehicleId,
      metadata: { reason: input.reason ?? null },
      ipAddress: ip,
    });
    return this.publicVehicleView(vehicleId, vehicle.riderId);
  }

  async setAvailability(
    riderId: string,
    input: UpdateAvailabilityInput,
    ip?: string,
  ) {
    const snapshot = await this.repository.loadOperationalSnapshot(riderId);
    if (!snapshot) {
      throw new AppError({
        status: 404,
        code: 'NOT_FOUND',
        message: 'Rider profile not found',
      });
    }

    if (input.availability === 'AVAILABLE') {
      if (snapshot.userStatus !== 'ACTIVE') {
        throw new AppError({
          status: 403,
          code: 'FORBIDDEN',
          message: 'Suspended riders cannot go online',
          details: { reasons: [IneligibilityReason.ACCOUNT_NOT_ACTIVE] },
        });
      }
      const goOnline = evaluateGoOnlineEligibility(snapshot, this.now());
      if (!goOnline.eligible) {
        throw new AppError({
          status: 409,
          code: 'CONFLICT',
          message: 'Rider is not eligible to go online',
          details: { reasons: goOnline.reasons },
        });
      }
      if (snapshot.availability === 'AVAILABLE') {
        return {
          availability: 'AVAILABLE' as const,
          updatedAt: this.now().toISOString(),
          unchanged: true,
        };
      }
      const updated = await this.repository.updateAvailability(riderId, 'AVAILABLE');
      await this.deps.audit.record({
        actorId: riderId,
        action: 'rider.availability.online',
        entityType: 'rider_profile',
        entityId: riderId,
        ipAddress: ip,
      });
      publishRiderAvailabilityUpdated({
        riderId,
        availability: 'AVAILABLE',
        updatedAt: updated.updatedAt.toISOString(),
      });
      return {
        availability: 'AVAILABLE' as const,
        updatedAt: updated.updatedAt.toISOString(),
      };
    }

    // OFFLINE
    if (snapshot.onActiveTrip) {
      throw new AppError({
        status: 409,
        code: 'CONFLICT',
        message: 'Cannot go offline while an accepted trip is active',
        details: { reasons: [IneligibilityReason.ON_ACTIVE_TRIP] },
      });
    }
    if (snapshot.availability === 'OFFLINE') {
      return {
        availability: 'OFFLINE' as const,
        updatedAt: this.now().toISOString(),
        unchanged: true,
      };
    }
    const updated = await this.repository.updateAvailability(riderId, 'OFFLINE');
    await this.deps.audit.record({
      actorId: riderId,
      action: 'rider.availability.offline',
      entityType: 'rider_profile',
      entityId: riderId,
      ipAddress: ip,
    });
    publishRiderAvailabilityUpdated({
      riderId,
      availability: 'OFFLINE',
      updatedAt: updated.updatedAt.toISOString(),
    });
    return {
      availability: 'OFFLINE' as const,
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  async getOperationalEligibility(riderId: string) {
    const snapshot = await this.repository.loadOperationalSnapshot(riderId);
    if (!snapshot) {
      throw new AppError({
        status: 404,
        code: 'NOT_FOUND',
        message: 'Rider profile not found',
      });
    }
    const result = evaluateOperationalEligibility(snapshot, {
      now: this.now(),
      requireOnline: true,
    });
    return {
      riderId,
      ...result,
    };
  }

  async verificationEligibility(userId: string): Promise<boolean> {
    const user = await this.repository.findUser(userId);
    const profile = await this.repository.findProfile(userId);
    if (!user || !profile) return false;
    return isVerificationEligible({
      userStatus: user.status,
      riderVerificationStatus: profile.verificationStatus,
      hasApprovedVehicle: profile.vehicles.some((v) => v.verificationStatus === 'APPROVED'),
    });
  }

  private async requireActiveNonAdmin(userId: string) {
    const user = await this.repository.findUser(userId);
    if (!user || user.status === 'DELETED') {
      throw new AppError({
        status: 401,
        code: 'UNAUTHORIZED',
        message: 'Authentication is required',
      });
    }
    if (user.role === 'ADMIN') {
      throw new AppError({
        status: 403,
        code: 'FORBIDDEN',
        message: 'Administrator accounts cannot open rider applications',
      });
    }
    if (user.status === 'SUSPENDED') {
      throw new AppError({
        status: 403,
        code: 'FORBIDDEN',
        message: 'Account is suspended',
      });
    }
    return user;
  }

  private async requireEditableProfile(userId: string) {
    const profile = await this.repository.findProfile(userId);
    if (!profile) {
      throw new AppError({
        status: 404,
        code: 'NOT_FOUND',
        message: 'Start rider onboarding first',
      });
    }
    if (profile.verificationStatus === 'PENDING_REVIEW') {
      throw new AppError({
        status: 409,
        code: 'CONFLICT',
        message: 'Application is pending review',
      });
    }
    if (profile.verificationStatus === 'APPROVED') {
      throw new AppError({
        status: 409,
        code: 'CONFLICT',
        message: 'Approved applications cannot be edited here',
      });
    }
    return profile;
  }

  private async requireOwnedVehicle(userId: string, vehicleId: string) {
    const vehicle = await this.repository.findVehicle(vehicleId);
    if (!vehicle || vehicle.riderId !== userId) {
      throw new AppError({
        status: 404,
        code: 'NOT_FOUND',
        message: 'Vehicle not found',
      });
    }
    return vehicle;
  }

  private async publicApplicationView(userId: string) {
    const profile = await this.repository.findProfile(userId);
    if (!profile) {
      throw new AppError({
        status: 404,
        code: 'NOT_FOUND',
        message: 'Application not found',
      });
    }
    const user = await this.repository.findUser(userId);
    return {
      riderId: profile.userId,
      fullName: profile.fullName,
      verificationStatus: profile.verificationStatus,
      availability: profile.availability,
      driversLicenceNumber: profile.driversLicenceNumber,
      driversLicenceExpiry: profile.driversLicenceExpiry?.toISOString() ?? null,
      submittedAt: profile.submittedAt?.toISOString() ?? null,
      hasEncryptedGhanaCard: profile.identitySecrets.some((s) => s.purpose === GHANA_CARD_PURPOSE),
      verificationEligible: isVerificationEligible({
        userStatus: user?.status ?? 'DELETED',
        riderVerificationStatus: profile.verificationStatus,
        hasApprovedVehicle: profile.vehicles.some((v) => v.verificationStatus === 'APPROVED'),
      }),
      documents: profile.documents.map((doc) => ({
        id: doc.id,
        kind: doc.kind,
        vehicleId: doc.vehicleId,
        contentType: doc.contentType,
        sizeBytes: doc.sizeBytes,
        createdAt: doc.createdAt.toISOString(),
      })),
      vehicles: profile.vehicles.map((vehicle) => ({
        id: vehicle.id,
        category: vehicle.category,
        registrationNumber: vehicle.registrationNumber,
        make: vehicle.make,
        model: vehicle.model,
        colour: vehicle.colour,
        capacity: vehicle.capacity,
        verificationStatus: vehicle.verificationStatus,
        rejectionReason: vehicle.rejectionReason,
      })),
      reviewHistory: profile.reviewDecisions.map((decision) => ({
        decision: decision.decision,
        reason: decision.reason,
        createdAt: decision.createdAt.toISOString(),
      })),
    };
  }

  private async publicVehicleView(vehicleId: string, expectedRiderId: string) {
    const vehicle = await this.requireOwnedVehicle(expectedRiderId, vehicleId);
    return {
      id: vehicle.id,
      category: vehicle.category,
      registrationNumber: vehicle.registrationNumber,
      make: vehicle.make,
      model: vehicle.model,
      colour: vehicle.colour,
      capacity: vehicle.capacity,
      verificationStatus: vehicle.verificationStatus,
      rejectionReason: vehicle.rejectionReason,
    };
  }
}

function assertCapacity(category: 'TRICYCLE' | 'CAR', capacity: number) {
  const max = category === 'TRICYCLE' ? 4 : 7;
  if (capacity < 1 || capacity > max) {
    throw new AppError({
      status: 400,
      code: 'VALIDATION_ERROR',
      message: `Capacity for ${category} must be between 1 and ${max}`,
    });
  }
}
