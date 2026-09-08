import { z } from 'zod';
export const DEFAULT_EXPIRY_DAYS = 90;
export const createApiKeySchema = z.object({
    name: z.string().min(1, 'A key name is required').max(80),
    expires_in_days: z
        .number()
        .int()
        .min(1, 'Must expire at least 1 day out')
        .max(365, 'Cannot exceed 365 days')
        .optional(),
});
