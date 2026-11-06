import { z } from 'zod';

import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../../config/constants.js';

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export function paginationMeta(page: number, pageSize: number, total: number): {
  page: number;
  pageSize: number;
  total: number;
  hasNextPage: boolean;
} {
  return {
    page,
    pageSize,
    total,
    hasNextPage: page * pageSize < total,
  };
}
