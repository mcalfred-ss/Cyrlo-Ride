import { AppError } from '../../common/errors/app-error.js';
import { env } from '../../config/env.js';
import {
  createCyrloMapsClient,
  type CyrloMapsClient,
  type MapsCoordinate,
  type RouteEstimate,
} from './cyrlo-maps.client.js';

export interface MapPoint {
  latitude: number;
  longitude: number;
}

export interface MapsProvider {
  /** Driving distance/duration via Cyrlo Maps `/v1/routes/estimate`. */
  route(from: MapPoint, to: MapPoint): Promise<{ distanceMeters: number; durationSeconds: number }>;
  /** Full client when Maps is configured; null when unconfigured. */
  client: CyrloMapsClient | null;
}

export class UnconfiguredMapsProvider implements MapsProvider {
  readonly client = null;

  async route(): Promise<{ distanceMeters: number; durationSeconds: number }> {
    throw new AppError({
      status: 501,
      code: 'NOT_IMPLEMENTED',
      message: 'Maps provider is not configured',
    });
  }
}

export class CyrloMapsProvider implements MapsProvider {
  constructor(private readonly maps: CyrloMapsClient) {}

  get client(): CyrloMapsClient {
    return this.maps;
  }

  async route(from: MapPoint, to: MapPoint): Promise<RouteEstimate> {
    return this.maps.estimate({
      from: toCoordinate(from),
      to: toCoordinate(to),
    });
  }
}

function toCoordinate(point: MapPoint): MapsCoordinate {
  return { latitude: point.latitude, longitude: point.longitude };
}

/** Factory from environment. Returns unconfigured provider when Maps env is incomplete. */
export function createMapsProviderFromEnv(
  source: {
    CYRLO_MAPS_BASE_URL: string;
    CYRLO_MAPS_API_KEY: string;
    CYRLO_MAPS_TIMEOUT_MS: number;
  } = env,
): MapsProvider {
  const client = createCyrloMapsClient({
    baseUrl: source.CYRLO_MAPS_BASE_URL,
    apiKey: source.CYRLO_MAPS_API_KEY,
    timeoutMs: source.CYRLO_MAPS_TIMEOUT_MS,
  });
  if (!client) {
    return new UnconfiguredMapsProvider();
  }
  return new CyrloMapsProvider(client);
}
