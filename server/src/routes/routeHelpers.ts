import type { Response } from 'express';
import { z } from 'zod';

export function isDuplicateKey(err: unknown) {
    return typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000;
}

export const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

export const objectIdSchema = z.string().regex(OBJECT_ID_PATTERN);

export const listQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(100).optional(),
    skip: z.coerce.number().int().min(0).optional(),
});

export function badRequest(response: Response, message: string, error: z.ZodError) {
    response.status(400).json({ error: message, details: error.flatten().fieldErrors });
}
