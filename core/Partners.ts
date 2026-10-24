/**
 * Preferred partnerships support.
 *
 * A preferred partnership is a *priority*, not a guarantee. The scheduler tries
 * hard to put these two players on the same team, but it will break them up when
 * fairness demands it (rest rotation, or the player having several preferred
 * partners to get through).
 *
 * A player may appear in as many partnerships as they like, which covers the
 * common case of practising with a gendered partner, a mixed partner and a
 * partner from another league on the same evening.
 *
 * Accepted string formats (partnerships separated by ';' ',' or a new line,
 * partners separated by '&', '+' or '/'):
 *   "Joe Kane & Ming Tan; Grace Kemp & Emma Scargill"
 *   "Joe Kane & Ming Tan; Joe Kane & Grace Kemp"   <- Joe has two preferences
 *   "Joe K + Ming T"
 */

import { resolvePlayerName } from './PlayerNames';

export type PreferredPair = [string, string];

/** Either a raw text argument (CLI / form field) or already structured pairs (JSON API). */
export type PartnersInput = string | string[][] | undefined | null;

const PAIR_SEPARATOR = /[;,\n]+/;
const PARTNER_SEPARATOR = /[&+/]/;

/**
 * Turns the raw partners argument into pairs of (still unresolved) player names.
 * Throws when an entry does not describe exactly two players.
 */
export function parsePartners(input: PartnersInput): PreferredPair[] {
    if (!input) {
        return [];
    }

    const entries: string[][] = Array.isArray(input)
        ? input.map(pair => (Array.isArray(pair) ? [...pair] : [String(pair)]))
        : input.split(PAIR_SEPARATOR).map(entry => entry.split(PARTNER_SEPARATOR));

    const pairs: PreferredPair[] = [];

    entries.forEach(entry => {
        const names = entry.map(name => String(name).trim()).filter(name => name !== '');

        if (names.length === 0) {
            return;
        }

        if (names.length !== 2) {
            throw new Error(
                `Partner entry "${names.join(' & ')}" is invalid. Each partnership names exactly two players, e.g. "Joe Kane & Ming Tan". ` +
                `To give someone several preferred partners, list one partnership per entry: "Joe Kane & Ming Tan; Joe Kane & Grace Kemp".`
            );
        }

        pairs.push([names[0]!, names[1]!]);
    });

    return pairs;
}

/**
 * Matches the names given in the partners argument against the players loaded
 * from the roster, so partners can be typed loosely ("joe k" -> "Joe K").
 *
 * Duplicate partnerships are collapsed. A player may appear in several
 * partnerships.
 */
export function resolvePartners(
    pairs: PreferredPair[],
    players: string[],
    formatPlayerName: (name: string) => string
): PreferredPair[] {
    const resolved: PreferredPair[] = [];
    const seen = new Set<string>();

    pairs.forEach(([firstName, secondName]) => {
        const first = resolvePlayerName(firstName, players, formatPlayerName, 'Partner');
        const second = resolvePlayerName(secondName, players, formatPlayerName, 'Partner');

        if (first === second) {
            throw new Error(`Cannot pair "${first}" with themselves.`);
        }

        const key = pairKey(first, second);

        if (seen.has(key)) {
            return;
        }

        seen.add(key);
        resolved.push([first, second]);
    });

    return resolved;
}

/** Lookup of player -> every one of their preferred partners. */
export function buildPreferenceMap(pairs: PreferredPair[]): Map<string, Set<string>> {
    const map = new Map<string, Set<string>>();

    const add = (player: string, partner: string) => {
        const existing = map.get(player);

        if (existing) {
            existing.add(partner);

            return;
        }

        map.set(player, new Set([partner]));
    };

    pairs.forEach(([first, second]) => {
        add(first, second);
        add(second, first);
    });

    return map;
}

function pairKey(first: string, second: string): string {
    return [first, second].sort().join('\u0000');
}

function resolvePlayerName(
    name: string,
    players: string[],
    formatPlayerName: (name: string) => string
): string {
    const target = normalise(name);
    const formattedTarget = normalise(formatPlayerName(name));

    const exact = players.filter(player => normalise(player) === target || normalise(player) === formattedTarget);

    if (exact.length === 1) {
        return exact[0]!;
    }

    if (exact.length > 1) {
        throw ambiguous(name, exact);
    }

    const prefixed = players.filter(player => normalise(player).startsWith(target));

    if (prefixed.length === 1) {
        return prefixed[0]!;
    }

    if (prefixed.length > 1) {
        throw ambiguous(name, prefixed);
    }

    const firstNameMatches = players.filter(player => firstNameOf(player) === firstNameOf(name));

    if (firstNameMatches.length === 1) {
        return firstNameMatches[0]!;
    }

    if (firstNameMatches.length > 1) {
        throw ambiguous(name, firstNameMatches);
    }

    throw new Error(
        `Partner "${name}" was not found in the roster for this date. Available players: ${players.join(', ')}.`
    );
}

function ambiguous(name: string, matches: string[]): Error {
    return new Error(`Partner "${name}" matches more than one player (${matches.join(', ')}). Please be more specific.`);
}

function normalise(value: string): string {
    return value.trim().toLowerCase().replace(/\s+/g, ' ').replace(/\.$/, '');
}

function firstNameOf(value: string): string {
    return normalise(value).split(' ')[0] ?? '';
}
