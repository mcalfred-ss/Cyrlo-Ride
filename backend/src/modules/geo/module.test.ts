import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { Permission, staffRoleHasPermission } from '../../common/authz/permissions.js';
import { StaffRole } from '../../common/types/staff-roles.js';
import { MemoryAuditService } from '../audit/module.service.js';
import { GeoImportServiceImpl, parseCsvRecords } from './import.service.js';
import { MemoryGeoRepository } from './memory-geo-repository.js';
import { geoAccess } from './module.permissions.js';
import {
  createCommunitySchema,
  geoTreeQuerySchema,
  importConfirmSchema,
  slugify,
  updateCommunitySchema,
} from './module.schema.js';
import { GeoServiceImpl } from './module.service.js';

/** Synthetic square used only for geometry unit tests — not a real boundary. */
const testPolygon = {
  type: 'Polygon' as const,
  coordinates: [
    [
      [-1.63, 6.68],
      [-1.62, 6.68],
      [-1.62, 6.69],
      [-1.63, 6.69],
      [-1.63, 6.68],
    ],
  ],
};
const otherPolygon = {
  type: 'Polygon' as const,
  coordinates: [
    [
      [-1.5, 6.5],
      [-1.4, 6.5],
      [-1.4, 6.6],
      [-1.5, 6.6],
      [-1.5, 6.5],
    ],
  ],
};

const actorId = randomUUID();
const q = { page: 1, pageSize: 50 };

function setup() {
  const repo = new MemoryGeoRepository();
  const audit = new MemoryAuditService();
  const service = new GeoServiceImpl(repo, { audit });
  const imports = new GeoImportServiceImpl(repo, { audit });
  return { repo, audit, service, imports };
}

async function seedHierarchy(service: GeoServiceImpl) {
  const country = await service.createCountry(actorId, { name: 'Testland', isoCode: 'TL' });
  const region = await service.createRegion(actorId, {
    countryId: country.id,
    name: 'North Region',
    code: 'NR',
  });
  const district = await service.createDistrict(actorId, {
    regionId: region.id,
    name: 'Alpha District',
    code: 'ALP',
  });
  return { country, region, district };
}

async function expectAppError(promise: Promise<unknown>, status: number, message?: RegExp) {
  await expect(promise).rejects.toMatchObject({ name: 'AppError', status });
  if (message) await expect(promise).rejects.toThrow(message);
}

describe('geo permissions mapping', () => {
  it('maps new permissions to staff roles', () => {
    expect(staffRoleHasPermission('SUPER_ADMIN', Permission.ManageGeoHierarchy)).toBe(true);
    expect(staffRoleHasPermission('SUPER_ADMIN', Permission.VerifyServiceZones)).toBe(true);
    expect(staffRoleHasPermission('SUPER_ADMIN', Permission.ViewGeoCoverage)).toBe(true);

    for (const role of ['OPERATIONS_ADMIN', 'FINANCE_ADMIN', 'SUPPORT_ADMIN'] as const) {
      expect(staffRoleHasPermission(role, Permission.ManageGeoHierarchy)).toBe(false);
      expect(staffRoleHasPermission(role, Permission.VerifyServiceZones)).toBe(false);
      expect(staffRoleHasPermission(role, Permission.ViewGeoCoverage)).toBe(true);
    }
  });

  it('derives route access: read for all staff, community write for ops, hierarchy/import for super only', () => {
    expect(geoAccess.canRead(StaffRole.SuperAdmin)).toBe(true);
    expect(geoAccess.canRead(StaffRole.OperationsAdmin)).toBe(true);
    expect(geoAccess.canRead(StaffRole.FinanceAdmin)).toBe(true);
    expect(geoAccess.canRead(StaffRole.SupportAdmin)).toBe(true);

    expect(geoAccess.canWriteCommunities(StaffRole.SuperAdmin)).toBe(true);
    expect(geoAccess.canWriteCommunities(StaffRole.OperationsAdmin)).toBe(true);
    expect(geoAccess.canWriteCommunities(StaffRole.FinanceAdmin)).toBe(false);
    expect(geoAccess.canWriteCommunities(StaffRole.SupportAdmin)).toBe(false);

    for (const check of [geoAccess.canWriteHierarchy, geoAccess.canImport]) {
      expect(check(StaffRole.SuperAdmin)).toBe(true);
      expect(check(StaffRole.OperationsAdmin)).toBe(false);
      expect(check(StaffRole.FinanceAdmin)).toBe(false);
      expect(check(StaffRole.SupportAdmin)).toBe(false);
    }
  });
});

