export function getApiBaseUrl(): string {
  return (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? '';
}

export function getEnvironmentLabel(): string {
  return (import.meta.env.VITE_ENVIRONMENT as string | undefined) ?? 'local';
}

export const env = {
  get apiBaseUrl() {
    return getApiBaseUrl();
  },
  get environment() {
    return getEnvironmentLabel();
  },
};
