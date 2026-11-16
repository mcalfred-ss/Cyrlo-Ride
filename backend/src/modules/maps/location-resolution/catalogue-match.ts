import {
  ASHANTI_TOWNS,
  type AshantiTownPoint,
} from '../catalogue/ashanti-open-admin.catalog.js';
import { haversineMeters } from './geo-distance.js';
import type { LocationConfidence } from './types.js';

/** Conservative thresholds — points are centroids, not town boundaries. */
export const CATALOGUE_MATCH_RULES = {
  /** Max distance for high-confidence town suggestion. */
  highMaxMeters: 800,
  /** Second-nearest must be at least this far (or ratio) for high. */
  highSeparationMeters: 600,
  highSeparationRatio: 2,
  /** Max distance for medium-confidence (always approximate). */
  mediumMaxMeters: 1800,
  mediumSeparationMeters: 1200,
  mediumSeparationRatio: 2.5,
} as const;

export interface CatalogueTownMatch {
  town: AshantiTownPoint;
  distanceMeters: number;
  secondDistanceMeters: number | null;
  confidence: LocationConfidence;
  /** Catalogue matches are never exact polygon containment. */
  approximate: boolean;
}

function titleCasePlace(value: string): string {
  return value
    .split(/\s+/)
    .map((word) => {
      if (!word) return word;
      if (word.toUpperCase() === word && word.length <= 5) return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

export function displayTownName(town: AshantiTownPoint): string {
  return titleCasePlace(town.name);
}

/**
 * Nearest Ashanti town centroid with conservative uniqueness checks.
 * Returns null when proximity alone is not reliable enough to assert a town.
 */
export function matchAshantiTown(
  latitude: number,
  longitude: number,
  towns: readonly AshantiTownPoint[] = ASHANTI_TOWNS,
): CatalogueTownMatch | null {
  if (towns.length === 0) return null;

  const ranked = towns
    .map((town) => ({
      town,
      distanceMeters: haversineMeters(
        latitude,
        longitude,
        town.latitude,
        town.longitude,
      ),
    }))
    .sort((a, b) => a.distanceMeters - b.distanceMeters);

  const nearest = ranked[0];
  if (!nearest) return null;
  const second = ranked[1] ?? null;
  const secondDistance = second?.distanceMeters ?? null;

  const uniqueEnough = (
    maxMeters: number,
    separationMeters: number,
    separationRatio: number,
  ): boolean => {
    if (nearest.distanceMeters > maxMeters) return false;
    if (secondDistance == null) return true;
    if (secondDistance - nearest.distanceMeters >= separationMeters) return true;
    if (nearest.distanceMeters > 0 && secondDistance / nearest.distanceMeters >= separationRatio) {
      return true;
    }
    return false;
  };

  if (
    uniqueEnough(
      CATALOGUE_MATCH_RULES.highMaxMeters,
      CATALOGUE_MATCH_RULES.highSeparationMeters,
      CATALOGUE_MATCH_RULES.highSeparationRatio,
    )
  ) {
    return {
      town: nearest.town,
      distanceMeters: nearest.distanceMeters,
      secondDistanceMeters: secondDistance,
      confidence: nearest.distanceMeters <= 400 ? 'high' : 'medium',
      approximate: nearest.distanceMeters > 400,
    };
  }

  if (
    uniqueEnough(
      CATALOGUE_MATCH_RULES.mediumMaxMeters,
      CATALOGUE_MATCH_RULES.mediumSeparationMeters,
      CATALOGUE_MATCH_RULES.mediumSeparationRatio,
    )
  ) {
    return {
      town: nearest.town,
      distanceMeters: nearest.distanceMeters,
      secondDistanceMeters: secondDistance,
      confidence: 'approximate',
      approximate: true,
    };
  }

  return null;
}