describe('slugify', () => {
  it('produces lowercase kebab slugs', () => {
    expect(slugify('  Kwame Nkrumah  Circle ')).toBe('kwame-nkrumah-circle');
    expect(slugify("Ayeduase / Kotei (Old Town)")).toBe('ayeduase-kotei-old-town');
    expect(slugify('Café Étoile')).toBe('cafe-etoile');
    expect(slugify("St. Mary's")).toBe('st-marys');
    expect(slugify('***')).toBe('');
  });
});

describe('schemas', () => {
  it('requires community center coordinates together and never infers them', () => {
    const districtId = randomUUID();
    expect(
      createCommunitySchema.safeParse({ districtId, name: 'Place', centerLatitude: 6.6 }).success,
    ).toBe(false);
    expect(createCommunitySchema.safeParse({ districtId, name: 'Place' }).success).toBe(true);
    expect(
      createCommunitySchema.safeParse({
        districtId,
        name: 'Place',
        centerLatitude: 6.6,
        centerLongitude: -1.6,
      }).success,
    ).toBe(true);
    expect(updateCommunitySchema.safeParse({}).success).toBe(false);
    expect(
      updateCommunitySchema.safeParse({ centerLatitude: null, centerLongitude: null }).success,
    ).toBe(true);
    expect(updateCommunitySchema.safeParse({ centerLatitude: null, centerLongitude: 1 }).success).toBe(
      false,
    );
  });

  it('parses tree query flags and confirm fingerprints', () => {
    expect(geoTreeQuerySchema.parse({}).includeCommunities).toBe(false);
    expect(geoTreeQuerySchema.parse({ includeCommunities: 'true' }).includeCommunities).toBe(true);
    expect(
      importConfirmSchema.safeParse({ format: 'json', rows: [{}], fingerprint: 'nope' }).success,
    ).toBe(false);
  });
});

describe('hierarchy create + audit', () => {
  it('creates country → region → district → community with defaults and audit entries', async () => {
    const { service, audit } = setup();
    const { district } = await seedHierarchy(service);

    const community = await service.createCommunity(actorId, {
      districtId: district.id,
      name: 'Kotei Old Town',
    });
    expect(community.slug).toBe('kotei-old-town');
    expect(community.status).toBe('ACTIVE');
    expect(community.verificationStatus).toBe('UNVERIFIED');
    expect(community.boundary).toBeNull();
    expect(community.centerLatitude).toBeNull();
    expect(community.centerLongitude).toBeNull();

    expect(audit.entries.map((entry) => entry.action)).toEqual([
      'geo.country.created',
      'geo.region.created',
      'geo.district.created',
      'geo.community.created',
    ]);
    expect(audit.entries.every((entry) => entry.actorId === actorId)).toBe(true);
  });

  it('updates entities and audits the changed fields', async () => {
    const { service, audit } = setup();
    const { country, region, district } = await seedHierarchy(service);
    const community = await service.createCommunity(actorId, {
      districtId: district.id,
      name: 'Somewhere',
    });

    expect((await service.updateCountry(actorId, country.id, { name: 'Testland 2' })).name).toBe(
      'Testland 2',
    );
    expect((await service.updateRegion(actorId, region.id, { name: 'North 2' })).name).toBe('North 2');
    expect(
      (await service.updateDistrict(actorId, district.id, { adminType: 'MUNICIPAL' })).adminType,
    ).toBe('MUNICIPAL');
    const updated = await service.updateCommunity(actorId, community.id, {
      centerLatitude: 6.6,
      centerLongitude: -1.6,
    });
    expect(updated.centerLatitude).toBe(6.6);

    const actions = audit.entries.map((entry) => entry.action);
    expect(actions).toContain('geo.country.updated');
    expect(actions).toContain('geo.region.updated');
    expect(actions).toContain('geo.district.updated');
    expect(actions).toContain('geo.community.updated');
    await expectAppError(service.updateCountry(actorId, randomUUID(), { name: 'Nope' }), 404);
  });

  it('lists with parent filters and builds the tree', async () => {
    const { service } = setup();
    const { country, region, district } = await seedHierarchy(service);
    const otherCountry = await service.createCountry(actorId, { name: 'Otherland', isoCode: 'OL' });
    await service.createRegion(actorId, { countryId: otherCountry.id, name: 'Far', code: 'FR' });
    await service.createCommunity(actorId, { districtId: district.id, name: 'Comm One' });

    const regions = await service.listRegions({ ...q, countryId: country.id });
    expect(regions.items.map((item) => item.code)).toEqual(['NR']);
    expect(regions.meta.total).toBe(1);
    expect((await service.listDistricts({ ...q, regionId: region.id })).items).toHaveLength(1);
    expect(
      (await service.listCommunities({ ...q, districtId: district.id })).items[0]?.hasBoundary,
    ).toBe(false);

    const tree = await service.getTree({ countryId: country.id, includeCommunities: false });
    expect(tree).toHaveLength(1);
    expect(tree[0]?.regions[0]?.districts[0]).toMatchObject({ code: 'ALP', communityCount: 1 });
    expect(tree[0]?.regions[0]?.districts[0]?.communities).toBeUndefined();

    const full = await service.getTree({ includeCommunities: true });
    expect(full).toHaveLength(2);
    const alpha = full.find((c) => c.isoCode === 'TL')!.regions[0]!.districts[0]!;
    expect(alpha.communities?.map((c) => c.slug)).toEqual(['comm-one']);
    await expectAppError(service.getTree({ countryId: randomUUID(), includeCommunities: false }), 404);
  });
});

