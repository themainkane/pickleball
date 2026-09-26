import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { userService } from '../services/UserService';
import { privateUser } from '../steralizers/userSerializer';
import {authService} from "../services/AuthService";

export const authRouter = Router();

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    // TODO: default store is in-memory. Resets on restart, not shared between
    // processes. Fine on one dev box, wrong as soon as you run two instances.
});

const loginBody = z.object({
    email: z.string().trim().toLowerCase().pipe(z.email()),
    password: z.string().min(1).max(200),
});

authRouter.post('/login', loginLimiter, async (req, res) => {
    const parsed = loginBody.safeParse(req.body);

    if (!parsed.success) {
        res.status(400).json({
            error: 'Invalid body',
            details: parsed.error.flatten().fieldErrors,
        });

        return;
    }

    const { email, password } = parsed.data;
    const user = await userService.verifyCredentials(email, password);

    if (!user) {
        res.status(401).json({ error: 'Invalid email or password' });

        return;
    }

    const token = authService.signAccessToken(user);

    res.json({
        token,
        user: privateUser(user),
    });
});
