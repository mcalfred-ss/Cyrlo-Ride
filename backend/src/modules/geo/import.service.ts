import { createHash } from 'node:crypto';

import { AppError } from '../../common/errors/app-error.js';
import type { AuditService } from '../audit/module.service.js';
import { validateAndNormalizeBoundary } from '../service-zones/zone-geometry.js';
import {
  IMPORT_CSV_COLUMNS,
  MAX_IMPORT_ROWS,
  boundariesEqual,
  importRowSchema,
  slugify,
  type ImportConfirmInput,
  type ImportPreviewInput,
  type ImportRow,
} from './module.schema.js';
import type { GeoRepository, GeoStatus } from './module.types.js';

export type ImportEntity = ImportRow['entity'];
export type ImportRowAction = 'create' | 'update' | 'unchanged' | 'invalid';

export interface ImportRowResult {
  /** 1-based position of the row within the submitted rows / CSV data rows. */
  rowNumber: number;
  entity: ImportEntity | null;
  key: string | null;
  action: ImportRowAction;
  errors: string[];
  /** Present only after a confirmed (applied) import. */
  id?: string;
}

export interface ImportSummary {
  total: number;
  create: number;
  update: number;
  unchanged: number;
  invalid: number;
  byEntity: Record<ImportEntity, Record<ImportRowAction, number>>;
}

export interface ImportReport {
  fingerprint: string;
  valid: boolean;
  applied: boolean;
  summary: ImportSummary;
  rows: ImportRowResult[];
}

export interface GeoImportService {
  preview(input: ImportPreviewInput): Promise<ImportReport>;
  confirm(actorId: string, input: ImportConfirmInput, ip?: string): Promise<ImportReport>;
}

export interface GeoImportServiceDeps {
  audit: AuditService;
}

interface RawRow {
  rowNumber: number;
  value: unknown;
  parseErrors: string[];
}

interface ParentRef {
  id: string;
  status: GeoStatus;
}

const ENTITY_ORDER: Record<ImportEntity, number> = {
  country: 0,
  region: 1,
  district: 2,
  community: 3,
};

export class GeoImportServiceImpl implements GeoImportService {
  constructor(
    private readonly repository: GeoRepository,
    private readonly deps: GeoImportServiceDeps,
  ) {}

  async preview(input: ImportPreviewInput): Promise<ImportReport> {
    const raws = toRawRows(input);
    return runImport(this.repository, raws, { dryRun: true, actorId: '' });
  }

  async confirm(actorId: string, input: ImportConfirmInput, ip?: string): Promise<ImportReport> {
    const raws = toRawRows(input);
    const fingerprint = fingerprintOf(raws);
    if (input.fingerprint && input.fingerprint !== fingerprint) {
      throw new AppError({
        status: 409,
        code: 'CONFLICT',
        message: 'Import payload does not match the previewed fingerprint; run preview again',
      });
    }

    // Validate everything (against current DB state) before writing anything.
    const preview = await runImport(this.repository, raws, { dryRun: true, actorId });
    if (!preview.valid) throw invalidImportError(preview);

    // Apply atomically. Natural-key upserts make re-running the same payload a no-op.
    const applied = await this.repository.withTransaction(async (tx) => {
      const report = await runImport(tx, raws, { dryRun: false, actorId });
      if (!report.valid) throw invalidImportError(report);
      return report;
    });

    await this.deps.audit.record({
      actorId,
      action: 'geo.import.confirmed',
      entityType: 'geo_import',
      entityId: fingerprint,
      metadata: {
        format: input.format,
        fingerprint,
        total: applied.summary.total,
        create: applied.summary.create,
        update: applied.summary.update,
        unchanged: applied.summary.unchanged,
        byEntity: applied.summary.byEntity,
      },
      ipAddress: ip,
    });
    return applied;
  }
}

function invalidImportError(report: ImportReport): AppError {
  const invalid = report.rows.filter((row) => row.action === 'invalid');
  return new AppError({
    status: 400,
    code: 'VALIDATION_ERROR',
    message: `Import contains ${invalid.length} invalid row(s); nothing was written`,
    details: invalid.slice(0, 50).flatMap((row) =>
      row.errors.map((message) => ({ path: `rows.${row.rowNumber}`, message })),
    ),
  });
}

function fingerprintOf(raws: RawRow[]): string {
  return createHash('sha256')
    .update(JSON.stringify(raws.map((row) => row.value ?? null)))
    .digest('hex');
}

