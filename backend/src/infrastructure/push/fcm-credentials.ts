import { readFileSync } from 'node:fs';

export interface FcmServiceAccount {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  token_uri?: string;
}

/**
 * Load a Google service-account JSON from a filesystem path.
 * Never log the private key or full JSON.
 */
export function loadFcmServiceAccountFile(filePath: string): FcmServiceAccount {
  const trimmed = filePath.trim();
  if (!trimmed) {
    throw new Error('FCM_SERVICE_ACCOUNT_FILE is empty');
  }
  let raw: string;
  try {
    raw = readFileSync(trimmed, 'utf8');
  } catch {
    throw new Error(`FCM service account file is not readable: ${trimmed}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('FCM service account file is not valid JSON');
  }
  return assertServiceAccountShape(parsed);
}

export function assertServiceAccountShape(value: unknown): FcmServiceAccount {
  if (!value || typeof value !== 'object') {
    throw new Error('FCM service account must be a JSON object');
  }
  const row = value as Record<string, unknown>;
  const required = [
    'type',
    'project_id',
    'private_key_id',
    'private_key',
    'client_email',
    'client_id',
  ] as const;
  for (const key of required) {
    if (typeof row[key] !== 'string' || (row[key] as string).trim().length === 0) {
      throw new Error(`FCM service account missing field: ${key}`);
    }
  }
  if (row.type !== 'service_account') {
    throw new Error('FCM service account type must be service_account');
  }
  return {
    type: row.type,
    project_id: row.project_id as string,
    private_key_id: row.private_key_id as string,
    private_key: row.private_key as string,
    client_email: row.client_email as string,
    client_id: row.client_id as string,
    token_uri: typeof row.token_uri === 'string' ? row.token_uri : undefined,
  };
}

/** Safe descriptor for logs/health — never includes secrets. */
export function describeServiceAccount(account: FcmServiceAccount): {
  projectId: string;
  clientEmail: string;
} {
  return {
    projectId: account.project_id,
    clientEmail: account.client_email,
  };
}
