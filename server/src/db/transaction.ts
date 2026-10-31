import mongoose from 'mongoose';

/**
 * Runs `work` in a MongoDB transaction: every write inside commits together or not at all.
 *
 * Mongoose's `transactionAsyncLocalStorage` (enabled in connectDb) attaches the session
 * to every query inside `work` automatically, so services don't pass sessions around.
 *
 * On a transient error (e.g. a write conflict with a concurrent transaction) the driver
 * retries `work` from the start, so it must not have side effects outside the database.
 */
export async function withTransaction<Result>(work: () => Promise<Result>): Promise<Result> {
    return mongoose.connection.transaction(work) as Promise<Result>;
}
