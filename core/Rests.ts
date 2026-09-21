/**
 * Per player rest counts.
 *
 * A rest count is how many rounds a player sits out over the whole session, not
 * per round. Everyone gets DEFAULT_RESTS_PER_PLAYER unless a number is declared
 * for them here.
 *
 * Unlike preferred partners, a declared number is a target the scheduler works
 * hard to hit exactly, and to spread evenly across the session: three rests in
 * twelve rounds means roughly every fourth round, never three in a row at the
 * end. See RestPlan for how that is worked out, and for the cases where the
 * court arithmetic makes a number impossible to honour.
 *
 * Accepted string formats (entries separated by ';' ',' or a new line, the name
 * and the number separated by ':' '=' or 'x'):
 *   "Joe Kane: 3; Ming Tan: 0"
 *   "Joe Kane = 3
 *    Ming Tan = 0"
 *   "Joe Kane x 3"
 *
 * Also accepts already structured input from the JSON API, either
 * { "Joe Kane": 3 } or [["Joe Kane", 3]].
 */

import { resolvePlayerName } from './PlayerNames';

/** How many rounds a player sits out when no number was declared for them. */
export const DEFAULT_RESTS_PER_PLAYER = 1;

/** One player and the number of rests asked for on their behalf. */
export interface RestDeclaration {
    player: string;
    rests: number;
}

/** Either a raw text argument (CLI / form field) or already structured counts (JSON API). */
export type RestsInput =
    | string
    | Record<string, number | string>
    | Array<[string, number | string]>
    | RestDeclaration[]
    | undefined
    | null;

const ENTRY_SEPARATOR = /[;,\n]+/;
const COUNT_SEPARATOR = /[:=]|\sx\s/i;

/**
 * Turns the raw rests argument into declarations with (still unresolved) player
 * names. Throws when an entry does not read as a name and a whole count.
 */
export function parseRests(input: RestsInput): RestDeclaration[] {
    if (!input) {
        return [];
    }

    return rawEntries(input)
        .filter(([name]) => name.trim() !== '')
        .map(([name, rests]) => ({
            player: name.trim(),
            rests: parseRestCount(name.trim(), rests)
        }));
}

/**
 * Matches the declared names against the players loaded from the roster, so
 * they can be typed loosely ("joe k" -> "Joe K").
 *
 * Declaring the same player twice is fine when the numbers agree, and an error
 * when they disagree, because there is no sensible way to pick a winner.
 */
export function resolveRests(
    declarations: RestDeclaration[],
    players: string[],
    formatPlayerName: (name: string) => string
): RestDeclaration[] {
    const resolved: RestDeclaration[] = [];
    const byPlayer = new Map<string, number>();

    declarations.forEach(({ player, rests }) => {
        const name = resolvePlayerName(player, players, formatPlayerName, 'Rest count for');
        const existing = byPlayer.get(name);

        if (existing === undefined) {
            byPlayer.set(name, rests);
            resolved.push({ player: name, rests });

            return;
        }

        if (existing !== rests) {
            throw new Error(
                `${name} was given two different rest counts (${existing} and ${rests}). Please declare one number per player.`
            );
        }
    });

    return resolved;
}

/** Lookup of player -> their declared number of rests. */
export function buildRestTargets(declarations: RestDeclaration[]): Map<string, number> {
    return new Map(declarations.map(({ player, rests }) => [player, rests]));
}

export function describeRestDeclarations(declarations: RestDeclaration[]): string {
    return declarations.map(({ player, rests }) => `${player}: ${rests}`).join(', ');
}

/** Flattens the several accepted input shapes into name/count string pairs. */
function rawEntries(input: NonNullable<RestsInput>): Array<[string, unknown]> {
    if (typeof input === 'string') {
        return input
            .split(ENTRY_SEPARATOR)
            .filter(entry => entry.trim() !== '')
            .map(entry => {
                const [name, ...rest] = entry.split(COUNT_SEPARATOR);

                return [String(name), rest.join('').trim()];
            });
    }

    if (Array.isArray(input)) {
        return input.map(entry =>
            Array.isArray(entry)
                ? [String(entry[0]), entry[1]]
                : [String(entry.player), entry.rests]
        );
    }

    return Object.entries(input);
}

function parseRestCount(name: string, value: unknown): number {
    const text = String(value ?? '').trim();

    if (text === '') {
        throw new Error(
            `Rest count for "${name}" is missing a number. Write the number after the name, e.g. "${name}: 2".`
        );
    }

    if (!/^\d+$/.test(text)) {
        throw new Error(
            `Rest count "${text}" for "${name}" is invalid. Use a whole number of rounds to sit out, e.g. "${name}: 2".`
        );
    }

    return parseInt(text, 10);
}
