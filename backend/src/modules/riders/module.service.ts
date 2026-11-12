import { AppError } from '../../common/errors/app-error.js';
import { encryptSecret, decryptSecret } from '../../common/security/secret-box.js';
import { paginationMeta } from '../../common/utils/pagination.js';
import { env } from '../../config/env.js';
import { RIDER_LOCATION_MAX_AGE_MS } from '../../config/constants.js';
import { publishRiderAvailabilityUpdated } from '../../infrastructure/realtime/publisher.js';
import type { ObjectStorage } from '../../infrastructure/storage/object-storage.js';
import type { AuditService } from '../audit/module.service.js';
import { evaluateLocationFreshness } from '../locations/location-freshness.js';
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
  ListAdminRidersQuery,
  ReviewRiderInput,
  ReviewVehicleInput,
  StartRiderOnboardingInput,
  UpdateAvailabilityInput,
  UpdateRiderOnboardingInput,
  UpdateVehicleInput,
} from './module.schema.js';

/** Ordinary rider directory/profile never includes exact lat/lng. */
export const RIDER_DIRECTORY_INCLUDES_EXACT_COORDINATES = false;

const GHANA_CARD_PURPOSE = 'GHANA_CARD_NUMBER';

/** Always required. Ghana Card / licence photos are alternate ID paths. */
const REQUIRED_RIDER_DOCS: DocumentKind[] = ['RIDER_PHOTO'];
/** Pilot: plate + one ID doc are enough; extra vehicle papers can be requested in review. */
const REQUIRED_VEHICLE_DOCS: DocumentKind[] = [];

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
  listRidersForAdmin(query: ListAdminRidersQuery): Promise<unknown>;
  getRiderForAdmin(riderId: string): Promise<unknown>;
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
        driversLicenceNumber: input.driversLicenceNumber ?? null,
        driversLicenceExpiry: input.driversLicenceExpiry
          ? new Date(input.driversLicenceExpiry)
          : null,
      });
    } else {
      await this.repository.updateProfile(userId, {
        fullName: input.fullName,
        driversLicenceNumber: input.driversLicenceNumber,
        driversLicenceExpiry: input.driversLicenceExpiry
          ? new Date(input.driversLicenceExpiry)
          : undefined,
      });
    }

    if (input.ghanaCardNumber) {
      await this.repository.upsertIdentitySecret({
        riderId: userId,
        purpose: GHANA_CARD_PURPOSE,
        ciphertext: encryptSecret(input.ghanaCardNumber, env.IDENTITY_ENCRYPTION_KEY),
        keyVersion: env.IDENTITY_ENCRYPTION_KEY_VERSION,
      });
    }

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
    const docs = profile.documents ?? [];
    const activeDocs = docs.filter((doc) => !doc.replacedAt);

    for (const kind of REQUIRED_RIDER_DOCS) {
      if (!activeDocs.some((doc) => doc.kind === kind)) {
        throw new AppError({
          status: 400,
          code: 'VALIDATION_ERROR',
          message: `Missing required document: ${kind}`,
        });
      }
    }

    const hasGhanaId =
      Boolean(secret) && activeDocs.some((doc) => doc.kind === 'GHANA_CARD');
    const hasLicenceId =
      Boolean(profile.driversLicenceNumber?.trim()) &&
      Boolean(profile.driversLicenceExpiry) &&
      activeDocs.some((doc) => doc.kind === 'DRIVERS_LICENCE');
    if (!hasGhanaId && !hasLicenceId) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        status: 400,
        message: "Upload either Ghana Card or driver's licence details and photo",
      });
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

  async listRidersForAdmin(query: ListAdminRidersQuery) {
    const { total, items } = await this.repository.listForAdminDirectory({
      page: query.page,
      pageSize: query.pageSize,
      q: query.q,
      status: query.status,
      verificationStatus: query.verificationStatus,
      availability: query.availability,
    });
    return {
      items: items.map((row) => ({
        id: row.id,
        phoneNumber: row.phoneNumber,
        role: row.role,
        status: row.status,
        displayName: row.displayName,
        fullName: row.fullName,
        verificationStatus: row.verificationStatus,
        availability: row.availability,
        submittedAt: row.submittedAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
      })),
      pagination: paginationMeta(query.page, query.pageSize, total),
      semantics: {
        availability: 'database_snapshot',
        note: 'availability is the stored rider_profiles.availability value, not a live feed.',
      },
    };
  }

  async getRiderForAdmin(riderId: string) {
    const row = await this.repository.findForAdminProfile(riderId);
    if (!row || !row.riderProfile) {
      throw new AppError({ status: 404, code: 'NOT_FOUND', message: 'Rider not found' });
    }
    const profile = row.riderProfile;
    const now = this.now();
    let gps: {
      sharingEnabled: boolean;
      recordedAt: string;
      receivedAt: string;
      fresh: boolean;
      maxAgeMs: number;
      snapshot: true;
    } | null = null;
    if (profile.location) {
      const freshness = evaluateLocationFreshness({
        recordedAt: profile.location.recordedAt,
        receivedAt: profile.location.receivedAt,
        now,
      });
      gps = {
        sharingEnabled: profile.location.sharingEnabled,
        recordedAt: profile.location.recordedAt.toISOString(),
        receivedAt: profile.location.receivedAt.toISOString(),
        fresh: freshness.fresh,
        maxAgeMs: RIDER_LOCATION_MAX_AGE_MS,
        snapshot: true,
      };
    }

    return {
      id: row.id,
      phoneNumber: row.phoneNumber,
      role: row.role,
      status: row.status,
      displayName: row.displayName,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      profile: {
        fullName: profile.fullName,
        verificationStatus: profile.verificationStatus,
        availability: profile.availability,
        submittedAt: profile.submittedAt?.toISOString() ?? null,
        driversLicenceNumber: profile.driversLicenceNumber,
        driversLicenceExpiry: profile.driversLicenceExpiry?.toISOString() ?? null,
        verificationNotes: profile.verificationNotes,
      },
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
        submittedAt: vehicle.submittedAt?.toISOString() ?? null,
        reviewedAt: vehicle.reviewedAt?.toISOString() ?? null,
      })),
      gps,
      tokens: {
        balance: profile.wallet?.tokenBalance ?? 0,
        note: 'Current wallet balance snapshot for ops. Ledger history remains on GET /admin/token-ledgers (ViewTokenLedgers).',
      },
      privacy: {
        exactCoordinatesIncluded: RIDER_DIRECTORY_INCLUDES_EXACT_COORDINATES,
        note: 'Exact lat/lng are omitted here. Privileged coordinate reads use GET /admin/riders/:riderId/location when permitted.',
      },
      semantics: {
        accountStatus: 'users.status',
        verificationStatus: 'rider_profiles.verification_status',
        availability: 'rider_profiles.availability database_snapshot',
        gps: 'latest rider_locations row + freshness at request time (not a live track)',
        tokens: 'rider_wallets.token_balance snapshot',
      },
    };
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
      env.OBJECT_STORAGE_SIGNED_URL_TTL_SECONDS,
    );
    await this.deps.audit.record({
      actorId,
      action: 'rider.document.viewed',
      entityType: 'rider_document',
      entityId: documentId,
      metadata: { kind: doc.kind, riderId: doc.riderId },
      ipAddress: ip,
    });
    return { url, expiresIn: env.OBJECT_STORAGE_SIGNED_URL_TTL_SECONDS };
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

    if (input.decision === 'APPROVED') {
      // Guard + status/role/wallet/decision write are one DB transaction (FOR UPDATE).
      // Does not auto-approve vehicles — each PENDING_REVIEW vehicle must be reviewed first.
      await this.repository.approveApplicationAtomic({
        riderId,
        actorId,
        reason: input.reason ?? null,
      });
      await this.deps.audit.record({
        actorId,
        action: 'rider.application.approved',
        entityType: 'rider_profile',
        entityId: riderId,
        metadata: { reason: input.reason ?? null },
        ipAddress: ip,
      });
      return this.getApplicationForOps(riderId);
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

    await this.repository.addReviewDecision({
      riderId,
      actorId,
      decision: 'REJECTED',
      reason: input.reason ?? null,
    });
    await this.deps.audit.record({
      actorId,
      action: 'rider.application.rejected',
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

function assertCapacity(category: 'OKADA' | 'PRAGYA' | 'ABOBOYAA', capacity: number) {
  const max = category === 'OKADA' ? 1 : 4;
  if (capacity < 1 || capacity > max) {
    throw new AppError({
      status: 400,
      code: 'VALIDATION_ERROR',
      message: `Capacity for ${category} must be between 1 and ${max}`,
    });
  }
}
