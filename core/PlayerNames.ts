/**
 * Matching loosely typed names against the roster loaded for a date, so
 * settings can be typed the way people talk ("joe k" -> "Joe K").
 *
 * Shared by every setting that names players: preferred partners, rest counts.
 * The `label` is only used in the error messages, so each setting can complain
 * in its own words.
 */

/**
 * Finds the one roster player a typed name refers to.
 *
 * Tries an exact match first, then a prefix, then the first name on its own.
 * Throws when nothing matches, or when more than one player does.
 */
export function resolvePlayerName(
    name: string,
    players: string[],
    formatPlayerName: (name: string) => string,
    label: string = 'Player'
): string {
    const target = normalise(name);
    const formattedTarget = normalise(formatPlayerName(name));

    const exact = players.filter(player => normalise(player) === target || normalise(player) === formattedTarget);
    if (exact.length === 1) {
        return exact[0]!;
    }
    if (exact.length > 1) {
        throw ambiguous(label, name, exact);
    }

    const prefixed = players.filter(player => normalise(player).startsWith(target));
    if (prefixed.length === 1) {
        return prefixed[0]!;
    }
    if (prefixed.length > 1) {
        throw ambiguous(label, name, prefixed);
    }

    const firstNameMatches = players.filter(player => firstNameOf(player) === firstNameOf(name));
    if (firstNameMatches.length === 1) {
        return firstNameMatches[0]!;
    }
    if (firstNameMatches.length > 1) {
        throw ambiguous(label, name, firstNameMatches);
    }

    throw new Error(
        `${label} "${name}" was not found in the roster for this date. Available players: ${players.join(', ')}.`
    );
}

function ambiguous(label: string, name: string, matches: string[]): Error {
    return new Error(`${label} "${name}" matches more than one player (${matches.join(', ')}). Please be more specific.`);
}

function normalise(value: string): string {
    return value.trim().toLowerCase().replace(/\s+/g, ' ').replace(/\.$/, '');
}

function firstNameOf(value: string): string {
    return normalise(value).split(' ')[0] ?? '';
}
