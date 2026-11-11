import { AppError } from '../../common/errors/app-error.js';
import type { AuditService } from '../audit/module.service.js';
import { validateAndNormalizeBoundary } from '../service-zones/zone-geometry.js';
import type {
  CreateCommunityInput,
  CreateCountryInput,
  CreateDistrictInput,
  CreateRegionInput,
  GeoTreeQuery,
  ListCommunitiesQuery,
  ListCountriesQuery,
  ListDistrictsQuery,
  ListRegionsQuery,
  UpdateCommunityInput,
  UpdateCountryInput,
  UpdateDistrictInput,
  UpdateRegionInput,
} from './module.schema.js';
import { boundariesEqual, slugify } from './module.schema.js';
import type {
  CommunityListRecord,
  CommunityRecord,
  CountryRecord,
  DistrictRecord,
  GeoRepository,
  GeoStatus,
  RegionRecord,
} from './module.types.js';

export interface GeoServiceDeps {
  audit: AuditService;
}

export interface ListResult<T> {
  items: T[];
  meta: { page: number; pageSize: number; total: number; hasNextPage: boolean };
}

export interface GeoService {
  listCountries(query: ListCountriesQuery): Promise<ListResult<CountryView>>;
  getCountry(id: string): Promise<CountryView>;
  createCountry(actorId: string, input: CreateCountryInput, ip?: string): Promise<CountryView>;
  updateCountry(
    actorId: string,
    id: string,
    input: UpdateCountryInput,
    ip?: string,
  ): Promise<CountryView>;

  listRegions(query: ListRegionsQuery): Promise<ListResult<RegionView>>;
  getRegion(id: string): Promise<RegionView>;
  createRegion(actorId: string, input: CreateRegionInput, ip?: string): Promise<RegionView>;
  updateRegion(
    actorId: string,
    id: string,
    input: UpdateRegionInput,
    ip?: string,
  ): Promise<RegionView>;

  listDistricts(query: ListDistrictsQuery): Promise<ListResult<DistrictView>>;
  getDistrict(id: string): Promise<DistrictView>;
  createDistrict(actorId: string, input: CreateDistrictInput, ip?: string): Promise<DistrictView>;
  updateDistrict(
    actorId: string,
    id: string,
    input: UpdateDistrictInput,
    ip?: string,
  ): Promise<DistrictView>;

  listCommunities(query: ListCommunitiesQuery): Promise<ListResult<CommunityListView>>;
  getCommunity(id: string): Promise<CommunityView>;
  createCommunity(
    actorId: string,
    input: CreateCommunityInput,
    ip?: string,
  ): Promise<CommunityView>;
  updateCommunity(
    actorId: string,
    id: string,
    input: UpdateCommunityInput,
    ip?: string,
  ): Promise<CommunityView>;

  getTree(query: GeoTreeQuery): Promise<GeoTreeCountryNode[]>;
}

export class GeoServiceImpl implements GeoService {
  constructor(
    private readonly repository: GeoRepository,
    private readonly deps: GeoServiceDeps,
  ) {}

  // ---------------- Countries ----------------
  async listCountries(query: ListCountriesQuery) {
    const { total, items } = await this.repository.listCountries(query);
    return listResult(items.map(toCountryView), query, total);
  }

  async getCountry(id: string) {
    return toCountryView(await this.requireCountry(id));
  }

  async createCountry(actorId: string, input: CreateCountryInput, ip?: string) {
    if (await this.repository.findCountryByIsoCode(input.isoCode)) {
      throw conflict('Country with this ISO code already exists');
    }
    const row = await this.repository.createCountry({
      name: input.name,
      isoCode: input.isoCode,
      status: input.status ?? 'ACTIVE',
      actorId,
    });
    await this.deps.audit.record({
      actorId,
      action: 'geo.country.created',
      entityType: 'geo_country',
      entityId: row.id,
      metadata: { name: row.name, isoCode: row.isoCode, status: row.status },
      ipAddress: ip,
    });
    return toCountryView(row);
  }

  async updateCountry(actorId: string, id: string, input: UpdateCountryInput, ip?: string) {
    const existing = await this.requireCountry(id);
    if (input.isoCode && input.isoCode !== existing.isoCode) {
      const other = await this.repository.findCountryByIsoCode(input.isoCode);
      if (other && other.id !== id) throw conflict('Country with this ISO code already exists');
    }
    const row = await this.repository.updateCountry(id, input);
    await this.deps.audit.record({
      actorId,
      action: 'geo.country.updated',
      entityType: 'geo_country',
      entityId: id,
      metadata: { fields: Object.keys(input), status: row.status },
      ipAddress: ip,
    });
    return toCountryView(row);
  }

