import { randomUUID } from 'node:crypto';

import { AppError } from '../../common/errors/app-error.js';
import type {
  CommunityListRecord,
  CommunityRecord,
  CountryRecord,
  CreateCommunityData,
  CreateCountryData,
  CreateDistrictData,
  CreateRegionData,
  DistrictRecord,
  GeoRepository,
  PageQuery,
  RegionRecord,
  TreeData,
  UpdateCommunityData,
  UpdateCountryData,
  UpdateDistrictData,
  UpdateRegionData,
} from './module.types.js';

function conflict(message: string): AppError {
  return new AppError({ status: 409, code: 'CONFLICT', message });
}

function matches(
  row: { name: string; status: string },
  query: Pick<PageQuery, 'status' | 'q'>,
): boolean {
  if (query.status && row.status !== query.status) return false;
  if (query.q && !row.name.toLowerCase().includes(query.q.toLowerCase())) return false;
  return true;
}

function page<T extends { name: string; id: string }>(rows: T[], query: PageQuery) {
  const sorted = [...rows].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  return {
    total: sorted.length,
    items: sorted.slice((query.page - 1) * query.pageSize, query.page * query.pageSize),
  };
}

/** In-memory GeoRepository for unit tests. `withTransaction` snapshots and restores on failure. */
export class MemoryGeoRepository implements GeoRepository {
  readonly countries = new Map<string, CountryRecord>();
  readonly regions = new Map<string, RegionRecord>();
  readonly districts = new Map<string, DistrictRecord>();
  readonly communities = new Map<string, CommunityRecord>();

  async withTransaction<T>(fn: (repo: GeoRepository) => Promise<T>): Promise<T> {
    const snapshot = {
      countries: new Map(this.countries),
      regions: new Map(this.regions),
      districts: new Map(this.districts),
      communities: new Map(this.communities),
    };
    try {
      return await fn(this);
    } catch (error) {
      for (const [key, store] of Object.entries(snapshot) as [
        keyof typeof snapshot,
        Map<string, never>,
      ][]) {
        const target = this[key] as Map<string, unknown>;
        target.clear();
        for (const [id, value] of store) target.set(id, value);
      }
      throw error;
    }
  }

  // ---- Countries ----
  async findCountryById(id: string) {
    return this.countries.get(id) ?? null;
  }
  async findCountryByIsoCode(isoCode: string) {
    return [...this.countries.values()].find((c) => c.isoCode === isoCode) ?? null;
  }
  async listCountries(query: PageQuery) {
    return page(
      [...this.countries.values()].filter((row) => matches(row, query)),
      query,
    );
  }
  async createCountry(data: CreateCountryData) {
    if (await this.findCountryByIsoCode(data.isoCode)) {
      throw conflict('Country with this ISO code already exists');
    }
    const now = new Date();
    const row: CountryRecord = {
      id: randomUUID(),
      name: data.name,
      isoCode: data.isoCode,
      status: data.status,
      createdById: data.actorId,
      createdAt: now,
      updatedAt: now,
    };
    this.countries.set(row.id, row);
    return row;
  }
  async updateCountry(id: string, data: UpdateCountryData) {
    const existing = this.countries.get(id)!;
    if (data.isoCode) {
      const other = await this.findCountryByIsoCode(data.isoCode);
      if (other && other.id !== id) throw conflict('Country with this ISO code already exists');
    }
    const row = { ...existing, ...stripUndefined(data), updatedAt: new Date() };
    this.countries.set(id, row);
    return row;
  }

  // ---- Regions ----
  async findRegionById(id: string) {
    return this.regions.get(id) ?? null;
  }
  async findRegionByCode(countryId: string, code: string) {
    return (
      [...this.regions.values()].find((r) => r.countryId === countryId && r.code === code) ?? null
    );
  }
  async listRegions(query: PageQuery & { countryId?: string }) {
    return page(
      [...this.regions.values()].filter(
        (row) => (!query.countryId || row.countryId === query.countryId) && matches(row, query),
      ),
      query,
    );
  }
  async createRegion(data: CreateRegionData) {
    if (await this.findRegionByCode(data.countryId, data.code)) {
      throw conflict('Region code already exists in this country');
    }
    const now = new Date();
    const row: RegionRecord = {
      id: randomUUID(),
      countryId: data.countryId,
      name: data.name,
      code: data.code,
      status: data.status,
      createdById: data.actorId,
      createdAt: now,
      updatedAt: now,
    };
    this.regions.set(row.id, row);
    return row;
  }
  async updateRegion(id: string, data: UpdateRegionData) {
    const existing = this.regions.get(id)!;
    if (data.code) {
      const other = await this.findRegionByCode(existing.countryId, data.code);
      if (other && other.id !== id) throw conflict('Region code already exists in this country');
    }
    const row = { ...existing, ...stripUndefined(data), updatedAt: new Date() };
    this.regions.set(id, row);
    return row;
  }

