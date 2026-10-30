import type { OrganisationLean } from '../models/Organisation';

type SerializableOrganisation = Pick<OrganisationLean, '_id' | 'name' | 'createdAt'>;

export function publicOrganisation(organisation: SerializableOrganisation) {
    return {
        id: String(organisation._id),
        name: organisation.name,
        createdAt: organisation.createdAt,
    };
}
