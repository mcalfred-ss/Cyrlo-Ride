import { z } from 'zod';

import { latitudeSchema, longitudeSchema } from '../../common/schemas/coordinates.js';

/** Max rows accepted by a single import preview/confirm request. */
export const MAX_IMPORT_ROWS = 5_000;
export const MAX_IMPORT_CSV_CHARS = 900_000;

/** Lowercase kebab-case slug derived from a display name. May return '' for non-latin-only input. */
export function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['\u2019]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
    .replace(/-+$/, '');
}

/** Key-order-independent comparison of normalized GeoJSON boundaries (jsonb reorders keys). */
export function boundariesEqual(a: unknown | null | undefined, b: unknown | null | undefined) {
  const left = a ?? null;
  const right = b ?? null;
  if (left === null || right === null) return left === right;
  const l = left as { type?: unknown; coordinates?: unknown };
  const r = right as { type?: unknown; coordinates?: unknown };
  return l.type === r.type && JSON.stringify(l.coordinates) === JSON.stringify(r.coordinates);
}

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{0,31}$/;

export const geoStatusSchema = z.enum(['ACTIVE', 'INACTIVE']);
export const districtAdminTypeSchema = z.enum(['DISTRICT', 'MUNICIPAL', 'METROPOLITAN', 'OTHER']);

export const geoNameSchema = z.string().trim().min(2).max(120);
export const isoCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/, 'ISO code must be a 2-letter ISO 3166-1 alpha-2 code');
export const geoCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(CODE_PATTERN, 'Code must be 1-32 chars: A-Z, 0-9, "_" or "-"');
export const geoSlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(SLUG_PATTERN, 'Slug must be lowercase kebab-case');

const idParam = z.string().uuid();
export const geoIdParamSchema = z.object({ id: idParam }).strict();

/** Boundary is validated structurally in the service (Polygon / MultiPolygon). */
const boundarySchema = z.unknown();

function centerIsConsistent(value: {
  centerLatitude?: number | null;
  centerLongitude?: number | null;
}): boolean {
  return (
    (value.centerLatitude === undefined) === (value.centerLongitude === undefined) &&
    (value.centerLatitude === null) === (value.centerLongitude === null)
  );
}

const centerMessage = {
  message: 'centerLatitude and centerLongitude must be provided together',
  path: ['centerLatitude'],
};

const atLeastOne = {
  message: 'At least one field is required',
};

const pagination = {
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  status: geoStatusSchema.optional(),
  q: z.string().trim().max(120).optional(),
};

// ---- Countries ----
export const createCountrySchema = z
  .object({
    name: geoNameSchema,
    isoCode: isoCodeSchema,
    status: geoStatusSchema.optional(),
  })
  .strict();

