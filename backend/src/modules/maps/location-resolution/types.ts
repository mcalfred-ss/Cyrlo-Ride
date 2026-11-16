export type LocationConfidence = 'high' | 'medium' | 'low' | 'approximate';

export type LocationSource =
  | 'provider'
  | 'catalogue'
  | 'provider+catalogue'
  | 'partial'
  | 'unavailable';

export interface ResolvedNearbyLandmark {
  name: string;
  category: string;
  latitude: number;
  longitude: number;
  distanceMeters: number;
  source: string;
}

export interface ResolvedLocation {
  formattedAddress: string;
  locality: string | null;
  neighbourhood: string | null;
  city: string | null;
  district: string | null;
  region: string | null;
  country: string | null;
  /** Echo of the requested coordinate — never moved to a centroid. */
  latitude: number;
  longitude: number;
  source: LocationSource;
  confidence: LocationConfidence;
  approximate: boolean;
  providerLabel: string | null;
  catalogueTownId: string | null;
  catalogueTownDistanceMeters: number | null;
}

export interface LocationResolutionResult {
  location: ResolvedLocation;
  nearbyLandmarks: ResolvedNearbyLandmark[];
}
