export type DatePreset = 'today' | '7d' | '30d' | 'all' | 'custom';

export interface AnalyticsDateRange {
  from?: string;
  to?: string;
  preset: DatePreset;
}

/** Format a Date for `<input type="datetime-local" />` in local time. */
export function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function fromDatetimeLocalValue(value: string): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function rangeForPreset(preset: Exclude<DatePreset, 'custom'>, now = new Date()): AnalyticsDateRange {
  if (preset === 'all') {
    return { preset };
  }
  if (preset === 'today') {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    return { preset, from: start.toISOString(), to: end.toISOString() };
  }
  const days = preset === '7d' ? 7 : 30;
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  return { preset, from: start.toISOString(), to: end.toISOString() };
}

export function localBoundsForPreset(preset: Exclude<DatePreset, 'custom'>, now = new Date()): {
  fromLocal: string;
  toLocal: string;
} {
  if (preset === 'all') {
    return { fromLocal: '', toLocal: '' };
  }
  const range = rangeForPreset(preset, now);
  return {
    fromLocal: range.from ? toDatetimeLocalValue(new Date(range.from)) : '',
    toLocal: range.to ? toDatetimeLocalValue(new Date(range.to)) : '',
  };
}
