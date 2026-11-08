import { AppError } from '../../common/errors/app-error.js';
import { logger } from '../../config/logger.js';

export interface MapsCoordinate {
  latitude: number;
  longitude: number;
}

export interface GeocodeHit {
  label: string;
  latitude: number;
  longitude: number;
}

export interface PlaceHit {
  id: string;
  label: string;
  address: string | null;
  latitude: number;
  longitude: number;
}

export interface RouteEstimate {
  distanceMeters: number;
  durationSeconds: number;
}

export interface RouteResult extends RouteEstimate {
  geometry: MapsCoordinate[];
}

export interface CyrloMapsClient {
  getConfig(): Promise<unknown>;
  geocode(input: {
    query: string;
    limit?: number;
    bias?: MapsCoordinate;
  }): Promise<GeocodeHit[]>;
  reverseGeocode(input: MapsCoordinate): Promise<GeocodeHit | null>;
  searchPlaces(input: {
    text: string;
    limit?: number;
    bias?: MapsCoordinate;
  }): Promise<PlaceHit[]>;
  route(input: { from: MapsCoordinate; to: MapsCoordinate }): Promise<RouteResult>;
  estimate(input: { from: MapsCoordinate; to: MapsCoordinate }): Promise<RouteEstimate>;
}

export interface CyrloMapsClientOptions {
  baseUrl: string;
  apiKey: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

type MapsErrorBody = {
  error?: { code?: string; message?: string };
  request_id?: string;
};

/**
 * Hosted Cyrlo Maps HTTP client.
 * Auth: Authorization: Bearer <secret> (secret only — not name:secret).
 * Never logs the API key.
 */
export class HttpCyrloMapsClient implements CyrloMapsClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: CyrloMapsClientOptions) {
    const base = options.baseUrl.trim().replace(/\/+$/, '');
    if (!base) {
      throw new AppError({
        status: 500,
        code: 'INTERNAL_ERROR',
        message: 'CYRLO_MAPS_BASE_URL is required',
      });
    }
    if (!options.apiKey.trim()) {
      throw new AppError({
        status: 500,
        code: 'INTERNAL_ERROR',
        message: 'CYRLO_MAPS_API_KEY is required',
      });
    }
    this.baseUrl = base;
    this.apiKey = options.apiKey.trim();
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async getConfig(): Promise<unknown> {
    const envelope = await this.requestJson<Record<string, unknown>>('GET', '/v1/config');
    return envelope.data;
  }

  async geocode(input: {
    query: string;
    limit?: number;
    bias?: MapsCoordinate;
  }): Promise<GeocodeHit[]> {
    const body: Record<string, unknown> = { query: input.query };
    if (input.limit !== undefined) body.limit = input.limit;
    if (input.bias) body.bias = input.bias;
    const envelope = await this.requestJson<{ results: GeocodeHit[] }>('POST', '/v1/geocode', body);
    return Array.isArray(envelope.data?.results) ? envelope.data.results : [];
  }

  async reverseGeocode(input: MapsCoordinate): Promise<GeocodeHit | null> {
    const envelope = await this.requestJson<{ result: GeocodeHit | null }>(
      'POST',
      '/v1/geocode/reverse',
      input,
    );
    return envelope.data?.result ?? null;
  }

  async searchPlaces(input: {
    text: string;
    limit?: number;
    bias?: MapsCoordinate;
  }): Promise<PlaceHit[]> {
    const body: Record<string, unknown> = { text: input.text };
    if (input.limit !== undefined) body.limit = input.limit;
    if (input.bias) body.bias = input.bias;
    const envelope = await this.requestJson<{ results: PlaceHit[] }>(
      'POST',
      '/v1/places/search',
      body,
    );
    return Array.isArray(envelope.data?.results) ? envelope.data.results : [];
  }

