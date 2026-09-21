import { Model, Types, type QueryFilter, type SortOrder } from 'mongoose';

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

export type ListArgs<T> = {
    filter?: QueryFilter<T>;
    limit?: number;
    skip?: number;
    sort?: Record<string, SortOrder>;
};

export class BaseService<T> {
    constructor(protected readonly model: Model<T>) {}

    /** caller builds `filter` — never pass req.query in */
    async list({ filter = {}, limit = DEFAULT_LIMIT, skip = 0, sort = { _id: -1 } }: ListArgs<T> = {}) {
        const capped = Math.min(Math.max(Number(limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);

        const docs = await this.model
            .find(filter)
            .sort(sort)
            .skip(Math.max(Number(skip) || 0, 0))
            .limit(capped + 1)   // one extra to detect hasMore, no count query
            .lean()
            .exec();

        return { items: docs.slice(0, capped), hasMore: docs.length > capped };
    }

    async getById(id: string) {
        if (!Types.ObjectId.isValid(id)) return null;

        return this.model.findById(id).lean().exec();
    }

    async create(data: Partial<T>) {
        const doc = await this.model.create(data as T);

        return doc;
    }

    async updateById(id: string, patch: Partial<T>) {
        if (!Types.ObjectId.isValid(id)) return null;

        return this.model
            .findByIdAndUpdate(id, patch, { new: true, runValidators: true })
            .lean()
            .exec();
    }

    async deleteById(id: string) {
        if (!Types.ObjectId.isValid(id)) return false;

        const res = await this.model.findByIdAndDelete(id).lean().exec();

        return res !== null;
    }

}
