import express, { type NextFunction, type Request, type Response } from 'express';
import mongoose from 'mongoose';
import { env } from './config/env';
import { connectDb, disconnectDb } from './db/connect';
import { usersRouter } from './routes/users';

async function main() {
    await connectDb();

    const app = express();
    app.use(express.json());

    app.get('/health', (_req, res) => {
        const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
        res.json({
            ok: mongoose.connection.readyState === 1,
            db: states[mongoose.connection.readyState],
        });
    });

    // TODO: no auth on these yet — see note below
    app.use('/users', usersRouter);

    app.use((_req, res) => {
        res.status(404).json({ error: 'Not found' });
    });

    // 4 args marks this as Express's error handler — async route rejections land here.
    // `_next` is unused but must stay, because Express detects error handlers by arity.
    app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    });

    const server = app.listen(env.PORT, () =>
        console.log(`listening on ${env.PORT}`),
    );

    for (const sig of ['SIGINT', 'SIGTERM'] as const) {
        process.on(sig, () => {
            server.close(async () => {
                await disconnectDb();
                process.exit(0);
            });
        });
    }
}

main().catch((err) => {
    console.error('boot failed', err);
    process.exit(1);
});
