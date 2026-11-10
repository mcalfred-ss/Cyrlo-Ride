/**
 * Upsert internal + App Store / Play review accounts on the target database.
 *
 * Usage (from backend/):
 *   npx tsx scripts/seed-review-accounts.ts
 *
 * Requires DATABASE_URL. Safe to re-run (upsert by phone).
 */
import { PrismaClient, type UserRole } from '@prisma/client';

const prisma = new PrismaClient();

type SeedAccount = {
  phoneNumber: string;
  role: UserRole;
  displayName: string;
  kind: 'internal' | 'store_review';
  /** Rider-only extras */
  rider?: {
    fullName: string;
    registrationNumber: string;
  };
};

/** Reserved Ghana E.164 numbers for QA / store review (not real SIMs). */
export const REVIEW_ACCOUNTS: SeedAccount[] = [
  {
    phoneNumber: '+233555010001',
    role: 'PASSENGER',
    displayName: 'Cyrlo QA Passenger',
    kind: 'internal',
  },
  {
    phoneNumber: '+233555010002',
    role: 'RIDER',
    displayName: 'Cyrlo QA Rider',
    kind: 'internal',
    rider: {
      fullName: 'Cyrlo QA Rider',
      registrationNumber: 'GR-QA-0001',
    },
  },
  {
    phoneNumber: '+233555010011',
    role: 'PASSENGER',
    displayName: 'Store Review Passenger',
    kind: 'store_review',
  },
  {
    phoneNumber: '+233555010012',
    role: 'RIDER',
    displayName: 'Store Review Rider',
    kind: 'store_review',
    rider: {
      fullName: 'Store Review Rider',
      registrationNumber: 'GR-RV-0012',
    },
  },
];

/** Fixed OTP for every allowlisted review phone (must match OTP_STATIC_LOGINS). */
export const REVIEW_OTP_CODE = '246810';

export function staticLoginsEnvValue(): string {
  return REVIEW_ACCOUNTS.map((account) => `${account.phoneNumber}:${REVIEW_OTP_CODE}`).join(',');
}

async function upsertPassenger(userId: string, displayName: string) {
  await prisma.passengerProfile.upsert({
    where: { userId },
    create: {
      userId,
      fullName: displayName,
      homeLocation: 'Ahenema Kokoben',
    },
    update: {
      fullName: displayName,
    },
  });
}

async function upsertApprovedPragyaRider(
  userId: string,
  rider: NonNullable<SeedAccount['rider']>,
) {
  const now = new Date();
  await prisma.riderProfile.upsert({
    where: { userId },
    create: {
      userId,
      fullName: rider.fullName,
      verificationStatus: 'APPROVED',
      driversLicenceNumber: 'DL-REVIEW-001',
      driversLicenceExpiry: new Date('2030-01-01T00:00:00.000Z'),
      submittedAt: now,
      availability: 'OFFLINE',
    },
    update: {
      fullName: rider.fullName,
      verificationStatus: 'APPROVED',
      submittedAt: now,
    },
  });

  const existingVehicle = await prisma.riderVehicle.findFirst({
    where: { riderId: userId },
    orderBy: { createdAt: 'asc' },
  });

  if (existingVehicle) {
    await prisma.riderVehicle.update({
      where: { id: existingVehicle.id },
      data: {
        category: 'PRAGYA',
        registrationNumber: rider.registrationNumber,
        make: 'Bajaj',
        model: 'RE',
        colour: 'Yellow',
        capacity: 3,
        verificationStatus: 'APPROVED',
        submittedAt: now,
        reviewedAt: now,
        rejectionReason: null,
      },
    });
  } else {
    await prisma.riderVehicle.create({
      data: {
        riderId: userId,
        category: 'PRAGYA',
        registrationNumber: rider.registrationNumber,
        make: 'Bajaj',
        model: 'RE',
        colour: 'Yellow',
        capacity: 3,
        verificationStatus: 'APPROVED',
        submittedAt: now,
        reviewedAt: now,
      },
    });
  }

  await prisma.riderWallet.upsert({
    where: { riderId: userId },
    create: { riderId: userId, tokenBalance: 50 },
    update: { tokenBalance: 50 },
  });

  const zone = await prisma.serviceZone.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: 'asc' },
  });
  if (zone) {
    await prisma.riderZoneApproval.upsert({
      where: {
        riderId_zoneId: { riderId: userId, zoneId: zone.id },
      },
      create: {
        riderId: userId,
        zoneId: zone.id,
        status: 'APPROVED',
        decidedAt: now,
        reason: 'seed-review-accounts',
      },
      update: {
        status: 'APPROVED',
        decidedAt: now,
        reason: 'seed-review-accounts',
      },
    });
  }
}

async function main() {
  console.log('Seeding review / QA accounts…');
  console.log(`OTP_STATIC_LOGINS=${staticLoginsEnvValue()}`);

  for (const account of REVIEW_ACCOUNTS) {
    const user = await prisma.user.upsert({
      where: { phoneNumber: account.phoneNumber },
      create: {
        phoneNumber: account.phoneNumber,
        role: account.role,
        status: 'ACTIVE',
        displayName: account.displayName,
      },
      update: {
        role: account.role,
        status: 'ACTIVE',
        displayName: account.displayName,
      },
    });

    if (account.role === 'PASSENGER') {
      await upsertPassenger(user.id, account.displayName);
    }
    if (account.role === 'RIDER' && account.rider) {
      await upsertApprovedPragyaRider(user.id, account.rider);
    }

    console.log(`  ✓ ${account.kind} ${account.role} ${account.phoneNumber}`);
  }

  console.log('Done. Set OTP_STATIC_LOGINS on the API host to the value printed above.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
