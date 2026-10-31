import type { Types } from 'mongoose';

/**
 * A stored document as a plain object: no Mongoose document methods, no virtuals.
 * What `.lean()` queries and `doc.toObject()` both hand back.
 *
 * Only `_id` is added — `InferSchemaType` already includes `createdAt`/`updatedAt`
 * for schemas declared with `timestamps: true`.
 */
export type Lean<T> = T & { _id: Types.ObjectId };
