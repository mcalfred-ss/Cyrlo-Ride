import type { AdminApplicationVehicle } from '../../api/types';

export interface VehicleReviewProgress {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  other: number;
}

export function summarizeVehicleReviews(
  vehicles: Array<Pick<AdminApplicationVehicle, 'verificationStatus'>>,
): VehicleReviewProgress {
  let pending = 0;
  let approved = 0;
  let rejected = 0;
  let other = 0;
  for (const vehicle of vehicles) {
    if (vehicle.verificationStatus === 'PENDING_REVIEW') pending += 1;
    else if (vehicle.verificationStatus === 'APPROVED') approved += 1;
    else if (vehicle.verificationStatus === 'REJECTED') rejected += 1;
    else other += 1;
  }
  return { total: vehicles.length, pending, approved, rejected, other };
}

/** Client UX guard mirroring backend approveApplicationAtomic rules. */
export function canApproveApplication(
  vehicles: Array<Pick<AdminApplicationVehicle, 'verificationStatus'>>,
): boolean {
  const progress = summarizeVehicleReviews(vehicles);
  return progress.pending === 0 && progress.approved >= 1;
}

export function formatVehicleProgress(progress: VehicleReviewProgress): string {
  return `${progress.pending} pending · ${progress.approved} approved · ${progress.rejected} rejected`;
}