// ---------------------------------------------------------------------------
// Input parsing (JSON rows or CSV text)
// ---------------------------------------------------------------------------

function toRawRows(input: ImportPreviewInput): RawRow[] {
  if (input.format === 'json') {
    return input.rows.map((value, index) => ({ rowNumber: index + 1, value, parseErrors: [] }));
  }
  return csvToRawRows(input.csv);
}

const NUMERIC_COLUMNS = new Set(['centerLatitude', 'centerLongitude']);

function csvToRawRows(csv: string): RawRow[] {
  const records = parseCsvRecords(csv);
  if (records.length < 2) {
    throw validationError('CSV must contain a header row and at least one data row');
  }
  const header = records[0]!.map((cell) => cell.trim());
  const allowed = new Set<string>(IMPORT_CSV_COLUMNS);
  const seen = new Set<string>();
  for (const column of header) {
    if (!allowed.has(column)) throw validationError(`Unknown CSV column "${column}"`);
    if (seen.has(column)) throw validationError(`Duplicate CSV column "${column}"`);
    seen.add(column);
  }
  if (!seen.has('entity')) throw validationError('CSV must include an "entity" column');
  const dataRecords = records.slice(1);
  if (dataRecords.length > MAX_IMPORT_ROWS) {
    throw validationError(`Import is limited to ${MAX_IMPORT_ROWS} rows`);
  }

  return dataRecords.map((record, index) => {
    const parseErrors: string[] = [];
    const value: Record<string, unknown> = {};
    if (record.length > header.length && record.slice(header.length).some((c) => c.trim() !== '')) {
      parseErrors.push('Row has more cells than the header');
    }
    header.forEach((column, columnIndex) => {
      const cell = (record[columnIndex] ?? '').trim();
      if (cell === '') return;
      if (NUMERIC_COLUMNS.has(column)) {
        const parsed = Number(cell);
        if (Number.isNaN(parsed)) parseErrors.push(`${column} must be a number`);
        else value[column] = parsed;
      } else if (column === 'boundary') {
        try {
          value[column] = JSON.parse(cell);
        } catch {
          parseErrors.push('boundary must be valid GeoJSON text');
        }
      } else {
        value[column] = cell;
      }
    });
    return { rowNumber: index + 1, value, parseErrors };
  });
}

/** Minimal RFC 4180 parser: quoted fields, doubled quotes, CRLF/LF/CR, embedded newlines. */
export function parseCsvRecords(input: string): string[][] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const records: string[][] = [];
  let record: string[] = [];
  let cell = '';
  let inQuotes = false;
  let cellStarted = false;

  const endCell = () => {
    record.push(cell);
    cell = '';
    cellStarted = false;
  };
  const endRecord = () => {
    endCell();
    if (record.some((entry) => entry.trim() !== '')) records.push(record);
    record = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]!;
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"' && !cellStarted) {
      inQuotes = true;
      cellStarted = true;
    } else if (char === ',') {
      endCell();
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      endRecord();
    } else {
      cell += char;
      cellStarted = true;
    }
  }
  if (inQuotes) throw validationError('CSV contains an unterminated quoted field');
  if (cellStarted || cell !== '' || record.length > 0) endRecord();
  return records;
}

function validationError(message: string): AppError {
  return new AppError({ status: 400, code: 'VALIDATION_ERROR', message });
}

// ---------------------------------------------------------------------------
// Import engine: one code path for preview (dryRun) and confirm (apply)
// ---------------------------------------------------------------------------

interface ParsedRow {
  index: number;
  rawRow: RawRow;
  row: ImportRow;
  key: string;
  /** Community slug (explicit or derived). */
  slug?: string;
}

function isPending(id: string): boolean {
  return id.startsWith('pending:');
}

function keyFor(row: ImportRow, slug?: string): string {
  switch (row.entity) {
    case 'country':
      return `country:${row.isoCode}`;
    case 'region':
      return `region:${row.countryIsoCode}/${row.code}`;
    case 'district':
      return `district:${row.countryIsoCode}/${row.regionCode}/${row.code}`;
    case 'community':
      return `community:${row.countryIsoCode}/${row.regionCode}/${row.districtCode}/${slug ?? ''}`;
  }
}

