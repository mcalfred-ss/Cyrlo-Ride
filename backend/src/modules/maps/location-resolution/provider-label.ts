/**
 * Parse a flat provider reverse-geocode label into address parts.
 * Never invents missing components — only classifies what the string contains.
 */

const COARSE_TOKENS = new Set([
  'ghana',
  'gh',
  'ashanti',
  'ashanti region',
  'asante',
  'kumasi',
  'greater kumasi',
  'west africa',
]);

export interface ParsedProviderLabel {
  raw: string | null;
  parts: string[];
  locality: string | null;
  neighbourhood: string | null;
  city: string | null;
  district: string | null;
  region: string | null;
  country: string | null;
  /** True when the label is only city/region/country level. */
  isCoarse: boolean;
}

function normalizeKey(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
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

export function parseProviderLabel(label: string | null | undefined): ParsedProviderLabel {
  const raw = label?.trim() || null;
  if (!raw) {
    return {
      raw: null,
      parts: [],
      locality: null,
      neighbourhood: null,
      city: null,
      district: null,
      region: null,
      country: null,
      isCoarse: true,
    };
  }

  const parts = raw
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);

  let country: string | null = null;
  let region: string | null = null;
  let district: string | null = null;
  let city: string | null = null;
  let neighbourhood: string | null = null;
  let locality: string | null = null;

  const remaining: string[] = [];

  for (const part of parts) {
    const key = normalizeKey(part);
    if (key === 'ghana' || key === 'gh') {
      country = 'Ghana';
      continue;
    }
    if (key === 'ashanti' || key === 'ashanti region' || key === 'asante') {
      region = 'Ashanti Region';
      continue;
    }
    if (key.includes('region') && !region) {
      region = titleCasePlace(part.replace(/\s+region$/i, '') + ' Region');
      continue;
    }
    if (/\bdistrict\b/i.test(part) || /\bmunicipal\b/i.test(part)) {
      district = titleCasePlace(part);
      continue;
    }
    if (key === 'kumasi' || key === 'greater kumasi') {
      city = 'Kumasi';
      continue;
    }
    remaining.push(part);
  }

  if (remaining.length >= 2) {
    locality = titleCasePlace(remaining[0]!);
    neighbourhood = titleCasePlace(remaining[1]!);
  } else if (remaining.length === 1) {
    const only = remaining[0]!;
    const key = normalizeKey(only);
    if (!COARSE_TOKENS.has(key)) {
      locality = titleCasePlace(only);
    }
  }

  const useful = parts.filter((p) => !COARSE_TOKENS.has(normalizeKey(p)));
  const isCoarse =
    useful.length === 0 ||
    (Boolean(city || region || country) && !locality && !neighbourhood && !district);

  return {
    raw,
    parts,
    locality,
    neighbourhood,
    city,
    district,
    region,
    country,
    isCoarse,
  };
}

export function isCoarseProviderLocality(value: string | null): boolean {
  if (!value) return true;
  return COARSE_TOKENS.has(normalizeKey(value));
}
