import mongoose from 'mongoose';
import { env } from '../config/env';

export async function connectDb(): Promise<void> {
    mongoose.set('strictQuery', true);

    if (env.NODE_ENV === 'dev') {
        mongoose.set('debug', true); // verbose
    }

    mongoose.connection.on('connected', () => console.log('mongo is up'));
    mongoose.connection.on('error', (e) => console.error('mongo error', e));
    mongoose.connection.on('disconnected', () => console.warn('mongo is down'));

    await mongoose.connect(env.MONGODB_URI, {
        serverSelectionTimeoutMS: 5000,
        maxPoolSize: 10,
    });
}

export async function disconnectDb(): Promise<void> {
    await mongoose.connection.close();
}
