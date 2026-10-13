/**
 * Gender, used only to shape the fixtures.
 *
 * A round plays better when the two pairs on a court are made up the same way:
 * ladies against ladies, mixed against mixed, men against men. Two men against
 * two women, or two men against a mixed pair, are the fixtures this module
 * exists to steer away from.
 *
 * It is a *low* priority. Rests are planned first and preferred partnerships
 * outrank it, so gender is a nudge rather than a rule and will often be
 * impossible to honour. The one near-guarantee is a ladies fixture: a roster
 * with LADIES_FIXTURE_MIN_WOMEN women gets LADIES_FIXTURES_PER_SESSION rounds
 * with one set aside, so long as enough women are on court that round.
 *
 * All of it is switched by the 'Ladies First' toggle, and none of it reaches the
 * PDF, the dashboard or the API response. Gender is organisation only.
 *
 * Accepted string formats (entries separated by ';' ',' or a new line, the name
 * and the gender separated by ':' or '='):
 *   "Cherie Marais: F; Joe Kane: M"
 *   "Cherie Marais = F
 *    Joe Kane = M"
 *
 * Also accepts already structured input from the JSON API, either
 * { "Cherie Marais": "F" } or [["Cherie Marais", "F"]].
 *
 * A roster can carry gender itself instead, either in a gender column beside
 * the date column or written after the name: "Cherie Marais (F)". Only M and F
 * are read; anything else leaves the player's gender unknown.
 */

import { resolvePlayerName } from './PlayerNames';

export type Gender = 'M' | 'F';

/** One player and the gender given for them. */
export interface GenderDeclaration {
    player: string;
    gender: Gender;
}

/** Either a raw text argument (CLI / form field) or already structured genders (JSON API). */
export type GendersInput =
    | string
    | Record<string, string>
    | Array<[string, string]>
    | GenderDeclaration[]
    | undefined
    | null;

/** What a pair of players adds up to. Unknown covers any pair we lack a gender for. */
export type PairMakeup = 'ladies' | 'mixed' | 'mens' | 'unknown';

/**
 * The order pairs are matched up in, so a fixture faces like with like. Also
 * the tie break order when a makeup has an odd pair left over.
 */
export const MAKEUP_ORDER: PairMakeup[] = ['ladies', 'mixed', 'mens', 'unknown'];

/** Women needed for one ladies pair. */
export const WOMEN_PER_LADIES_PAIR = 2;

/** Pairs in a ladies fixture: two women against two women. */
export const LADIES_FIXTURE_PAIRS = 2;

/** Below this many women a ladies fixture cannot be made at all. */
export const LADIES_FIXTURE_MIN_WOMEN = WOMEN_PER_LADIES_PAIR * LADIES_FIXTURE_PAIRS;

/**
 * Ladies fixtures set aside across a session once the roster has the women for
 * one. Deliberately a couple rather than every round: reserving one every round
 * would lock the women into playing each other all evening, which is the
 * opposite of the mixed preference.
 */
export const LADIES_FIXTURES_PER_SESSION = 2;

const ENTRY_SEPARATOR = /[;,\n]+/;
const GENDER_SEPARATOR = /[:=]/;

/** "Cherie Marais (F)", "Cherie Marais [F]", "Cherie Marais | F", "Cherie Marais - F" */
const NAME_WITH_GENDER = /^(.+?)\s*(?:\(\s*([^)]*?)\s*\)|\[\s*([^\]]*?)\s*]|\|\s*(\S+)|\s-+\s*(\S+))$/;

/** Column headers that hold a gender rather than a roster. */
const GENDER_HEADERS = ['gender', 'genders', 'sex', 'm/f', 'f/m', 'mf'];

/**
 * Turns the raw genders argument into declarations with (still unresolved)
 * player names. Throws when an entry does not read as a name and M or F.
 */
export function parseGenders(input: GendersInput): GenderDeclaration[] {
    if (!input) {
        return [];
    }

    return rawEntries(input)
        .filter(([name]) => name.trim() !== '')
        .map(([name, gender]) => ({
            player: name.trim(),
            gender: parseGenderValue(name.trim(), gender)
        }));
}

/**
 * Matches the named players against the roster loaded for the date, so genders
 * can be typed loosely ("cherie m" -> "Cherie M").
 *
 * Naming the same player twice is fine when the genders agree, and an error when
 * they disagree, because there is no sensible way to pick a winner.
 */
