import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { userService } from '../services/UserService';
import { privateUser } from '../steralizers/userSerializer';
import {authService} from "../services/AuthService";
import {isDuplicateKey} from "./routeHelpers";

export const authRouter = Router();

const REGISTER_LIMITER = rateLimit({ windowMs: 60 * 60 * 1000, limit: 5 });
const LOGIN_LIMITER = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    // TODO: default store is in-memory. Resets on restart, not shared between
    // processes. Fine on one dev box, wrong as soon as you run two instances.
});
const LOGIN_BODY = z.object({
    email: z.string().trim().toLowerCase().pipe(z.email()),
    password: z.string().min(1).max(200),
});
const REGISTER_BODY = z.object({
    email: z.string().trim().toLowerCase().pipe(z.email()),
    password: z.string().min(1).max(200),
    userName: z.string().trim().min(1).max(60),
})

authRouter.post('/login', LOGIN_LIMITER, async (req, res) => {
    const parsed = LOGIN_BODY.safeParse(req.body);

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

    authRouter.post('/register', REGISTER_LIMITER, async (req, res) => {
       const parsed = REGISTER_BODY.safeParse(req.body);

       if (!parsed.success) {
           res.status(400).json({
               error: 'Invalid body',
               details: parsed.error.flatten().fieldErrors,
           });

           return;
       }

        try {
            const user = await userService.register(parsed.data);
            const token = authService.signAccessToken(user)

            res.status(201).json({
                token,
                user: privateUser(user),
            })
        }catch (error){
           if (isDuplicateKey(error)){
               // TODO insecure, remove alongside mail pipeline
               res.status(409).json({error: 'That email is already registered'})

               return;
           }

            throw error;
        }
    })
});
