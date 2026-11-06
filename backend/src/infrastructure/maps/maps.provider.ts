import { AppError } from '../../common/errors/app-error.js';

export interface MapPoint {
  latitude: number;
  longitude: number;
}

export interface MapsProvider {
  route(from: MapPoint, to: MapPoint): Promise<{ distanceMeters: number; durationSeconds: number }>;
}

export class UnconfiguredMapsProvider implements MapsProvider {
  async route(): Promise<{ distanceMeters: number; durationSeconds: number }> {
    throw new AppError({
      status: 501,
      code: 'NOT_IMPLEMENTED',
      message: 'Maps provider is not configured',
    });
  }
}