  async route(input: { from: MapsCoordinate; to: MapsCoordinate }): Promise<RouteResult> {
    const envelope = await this.requestJson<{
      distance_meters: number;
      duration_seconds: number;
      geometry: MapsCoordinate[];
    }>('POST', '/v1/routes', input);
    const data = envelope.data;
    if (!data) {
      throw mapsAppError(502, 'provider_error', 'Maps route response was incomplete');
    }
    return {
      distanceMeters: data.distance_meters,
      durationSeconds: data.duration_seconds,
      geometry: Array.isArray(data.geometry) ? data.geometry : [],
    };
  }

  async estimate(input: {
    from: MapsCoordinate;
    to: MapsCoordinate;
  }): Promise<RouteEstimate> {
    const envelope = await this.requestJson<{
      distance_meters: number;
      duration_seconds: number;
    }>('POST', '/v1/routes/estimate', input);
    const data = envelope.data;
    if (!data) {
      throw mapsAppError(502, 'provider_error', 'Maps estimate response was incomplete');
    }
    return {
      distanceMeters: data.distance_meters,
      durationSeconds: data.duration_seconds,
    };
  }

  private async requestJson<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<{ data: T; request_id?: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      const text = await response.text();
      let parsed: unknown = null;
      if (text.length > 0) {
        try {
          parsed = JSON.parse(text) as unknown;
        } catch {
          logger.warn(
            { mapsStatus: response.status, mapsPath: path },
            'Cyrlo Maps returned non-JSON body',
          );
          throw mapsAppError(502, 'provider_error', 'Maps provider returned an invalid response');
        }
      }

      if (!response.ok) {
        throw mapHttpError(response.status, parsed as MapsErrorBody | null, path);
      }

      if (!parsed || typeof parsed !== 'object' || !('data' in parsed)) {
        throw mapsAppError(502, 'provider_error', 'Maps provider response was malformed');
      }
      return parsed as { data: T; request_id?: string };
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw mapsAppError(504, 'provider_timeout', 'Maps provider request timed out');
      }
      logger.warn({ err: error, mapsPath: path }, 'Cyrlo Maps request failed');
      throw mapsAppError(503, 'provider_unavailable', 'Maps provider is unavailable');
    } finally {
      clearTimeout(timer);
    }
  }
}

function mapHttpError(status: number, body: MapsErrorBody | null, path: string): AppError {
  const code = body?.error?.code;
  const message = body?.error?.message;
  logger.warn(
    { mapsStatus: status, mapsPath: path, mapsErrorCode: code },
    'Cyrlo Maps HTTP error',
  );
  if (status === 401) {
    return mapsAppError(502, 'provider_unauthorized', 'Maps provider rejected the API key');
  }
  if (status === 429) {
    return mapsAppError(429, 'RATE_LIMITED', message ?? 'Maps provider rate limit exceeded');
  }
  if (status === 400) {
    return mapsAppError(400, 'VALIDATION_ERROR', message ?? 'Invalid maps request');
  }
  if (status === 404) {
    return mapsAppError(404, 'NOT_FOUND', message ?? 'No route is available for these coordinates');
  }
  if (status === 504) {
    return mapsAppError(504, 'provider_timeout', message ?? 'Maps provider timed out');
  }
  if (status === 503) {
    return mapsAppError(503, 'provider_unavailable', message ?? 'Maps provider is unavailable');
  }
  return mapsAppError(502, 'provider_error', message ?? 'Maps provider request failed');
}

function mapsAppError(
  status: number,
  code:
    | 'VALIDATION_ERROR'
    | 'NOT_FOUND'
    | 'RATE_LIMITED'
    | 'provider_unauthorized'
    | 'provider_timeout'
    | 'provider_unavailable'
    | 'provider_error',
  message: string,
): AppError {
  return new AppError({ status, code, message });
}

export function createCyrloMapsClient(options: {
  baseUrl: string;
  apiKey: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}): CyrloMapsClient | null {
  if (!options.baseUrl.trim() || !options.apiKey.trim()) {
    return null;
  }
  return new HttpCyrloMapsClient(options);
}