async function runImport(
  repo: GeoRepository,
  raws: RawRow[],
  options: { dryRun: boolean; actorId: string },
): Promise<ImportReport> {
  const results: ImportRowResult[] = raws.map((raw) => ({
    rowNumber: raw.rowNumber,
    entity: null,
    key: null,
    action: 'invalid',
    errors: [],
  }));
  /** natural key -> first error, so children can explain why their parent is unusable. */
  const invalidKeys = new Map<string, string>();

  // Stage 1: shape validation + in-batch duplicate detection.
  const parsed: ParsedRow[] = [];
  const seenKeys = new Map<string, number>();
  raws.forEach((rawRow, index) => {
    const result = results[index]!;
    if (rawRow.parseErrors.length > 0) {
      result.errors.push(...rawRow.parseErrors);
    }
    const shape = importRowSchema.safeParse(rawRow.value);
    if (!shape.success) {
      for (const issue of shape.error.issues) {
        const path = issue.path.join('.');
        result.errors.push(path ? `${path}: ${issue.message}` : issue.message);
      }
      return;
    }
    const row = shape.data;
    result.entity = row.entity;

    let slug: string | undefined;
    if (row.entity === 'community') {
      slug = row.slug ?? slugify(row.name);
      if (!slug) {
        result.errors.push('slug: could not derive a slug from name; provide an explicit slug');
      }
      if ((row.centerLatitude === undefined) !== (row.centerLongitude === undefined)) {
        result.errors.push('centerLatitude and centerLongitude must be provided together');
      }
    }
    const key = keyFor(row, slug);
    result.key = key;
    const firstSeen = seenKeys.get(key);
    const isDuplicate = firstSeen !== undefined;
    if (isDuplicate) {
      result.errors.push(`Duplicate of row ${firstSeen} in this import (${key})`);
    } else {
      seenKeys.set(key, rawRow.rowNumber);
    }
    if (result.errors.length === 0) {
      parsed.push({ index, rawRow, row, key, slug });
    } else if (!isDuplicate) {
      // A duplicate must not poison the first (possibly valid) occurrence of the same key.
      invalidKeys.set(key, result.errors[0]!);
    }
  });

  // Stage 2: parent-ordered resolution and planning/applying.
  const ctx = new ImportContext(repo, options, invalidKeys);
  const ordered = [...parsed].sort(
    (a, b) => ENTITY_ORDER[a.row.entity] - ENTITY_ORDER[b.row.entity] || a.index - b.index,
  );
  for (const item of ordered) {
    const result = results[item.index]!;
    try {
      const outcome = await ctx.process(item);
      result.action = outcome.action;
      if (outcome.id && !options.dryRun) result.id = outcome.id;
    } catch (error) {
      if (
        error instanceof RowError ||
        (error instanceof AppError && error.code === 'VALIDATION_ERROR')
      ) {
        result.errors.push(error.message);
        invalidKeys.set(item.key, error.message);
      } else {
        throw error;
      }
    }
  }

  for (const result of results) {
    if (result.errors.length > 0) result.action = 'invalid';
  }
  return buildReport(raws, results, options.dryRun);
}

class RowError extends Error {}

function buildReport(raws: RawRow[], rows: ImportRowResult[], dryRun: boolean): ImportReport {
  const emptyCounts = (): Record<ImportRowAction, number> => ({
    create: 0,
    update: 0,
    unchanged: 0,
    invalid: 0,
  });
  const byEntity: ImportSummary['byEntity'] = {
    country: emptyCounts(),
    region: emptyCounts(),
    district: emptyCounts(),
    community: emptyCounts(),
  };
  const summary: ImportSummary = {
    total: rows.length,
    create: 0,
    update: 0,
    unchanged: 0,
    invalid: 0,
    byEntity,
  };
  for (const row of rows) {
    summary[row.action] += 1;
    if (row.entity) byEntity[row.entity][row.action] += 1;
  }
  const valid = summary.invalid === 0;
  return {
    fingerprint: fingerprintOf(raws),
    valid,
    applied: !dryRun && valid,
    summary,
    rows,
  };
}

interface Outcome {
  action: Exclude<ImportRowAction, 'invalid'>;
  id: string;
}

class ImportContext {
  private readonly countries = new Map<string, ParentRef>();
  private readonly regions = new Map<string, ParentRef>();
  private readonly districts = new Map<string, ParentRef>();

  constructor(
    private readonly repo: GeoRepository,
    private readonly options: { dryRun: boolean; actorId: string },
    private readonly invalidKeys: Map<string, string>,
  ) {}

  async process(item: ParsedRow): Promise<Outcome> {
    switch (item.row.entity) {
      case 'country':
        return this.country(item.row);
      case 'region':
        return this.region(item.row);
      case 'district':
        return this.district(item.row);
      case 'community':
        return this.community(item.row, item.slug!);
    }
  }