export function resolveGenders(
    declarations: GenderDeclaration[],
    players: string[],
    formatPlayerName: (name: string) => string
): GenderDeclaration[] {
    const resolved: GenderDeclaration[] = [];
    const byPlayer = new Map<string, Gender>();

    declarations.forEach(({ player, gender }) => {
        const name = resolvePlayerName(player, players, formatPlayerName, 'Gender for');
        const existing = byPlayer.get(name);

        if (existing === undefined) {
            byPlayer.set(name, gender);
            resolved.push({ player: name, gender });
            return;
        }

        if (existing !== gender) {
            throw new Error(
                `${name} was given two different genders (${existing} and ${gender}). Please give one per player.`
            );
        }
    });

    return resolved;
}

/** Lookup of player -> their gender. */
export function buildGenderMap(declarations: GenderDeclaration[]): Map<string, Gender> {
    return new Map(declarations.map(({ player, gender }) => [player, gender]));
}

/** M or F, however it was written. Undefined for anything else, including blanks. */
export function readGender(value: unknown): Gender | undefined {
    const text = String(value ?? '').trim().toUpperCase();
    return text === 'M' || text === 'F' ? text : undefined;
}

/**
 * Splits a gender written after a name off the name itself, so a roster can
 * carry it in the same cell or name box.
 *
 * A suffix that does not read as M or F is left alone and treated as part of the
 * name, which keeps "Marais, Cherie" and "Joe (captain)" intact.
 */
export function splitNameAndGender(entry: string): { name: string; gender?: Gender } {
    const match = NAME_WITH_GENDER.exec(entry.trim());

    if (!match) {
        return { name: entry.trim() };
    }

    const [, name, ...suffixes] = match;
    const gender = readGender(suffixes.find(suffix => suffix !== undefined));

    return gender ? { name: name!.trim(), gender } : { name: entry.trim() };
}

/**
 * The column holding genders for a roster column, or -1 when the sheet has none.
 *
 * The column beside the roster wins, then one named after the date
 * ("12/10/26 Gender"), then a lone gender column shared by the whole sheet.
 * Several unnamed gender columns are ambiguous, so none is used.
 */
export function findGenderColumn(headers: string[], targetColumnIndex: number): number {
    const beside = targetColumnIndex + 1;
    if (isGenderHeader(headers[beside])) {
        return beside;
    }

    const target = normalise(headers[targetColumnIndex] ?? '');
    const dated = headers.findIndex(header =>
        target !== '' && GENDER_HEADERS.some(name => normalise(header) === `${target} ${name}`)
    );
    if (dated !== -1) {
        return dated;
    }

    const lone = headers.filter(isGenderHeader);
    return lone.length === 1 ? headers.findIndex(isGenderHeader) : -1;
}

/** What two genders add up to. Either one unknown makes the pair unknown. */
export function pairMakeup(first: Gender | undefined, second: Gender | undefined): PairMakeup {
    if (!first || !second) {
        return 'unknown';
    }
    if (first === 'F' && second === 'F') {
        return 'ladies';
    }
    if (first === 'M' && second === 'M') {
        return 'mens';
    }
    return 'mixed';
}

/** Where a makeup sits in MAKEUP_ORDER. Used to line two teams up against each other. */
export function makeupRank(makeup: PairMakeup): number {
    const rank = MAKEUP_ORDER.indexOf(makeup);
    return rank === -1 ? MAKEUP_ORDER.length : rank;
}

function isGenderHeader(header: string | undefined): boolean {
    return header !== undefined && GENDER_HEADERS.includes(normalise(header));
}

/** Flattens the several accepted input shapes into name/gender string pairs. */
function rawEntries(input: NonNullable<GendersInput>): Array<[string, unknown]> {
    if (typeof input === 'string') {
        return input
            .split(ENTRY_SEPARATOR)
            .filter(entry => entry.trim() !== '')
            .map(entry => {
                const [name, ...rest] = entry.split(GENDER_SEPARATOR);
                return [String(name), rest.join('').trim()];
            });
    }

    if (Array.isArray(input)) {
        return input.map(entry =>
            Array.isArray(entry)
                ? [String(entry[0]), entry[1]]
                : [String(entry.player), entry.gender]
        );
    }

    return Object.entries(input);
}

function parseGenderValue(name: string, value: unknown): Gender {
    const text = String(value ?? '').trim();

    if (text === '') {
        throw new Error(
            `Gender for "${name}" is missing. Write M or F after the name, e.g. "${name}: F".`
        );
    }

    const gender = readGender(text);

    if (!gender) {
        throw new Error(
            `Gender "${text}" for "${name}" is invalid. Use M or F, e.g. "${name}: F".`
        );
    }

    return gender;
}

function normalise(value: string): string {
    return value.trim().toLowerCase().replace(/\s+/g, ' ');
}
