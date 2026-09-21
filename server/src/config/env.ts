import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
    NODE_ENV: z.enum(['dev', 'test', 'live']).default('dev'),
    PORT: z.coerce.number().default(4000),
    MONGODB_URI: z.url(),
    JWT_SECRET: z.string().min(32),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
    console.error('Bad env:', parsed.error.flatten().fieldErrors);
    process.exit(1);
}

export const env = parsed.data;