  // ---- parent resolution (batch-planned rows win over stored rows) ----
  private async resolveCountry(iso: string): Promise<ParentRef> {
    const invalid = this.invalidKeys.get(`country:${iso}`);
    if (invalid) {
      throw new RowError(`Parent country "${iso}" is invalid in this import (${invalid})`);
    }
    const planned = this.countries.get(iso);
    if (planned) return planned;
    const stored = await this.repo.findCountryByIsoCode(iso);
    if (!stored) throw new RowError(`Parent country "${iso}" not found`);
    const ref = { id: stored.id, status: stored.status };
    this.countries.set(iso, ref);
    return ref;
  }

  private async resolveRegion(iso: string, code: string): Promise<ParentRef> {
    const key = `${iso}/${code}`;
    const invalid = this.invalidKeys.get(`region:${key}`);
    if (invalid) {
      throw new RowError(`Parent region "${code}" in "${iso}" is invalid in this import (${invalid})`);
    }
    const planned = this.regions.get(key);
    if (planned) return planned;
    const country = await this.resolveCountry(iso);
    const stored = isPending(country.id) ? null : await this.repo.findRegionByCode(country.id, code);
    if (!stored) throw new RowError(`Parent region "${code}" not found in country "${iso}"`);
    const ref = { id: stored.id, status: stored.status };
    this.regions.set(key, ref);
    return ref;
  }

  private async resolveDistrict(iso: string, regionCode: string, code: string): Promise<ParentRef> {
    const key = `${iso}/${regionCode}/${code}`;
    const invalid = this.invalidKeys.get(`district:${key}`);
    if (invalid) {
      throw new RowError(
        `Parent district "${code}" in "${iso}/${regionCode}" is invalid in this import (${invalid})`,
      );
    }
    const planned = this.districts.get(key);
    if (planned) return planned;
    const region = await this.resolveRegion(iso, regionCode);
    const stored = isPending(region.id) ? null : await this.repo.findDistrictByCode(region.id, code);
    if (!stored) {
      throw new RowError(`Parent district "${code}" not found in region "${iso}/${regionCode}"`);
    }
    const ref = { id: stored.id, status: stored.status };
    this.districts.set(key, ref);
    return ref;
  }

  private assertParentActive(
    existingStatus: GeoStatus | undefined,
    effectiveStatus: GeoStatus,
    parent: ParentRef,
    label: string,
  ) {
    const becomingActive = effectiveStatus === 'ACTIVE' && existingStatus !== 'ACTIVE';
    if (becomingActive && parent.status !== 'ACTIVE') {
      throw new RowError(`Cannot create or activate a child under an inactive ${label}`);
    }
  }

  // ---- entity handlers ----
  private async country(row: Extract<ImportRow, { entity: 'country' }>): Promise<Outcome> {
    const existing = await this.repo.findCountryByIsoCode(row.isoCode);
    if (!existing) {
      const status = row.status ?? 'ACTIVE';
      const id = this.options.dryRun
        ? `pending:country:${row.isoCode}`
        : (
            await this.repo.createCountry({
              name: row.name,
              isoCode: row.isoCode,
              status,
              actorId: this.options.actorId,
            })
          ).id;
      this.countries.set(row.isoCode, { id, status });
      return { action: 'create', id };
    }
    const patch: { name?: string; status?: GeoStatus } = {};
    if (row.name !== existing.name) patch.name = row.name;
    if (row.status && row.status !== existing.status) patch.status = row.status;
    const status = patch.status ?? existing.status;
    this.countries.set(row.isoCode, { id: existing.id, status });
    if (Object.keys(patch).length === 0) return { action: 'unchanged', id: existing.id };
    if (!this.options.dryRun) await this.repo.updateCountry(existing.id, patch);
    return { action: 'update', id: existing.id };
  }

