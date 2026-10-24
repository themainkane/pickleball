import 'dotenv/config';
import { z } from 'zod';

const UNIT_SECONDS = { s: 1, m: 60, h: 3600, d: 86400 } as const;

/** "900" | "15m" | "30d" -> seconds */
const duration = z
    .string()
    .regex(/^\d+[smhd]?$/, 'expected e.g. 900, 15m, 12h, 30d')
    .transform((v) => {
        const unit = v.at(-1) as string;
        const n = parseInt(v, 10);

        return unit in UNIT_SECONDS ? n * UNIT_SECONDS[unit as keyof typeof UNIT_SECONDS] : n;
    });

const schema = z.object({
    NODE_ENV: z.enum(['dev', 'test', 'live']).default('dev'),
    PORT: z.coerce.number().default(4000),
    MONGODB_URI: z.url(),
    JWT_SECRET: z.string().min(32),
    JWT_EXPIRES_IN: duration.default(900),
    REFRESH_EXPIRES_IN: duration.default(30 * 86400),
    // Must match the path the *browser* sees. Vite proxies /api/* -> server, so /api/auth.
    REFRESH_COOKIE_PATH: z.string().startsWith('/').default('/api/auth'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
    console.error('Bad env:', parsed.error.flatten().fieldErrors);
    process.exit(1);
}

export const env = parsed.data;
