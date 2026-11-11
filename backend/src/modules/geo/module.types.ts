/** Shared types for the geo hierarchy module (repository contract + records). */

export type GeoStatus = 'ACTIVE' | 'INACTIVE';
export type GeoDistrictAdminType = 'DISTRICT' | 'MUNICIPAL' | 'METROPOLITAN' | 'OTHER';
export type GeoCommunityVerificationStatus = 'UNVERIFIED' | 'VERIFIED';

interface BaseRecord {
  id: string;
  name: string;
  status: GeoStatus;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CountryRecord extends BaseRecord {
  isoCode: string;
}

export interface RegionRecord extends BaseRecord {
  countryId: string;
  code: string;
}

export interface DistrictRecord extends BaseRecord {
  regionId: string;
  code: string;
  adminType: GeoDistrictAdminType;
}

export interface CommunityRecord extends BaseRecord {
  districtId: string;
  slug: string;
  centerLatitude: number | null;
  centerLongitude: number | null;
  boundary: unknown | null;
  verificationStatus: GeoCommunityVerificationStatus;
}

/** List rows omit the (potentially large) boundary payload. */
export type CommunityListRecord = Omit<CommunityRecord, 'boundary'> & { hasBoundary: boolean };

export interface PageQuery {
  page: number;
  pageSize: number;
  status?: GeoStatus;
  q?: string;
}

export interface CreateCountryData {
  name: string;
  isoCode: string;
  status: GeoStatus;
  actorId: string;
}
export interface UpdateCountryData {
  name?: string;
  isoCode?: string;
  status?: GeoStatus;
}

export interface CreateRegionData {
  countryId: string;
  name: string;
  code: string;
  status: GeoStatus;
  actorId: string;
}
export interface UpdateRegionData {
  name?: string;
  code?: string;
  status?: GeoStatus;
}

export interface CreateDistrictData {
  regionId: string;
  name: string;
  code: string;
  adminType: GeoDistrictAdminType;
  status: GeoStatus;
  actorId: string;
}
export interface UpdateDistrictData {
  name?: string;
  code?: string;
  adminType?: GeoDistrictAdminType;
  status?: GeoStatus;
}

export interface CreateCommunityData {
  districtId: string;
  name: string;
  slug: string;
  centerLatitude: number | null;
  centerLongitude: number | null;
  boundary: unknown | null;
  status: GeoStatus;
  actorId: string;
}
export interface UpdateCommunityData {
  name?: string;
  slug?: string;
  centerLatitude?: number | null;
  centerLongitude?: number | null;
  boundary?: unknown | null;
  verificationStatus?: GeoCommunityVerificationStatus;
  status?: GeoStatus;
}

export interface TreeData {
  countries: CountryRecord[];
  regions: RegionRecord[];
  districts: DistrictRecord[];
  /** Only populated when includeCommunities is requested. */
  communities: CommunityListRecord[];
  communityCounts: Record<string, number>;
}

/** Private to the geo module. Prisma + in-memory implementations share this contract. */
export interface GeoRepository {
  /** Run `fn` atomically; the repository passed to `fn` must be used for all reads/writes. */
  withTransaction<T>(fn: (repo: GeoRepository) => Promise<T>): Promise<T>;

  findCountryById(id: string): Promise<CountryRecord | null>;
  findCountryByIsoCode(isoCode: string): Promise<CountryRecord | null>;
  listCountries(query: PageQuery): Promise<{ total: number; items: CountryRecord[] }>;
  createCountry(data: CreateCountryData): Promise<CountryRecord>;
  updateCountry(id: string, data: UpdateCountryData): Promise<CountryRecord>;

  findRegionById(id: string): Promise<RegionRecord | null>;
  findRegionByCode(countryId: string, code: string): Promise<RegionRecord | null>;
  listRegions(
    query: PageQuery & { countryId?: string },
  ): Promise<{ total: number; items: RegionRecord[] }>;
  createRegion(data: CreateRegionData): Promise<RegionRecord>;
  updateRegion(id: string, data: UpdateRegionData): Promise<RegionRecord>;

  findDistrictById(id: string): Promise<DistrictRecord | null>;
  findDistrictByCode(regionId: string, code: string): Promise<DistrictRecord | null>;
  listDistricts(
    query: PageQuery & { regionId?: string },
  ): Promise<{ total: number; items: DistrictRecord[] }>;
  createDistrict(data: CreateDistrictData): Promise<DistrictRecord>;
  updateDistrict(id: string, data: UpdateDistrictData): Promise<DistrictRecord>;

  findCommunityById(id: string): Promise<CommunityRecord | null>;
  findCommunityBySlug(districtId: string, slug: string): Promise<CommunityRecord | null>;
  listCommunities(
    query: PageQuery & { districtId?: string },
  ): Promise<{ total: number; items: CommunityListRecord[] }>;
  createCommunity(data: CreateCommunityData): Promise<CommunityRecord>;
  updateCommunity(id: string, data: UpdateCommunityData): Promise<CommunityRecord>;

  loadTree(input: { countryId?: string; includeCommunities: boolean }): Promise<TreeData>;
}