  // ---- Districts ----
  async findDistrictById(id: string) {
    return this.districts.get(id) ?? null;
  }
  async findDistrictByCode(regionId: string, code: string) {
    return (
      [...this.districts.values()].find((d) => d.regionId === regionId && d.code === code) ?? null
    );
  }
  async listDistricts(query: PageQuery & { regionId?: string }) {
    return page(
      [...this.districts.values()].filter(
        (row) => (!query.regionId || row.regionId === query.regionId) && matches(row, query),
      ),
      query,
    );
  }
  async createDistrict(data: CreateDistrictData) {
    if (await this.findDistrictByCode(data.regionId, data.code)) {
      throw conflict('District code already exists in this region');
    }
    const now = new Date();
    const row: DistrictRecord = {
      id: randomUUID(),
      regionId: data.regionId,
      name: data.name,
      code: data.code,
      adminType: data.adminType,
      status: data.status,
      createdById: data.actorId,
      createdAt: now,
      updatedAt: now,
    };
    this.districts.set(row.id, row);
    return row;
  }
  async updateDistrict(id: string, data: UpdateDistrictData) {
    const existing = this.districts.get(id)!;
    if (data.code) {
      const other = await this.findDistrictByCode(existing.regionId, data.code);
      if (other && other.id !== id) throw conflict('District code already exists in this region');
    }
    const row = { ...existing, ...stripUndefined(data), updatedAt: new Date() };
    this.districts.set(id, row);
    return row;
  }

  // ---- Communities ----
  async findCommunityById(id: string) {
    return this.communities.get(id) ?? null;
  }
  async findCommunityBySlug(districtId: string, slug: string) {
    return (
      [...this.communities.values()].find((c) => c.districtId === districtId && c.slug === slug) ??
      null
    );
  }
  async listCommunities(query: PageQuery & { districtId?: string }) {
    const result = page(
      [...this.communities.values()].filter(
        (row) => (!query.districtId || row.districtId === query.districtId) && matches(row, query),
      ),
      query,
    );
    return { total: result.total, items: result.items.map(toListRecord) };
  }
  async createCommunity(data: CreateCommunityData) {
    if (await this.findCommunityBySlug(data.districtId, data.slug)) {
      throw conflict('Community slug already exists in this district');
    }
    const now = new Date();
    const row: CommunityRecord = {
      id: randomUUID(),
      districtId: data.districtId,
      name: data.name,
      slug: data.slug,
      centerLatitude: data.centerLatitude,
      centerLongitude: data.centerLongitude,
      boundary: data.boundary,
      verificationStatus: 'UNVERIFIED',
      status: data.status,
      createdById: data.actorId,
      createdAt: now,
      updatedAt: now,
    };
    this.communities.set(row.id, row);
    return row;
  }
  async updateCommunity(id: string, data: UpdateCommunityData) {
    const existing = this.communities.get(id)!;
    if (data.slug) {
      const other = await this.findCommunityBySlug(existing.districtId, data.slug);
      if (other && other.id !== id) throw conflict('Community slug already exists in this district');
    }
    const row = { ...existing, ...stripUndefined(data), updatedAt: new Date() };
    this.communities.set(id, row);
    return row;
  }

  // ---- Tree ----
  async loadTree(input: { countryId?: string; includeCommunities: boolean }): Promise<TreeData> {
    const countries = [...this.countries.values()].filter(
      (country) => !input.countryId || country.id === input.countryId,
    );
    const countryIds = new Set(countries.map((country) => country.id));
    const regions = [...this.regions.values()].filter((region) => countryIds.has(region.countryId));
    const regionIds = new Set(regions.map((region) => region.id));
    const districts = [...this.districts.values()].filter((d) => regionIds.has(d.regionId));
    const districtIds = new Set(districts.map((district) => district.id));
    const scoped = [...this.communities.values()].filter((c) => districtIds.has(c.districtId));
    const communityCounts: Record<string, number> = {};
    for (const community of scoped) {
      communityCounts[community.districtId] = (communityCounts[community.districtId] ?? 0) + 1;
    }
    return {
      countries,
      regions,
      districts,
      communities: input.includeCommunities ? scoped.map(toListRecord) : [],
      communityCounts,
    };
  }
}

function toListRecord(row: CommunityRecord): CommunityListRecord {
  const { boundary, ...rest } = row;
  return { ...rest, hasBoundary: boundary !== null && boundary !== undefined };
}

function stripUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as Partial<T>;
}