export const updateCountrySchema = z
  .object({
    name: geoNameSchema.optional(),
    isoCode: isoCodeSchema.optional(),
    status: geoStatusSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, atLeastOne);

export const listCountriesQuerySchema = z.object({ ...pagination }).strict();

// ---- Regions ----
export const createRegionSchema = z
  .object({
    countryId: idParam,
    name: geoNameSchema,
    code: geoCodeSchema,
    status: geoStatusSchema.optional(),
  })
  .strict();

export const updateRegionSchema = z
  .object({
    name: geoNameSchema.optional(),
    code: geoCodeSchema.optional(),
    status: geoStatusSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, atLeastOne);

export const listRegionsQuerySchema = z
  .object({ ...pagination, countryId: idParam.optional() })
  .strict();

// ---- Districts ----
export const createDistrictSchema = z
  .object({
    regionId: idParam,
    name: geoNameSchema,
    code: geoCodeSchema,
    adminType: districtAdminTypeSchema.optional(),
    status: geoStatusSchema.optional(),
  })
  .strict();

export const updateDistrictSchema = z
  .object({
    name: geoNameSchema.optional(),
    code: geoCodeSchema.optional(),
    adminType: districtAdminTypeSchema.optional(),
    status: geoStatusSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, atLeastOne);

export const listDistrictsQuerySchema = z
  .object({ ...pagination, regionId: idParam.optional() })
  .strict();

// ---- Communities ----
export const createCommunitySchema = z
  .object({
    districtId: idParam,
    name: geoNameSchema,
    /** Defaults to slugify(name). */
    slug: geoSlugSchema.optional(),
    centerLatitude: latitudeSchema.optional(),
    centerLongitude: longitudeSchema.optional(),
    /** Optional GeoJSON Polygon/MultiPolygon. Never inferred by the server. */
    boundary: boundarySchema.optional(),
    status: geoStatusSchema.optional(),
  })
  .strict()
  .refine(centerIsConsistent, centerMessage);

export const communityVerificationStatusSchema = z.enum(['UNVERIFIED', 'VERIFIED']);

export const updateCommunitySchema = z
  .object({
    name: geoNameSchema.optional(),
    slug: geoSlugSchema.optional(),
    centerLatitude: latitudeSchema.nullable().optional(),
    centerLongitude: longitudeSchema.nullable().optional(),
    /** `null` clears the boundary. */
    boundary: boundarySchema.optional(),
    /**
     * Operational verification of the community record (not a service-zone boundary).
     * Boundary edits still force UNVERIFIED in the service layer.
     */
    verificationStatus: communityVerificationStatusSchema.optional(),
    status: geoStatusSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, atLeastOne)
  .refine(centerIsConsistent, centerMessage);

export const listCommunitiesQuerySchema = z
  .object({ ...pagination, districtId: idParam.optional() })
  .strict();

// ---- Tree ----
export const geoTreeQuerySchema = z
  .object({
    countryId: idParam.optional(),
    includeCommunities: z
      .enum(['true', 'false'])
      .optional()
      .transform((value) => value === 'true'),
  })
  .strict();

// ---- Import ----
export const importRowShapeSchemas = {
  country: z
    .object({
      entity: z.literal('country'),
      isoCode: isoCodeSchema,
      name: geoNameSchema,
      status: geoStatusSchema.optional(),
    })
    .strict(),
  region: z
    .object({
      entity: z.literal('region'),
      countryIsoCode: isoCodeSchema,
      code: geoCodeSchema,
      name: geoNameSchema,
      status: geoStatusSchema.optional(),
    })
    .strict(),
  district: z
    .object({
      entity: z.literal('district'),
      countryIsoCode: isoCodeSchema,
      regionCode: geoCodeSchema,
      code: geoCodeSchema,
      name: geoNameSchema,
      adminType: districtAdminTypeSchema.optional(),
      status: geoStatusSchema.optional(),
    })
    .strict(),
  community: z
    .object({
      entity: z.literal('community'),
      countryIsoCode: isoCodeSchema,
      regionCode: geoCodeSchema,
      districtCode: geoCodeSchema,
      name: geoNameSchema,
      slug: geoSlugSchema.optional(),
      centerLatitude: latitudeSchema.optional(),
      centerLongitude: longitudeSchema.optional(),
      boundary: boundarySchema.optional(),
      status: geoStatusSchema.optional(),
    })
    .strict(),
};

export const importRowSchema = z.discriminatedUnion('entity', [
  importRowShapeSchemas.country,
  importRowShapeSchemas.region,
  importRowShapeSchemas.district,
  importRowShapeSchemas.community,
]);

export const IMPORT_CSV_COLUMNS = [
  'entity',
  'isoCode',
  'countryIsoCode',
  'regionCode',
  'districtCode',
  'code',
  'name',
  'slug',
  'adminType',
  'status',
  'centerLatitude',
  'centerLongitude',
  'boundary',
] as const;

const fingerprintSchema = z
  .string()
  .regex(/^[a-f0-9]{64}$/, 'fingerprint must be a sha256 hex digest');

const importJsonBody = z
  .object({
    format: z.literal('json'),
    /** Row-level validation happens in the import service so previews can report per-row errors. */
    rows: z.array(z.unknown()).min(1).max(MAX_IMPORT_ROWS),
  })
  .strict();

const importCsvBody = z
  .object({
    format: z.literal('csv'),
    csv: z.string().min(1).max(MAX_IMPORT_CSV_CHARS),
  })
  .strict();

export const importPreviewSchema = z.discriminatedUnion('format', [importJsonBody, importCsvBody]);

export const importConfirmSchema = z.discriminatedUnion('format', [
  importJsonBody.extend({ fingerprint: fingerprintSchema.optional() }).strict(),
  importCsvBody.extend({ fingerprint: fingerprintSchema.optional() }).strict(),
]);

export type CreateCountryInput = z.infer<typeof createCountrySchema>;
export type UpdateCountryInput = z.infer<typeof updateCountrySchema>;
export type ListCountriesQuery = z.infer<typeof listCountriesQuerySchema>;
export type CreateRegionInput = z.infer<typeof createRegionSchema>;
export type UpdateRegionInput = z.infer<typeof updateRegionSchema>;
export type ListRegionsQuery = z.infer<typeof listRegionsQuerySchema>;
export type CreateDistrictInput = z.infer<typeof createDistrictSchema>;
export type UpdateDistrictInput = z.infer<typeof updateDistrictSchema>;
export type ListDistrictsQuery = z.infer<typeof listDistrictsQuerySchema>;
export type CreateCommunityInput = z.infer<typeof createCommunitySchema>;
export type UpdateCommunityInput = z.infer<typeof updateCommunitySchema>;
export type ListCommunitiesQuery = z.infer<typeof listCommunitiesQuerySchema>;
export type GeoTreeQuery = z.infer<typeof geoTreeQuerySchema>;
export type ImportRow = z.infer<typeof importRowSchema>;
export type ImportPreviewInput = z.infer<typeof importPreviewSchema>;
export type ImportConfirmInput = z.infer<typeof importConfirmSchema>;
