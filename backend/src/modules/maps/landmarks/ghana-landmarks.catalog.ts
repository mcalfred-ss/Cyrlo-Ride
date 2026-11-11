/**
 * Curated Ghana passenger landmarks.
 *
 * Coordinates are verified against OpenStreetMap Nominatim with countrycodes=gh
 * (read-only lookup 2026-11-11). Do not add entries without a verification source.
 * This catalog is nationwide-ready; seed gradually — never invent coordinates.
 */

export type LandmarkCategory =
  | 'university'
  | 'market'
  | 'hospital'
  | 'mall'
  | 'community'
  | 'landmark';

export interface GhanaLandmark {
  /** Stable catalog id (not a Maps provider id). */
  id: string;
  name: string;
  aliases: string[];
  latitude: number;
  longitude: number;
  region: string | null;
  district: string | null;
  community: string | null;
  category: LandmarkCategory;
  /** Where the coordinates were verified. */
  source: string;
  sourceRef: string;
  verifiedAt: string;
}

/** Approximate Ghana WGS84 bounds used to drop foreign provider hits. */
export const GHANA_BBOX = {
  minLatitude: 4.5,
  maxLatitude: 11.2,
  minLongitude: -3.35,
  maxLongitude: 1.25,
} as const;

export function isInsideGhana(latitude: number, longitude: number): boolean {
  return (
    latitude >= GHANA_BBOX.minLatitude &&
    latitude <= GHANA_BBOX.maxLatitude &&
    longitude >= GHANA_BBOX.minLongitude &&
    longitude <= GHANA_BBOX.maxLongitude
  );
}

/**
 * Verified Ashanti / Kumasi starter set. Expand nationwide with the same
 * verification process — never paste unverified lat/lng.
 */
export const GHANA_LANDMARKS: readonly GhanaLandmark[] = [
  {
    id: 'gh-knust',
    name: 'Kwame Nkrumah University of Science and Technology',
    aliases: ['KNUST', 'Kwame Nkrumah University of Science & Technology'],
    latitude: 6.6785135,
    longitude: -1.575422,
    region: 'Ashanti',
    district: 'Oforikrom Municipal District',
    community: 'Oduom',
    category: 'university',
    source: 'OpenStreetMap Nominatim',
    sourceRef: 'countrycodes=gh query="KNUST Kumasi" 2026-11-11',
    verifiedAt: '2026-11-11',
  },
  {
    id: 'gh-kejetia-market',
    name: 'Kejetia Market',
    aliases: ['Kejetia', 'Kejetia Market Kumasi'],
    latitude: 6.6958325,
    longitude: -1.6210457,
    region: 'Ashanti',
    district: 'Kumasi Metropolitan District',
    community: 'Adum',
    category: 'market',
    source: 'OpenStreetMap Nominatim',
    sourceRef: 'countrycodes=gh query="Kejetia Market Kumasi" 2026-11-11',
    verifiedAt: '2026-11-11',
  },
  {
    id: 'gh-kath',
    name: 'Komfo Anokye Teaching Hospital',
    aliases: ['KATH', 'Komfo Anokye', 'Okomfo Anokye Teaching Hospital'],
    latitude: 6.6968846,
    longitude: -1.6299787,
    region: 'Ashanti',
    district: 'Kumasi Metropolitan District',
    community: 'Adum',
    category: 'hospital',
    source: 'OpenStreetMap Nominatim',
    sourceRef: 'countrycodes=gh query="Komfo Anokye Teaching Hospital" 2026-11-11',
    verifiedAt: '2026-11-11',
  },
  {
    id: 'gh-kumasi-city-mall',
    name: 'Kumasi City Mall',
    aliases: ['KCM', 'City Mall Kumasi'],
    latitude: 6.6729019,
    longitude: -1.6070401,
    region: 'Ashanti',
    district: 'Asokwa Municipal District',
    community: 'Asokwa',
    category: 'mall',
    source: 'OpenStreetMap Nominatim',
    sourceRef: 'countrycodes=gh query="Kumasi City Mall" 2026-11-11',
    verifiedAt: '2026-11-11',
  },
  {
    id: 'gh-adum',
    name: 'Adum',
    aliases: ['Adum Kumasi'],
    latitude: 6.6942926,
    longitude: -1.6233319,
    region: 'Ashanti',
    district: 'Kumasi Metropolitan District',
    community: 'Adum',
    category: 'community',
    source: 'OpenStreetMap Nominatim',
    sourceRef: 'countrycodes=gh query="Adum Kumasi" 2026-11-11',
    verifiedAt: '2026-11-11',
  },
  {
    id: 'gh-ahodwo',
    name: 'Ahodwo',
    aliases: ['Ahodwo Kumasi'],
    latitude: 6.656522,
    longitude: -1.6196492,
    region: 'Ashanti',
    district: 'Kumasi Metropolitan District',
    community: 'Ahodwo',
    category: 'community',
    source: 'OpenStreetMap Nominatim',
    sourceRef: 'countrycodes=gh query="Ahodwo Kumasi" 2026-11-11',
    verifiedAt: '2026-11-11',
  },
  {
    id: 'gh-santasi',
    name: 'Santasi Roundabout',
    aliases: ['Santasi', 'Santasi Kumasi'],
    latitude: 6.6723232,
    longitude: -1.6410716,
    region: 'Ashanti',
    district: 'Kumasi Metropolitan District',
    community: 'Patasi',
    category: 'landmark',
    source: 'OpenStreetMap Nominatim',
    sourceRef: 'countrycodes=gh query="Santasi Kumasi" 2026-11-11',
    verifiedAt: '2026-11-11',
  },
  {
    id: 'gh-tafo',
    name: 'Tafo',
    aliases: ['Old Tafo', 'Tafo Kumasi'],
    latitude: 6.741892,
    longitude: -1.610432,
    region: 'Ashanti',
    district: 'Old Tafo Municipal District',
    community: 'Pankrono',
    category: 'community',
    source: 'OpenStreetMap Nominatim',
    sourceRef: 'countrycodes=gh query="Tafo Kumasi" 2026-11-11',
    verifiedAt: '2026-11-11',
  },
];