describe('parent validation', () => {
  it('rejects missing parents', async () => {
    const { service } = setup();
    await expectAppError(
      service.createRegion(actorId, { countryId: randomUUID(), name: 'Orphan', code: 'OR' }),
      404,
      /Parent country not found/,
    );
    await expectAppError(
      service.createDistrict(actorId, { regionId: randomUUID(), name: 'Orphan', code: 'OR' }),
      404,
      /Parent region not found/,
    );
    await expectAppError(
      service.createCommunity(actorId, { districtId: randomUUID(), name: 'Orphan' }),
      404,
      /Parent district not found/,
    );
  });

  it('blocks active children under inactive parents but allows inactive children', async () => {
    const { service } = setup();
    const { country, region, district } = await seedHierarchy(service);
    await service.updateDistrict(actorId, district.id, { status: 'INACTIVE' });
    await service.updateRegion(actorId, region.id, { status: 'INACTIVE' });
    await service.updateCountry(actorId, country.id, { status: 'INACTIVE' });

    await expectAppError(
      service.createRegion(actorId, { countryId: country.id, name: 'New', code: 'NW' }),
      409,
      /inactive country/,
    );
    await expectAppError(
      service.createDistrict(actorId, { regionId: region.id, name: 'New', code: 'NW' }),
      409,
      /inactive region/,
    );
    await expectAppError(
      service.createCommunity(actorId, { districtId: district.id, name: 'New' }),
      409,
      /inactive district/,
    );

    const inactiveChild = await service.createCommunity(actorId, {
      districtId: district.id,
      name: 'Dormant',
      status: 'INACTIVE',
    });
    expect(inactiveChild.status).toBe('INACTIVE');
    await expectAppError(
      service.updateCommunity(actorId, inactiveChild.id, { status: 'ACTIVE' }),
      409,
      /inactive district/,
    );

    // Re-activating top-down works.
    await service.updateCountry(actorId, country.id, { status: 'ACTIVE' });
    await expectAppError(
      service.updateDistrict(actorId, district.id, { status: 'ACTIVE' }),
      409,
      /inactive region/,
    );
    await service.updateRegion(actorId, region.id, { status: 'ACTIVE' });
    await service.updateDistrict(actorId, district.id, { status: 'ACTIVE' });
    expect((await service.updateCommunity(actorId, inactiveChild.id, { status: 'ACTIVE' })).status).toBe(
      'ACTIVE',
    );
  });
});

