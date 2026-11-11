import { Prisma, type PrismaClient } from '@prisma/client';

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

type Db = PrismaClient | Prisma.TransactionClient;

const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 120_000 } as const;

function num(value: Prisma.Decimal | null): number | null {
  return value === null ? null : value.toNumber();
}

function toCommunity(row: {
  id: string;
  districtId: string;
  name: string;
  slug: string;
  centerLatitude: Prisma.Decimal | null;
  centerLongitude: Prisma.Decimal | null;
  boundary: Prisma.JsonValue | null;
  verificationStatus: 'UNVERIFIED' | 'VERIFIED';
  status: 'ACTIVE' | 'INACTIVE';
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
}): CommunityRecord {
  return {
    ...row,
    centerLatitude: num(row.centerLatitude),
    centerLongitude: num(row.centerLongitude),
  };
}

function nameFilter(q?: string) {
  return q ? { name: { contains: q, mode: 'insensitive' as const } } : {};
}

/** Maps unique-constraint races to a 409 so concurrent writers see a clean conflict. */
async function mapUnique<T>(message: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new AppError({ status: 409, code: 'CONFLICT', message });
    }
    throw error;
  }
}

function boundaryInput(value: unknown | null | undefined) {
  if (value === undefined) return undefined;
  return value === null ? Prisma.DbNull : (value as Prisma.InputJsonValue);
}

/** Private to the geo module. */
export class GeoPrismaRepository implements GeoRepository {
  constructor(private readonly db: Db) {}

  async withTransaction<T>(fn: (repo: GeoRepository) => Promise<T>): Promise<T> {
    if (!('$transaction' in this.db)) {
      // Already inside a transaction.
      return fn(this);
    }
    return this.db.$transaction(
      async (tx) => fn(new GeoPrismaRepository(tx)),
      TRANSACTION_OPTIONS,
    );
  }

  // ---- Countries ----
  findCountryById(id: string): Promise<CountryRecord | null> {
    return this.db.country.findUnique({ where: { id } });
  }

  findCountryByIsoCode(isoCode: string): Promise<CountryRecord | null> {
    return this.db.country.findUnique({ where: { isoCode } });
  }

