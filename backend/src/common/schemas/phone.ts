import { z } from 'zod';

/** Ghana numbers in E.164: +233 and nine national digits. */
export const ghanaPhoneSchema = z.string().regex(/^\+233\d{9}$/);