  private async region(row: Extract<ImportRow, { entity: 'region' }>): Promise<Outcome> {
    const country = await this.resolveCountry(row.countryIsoCode);
    const existing = isPending(country.id)
      ? null
      : await this.repo.findRegionByCode(country.id, row.code);
    const status = row.status ?? existing?.status ?? 'ACTIVE';
    this.assertParentActive(existing?.status, status, country, 'country');
    const key = `${row.countryIsoCode}/${row.code}`;

    if (!existing) {
      const id = this.options.dryRun
        ? `pending:region:${key}`
        : (
            await this.repo.createRegion({
              countryId: country.id,
              name: row.name,
              code: row.code,
              status,
              actorId: this.options.actorId,
            })
          ).id;
      this.regions.set(key, { id, status });
      return { action: 'create', id };
    }
    const patch: { name?: string; status?: GeoStatus } = {};
    if (row.name !== existing.name) patch.name = row.name;
    if (status !== existing.status) patch.status = status;
    this.regions.set(key, { id: existing.id, status });
    if (Object.keys(patch).length === 0) return { action: 'unchanged', id: existing.id };
    if (!this.options.dryRun) await this.repo.updateRegion(existing.id, patch);
    return { action: 'update', id: existing.id };
  }

  private async district(row: Extract<ImportRow, { entity: 'district' }>): Promise<Outcome> {
    const region = await this.resolveRegion(row.countryIsoCode, row.regionCode);
    const existing = isPending(region.id)
      ? null
      : await this.repo.findDistrictByCode(region.id, row.code);
    const status = row.status ?? existing?.status ?? 'ACTIVE';
    this.assertParentActive(existing?.status, status, region, 'region');
    const key = `${row.countryIsoCode}/${row.regionCode}/${row.code}`;

    if (!existing) {
      const id = this.options.dryRun
        ? `pending:district:${key}`
        : (
            await this.repo.createDistrict({
              regionId: region.id,
              name: row.name,
              code: row.code,
              adminType: row.adminType ?? 'DISTRICT',
              status,
              actorId: this.options.actorId,
            })
          ).id;
      this.districts.set(key, { id, status });
      return { action: 'create', id };
    }
    const patch: {
      name?: string;
      status?: GeoStatus;
      adminType?: typeof existing.adminType;
    } = {};
    if (row.name !== existing.name) patch.name = row.name;
    if (status !== existing.status) patch.status = status;
    if (row.adminType && row.adminType !== existing.adminType) patch.adminType = row.adminType;
    this.districts.set(key, { id: existing.id, status });
    if (Object.keys(patch).length === 0) return { action: 'unchanged', id: existing.id };
    if (!this.options.dryRun) await this.repo.updateDistrict(existing.id, patch);
    return { action: 'update', id: existing.id };
  }

  private async community(
    row: Extract<ImportRow, { entity: 'community' }>,
    slug: string,
  ): Promise<Outcome> {
    const district = await this.resolveDistrict(
      row.countryIsoCode,
      row.regionCode,
      row.districtCode,
    );
    const existing = isPending(district.id)
      ? null
      : await this.repo.findCommunityBySlug(district.id, slug);
    const status = row.status ?? existing?.status ?? 'ACTIVE';
    this.assertParentActive(existing?.status, status, district, 'district');

    // Boundary is optional; omitted means "leave as is". Never inferred or generated here.
    const boundary =
      row.boundary === undefined ? undefined : validateAndNormalizeBoundary(row.boundary).boundary;

    if (!existing) {
      if (this.options.dryRun) return { action: 'create', id: `pending:community:${slug}` };
      const created = await this.repo.createCommunity({
        districtId: district.id,
        name: row.name,
        slug,
        centerLatitude: row.centerLatitude ?? null,
        centerLongitude: row.centerLongitude ?? null,
        boundary: boundary ?? null,
        status,
        actorId: this.options.actorId,
      });
      return { action: 'create', id: created.id };
    }

    const patch: {
      name?: string;
      status?: GeoStatus;
      centerLatitude?: number | null;
      centerLongitude?: number | null;
      boundary?: unknown;
      verificationStatus?: 'UNVERIFIED';
    } = {};
    if (row.name !== existing.name) patch.name = row.name;
    if (status !== existing.status) patch.status = status;
    if (
      row.centerLatitude !== undefined &&
      row.centerLongitude !== undefined &&
      (row.centerLatitude !== existing.centerLatitude ||
        row.centerLongitude !== existing.centerLongitude)
    ) {
      patch.centerLatitude = row.centerLatitude;
      patch.centerLongitude = row.centerLongitude;
    }
    if (boundary !== undefined && !boundariesEqual(boundary, existing.boundary)) {
      patch.boundary = boundary;
      if (existing.verificationStatus === 'VERIFIED') patch.verificationStatus = 'UNVERIFIED';
    }
    if (Object.keys(patch).length === 0) return { action: 'unchanged', id: existing.id };
    if (!this.options.dryRun) await this.repo.updateCommunity(existing.id, patch);
    return { action: 'update', id: existing.id };
  }
}
