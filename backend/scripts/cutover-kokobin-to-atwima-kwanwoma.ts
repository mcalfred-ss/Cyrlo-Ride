/**
 * PRODUCTION CUTOVER HELPER — DO NOT RUN WITHOUT EXPLICIT AUTHORIZATION.
 *
 * Controlled replacement of the misplaced Kokobin community zone with the
 * verified Atwima Kwanwoma district ADM2 zone.
 *
 * Default mode: --dry-run (inspect + print plan only).
 * Mutating mode requires: --execute --i-understand-production-risk
 *
 * Steps (documented; execute only when authorized):
 * 1. Ensure Atwima Kwanwoma district zone exists with ADM2 boundary (VERIFIED).
 * 2. Inventory Kokobin: bookings count, rider approvals, status.
 * 3. Suspend/lock Kokobin (preserve id + FK relationships) — never delete.
 * 4. Optionally migrate APPROVED rider approvals to Atwima Kwanwoma (explicit flag).
 * 5. Activate Atwima Kwanwoma only after verification checklist passes.
 * 6. Leave historical bookings pointing at Kokobin zone id.
 *
 * Usage:
 *   npx tsx scripts/cutover-kokobin-to-atwima-kwanwoma.ts --dry-run
 *   npx tsx scripts/cutover-kokobin-to-atwima-kwanwoma.ts --execute --i-understand-production-risk
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

async function main() {
  const dryRun = !hasFlag('--execute');
  const riskAck = hasFlag('--i-understand-production-risk');
  const migrateApprovals = hasFlag('--migrate-approvals');

  if (!dryRun && !riskAck) {
    throw new Error(
      'Refusing to execute: pass --execute --i-understand-production-risk after explicit authorization.',
    );
  }

  const kokobin = await prisma.serviceZone.findFirst({
    where: { OR: [{ slug: 'kokobin' }, { name: { equals: 'Kokobin', mode: 'insensitive' } }] },
  });
  const atwima = await prisma.serviceZone.findFirst({
    where: { slug: 'atwima-kwanwoma' },
    include: { district: true },
  });

  const bookingCount = kokobin
    ? await prisma.booking.count({ where: { serviceZoneId: kokobin.id } })
    : 0;
  const approvals = kokobin
    ? await prisma.riderZoneApproval.findMany({
        where: { zoneId: kokobin.id },
        select: { id: true, riderId: true, status: true },
      })
    : [];

  const plan = {
    mode: dryRun ? 'dry-run' : 'execute',
    kokobin: kokobin
      ? {
          id: kokobin.id,
          status: kokobin.status,
          isActive: kokobin.isActive,
          communityId: kokobin.communityId,
          districtId: kokobin.districtId,
          bbox: {
            minLatitude: Number(kokobin.minLatitude),
            maxLatitude: Number(kokobin.maxLatitude),
            minLongitude: Number(kokobin.minLongitude),
            maxLongitude: Number(kokobin.maxLongitude),
          },
          bookingCount,
          approvals,
        }
      : null,
    atwimaKwanwoma: atwima
      ? {
          id: atwima.id,
          status: atwima.status,
          isActive: atwima.isActive,
          districtId: atwima.districtId,
          districtName: atwima.district?.name ?? null,
          boundaryVerificationStatus: atwima.boundaryVerificationStatus,
          geographicSource: atwima.geographicSource,
        }
      : null,
    actions: [
      'Create/verify Atwima Kwanwoma district zone from ADM2 (if missing)',
      'Lock or suspend Kokobin without deleting (preserve bookings + audit)',
      migrateApprovals
        ? 'Migrate APPROVED Kokobin rider approvals → Atwima Kwanwoma (explicit)'
        : 'Leave Kokobin rider approvals in place; Ops re-approves for Atwima manually',
      'Activate Atwima Kwanwoma as sole ACTIVE Ashanti district zone',
      'Confirm no other Ashanti district zones are ACTIVE',
    ],
    invariants: {
      neverDeleteKokobin: true,
      neverRewriteBookingZoneIds: true,
      atwimaMustBeVerifiedBeforeActivate: true,
      requireExplicitAuthorization: true,
    },
  };

  console.log(JSON.stringify(plan, null, 2));

  if (dryRun) {
    console.log('\nDry-run only. No database mutations performed.');
    return;
  }

  if (!atwima) {
    throw new Error('Atwima Kwanwoma zone missing. Seed/create it before cutover.');
  }
  if (atwima.boundaryVerificationStatus !== 'VERIFIED') {
    throw new Error('Atwima Kwanwoma boundary must be VERIFIED before activation.');
  }

  if (kokobin && kokobin.status === 'ACTIVE') {
    await prisma.serviceZone.update({
      where: { id: kokobin.id },
      data: {
        status: 'LOCKED',
        isActive: false,
        suspendedAt: new Date(),
      },
    });
    console.log(`Locked Kokobin zone ${kokobin.id}`);
  }

  if (migrateApprovals && kokobin) {
    const approved = approvals.filter((a) => a.status === 'APPROVED');
    for (const row of approved) {
      await prisma.riderZoneApproval.upsert({
        where: { riderId_zoneId: { riderId: row.riderId, zoneId: atwima.id } },
        create: {
          riderId: row.riderId,
          zoneId: atwima.id,
          status: 'APPROVED',
          reason: 'Cutover from Kokobin (authorized)',
          decidedAt: new Date(),
        },
        update: {
          status: 'APPROVED',
          reason: 'Cutover from Kokobin (authorized)',
          decidedAt: new Date(),
        },
      });
      await prisma.riderZoneApproval.update({
        where: { id: row.id },
        data: {
          status: 'REVOKED',
          reason: 'Superseded by Atwima Kwanwoma district zone cutover',
          decidedAt: new Date(),
        },
      });
    }
    console.log(`Migrated ${approved.length} approvals to Atwima Kwanwoma`);
  }

  await prisma.serviceZone.update({
    where: { id: atwima.id },
    data: {
      status: 'ACTIVE',
      isActive: true,
      activatedAt: new Date(),
    },
  });
  console.log(`Activated Atwima Kwanwoma zone ${atwima.id}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