describe('duplicate detection', () => {
  it('rejects duplicate country iso, region code, district code, and community slug', async () => {
    const { service } = setup();
    const { country, region, district } = await seedHierarchy(service);
    await service.createCommunity(actorId, { districtId: district.id, name: 'Same Name' });

    await expectAppError(
      service.createCountry(actorId, { name: 'Dup', isoCode: 'TL' }),
      409,
      /ISO code/,
    );
    await expectAppError(
      service.createRegion(actorId, { countryId: country.id, name: 'Dup', code: 'NR' }),
      409,
      /Region code/,
    );
    await expectAppError(
      service.createDistrict(actorId, { regionId: region.id, name: 'Dup', code: 'ALP' }),
      409,
      /District code/,
    );
    await expectAppError(
      service.createCommunity(actorId, { districtId: district.id, name: 'Same Name' }),
      409,
      /slug/,
    );
    await expectAppError(
      service.createCommunity(actorId, {
        districtId: district.id,
        name: 'Different',
        slug: 'same-name',
      }),
      409,
      /slug/,
    );
  });

  it('allows the same code/slug under different parents and rejects duplicates on update', async () => {
    const { service } = setup();
    const { country, region, district } = await seedHierarchy(service);
    const otherCountry = await service.createCountry(actorId, { name: 'Otherland', isoCode: 'OL' });
    await service.createRegion(actorId, { countryId: otherCountry.id, name: 'Same Code', code: 'NR' });

    const secondRegion = await service.createRegion(actorId, {
      countryId: country.id,
      name: 'South',
      code: 'SR',
    });
    await expectAppError(service.updateRegion(actorId, secondRegion.id, { code: 'NR' }), 409);
    const secondDistrict = await service.createDistrict(actorId, {
      regionId: region.id,
      name: 'Beta',
      code: 'BET',
    });
    await expectAppError(service.updateDistrict(actorId, secondDistrict.id, { code: 'ALP' }), 409);
    await expectAppError(service.updateCountry(actorId, country.id, { isoCode: 'OL' }), 409);

    const a = await service.createCommunity(actorId, { districtId: district.id, name: 'Alpha' });
    const b = await service.createCommunity(actorId, { districtId: district.id, name: 'Beta' });
    await expectAppError(service.updateCommunity(actorId, b.id, { slug: a.slug }), 409);
    // Same slug in another district is fine.
    const c = await service.createCommunity(actorId, {
      districtId: secondDistrict.id,
      name: 'Alpha',
    });
    expect(c.slug).toBe('alpha');
  });
});

describe('community boundary', () => {
  it('is optional, validated when present, and never invented', async () => {
    const { service } = setup();
    const { district } = await seedHierarchy(service);

    const withBoundary = await service.createCommunity(actorId, {
      districtId: district.id,
      name: 'Bounded',
      boundary: testPolygon,
    });
    expect(withBoundary.boundary).toMatchObject({ type: 'Polygon' });
    expect(withBoundary.centerLatitude).toBeNull();

    await expectAppError(
      service.createCommunity(actorId, {
        districtId: district.id,
        name: 'Bad Shape',
        boundary: { type: 'Point', coordinates: [0, 0] },
      }),
      400,
      /Polygon or MultiPolygon/,
    );
    await expectAppError(
      service.createCommunity(actorId, {
        districtId: district.id,
        name: 'Open Ring',
        boundary: {
          type: 'Polygon',
          coordinates: [
            [
              [0, 0],
              [1, 0],
              [1, 1],
              [0, 1],
              [0.5, 0.5],
            ],
          ],
        },
      }),
      400,
      /closed/,
    );

    const list = await service.listCommunities({ ...q, districtId: district.id });
    expect(list.items.find((item) => item.id === withBoundary.id)?.hasBoundary).toBe(true);
    expect('boundary' in (list.items[0] ?? {})).toBe(false);
  });

  it('resets verification when the boundary changes and supports clearing', async () => {
    const { service, repo } = setup();
    const { district } = await seedHierarchy(service);
    const community = await service.createCommunity(actorId, {
      districtId: district.id,
      name: 'Verified Place',
      boundary: testPolygon,
    });
    // Verification is owned by a separate flow; simulate it directly in the store.
    repo.communities.set(community.id, {
      ...repo.communities.get(community.id)!,
      verificationStatus: 'VERIFIED',
    });

    const renamed = await service.updateCommunity(actorId, community.id, {
      name: 'Verified Place 2',
      boundary: testPolygon,
    });
    expect(renamed.verificationStatus).toBe('VERIFIED');

    const changed = await service.updateCommunity(actorId, community.id, { boundary: otherPolygon });
    expect(changed.verificationStatus).toBe('UNVERIFIED');

    const cleared = await service.updateCommunity(actorId, community.id, { boundary: null });
    expect(cleared.boundary).toBeNull();
    await expectAppError(
      service.updateCommunity(actorId, community.id, { boundary: { type: 'Point' } }),
      400,
    );
  });
});

