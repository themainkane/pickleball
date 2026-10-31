import { Model, Types, type QueryFilter, type SortOrder } from 'mongoose';
import type { Lean } from '../models/lean';

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

export type ListArgs<T> = {
    filter?: QueryFilter<T>;
    limit?: number;
    skip?: number;
    sort?: Record<string, SortOrder>;
};

/**
 * `TRead` is what reads hand back: the plain-object shape of `T` by default. A service
 * can narrow it (e.g. UserService drops `passwordHash`, which `select: false` already
 * keeps out of query results) so callers can't read a field that isn't really there.
 */
export class BaseService<T, TRead = Lean<T>> {
    constructor(protected readonly model: Model<T>) {}

    /** caller builds `filter` — never pass request.query in */
    async list({ filter = {}, limit = DEFAULT_LIMIT, skip = 0, sort = { _id: -1 } }: ListArgs<T> = {}) {
        const capped = Math.min(Math.max(Number(limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);

        const docs = await this.model
            .find(filter)
            .sort(sort)
            .skip(Math.max(Number(skip) || 0, 0))
            .limit(capped + 1)   // one extra to detect hasMore, no count query
            .lean<TRead[]>()
            .exec();

        return { items: docs.slice(0, capped), hasMore: docs.length > capped };
    }

    async getById(id: string) {
        if (!Types.ObjectId.isValid(id)) return null;

        return this.model.findById(id).lean<TRead | null>().exec();
    }

    /** Returns a plain object, like the other methods, so callers never see a hydrated document. */
    async create(data: Partial<T>) {
        const doc = await this.model.create(data as T);

        // virtuals: false is the default; stated so a schema gaining virtuals can't change this.
        return doc.toObject({ virtuals: false }) as TRead;
    }

    async updateById(id: string, patch: Partial<T>) {
        if (!Types.ObjectId.isValid(id)) return null;

        return this.model
            .findByIdAndUpdate(id, patch, { new: true, runValidators: true })
            .lean<TRead | null>()
            .exec();
    }

    async deleteById(id: string) {
        if (!Types.ObjectId.isValid(id)) return false;

        const response = await this.model.findByIdAndDelete(id).lean().exec();

        return response !== null;
    }

}
