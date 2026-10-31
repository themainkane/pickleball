import type { Response } from 'express';
import { z } from 'zod';

export function isDuplicateKey(error: unknown) {
    return typeof error === 'object' && error !== null && (error as { code?: number }).code === 11000;
}

export const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

export const OBJECT_ID_SCHEMA = z.string().regex(OBJECT_ID_PATTERN);

export const LIST_QUERY_SCHEMA = z.object({
    limit: z.coerce.number().int().min(1).max(100).optional(),
    skip: z.coerce.number().int().min(0).optional(),
});

export function badRequest(response: Response, message: string, error: z.ZodError) {
    response.status(400).json({ error: message, details: error.flatten().fieldErrors });
}