  // ---------------- Regions ----------------
  async listRegions(query: ListRegionsQuery) {
    const { total, items } = await this.repository.listRegions(query);
    return listResult(items.map(toRegionView), query, total);
  }

  async getRegion(id: string) {
    return toRegionView(await this.requireRegion(id));
  }

  async createRegion(actorId: string, input: CreateRegionInput, ip?: string) {
    const country = await this.repository.findCountryById(input.countryId);
    if (!country) throw parentNotFound('country');
    const status = input.status ?? 'ACTIVE';
    assertParentActive(status, country.status, 'country');
    if (await this.repository.findRegionByCode(input.countryId, input.code)) {
      throw conflict('Region code already exists in this country');
    }
    const row = await this.repository.createRegion({
      countryId: input.countryId,
      name: input.name,
      code: input.code,
      status,
      actorId,
    });
    await this.deps.audit.record({
      actorId,
      action: 'geo.region.created',
      entityType: 'geo_region',
      entityId: row.id,
      metadata: { countryId: row.countryId, code: row.code, name: row.name, status: row.status },
      ipAddress: ip,
    });
    return toRegionView(row);
  }

  async updateRegion(actorId: string, id: string, input: UpdateRegionInput, ip?: string) {
    const existing = await this.requireRegion(id);
    if (input.status === 'ACTIVE' && existing.status !== 'ACTIVE') {
      const country = await this.repository.findCountryById(existing.countryId);
      assertParentActive('ACTIVE', country?.status ?? 'INACTIVE', 'country');
    }
    if (input.code && input.code !== existing.code) {
      const other = await this.repository.findRegionByCode(existing.countryId, input.code);
      if (other && other.id !== id) throw conflict('Region code already exists in this country');
    }
    const row = await this.repository.updateRegion(id, input);
    await this.deps.audit.record({
      actorId,
      action: 'geo.region.updated',
      entityType: 'geo_region',
      entityId: id,
      metadata: { fields: Object.keys(input), status: row.status },
      ipAddress: ip,
    });
    return toRegionView(row);
  }

  // ---------------- Districts ----------------
  async listDistricts(query: ListDistrictsQuery) {
    const { total, items } = await this.repository.listDistricts(query);
    return listResult(items.map(toDistrictView), query, total);
  }

  async getDistrict(id: string) {
    return toDistrictView(await this.requireDistrict(id));
  }

  async createDistrict(actorId: string, input: CreateDistrictInput, ip?: string) {
    const region = await this.repository.findRegionById(input.regionId);
    if (!region) throw parentNotFound('region');
    const status = input.status ?? 'ACTIVE';
    assertParentActive(status, region.status, 'region');
    if (await this.repository.findDistrictByCode(input.regionId, input.code)) {
      throw conflict('District code already exists in this region');
    }
    const row = await this.repository.createDistrict({
      regionId: input.regionId,
      name: input.name,
      code: input.code,
      adminType: input.adminType ?? 'DISTRICT',
      status,
      actorId,
    });
    await this.deps.audit.record({
      actorId,
      action: 'geo.district.created',
      entityType: 'geo_district',
      entityId: row.id,
      metadata: {
        regionId: row.regionId,
        code: row.code,
        name: row.name,
        adminType: row.adminType,
        status: row.status,
      },
      ipAddress: ip,
    });
    return toDistrictView(row);
  }

  async updateDistrict(actorId: string, id: string, input: UpdateDistrictInput, ip?: string) {
    const existing = await this.requireDistrict(id);
    if (input.status === 'ACTIVE' && existing.status !== 'ACTIVE') {
      const region = await this.repository.findRegionById(existing.regionId);
      assertParentActive('ACTIVE', region?.status ?? 'INACTIVE', 'region');
    }
    if (input.code && input.code !== existing.code) {
      const other = await this.repository.findDistrictByCode(existing.regionId, input.code);
      if (other && other.id !== id) throw conflict('District code already exists in this region');
    }
    const row = await this.repository.updateDistrict(id, input);
    await this.deps.audit.record({
      actorId,
      action: 'geo.district.updated',
      entityType: 'geo_district',
      entityId: id,
      metadata: { fields: Object.keys(input), status: row.status },
      ipAddress: ip,
    });
    return toDistrictView(row);
  }

  // ---------------- Communities ----------------
  async listCommunities(query: ListCommunitiesQuery) {
    const { total, items } = await this.repository.listCommunities(query);
    return listResult(items.map(toCommunityListView), query, total);
  }

  async getCommunity(id: string) {
    return toCommunityView(await this.requireCommunity(id));
  }