  async listCountries(query: PageQuery) {
    const where: Prisma.CountryWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...nameFilter(query.q),
    };
    const [total, items] = await Promise.all([
      this.db.country.count({ where }),
      this.db.country.findMany({
        where,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return { total, items };
  }

  createCountry(data: CreateCountryData): Promise<CountryRecord> {
    return mapUnique('Country with this ISO code already exists', () =>
      this.db.country.create({
        data: {
          name: data.name,
          isoCode: data.isoCode,
          status: data.status,
          createdById: data.actorId,
        },
      }),
    );
  }

  updateCountry(id: string, data: UpdateCountryData): Promise<CountryRecord> {
    return mapUnique('Country with this ISO code already exists', () =>
      this.db.country.update({ where: { id }, data }),
    );
  }

  // ---- Regions ----
  findRegionById(id: string): Promise<RegionRecord | null> {
    return this.db.region.findUnique({ where: { id } });
  }

  findRegionByCode(countryId: string, code: string): Promise<RegionRecord | null> {
    return this.db.region.findUnique({ where: { countryId_code: { countryId, code } } });
  }

  async listRegions(query: PageQuery & { countryId?: string }) {
    const where: Prisma.RegionWhereInput = {
      ...(query.countryId ? { countryId: query.countryId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...nameFilter(query.q),
    };
    const [total, items] = await Promise.all([
      this.db.region.count({ where }),
      this.db.region.findMany({
        where,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return { total, items };
  }

  createRegion(data: CreateRegionData): Promise<RegionRecord> {
    return mapUnique('Region code already exists in this country', () =>
      this.db.region.create({
        data: {
          countryId: data.countryId,
          name: data.name,
          code: data.code,
          status: data.status,
          createdById: data.actorId,
        },
      }),
    );
  }

  updateRegion(id: string, data: UpdateRegionData): Promise<RegionRecord> {
    return mapUnique('Region code already exists in this country', () =>
      this.db.region.update({ where: { id }, data }),
    );
  }

  // ---- Districts ----
  findDistrictById(id: string): Promise<DistrictRecord | null> {
    return this.db.district.findUnique({ where: { id } });
  }

  findDistrictByCode(regionId: string, code: string): Promise<DistrictRecord | null> {
    return this.db.district.findUnique({ where: { regionId_code: { regionId, code } } });
  }

  async listDistricts(query: PageQuery & { regionId?: string }) {
    const where: Prisma.DistrictWhereInput = {
      ...(query.regionId ? { regionId: query.regionId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...nameFilter(query.q),
    };
    const [total, items] = await Promise.all([
      this.db.district.count({ where }),
      this.db.district.findMany({
        where,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return { total, items };
  }

  createDistrict(data: CreateDistrictData): Promise<DistrictRecord> {
    return mapUnique('District code already exists in this region', () =>
      this.db.district.create({
        data: {
          regionId: data.regionId,
          name: data.name,
          code: data.code,
          adminType: data.adminType,
          status: data.status,
          createdById: data.actorId,
        },
      }),
    );
  }

  updateDistrict(id: string, data: UpdateDistrictData): Promise<DistrictRecord> {
    return mapUnique('District code already exists in this region', () =>
      this.db.district.update({ where: { id }, data }),
    );
  }

  // ---- Communities ----
  async findCommunityById(id: string): Promise<CommunityRecord | null> {
    const row = await this.db.community.findUnique({ where: { id } });
    return row ? toCommunity(row) : null;
  }

  async findCommunityBySlug(districtId: string, slug: string): Promise<CommunityRecord | null> {
    const row = await this.db.community.findUnique({
      where: { districtId_slug: { districtId, slug } },
    });
    return row ? toCommunity(row) : null;
  }

  async listCommunities(query: PageQuery & { districtId?: string }) {
    const where: Prisma.CommunityWhereInput = {
      ...(query.districtId ? { districtId: query.districtId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...nameFilter(query.q),
    };
    const [total, rows] = await Promise.all([
      this.db.community.count({ where }),
      this.db.community.findMany({
        where,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          id: true,
          districtId: true,
          name: true,
          slug: true,
          centerLatitude: true,
          centerLongitude: true,
          verificationStatus: true,
          status: true,
          createdById: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);
    const withBoundary = await this.idsWithBoundary(rows.map((row) => row.id));
    const items: CommunityListRecord[] = rows.map((row) => ({
      ...row,
      centerLatitude: num(row.centerLatitude),
      centerLongitude: num(row.centerLongitude),
      hasBoundary: withBoundary.has(row.id),
    }));
    return { total, items };
  }

  createCommunity(data: CreateCommunityData): Promise<CommunityRecord> {
    return mapUnique('Community slug already exists in this district', async () =>
      toCommunity(
        await this.db.community.create({
          data: {
            districtId: data.districtId,
            name: data.name,
            slug: data.slug,
            centerLatitude: data.centerLatitude,
            centerLongitude: data.centerLongitude,
            boundary: boundaryInput(data.boundary ?? null),
            status: data.status,
            createdById: data.actorId,
          },
        }),
      ),
    );
  }

  updateCommunity(id: string, data: UpdateCommunityData): Promise<CommunityRecord> {
    return mapUnique('Community slug already exists in this district', async () =>
      toCommunity(
        await this.db.community.update({
          where: { id },
          data: {
            name: data.name,
            slug: data.slug,
            centerLatitude: data.centerLatitude,
            centerLongitude: data.centerLongitude,
            boundary: boundaryInput(data.boundary),
            verificationStatus: data.verificationStatus,
            status: data.status,
          },
        }),
      ),
    );
  }

  // ---- Tree ----
  async loadTree(input: { countryId?: string; includeCommunities: boolean }): Promise<TreeData> {
    const countries = await this.db.country.findMany({
      where: input.countryId ? { id: input.countryId } : {},
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
    const countryIds = countries.map((country) => country.id);
    const regions = await this.db.region.findMany({
      where: { countryId: { in: countryIds } },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
    const districts = await this.db.district.findMany({
      where: { regionId: { in: regions.map((region) => region.id) } },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
    const districtIds = districts.map((district) => district.id);

    const counts = await this.db.community.groupBy({
      by: ['districtId'],
      where: { districtId: { in: districtIds } },
      _count: { _all: true },
    });
    const communityCounts: Record<string, number> = {};
    for (const row of counts) communityCounts[row.districtId] = row._count._all;

    let communities: CommunityListRecord[] = [];
    if (input.includeCommunities) {
      const rows = await this.db.community.findMany({
        where: { districtId: { in: districtIds } },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          districtId: true,
          name: true,
          slug: true,
          centerLatitude: true,
          centerLongitude: true,
          verificationStatus: true,
          status: true,
          createdById: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      const withBoundary = await this.idsWithBoundary(rows.map((row) => row.id));
      communities = rows.map((row) => ({
        ...row,
        centerLatitude: num(row.centerLatitude),
        centerLongitude: num(row.centerLongitude),
        hasBoundary: withBoundary.has(row.id),
      }));
    }
    return { countries, regions, districts, communities, communityCounts };
  }

  private async idsWithBoundary(ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const rows = await this.db.community.findMany({
      where: { id: { in: ids }, boundary: { not: Prisma.DbNull } },
      select: { id: true },
    });
    return new Set(rows.map((row) => row.id));
  }
}
