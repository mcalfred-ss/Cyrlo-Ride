import { z } from 'zod';

export const markReadSchema = z.object({ notificationId: z.string().uuid() }).strict();
export type MarkReadInput = z.infer<typeof markReadSchema>;
