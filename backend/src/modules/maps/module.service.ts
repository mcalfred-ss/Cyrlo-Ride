import { AppError } from '../../common/errors/app-error.js';
import type { CyrloMapsClient } from '../../infrastructure/maps/cyrlo-maps.client.js';
import type {
  GeocodeBody,
  PlaceSearchBody,
  ReverseGeocodeBody,
  RouteBody,
} from './module.schema.js';

export class MapsService {
  constructor(
    private readonly client: CyrloMapsClient | null,
    private readonly mapboxPublicToken: string = '',
  ) {}

  private requireClient(): CyrloMapsClient {
    if (!this.client) {
      throw new AppError({
        status: 501,
        code: 'NOT_IMPLEMENTED',
        message: 'Cyrlo Maps is not configured on this server',
      });
    }
    return this.client;
  }

  /**
   * Client bootstrap for maps. Always returns Ride tile config; optionally
   * includes upstream Cyrlo Maps `/v1/config` when that provider is healthy.
   */
  async config() {
    let provider: unknown = null;
    if (this.client) {
      try {
        provider = await this.client.getConfig();
      } catch {
        provider = null;
      }
    }
    return {
      mapboxPublicToken: this.mapboxPublicToken || null,
      provider,
    };
  }

  async geocode(input: GeocodeBody) {
    const results = await this.requireClient().geocode(input);
    return { results };
  }

  async reverse(input: ReverseGeocodeBody) {
    const result = await this.requireClient().reverseGeocode(input);
    return { result };
  }

  async places(input: PlaceSearchBody) {
    const results = await this.requireClient().searchPlaces(input);
    return { results };
  }

  async route(input: RouteBody) {
    const route = await this.requireClient().route(input);
    return {
      distanceMeters: route.distanceMeters,
      durationSeconds: route.durationSeconds,
      geometry: route.geometry,
    };
  }

  async estimate(input: RouteBody) {
    const estimate = await this.requireClient().estimate(input);
    return {
      distanceMeters: estimate.distanceMeters,
      durationSeconds: estimate.durationSeconds,
    };
  }
}
