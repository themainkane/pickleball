import cookieParser from 'cookie-parser';
import express, { type NextFunction, type Request, type Response } from 'express';
import mongoose from 'mongoose';
import { env } from './config/env';
import { connectDb, disconnectDb } from './db/connect';
import { usersRouter } from './routes/users';
import {authRouter} from "./routes/auth";
import { clubsRouter } from './routes/clubs';
import { organisationsRouter } from './routes/organisations';
import { venuesRouter } from './routes/venues';

async function main() {
    await connectDb();

    const app = express();
    app.disable('x-powered-by');
    app.use(express.json({ limit: '100kb' }));
    app.use(cookieParser());

    app.get('/health', (_req, response) => {
        const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
        response.json({
            ok: mongoose.connection.readyState === 1,
            db: states[mongoose.connection.readyState],
        });
    });

    app.use('/users', usersRouter);
    app.use('/auth', authRouter);
    app.use('/organisations', organisationsRouter);
    app.use('/venues', venuesRouter);
    app.use('/clubs', clubsRouter);

    app.use((_req, response) => {
        response.status(404).json({ error: 'Not found' });
    });

    // 4 args marks this as Express's error handler — async route rejections land here.
    // `_next` is unused but must stay, because Express detects error handlers by arity.
    app.use((err: unknown, _req: Request, response: Response, _next: NextFunction) => {
        console.error(err);
        response.status(500).json({ error: 'Internal server error' });
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