  async createCommunity(actorId: string, input: CreateCommunityInput, ip?: string) {
    const district = await this.repository.findDistrictById(input.districtId);
    if (!district) throw parentNotFound('district');
    const status = input.status ?? 'ACTIVE';
    assertParentActive(status, district.status, 'district');

    const slug = input.slug ?? slugify(input.name);
    if (!slug) {
      throw new AppError({
        status: 400,
        code: 'VALIDATION_ERROR',
        message: 'Could not derive a slug from the name; provide an explicit slug',
      });
    }
    if (await this.repository.findCommunityBySlug(input.districtId, slug)) {
      throw conflict('Community slug already exists in this district');
    }
    // Boundary is optional and never inferred; when supplied it must be a valid GeoJSON polygon.
    const boundary =
      input.boundary === undefined || input.boundary === null
        ? null
        : validateAndNormalizeBoundary(input.boundary).boundary;

    const row = await this.repository.createCommunity({
      districtId: input.districtId,
      name: input.name,
      slug,
      centerLatitude: input.centerLatitude ?? null,
      centerLongitude: input.centerLongitude ?? null,
      boundary,
      status,
      actorId,
    });
    await this.deps.audit.record({
      actorId,
      action: 'geo.community.created',
      entityType: 'geo_community',
      entityId: row.id,
      metadata: {
        districtId: row.districtId,
        slug: row.slug,
        name: row.name,
        status: row.status,
        hasBoundary: boundary !== null,
      },
      ipAddress: ip,
    });
    return toCommunityView(row);
  }

  async updateCommunity(actorId: string, id: string, input: UpdateCommunityInput, ip?: string) {
    const existing = await this.requireCommunity(id);
    if (input.status === 'ACTIVE' && existing.status !== 'ACTIVE') {
      const district = await this.repository.findDistrictById(existing.districtId);
      assertParentActive('ACTIVE', district?.status ?? 'INACTIVE', 'district');
    }
    if (input.slug && input.slug !== existing.slug) {
      const other = await this.repository.findCommunityBySlug(existing.districtId, input.slug);
      if (other && other.id !== id) {
        throw conflict('Community slug already exists in this district');
      }
    }

    let boundary: unknown | null | undefined;
    let boundaryChanged = false;
    if (input.boundary !== undefined) {
      boundary =
        input.boundary === null ? null : validateAndNormalizeBoundary(input.boundary).boundary;
      boundaryChanged = !boundariesEqual(boundary, existing.boundary);
    }

    const verificationStatus = boundaryChanged
      ? ('UNVERIFIED' as const)
      : input.verificationStatus;

    const row = await this.repository.updateCommunity(id, {
      name: input.name,
      slug: input.slug,
      centerLatitude: input.centerLatitude,
      centerLongitude: input.centerLongitude,
      boundary,
      status: input.status,
      verificationStatus,
    });
    await this.deps.audit.record({
      actorId,
      action: 'geo.community.updated',
      entityType: 'geo_community',
      entityId: id,
      metadata: {
        fields: Object.keys(input),
        status: row.status,
        boundaryChanged,
        verificationStatus: row.verificationStatus,
        verificationChanged: row.verificationStatus !== existing.verificationStatus,
      },
      ipAddress: ip,
    });
    return toCommunityView(row);
  }

  // ---------------- Tree ----------------
  async getTree(query: GeoTreeQuery): Promise<GeoTreeCountryNode[]> {
    if (query.countryId) await this.requireCountry(query.countryId);
    const data = await this.repository.loadTree({
      countryId: query.countryId,
      includeCommunities: query.includeCommunities,
    });

    const communitiesByDistrict = new Map<string, GeoTreeCommunityNode[]>();
    for (const community of data.communities) {
      const list = communitiesByDistrict.get(community.districtId) ?? [];
      list.push({
        id: community.id,
        name: community.name,
        slug: community.slug,
        status: community.status,
        verificationStatus: community.verificationStatus,
        hasBoundary: community.hasBoundary,
      });
      communitiesByDistrict.set(community.districtId, list);
    }
    const districtsByRegion = new Map<string, GeoTreeDistrictNode[]>();
    for (const district of data.districts) {
      const list = districtsByRegion.get(district.regionId) ?? [];
      list.push({
        id: district.id,
        name: district.name,
        code: district.code,
        adminType: district.adminType,
        status: district.status,
        communityCount: data.communityCounts[district.id] ?? 0,
        ...(query.includeCommunities
          ? { communities: communitiesByDistrict.get(district.id) ?? [] }
          : {}),
      });
      districtsByRegion.set(district.regionId, list);
    }
    const regionsByCountry = new Map<string, GeoTreeRegionNode[]>();
    for (const region of data.regions) {
      const list = regionsByCountry.get(region.countryId) ?? [];
      list.push({
        id: region.id,
        name: region.name,
        code: region.code,
        status: region.status,
        districts: districtsByRegion.get(region.id) ?? [],
      });
      regionsByCountry.set(region.countryId, list);
    }
    return data.countries.map((country) => ({
      id: country.id,
      name: country.name,
      isoCode: country.isoCode,
      status: country.status,
      regions: regionsByCountry.get(country.id) ?? [],
    }));
  }

