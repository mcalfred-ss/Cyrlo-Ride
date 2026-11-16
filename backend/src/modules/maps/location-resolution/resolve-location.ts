import { isInsideGhana } from '../landmarks/ghana-landmarks.catalog.js';
import {
  displayTownName,
  matchAshantiTown,
  type CatalogueTownMatch,
} from './catalogue-match.js';
import { findNearbyLandmarks } from './nearby-landmarks.js';
import {
  isCoarseProviderLocality,
  parseProviderLabel,
  type ParsedProviderLabel,
} from './provider-label.js';
import type {
  LocationConfidence,
  LocationResolutionResult,
  LocationSource,
  ResolvedLocation,
} from './types.js';

export interface ResolveLocationInput {
  latitude: number;
  longitude: number;
  /** Flat provider reverse-geocode label, if any. */
  providerLabel?: string | null;
  landmarkLimit?: number;
}

function joinAddress(parts: Array<string | null | undefined>): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    const trimmed = part?.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out.join(', ');
}

function pickConfidence(
  provider: ParsedProviderLabel,
  catalogue: CatalogueTownMatch | null,
  usedCatalogueLocality: boolean,
): LocationConfidence {
  if (usedCatalogueLocality && catalogue) {
    return catalogue.confidence;
  }
  if (provider.locality && !provider.isCoarse) return 'high';
  if (provider.city || provider.district || provider.region) return 'approximate';
  if (provider.country) return 'low';
  return 'approximate';
}

function pickSource(
  provider: ParsedProviderLabel,
  usedCatalogue: boolean,
): LocationSource {
  const hasProvider = Boolean(provider.raw);
  if (hasProvider && usedCatalogue) return 'provider+catalogue';
  if (hasProvider) return provider.isCoarse ? 'partial' : 'provider';
  if (usedCatalogue) return 'catalogue';
  return 'unavailable';
}

/**
 * Central location resolution for Greater Kumasi / Ashanti.
 *
 * Priority:
 * 1. Structured parts from the provider reverse label (no fabrication).
 * 2. Conservative Ashanti town catalogue match (points only).
 * 3. Region/country when Ghana bbox / provider indicates Ghana.
 * 4. Nearby verified landmarks (separate list).
 *
 * Never moves the requested coordinates to a town centroid.
 * Never treats catalogue proximity as a service-zone boundary.
 */
export function resolveLocation(input: ResolveLocationInput): LocationResolutionResult {
  const { latitude, longitude } = input;
  const provider = parseProviderLabel(input.providerLabel);
  const catalogue = isInsideGhana(latitude, longitude)
    ? matchAshantiTown(latitude, longitude)
    : null;

  let locality = provider.locality;
  let neighbourhood = provider.neighbourhood;
  let city = provider.city;
  let district = provider.district;
  let region = provider.region;
  let country = provider.country;
  let usedCatalogueLocality = false;
  let usedCatalogueHierarchy = false;

  const providerLocalityUsable =
    Boolean(locality) && !isCoarseProviderLocality(locality) && !provider.isCoarse;

  // Do not silently replace a specific provider locality with a centroid match.
  if (!providerLocalityUsable && catalogue) {
    locality = displayTownName(catalogue.town);
    usedCatalogueLocality = true;
    usedCatalogueHierarchy = true;
  }

  if (catalogue && !district) {
    district = catalogue.town.district;
    usedCatalogueHierarchy = true;
  }

  if (catalogue && !region) {
    region = 'Ashanti Region';
    usedCatalogueHierarchy = true;
  } else if (!region && provider.region) {
    region = provider.region;
  }

  if (!city && provider.city) {
    city = provider.city;
  }

  if (!country) {
    if (provider.country) country = provider.country;
    else if (isInsideGhana(latitude, longitude) && (region || district || locality || city)) {
      country = 'Ghana';
    }
  }

  // Prefer "Ashanti Region" wording when we only have "Ashanti".
  if (region && /^ashanti$/i.test(region.trim())) {
    region = 'Ashanti Region';
  }

  const approximate =
    usedCatalogueLocality
      ? catalogue?.approximate ?? true
      : provider.isCoarse || (!locality && !neighbourhood);

  const formattedAddress = joinAddress([
    locality,
    neighbourhood && neighbourhood.toLowerCase() !== locality?.toLowerCase()
      ? neighbourhood
      : null,
    district,
    // Avoid "Kumasi" after a specific town when district/region already place it.
    city && (!locality || city.toLowerCase() !== locality.toLowerCase()) ? city : null,
    region,
    country,
  ]);

  const confidence = pickConfidence(provider, catalogue, usedCatalogueLocality);
  const source = pickSource(provider, usedCatalogueLocality || usedCatalogueHierarchy);

  const location: ResolvedLocation = {
    formattedAddress:
      formattedAddress ||
      (provider.raw && provider.raw.trim()) ||
      '',
    locality,
    neighbourhood,
    city,
    district,
    region,
    country,
    latitude,
    longitude,
    source: formattedAddress || provider.raw ? source : 'unavailable',
    confidence: formattedAddress || provider.raw ? confidence : 'approximate',
    approximate: !(formattedAddress || provider.raw) ? true : approximate,
    providerLabel: provider.raw,
    catalogueTownId: catalogue?.town.id ?? null,
    catalogueTownDistanceMeters:
      catalogue != null ? Math.round(catalogue.distanceMeters) : null,
  };

  const nearbyLandmarks = findNearbyLandmarks({
    latitude,
    longitude,
    limit: input.landmarkLimit,
  });

  return { location, nearbyLandmarks };
}
