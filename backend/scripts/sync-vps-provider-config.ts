/**
 * Allowlisted sync of provider credentials from existing VPS app env files
 * into /etc/cyrlo-ride/providers.env for Cyrlo Ride staging.
 *
 * Security:
 * - Never prints credential values.
 * - Never copies entire source .env files.
 * - Only approved source paths and variable names.
 * - Atomic write + 0640 root:cyrlo-ride.
 * - Paystack: copies only secrets that classify as test (sk_test_...).
 *
 * Usage (on VPS, as root):
 *   npx tsx scripts/sync-vps-provider-config.ts
 *   # or after build: node dist/../scripts via tsx
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const TARGET_DIR = '/etc/cyrlo-ride';
const TARGET_FILE = join(TARGET_DIR, 'providers.env');
const TARGET_GROUP = 'cyrlo-ride';

/** Approved source files only. */
const SOURCE_FILES = [
  '/var/www/cirlo/brolly/apps/api/.env',
  '/var/www/eqostack/server/.env',
  '/var/www/schoolfee/backend/.env',
  '/var/www/stora/api/.env.production',
] as const;

type SourceName = 'cirlo' | 'eqo' | 'school' | 'stora';

const SOURCE_LABEL: Record<(typeof SOURCE_FILES)[number], SourceName> = {
  '/var/www/cirlo/brolly/apps/api/.env': 'cirlo',
  '/var/www/eqostack/server/.env': 'eqo',
  '/var/www/schoolfee/backend/.env': 'school',
  '/var/www/stora/api/.env.production': 'stora',
};

/** Ride target → extraction rules. */
interface MappingRule {
  target: string;
  /** Prefer first present non-empty among these source keys. */
  sources: Array<{ file: (typeof SOURCE_FILES)[number]; key: string }>;
  /** Optional classifier; return false to refuse the value. */
  accept?: (value: string) => boolean;
  required: boolean;
}

function classifyPaystackSecret(value: string): 'test' | 'live' | 'unknown' | 'missing' {
  if (!value) return 'missing';
  if (value.startsWith('sk_test_')) return 'test';
  if (value.startsWith('sk_live_')) return 'live';
  return 'unknown';
}

const MAPPINGS: MappingRule[] = [
  {
    target: 'VYNFY_API_KEY',
    required: true,
    sources: [
      { file: '/var/www/cirlo/brolly/apps/api/.env', key: 'VYNFY_API_KEY' },
      { file: '/var/www/eqostack/server/.env', key: 'VYNFY_API_KEY' },
    ],
  },
  {
    target: 'VYNFY_SENDER_ID',
    required: true,
    sources: [
      { file: '/var/www/cirlo/brolly/apps/api/.env', key: 'VYNFY_SMS_SENDER' },
      { file: '/var/www/eqostack/server/.env', key: 'VYNFY_SMS_SENDER' },
      { file: '/var/www/cirlo/brolly/apps/api/.env', key: 'VYNFY_SENDER_ID' },
    ],
  },
  {
    target: 'PAYSTACK_SECRET_KEY',
    required: true,
    sources: [
      { file: '/var/www/cirlo/brolly/apps/api/.env', key: 'PAYSTACK_SECRET_KEY' },
      { file: '/var/www/schoolfee/backend/.env', key: 'PAYSTACK_SECRET_KEY' },
      { file: '/var/www/stora/api/.env.production', key: 'PAYSTACK_SECRET_KEY' },
      { file: '/var/www/eqostack/server/.env', key: 'PAYSTACK_SECRET_KEY' },
    ],
    accept: (value) => classifyPaystackSecret(value) === 'test',
  },
];

function parseEnvFile(path: string): Record<string, string> | null {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return null;
  }
  const out: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    let body = trimmed.startsWith('export ') ? trimmed.slice(7).trim() : trimmed;
    const eq = body.indexOf('=');
    if (eq <= 0) continue;
    const key = body.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = body.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function main(): void {
  const parsed = new Map<string, Record<string, string>>();
  const missingFiles: string[] = [];
  for (const file of SOURCE_FILES) {
    const env = parseEnvFile(file);
    if (!env) {
      missingFiles.push(file);
      continue;
    }
    parsed.set(file, env);
  }

  const resolved: Record<string, string> = {};
  const reports: string[] = [];
  const blockers: string[] = [];

  for (const rule of MAPPINGS) {
    let found = false;
    for (const src of rule.sources) {
      const env = parsed.get(src.file);
      if (!env) continue;
      const raw = (env[src.key] ?? '').trim();
      if (!raw) continue;
      if (rule.accept && !rule.accept(raw)) {
        const label = SOURCE_LABEL[src.file];
        if (rule.target === 'PAYSTACK_SECRET_KEY') {
          reports.push(
            `skip ${rule.target} from ${label}:${src.key} class=${classifyPaystackSecret(raw)}`,
          );
        } else {
          reports.push(`skip ${rule.target} from ${label}:${src.key} (rejected by accept)`);
        }
        continue;
      }
      resolved[rule.target] = raw;
      reports.push(`mapped ${rule.target} from ${SOURCE_LABEL[src.file]}:${src.key}`);
      found = true;
      break;
    }
    if (!found) {
      if (rule.required) {
        blockers.push(`missing required target ${rule.target}`);
      } else {
        reports.push(`optional ${rule.target} not found`);
      }
    }
  }

  for (const line of reports) {
    console.log(line);
  }
  if (missingFiles.length > 0) {
    console.log(`unreadable_sources=${missingFiles.length}`);
  }

  if (blockers.length > 0) {
    for (const b of blockers) console.error(b);
    // Still write whatever was safely resolved (e.g. Vynfy) so partial progress is kept.
  }

  mkdirSync(TARGET_DIR, { recursive: true, mode: 0o750 });

  const header = [
    '# Cyrlo Ride staging provider credentials — generated by sync-vps-provider-config',
    '# Do not commit. Do not share. Allowlisted keys only.',
    `# generated_at=${new Date().toISOString()}`,
    '',
  ];
  const body = Object.keys(resolved)
    .sort()
    .map((key) => `${key}=${shellQuote(resolved[key])}`);
  const content = `${header.join('\n')}${body.join('\n')}\n`;

  const tmp = `${TARGET_FILE}.tmp.${process.pid}`;
  try {
    writeFileSync(tmp, content, { mode: 0o640, encoding: 'utf8' });
    // Ensure ownership/mode via shell helpers when available (root expected).
    try {
      execFileSync('chown', [`root:${TARGET_GROUP}`, tmp], { stdio: 'ignore' });
      execFileSync('chmod', ['0640', tmp], { stdio: 'ignore' });
      execFileSync('chown', [`root:${TARGET_GROUP}`, TARGET_DIR], { stdio: 'ignore' });
      execFileSync('chmod', ['0750', TARGET_DIR], { stdio: 'ignore' });
    } catch {
      // Ownership may fail off-VPS; still atomic replace.
    }
    renameSync(tmp, TARGET_FILE);
  } catch (error) {
    try {
      unlinkSync(tmp);
    } catch {
      /* ignore */
    }
    throw error;
  }

  console.log(`wrote ${TARGET_FILE}`);
  console.log(`keys=${Object.keys(resolved).sort().join(',') || '(none)'}`);

  if (blockers.length > 0) {
    process.exitCode = 2;
  }
}

main();
