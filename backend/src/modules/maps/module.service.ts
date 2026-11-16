import { AppError } from '../../common/errors/app-error.js';
import type { CyrloMapsClient, PlaceHit } from '../../infrastructure/maps/cyrlo-maps.client.js';
import {
  filterProviderHitsToGhana,
  mergeLandmarkAndProviderHits,
  searchGhanaLandmarks,
} from './landmarks/ghana-landmarks.search.js';
import { resolveLocation } from './location-resolution/resolve-location.js';
import type {
  GeocodeBody,
  LocationResolveBody,
  PlaceSearchBody,
  ReverseGeocodeBody,
  RouteBody,
} from './module.schema.js';
import {
  PASSENGER_DESTINATION_COUNTRY,
  PASSENGER_DESTINATION_PLACE_TYPES,
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

  /**
   * Structured location resolution for Flutter / clients.
   * Composes existing reverse geocode with the Ashanti catalogue and
   * verified landmarks. Does not invent address parts or move coordinates.
   */
  async resolveLocation(input: LocationResolveBody) {
    let providerLabel: string | null = null;
    try {
      const reverse = await this.requireClient().reverseGeocode({
        latitude: input.latitude,
        longitude: input.longitude,
      });
      providerLabel = reverse?.label?.trim() || null;
    } catch (error) {
      // Catalogue + landmarks can still produce a partial result.
      if (!(error instanceof AppError)) throw error;
      if (
        error.code !== 'provider_unavailable' &&
        error.code !== 'provider_timeout' &&
        error.code !== 'provider_error' &&
        error.code !== 'NOT_IMPLEMENTED'
      ) {
        throw error;
      }
    }

    return resolveLocation({
      latitude: input.latitude,
      longitude: input.longitude,
      providerLabel,
      landmarkLimit: input.landmarkLimit,
    });
  }

  /**
   * Passenger destination place search:
   * 1. Curated Ghana landmark catalog (verified coords).
   * 2. Cyrlo Maps provider with country=GH, pickup bias, and relevant types.
   * 3. Hard Ghana bbox post-filter so foreign hits never reach the client.
   */
  async places(input: PlaceSearchBody) {
    const limit = input.limit ?? 8;
    const country = input.country ?? PASSENGER_DESTINATION_COUNTRY;
    const landmarks = searchGhanaLandmarks({
      query: input.text,
      limit,
      bias: input.bias ?? null,
    });

    let provider: PlaceHit[] = [];
    try {
      const raw = await this.requireClient().searchPlaces({
        text: input.text,
        limit,
        bias: input.bias,
        country,
        types: [...PASSENGER_DESTINATION_PLACE_TYPES],
      });
      provider =
        country === PASSENGER_DESTINATION_COUNTRY
          ? filterProviderHitsToGhana(raw)
          : raw;
    } catch (error) {
      // Landmarks alone are still useful when the provider is down.
      if (landmarks.length === 0) throw error;
      provider = [];
    }

    const results = mergeLandmarkAndProviderHits({
      landmarks,
      provider,
      limit,
    });
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
