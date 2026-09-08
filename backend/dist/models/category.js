import { z } from 'zod';
import { normalizeTemplateKey } from './template.js';
const objectIdString = z.string().regex(/^[a-fA-F0-9]{24}$/, 'Invalid id');
export const createCategorySchema = z.object({
    name: z.string().min(1).max(60),
    templates: z
        .array(z.object({
        project_id: objectIdString,
        template_key: z.string().min(1).max(80).transform(normalizeTemplateKey),
    }))
        .max(200, 'Too many templates in one request')
        .optional(),
});
export const updateCategorySchema = z
    .object({
    name: z.string().min(1).max(60).optional(),
    templates: z
        .array(z.object({
        project_id: objectIdString,
        template_key: z.string().min(1).max(80).transform(normalizeTemplateKey),
    }))
        .max(200, 'Too many templates in one request')
        .optional(),
})
    .refine((v) => v.name !== undefined || v.templates !== undefined, {
    message: 'Provide a name, templates, or both',
});