  // ---------------- helpers ----------------
  private async requireCountry(id: string) {
    const row = await this.repository.findCountryById(id);
    if (!row) throw notFound('Country');
    return row;
  }
  private async requireRegion(id: string) {
    const row = await this.repository.findRegionById(id);
    if (!row) throw notFound('Region');
    return row;
  }
  private async requireDistrict(id: string) {
    const row = await this.repository.findDistrictById(id);
    if (!row) throw notFound('District');
    return row;
  }
  private async requireCommunity(id: string) {
    const row = await this.repository.findCommunityById(id);
    if (!row) throw notFound('Community');
    return row;
  }
}

// ---------------- errors ----------------
function conflict(message: string): AppError {
  return new AppError({ status: 409, code: 'CONFLICT', message });
}
function notFound(label: string): AppError {
  return new AppError({ status: 404, code: 'NOT_FOUND', message: `${label} not found` });
}
function parentNotFound(label: string): AppError {
  return new AppError({ status: 404, code: 'NOT_FOUND', message: `Parent ${label} not found` });
}
function assertParentActive(childStatus: GeoStatus, parentStatus: GeoStatus, label: string) {
  if (childStatus === 'ACTIVE' && parentStatus !== 'ACTIVE') {
    throw new AppError({
      status: 409,
      code: 'CONFLICT',
      message: `Cannot create or activate a child under an inactive ${label}`,
    });
  }
}

function listResult<T>(
  items: T[],
  query: { page: number; pageSize: number },
  total: number,
): ListResult<T> {
  return {
    items,
    meta: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      hasNextPage: query.page * query.pageSize < total,
    },
  };
}

// ---------------- views ----------------
export interface CountryView {
  id: string;
  name: string;
  isoCode: string;
  status: GeoStatus;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface RegionView {
  id: string;
  countryId: string;
  name: string;
  code: string;
  status: GeoStatus;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface DistrictView {
  id: string;
  regionId: string;
  name: string;
  code: string;
  adminType: DistrictRecord['adminType'];
  status: GeoStatus;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface CommunityListView {
  id: string;
  districtId: string;
  name: string;
  slug: string;
  centerLatitude: number | null;
  centerLongitude: number | null;
  hasBoundary: boolean;
  verificationStatus: CommunityRecord['verificationStatus'];
  status: GeoStatus;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface CommunityView extends CommunityListView {
  boundary: unknown | null;
}

export interface GeoTreeCommunityNode {
  id: string;
  name: string;
  slug: string;
  status: GeoStatus;
  verificationStatus: CommunityRecord['verificationStatus'];
  hasBoundary: boolean;
}
export interface GeoTreeDistrictNode {
  id: string;
  name: string;
  code: string;
  adminType: DistrictRecord['adminType'];
  status: GeoStatus;
  communityCount: number;
  communities?: GeoTreeCommunityNode[];
}
export interface GeoTreeRegionNode {
  id: string;
  name: string;
  code: string;
  status: GeoStatus;
  districts: GeoTreeDistrictNode[];
}
export interface GeoTreeCountryNode {
  id: string;
  name: string;
  isoCode: string;
  status: GeoStatus;
  regions: GeoTreeRegionNode[];
}

function toCountryView(row: CountryRecord): CountryView {
  return {
    id: row.id,
    name: row.name,
    isoCode: row.isoCode,
    status: row.status,
    createdById: row.createdById,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
function toRegionView(row: RegionRecord): RegionView {
  return {
    id: row.id,
    countryId: row.countryId,
    name: row.name,
    code: row.code,
    status: row.status,
    createdById: row.createdById,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
function toDistrictView(row: DistrictRecord): DistrictView {
  return {
    id: row.id,
    regionId: row.regionId,
    name: row.name,
    code: row.code,
    adminType: row.adminType,
    status: row.status,
    createdById: row.createdById,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
function toCommunityListView(row: CommunityListRecord): CommunityListView {
  return {
    id: row.id,
    districtId: row.districtId,
    name: row.name,
    slug: row.slug,
    centerLatitude: row.centerLatitude,
    centerLongitude: row.centerLongitude,
    hasBoundary: row.hasBoundary,
    verificationStatus: row.verificationStatus,
    status: row.status,
    createdById: row.createdById,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
function toCommunityView(row: CommunityRecord): CommunityView {
  const { boundary, ...rest } = row;
  return {
    ...toCommunityListView({ ...rest, hasBoundary: boundary !== null && boundary !== undefined }),
    boundary: boundary ?? null,
  };
}