describe('csv parsing', () => {
  it('handles quotes, escaped quotes, embedded newlines, CRLF and BOM', () => {
    const records = parseCsvRecords(
      '\uFEFFentity,name\r\ncountry,"Land, ""The"" Great"\r\n\r\nregion,"Multi\nline"\n',
    );
    expect(records).toEqual([
      ['entity', 'name'],
      ['country', 'Land, "The" Great'],
      ['region', 'Multi\nline'],
    ]);
    expect(() => parseCsvRecords('a,"b')).toThrow(/unterminated/);
  });
});

describe('import preview', () => {
  const rows = [
    { entity: 'country', isoCode: 'tl', name: 'Testland' },
    { entity: 'region', countryIsoCode: 'TL', code: 'nr', name: 'North Region' },
    {
      entity: 'district',
      countryIsoCode: 'TL',
      regionCode: 'NR',
      code: 'ALP',
      name: 'Alpha District',
    },
    {
      entity: 'community',
      countryIsoCode: 'TL',
      regionCode: 'NR',
      districtCode: 'ALP',
      name: 'Kotei Old Town',
      boundary: testPolygon,
    },
  ];

  it('validates a self-contained batch without writing anything', async () => {
    const { imports, repo, audit } = setup();
    const report = await imports.preview({ format: 'json', rows });
    expect(report.valid).toBe(true);
    expect(report.applied).toBe(false);
    expect(report.summary).toMatchObject({ total: 4, create: 4, invalid: 0 });
    expect(report.rows.map((row) => row.key)).toEqual([
      'country:TL',
      'region:TL/NR',
      'district:TL/NR/ALP',
      'community:TL/NR/ALP/kotei-old-town',
    ]);
    expect(report.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(repo.countries.size + repo.regions.size + repo.districts.size + repo.communities.size).toBe(
      0,
    );
    expect(audit.entries).toHaveLength(0);
  });

  it('is independent of row order (parents resolved by entity rank)', async () => {
    const { imports } = setup();
    const report = await imports.preview({ format: 'json', rows: [...rows].reverse() });
    expect(report.valid).toBe(true);
    expect(report.summary.create).toBe(4);
  });

  it('rejects rows whose parents do not exist', async () => {
    const { imports } = setup();
    const report = await imports.preview({
      format: 'json',
      rows: [
        { entity: 'region', countryIsoCode: 'ZZ', code: 'AA', name: 'Orphan Region' },
        {
          entity: 'district',
          countryIsoCode: 'ZZ',
          regionCode: 'AA',
          code: 'DD',
          name: 'Orphan District',
        },
        {
          entity: 'community',
          countryIsoCode: 'ZZ',
          regionCode: 'AA',
          districtCode: 'DD',
          name: 'Orphan Community',
        },
      ],
    });
    expect(report.valid).toBe(false);
    expect(report.summary.invalid).toBe(3);
    expect(report.rows[0]?.errors[0]).toMatch(/Parent country "ZZ" not found/);
    expect(report.rows[1]?.errors[0]).toMatch(/Parent country "ZZ" not found/);
    expect(report.rows[2]?.errors[0]).toMatch(/Parent country "ZZ" not found/);
  });

  it('rejects stored-parent mismatches, inactive parents, in-batch duplicates, and bad shapes', async () => {
    const { imports, service } = setup();
    const { country, region } = await seedHierarchy(service);
    await service.updateRegion(actorId, region.id, { status: 'INACTIVE' });
    expect(country.isoCode).toBe('TL');

    const report = await imports.preview({
      format: 'json',
      rows: [
        // region exists in TL but district references wrong region code
        {
          entity: 'district',
          countryIsoCode: 'TL',
          regionCode: 'NOPE',
          code: 'D1',
          name: 'Wrong Region',
        },
        // inactive parent region cannot take an active district
        { entity: 'district', countryIsoCode: 'TL', regionCode: 'NR', code: 'D2', name: 'Active Under Inactive' },
        // inactive child is fine
        {
          entity: 'district',
          countryIsoCode: 'TL',
          regionCode: 'NR',
          code: 'D3',
          name: 'Inactive Under Inactive',
          status: 'INACTIVE',
        },
        // duplicate natural key in batch
        { entity: 'district', countryIsoCode: 'TL', regionCode: 'NR', code: 'D3', name: 'Dup', status: 'INACTIVE' },
        // bad shape
        { entity: 'planet', name: 'Mars' },
        { entity: 'country', isoCode: 'TOOLONG', name: 'Bad ISO' },
        {
          entity: 'community',
          countryIsoCode: 'TL',
          regionCode: 'NR',
          districtCode: 'D3',
          name: 'Half Center',
          centerLatitude: 6.5,
        },
        {
          entity: 'community',
          countryIsoCode: 'TL',
          regionCode: 'NR',
          districtCode: 'D3',
          name: 'Bad Boundary',
          status: 'INACTIVE',
          boundary: { type: 'Point', coordinates: [0, 0] },
        },
      ],
    });

    const [wrongRegion, inactiveParent, okChild, dup, planet, badIso, halfCenter, badBoundary] =
      report.rows;
    expect(wrongRegion?.errors[0]).toMatch(/Parent region "NOPE" not found/);
    expect(inactiveParent?.errors[0]).toMatch(/inactive region/);
    expect(okChild?.action).toBe('create');
    expect(dup?.errors[0]).toMatch(/Duplicate of row 3/);
    expect(planet?.action).toBe('invalid');
    expect(badIso?.errors[0]).toMatch(/isoCode/);
    expect(halfCenter?.errors[0]).toMatch(/provided together/);
    expect(badBoundary?.errors[0]).toMatch(/Polygon or MultiPolygon/);
    expect(report.valid).toBe(false);
  });

  it('accepts CSV and surfaces row-level parse errors', async () => {
    const { imports } = setup();
    const csv = [
      'entity,isoCode,countryIsoCode,regionCode,districtCode,code,name,centerLatitude,boundary',
      'country,TL,,,,,Testland,,',
      'region,,TL,,,NR,North Region,,',
      'community,,TL,NR,ALP,,Comm,abc,',
    ].join('\n');
    const report = await imports.preview({ format: 'csv', csv });
    expect(report.summary.total).toBe(3);
    expect(report.rows[0]?.action).toBe('create');
    expect(report.rows[1]?.action).toBe('create');
    expect(report.rows[2]?.errors.join(' ')).toMatch(/centerLatitude must be a number/);

    await expect(imports.preview({ format: 'csv', csv: 'entity,bogus\ncountry,x' })).rejects.toThrow(
      /Unknown CSV column/,
    );
    await expect(imports.preview({ format: 'csv', csv: 'name\nx' })).rejects.toThrow(
      /"entity" column/,
    );
  });
});

describe('import confirm', () => {
  const rows = [
    { entity: 'country', isoCode: 'TL', name: 'Testland' },
    { entity: 'region', countryIsoCode: 'TL', code: 'NR', name: 'North Region' },
    {
      entity: 'district',
      countryIsoCode: 'TL',
      regionCode: 'NR',
      code: 'ALP',
      name: 'Alpha District',
      adminType: 'MUNICIPAL',
    },
    {
      entity: 'community',
      countryIsoCode: 'TL',
      regionCode: 'NR',
      districtCode: 'ALP',
      name: 'Kotei Old Town',
      boundary: testPolygon,
    },
    {
      entity: 'community',
      countryIsoCode: 'TL',
      regionCode: 'NR',
      districtCode: 'ALP',
      name: 'No Geometry Yet',
    },
  ];

  it('upserts by natural keys, is idempotent, and writes a single audit entry per confirm', async () => {
    const { imports, repo, audit } = setup();

    const first = await imports.confirm(actorId, { format: 'json', rows }, '127.0.0.1');
    expect(first.applied).toBe(true);
    expect(first.summary).toMatchObject({ create: 5, update: 0, unchanged: 0, invalid: 0 });
    expect(first.rows.every((row) => typeof row.id === 'string')).toBe(true);
    expect(repo.countries.size).toBe(1);
    expect(repo.regions.size).toBe(1);
    expect(repo.districts.size).toBe(1);
    expect(repo.communities.size).toBe(2);
    const district = [...repo.districts.values()][0]!;
    expect(district.adminType).toBe('MUNICIPAL');
    const community = [...repo.communities.values()].find((c) => c.slug === 'kotei-old-town')!;
    expect(community.createdById).toBe(actorId);
    expect(community.centerLatitude).toBeNull();
    expect(community.verificationStatus).toBe('UNVERIFIED');
    const noGeometry = [...repo.communities.values()].find((c) => c.slug === 'no-geometry-yet')!;
    expect(noGeometry.boundary).toBeNull();

    const second = await imports.confirm(actorId, { format: 'json', rows });
    expect(second.summary).toMatchObject({ create: 0, update: 0, unchanged: 5, invalid: 0 });
    expect(repo.communities.size).toBe(2);
    expect(second.rows.map((row) => row.id)).toEqual(first.rows.map((row) => row.id));

    const importAudits = audit.entries.filter((entry) => entry.action === 'geo.import.confirmed');
    expect(importAudits).toHaveLength(2);
    expect(importAudits[0]).toMatchObject({
      actorId,
      entityType: 'geo_import',
      entityId: first.fingerprint,
      ipAddress: '127.0.0.1',
    });
    expect(importAudits[0]?.metadata).toMatchObject({ create: 5, total: 5 });
  });

  it('updates changed fields only, keeps unspecified fields, and resets verification on boundary change', async () => {
    const { imports, repo } = setup();
    await imports.confirm(actorId, { format: 'json', rows });
    const community = [...repo.communities.values()].find((c) => c.slug === 'kotei-old-town')!;
    repo.communities.set(community.id, { ...community, verificationStatus: 'VERIFIED' });

    const report = await imports.confirm(actorId, {
      format: 'json',
      rows: [
        { entity: 'region', countryIsoCode: 'TL', code: 'NR', name: 'North Region Renamed' },
        {
          entity: 'community',
          countryIsoCode: 'TL',
          regionCode: 'NR',
          districtCode: 'ALP',
          name: 'Kotei Old Town',
          boundary: otherPolygon,
        },
      ],
    });
    expect(report.summary).toMatchObject({ update: 2, create: 0, unchanged: 0 });
    expect([...repo.regions.values()][0]?.name).toBe('North Region Renamed');
    const updated = repo.communities.get(community.id)!;
    expect(updated.verificationStatus).toBe('UNVERIFIED');
    expect(updated.boundary).toMatchObject({ type: 'Polygon' });
    // District adminType untouched because the district row was not part of this import.
    expect([...repo.districts.values()][0]?.adminType).toBe('MUNICIPAL');
  });

  it('rejects the whole batch (writes nothing) when any row is invalid', async () => {
    const { imports, repo, audit } = setup();
    await expectAppError(
      imports.confirm(actorId, {
        format: 'json',
        rows: [
          ...rows,
          { entity: 'region', countryIsoCode: 'ZZ', code: 'AA', name: 'Orphan Region' },
        ],
      }),
      400,
      /invalid row/,
    );
    expect(repo.countries.size + repo.regions.size + repo.districts.size + repo.communities.size).toBe(
      0,
    );
    expect(audit.entries).toHaveLength(0);
  });

  it('rejects a confirm whose fingerprint no longer matches the previewed payload', async () => {
    const { imports, repo } = setup();
    const preview = await imports.preview({ format: 'json', rows });
    await expectAppError(
      imports.confirm(actorId, {
        format: 'json',
        rows: rows.slice(0, 2),
        fingerprint: preview.fingerprint,
      }),
      409,
    );
    expect(repo.countries.size).toBe(0);

    const ok = await imports.confirm(actorId, {
      format: 'json',
      rows,
      fingerprint: preview.fingerprint,
    });
    expect(ok.applied).toBe(true);
  });

  it('does not touch inactive-parent safety: inactive stored parents reject active children on confirm', async () => {
    const { imports, service } = setup();
    const { region } = await seedHierarchy(service);
    await service.updateRegion(actorId, region.id, { status: 'INACTIVE' });
    await expectAppError(
      imports.confirm(actorId, {
        format: 'json',
        rows: [
          { entity: 'district', countryIsoCode: 'TL', regionCode: 'NR', code: 'NEW', name: 'New One' },
        ],
      }),
      400,
      /invalid row/,
    );
  });
});
