import { parse } from 'csv-parse/sync';
import {Writable} from "node:stream";
import {buildPreferenceMap, parsePartners, type PartnersInput, type PreferredPair, resolvePartners} from "./Partners";
import {
    buildRestTargets,
    DEFAULT_RESTS_PER_PLAYER,
    describeRestDeclarations,
    parseRests,
    type RestDeclaration,
    type RestsInput,
    resolveRests
} from "./Rests";
import {RestPlan} from "./RestPlan";
import {
    findGenderColumn,
    type Gender,
    type GendersInput,
    LADIES_FIXTURE_MIN_WOMEN,
    LADIES_FIXTURES_PER_SESSION,
    MAKEUP_ORDER,
    makeupRank,
    pairMakeup,
    type PairMakeup,
    parseGenders,
    readGender,
    resolveGenders,
    splitNameAndGender
} from "./Genders";

export interface Match {
    court: number;
    team1: [string, string];
    team2: [string, string] | null;
}

export interface RoundSchedule {
    roundNumber: number
    matches: Match[];
    restPile: string[];
}

/** Everything about a session that is not the roster itself. */
export interface SchedulerOptions {
    /** Partnerships the scheduler should favour, in the order they were given. */
    partners?: PartnersInput;
    /** How strongly to favour those partnerships. See DEFAULT_PARTNER_PRIORITY. */
    partnerPriority?: number;
    /** Rest counts declared for named players. See Rests. */
    rests?: RestsInput;
    /** Rests for every player with no declared number of their own. */
    defaultRests?: number;
    /**
     * Genders declared for named players. Only ever used to shape the fixtures,
     * never reported. See Genders.
     */
    genders?: GendersInput;
    /**
     * Whether to let gender shape the fixtures at all: the 'Ladies First'
     * toggle. On by default, and off means gender is ignored entirely.
     */
    ladiesFirst?: boolean;
    /** How strongly to favour mixed pairs. See DEFAULT_GENDER_PRIORITY. */
    genderPriority?: number;
    /**
     * Roster typed straight into the UI. When this has names the CSV is
     * ignored entirely, so no date column is needed.
     */
    rosterNames?: string[];
}

/**
 * How strongly a preferred partnership outweighs the "don't repeat pairings"
 * rule. A preferred pair beats a brand new random pair until they have already
 * played together this many times, so with the default a preference is a strong
 * pull without ever being an absolute lock.
 */
export const DEFAULT_PARTNER_PRIORITY = 3;

/**
 * How strongly a mixed pair outweighs the "don't repeat pairings" rule.
 *
 * Deliberately far below DEFAULT_PARTNER_PRIORITY: a preferred partnership of
 * two men still beats a mixed pair, and one round together is enough to cancel
 * the mixed bonus out, so nobody gets locked into mixed all evening.
 */
export const DEFAULT_GENDER_PRIORITY = 1;

export abstract class BaseScheduler <TSchedule> {
    protected players: string[] =[]

    /** Partnerships the scheduler should favour, in the order they were given. */
    protected preferredPairs: PreferredPair[] = [];

    /** player -> all of their preferred partners. */
    protected preferredPartnersOf: Map<string, Set<string>> = new Map();

    /** Rest counts declared for named players, resolved against the roster. */
    protected restDeclarations: RestDeclaration[] = [];

    /** player -> their declared number of rests. */
    protected declaredRestsOf: Map<string, number> = new Map();

    /**
     * player -> their gender, from the roster or the form. Used to shape the
     * fixtures and nothing else: it is never reported or written out.
     */
    protected genderOf: Map<string, Gender> = new Map();

    /**
     * Genders carried by the roster itself. Kept by row as the roster is read,
     * so two players with the same name cannot be mixed up by name matching.
     */
    private rosterGenderOf: Map<string, Gender> = new Map();

    /** Anything the schedule could not honour, worth telling the organiser about. */
    protected warnings: string[] = [];

    /** How many times each pair of players has been teamed up so far. */
    private pairCounts: Map<string, Map<string, number>> = new Map();

    protected partnersInput: PartnersInput;
    protected partnerPriority: number;
    protected restsInput: RestsInput;
    protected defaultRests: number;
    protected gendersInput: GendersInput;
    protected genderPriority: number;
    /** The 'Ladies First' toggle. Off means gender plays no part at all. */
    protected ladiesFirst: boolean;
    protected rosterNames: string[];

    constructor(
        protected csvContent: string,
        protected outputStream: Writable,
        protected targetDateColumn: string,
        options: SchedulerOptions = {}
    ) {
        this.partnersInput = options.partners ?? [];
        this.partnerPriority = options.partnerPriority ?? DEFAULT_PARTNER_PRIORITY;
        this.restsInput = options.rests ?? [];
        this.defaultRests = options.defaultRests ?? DEFAULT_RESTS_PER_PLAYER;
        this.gendersInput = options.genders ?? [];
        this.genderPriority = options.genderPriority ?? DEFAULT_GENDER_PRIORITY;
        this.ladiesFirst = options.ladiesFirst ?? true;
        this.rosterNames = options.rosterNames ?? [];
    }

    public run(): void {
        try {
            console.log(`Loading players for date: ${this.targetDateColumn}...`);
            this.loadPlayers();

            if (this.preferredPairs.length > 0) {
                console.log(`Preferred partnerships: ${this.describePreferredPairs()}`);
            }

            if (this.restDeclarations.length > 0) {
                console.log(`Declared rest counts: ${describeRestDeclarations(this.restDeclarations)}`);
            }

            console.log(`Found ${this.players.length} players. Generating schedule...`);
            const schedule = this.generateSchedule();

            console.log(`Writing output to PDF...`);
            this.createPDF(schedule);
        } catch (error) {
            console.error("Failed to generate schedule:", error);
            throw error;
        }
    }

    public getScheduleData(): {
        players: string[],
        schedule: TSchedule,
        preferredPairs: PreferredPair[],
        restDeclarations: RestDeclaration[],
        warnings: string[]
    } {
        this.loadPlayers();
        const schedule = this.generateSchedule();

        return {
            players: this.players,
            schedule,
            preferredPairs: this.preferredPairs,
            restDeclarations: this.restDeclarations,
            warnings: this.warnings
        };

    }

    public getPreferredPairs(): PreferredPair[] {
        return this.preferredPairs;
    }

    /** Rest counts declared for named players, resolved against the roster. */
    public getRestDeclarations(): RestDeclaration[] {
        return this.restDeclarations;
    }

    /** Anything the schedule could not honour. Empty when everything fitted. */
    public getWarnings(): string[] {
        return this.warnings;
    }

    /**
     * Loads the roster and resolves the partners argument without producing any
     * output, so callers can report errors before streaming a PDF.
     */
    public validate(): void {
        this.loadPlayers();
    }

    protected loadPlayers(): void {
        this.players = [];
        this.warnings = [];
        this.rosterGenderOf = new Map();

        if (this.rosterNames.length > 0) {
            this.loadPlayersFromNames();

            return;
        }

        const records: string[][] = parse(this.csvContent, { skip_empty_lines: true, trim: true });
        const [headers, ...playerRows] = records;

        if(!headers || headers.length === 0) {
            throw new Error("No headers found in the CSV file. Please ensure column headers are present and formatted correctly: DD/MM/YY");
        }

        const targetColumnIndex = headers.findIndex(header => header === this.targetDateColumn);

        if (targetColumnIndex === -1) {
            throw new Error(`Could not find column for date: ${this.targetDateColumn}`);
        }

        // Gender is optional: a sheet without it simply schedules without it.
        const genderColumnIndex = findGenderColumn(headers, targetColumnIndex);

       playerRows.forEach((row) => {
            const cell = row[targetColumnIndex];

            if (cell && cell.trim() !== '') {
                // Gender may be written after the name, or sit in its own column.
                const { name, gender } = splitNameAndGender(cell);
                const player = this.formatPlayerName(name);
                const rowGender = gender
                    ?? (genderColumnIndex === -1 ? undefined : readGender(row[genderColumnIndex]));

                this.players.push(player);

                if (rowGender) {
                    this.rosterGenderOf.set(player, rowGender);
                }
            }
        })

        if (this.players.length < 4) {
            throw new Error("Not enough players found in the CSV for the specified date.");
        }

        this.applyRosterSettings();
    }

    /** Builds the roster from names typed in directly, ignoring the CSV. */
    protected loadPlayersFromNames(): void {
        this.players = this.rosterNames
            .map(name => name.trim())
            .filter(name => name !== '')
            .map(entry => {
                // Supports "Cherie Marais (F)" as well as the gender dropdown.
                const { name, gender } = splitNameAndGender(entry);
                const player = this.formatPlayerName(name);

                if (gender) {
                    this.rosterGenderOf.set(player, gender);
                }

                return player;
            });

        if (this.players.length < 4) {
            throw new Error("Not enough players. Please enter at least 4 names.");
        }

        this.applyRosterSettings();
    }

    /** Resolves every setting that names players against the loaded roster. */
    protected applyRosterSettings(): void {
        this.applyPartners();
        this.applyRests();
        this.applyGenders();
    }

    /** Resolves the partners argument against the loaded roster. */
    protected applyPartners(): void {
        this.preferredPairs = resolvePartners(
            parsePartners(this.partnersInput),
            this.players,
            name => this.formatPlayerName(name)
        );
        this.preferredPartnersOf = buildPreferenceMap(this.preferredPairs);
    }

    /** Resolves the declared rest counts against the loaded roster. */
    protected applyRests(): void {
        this.restDeclarations = resolveRests(
            parseRests(this.restsInput),
            this.players,
            name => this.formatPlayerName(name)
        );
        this.declaredRestsOf = buildRestTargets(this.restDeclarations);
    }

    /**
     * Works out who is who, starting from whatever the roster carried and
     * letting anything passed in alongside it win, so the form can correct a
     * sheet. Players nobody gave a gender for stay unknown, which the fixture
     * shaping simply steps around.
     */
    protected applyGenders(): void {
        this.genderOf = new Map(this.rosterGenderOf);

        resolveGenders(
            parseGenders(this.gendersInput),
            this.players,
            name => this.formatPlayerName(name)
        ).forEach(({ player, gender }) => this.genderOf.set(player, gender));
    }

    protected describePreferredPairs(): string {
        return this.preferredPairs.map(([first, second]) => `${first} & ${second}`).join(', ');
    }

    protected formatPlayerName(name: string): string {
        const names = name.split(' ');

        return names.length === 1 ?
            `${names[0]}` : `${names[0]} ${names[names.length - 1].charAt(0).toUpperCase()}`;

    }

    // --- Preferences -------------------------------------------------------

    /** Every preferred partner of a player (may be empty). */
    protected preferredPartnersFor(player: string): Set<string> {
        return this.preferredPartnersOf.get(player) ?? new Set();
    }

    protected isPreferredPartnership(first: string, second: string): boolean {
        return this.preferredPartnersFor(first).has(second);
    }

    /** How many of `pool` are preferred partners of `player`. */
    protected countPreferredPartnersIn(player: string, pool: Iterable<string>): number {
        const preferred = this.preferredPartnersFor(player);
        let count = 0;
        for (const other of pool) {
            if (preferred.has(other)) {
                count++;
            }
        }

        return count;
    }

    // --- Gender -----------------------------------------------------------

    /** A player's gender, or undefined when nobody told us. */
    protected genderFor(player: string): Gender | undefined {
        return this.genderOf.get(player);
    }

    /** Only the women in a pool. Empty while 'Ladies First' is off. */
    protected womenIn(pool: Iterable<string>): string[] {
        if (!this.ladiesFirst) {
            return [];
        }
        return [...pool].filter(player => this.genderFor(player) === 'F');
    }

    /** What a pair adds up to: ladies, mixed, mens, or unknown. */
    protected makeupOf(pair: [string, string]): PairMakeup {
        return pairMakeup(this.genderFor(pair[0]), this.genderFor(pair[1]));
    }

    /**
     * How many of `pool` share this player's gender. Zero while 'Ladies First'
     * is off, or when we do not know the player's gender, so callers using it as
     * a tie break simply fall through to their next rule.
     */
    protected countSameGenderIn(player: string, pool: Iterable<string>): number {
        const gender = this.genderFor(player);

        if (!this.ladiesFirst || !gender) {
            return 0;
        }

        let count = 0;
        for (const other of pool) {
            if (this.genderFor(other) === gender) {
                count++;
            }
        }
        return count;
    }

    /**
     * The rounds that should set a ladies fixture aside, spread across the
     * session. Empty when 'Ladies First' is off, or when the roster has too few
     * women for a ladies fixture to exist.
     *
     * Only a couple of rounds are reserved. Every other round is left to the
     * mixed preference in pairScore, because reserving one every round would
     * leave the women playing nobody but each other.
     */
    protected ladiesFixtureRounds(totalRounds: number): Set<number> {
        const rounds = new Set<number>();

        if (!this.ladiesFirst || totalRounds < 1) {
            return rounds;
        }
        if (this.womenIn(this.players).length < LADIES_FIXTURE_MIN_WOMEN) {
            return rounds;
        }

        const wanted = Math.min(LADIES_FIXTURES_PER_SESSION, totalRounds);
        for (let fixture = 1; fixture <= wanted; fixture++) {
            rounds.add(Math.max(1, Math.round((fixture * totalRounds) / (wanted + 1))));
        }

        return rounds;
    }

    // --- Pairing history --------------------------------------------------

    protected resetPairHistory(): void {
        this.pairCounts = new Map();
    }

    protected timesPaired(first: string, second: string): number {
        return this.pairCounts.get(first)?.get(second) ?? 0;
    }

    protected recordPairing(first: string, second: string): void {
        this.bumpPairing(first, second);
        this.bumpPairing(second, first);
    }

    private bumpPairing(from: string, to: string): void {
        const counts = this.pairCounts.get(from) ?? new Map<string, number>();
        counts.set(to, (counts.get(to) ?? 0) + 1);
        this.pairCounts.set(from, counts);
    }

    // --- Pair forming -----------------------------------------------------

    /**
     * How desirable it is to team these two up right now. Higher is better.
     *
     * A preferred partnership starts well ahead of everyone else, but each round
     * they spend together shaves the bonus down. That means a player with two
     * preferred partners naturally alternates between them, and a preference is
     * eventually outranked by a pairing nobody has had yet.
     *
     * A mixed pair gets a much smaller nudge on top, so mixed wins between two
     * otherwise equal pairings but never beats a preference or drags the same
     * two players back together round after round.
     */
    protected pairScore(first: string, second: string): number {
        const bonus = this.isPreferredPartnership(first, second) ? this.partnerPriority : 0;

        return bonus - this.timesPaired(first, second);
        return bonus + this.genderScore(first, second) - this.timesPaired(first, second);
    }

    /** The mixed pair nudge. Zero while 'Ladies First' is off. */
    protected genderScore(first: string, second: string): number {
        if (!this.ladiesFirst) {
            return 0;
        }
        return pairMakeup(this.genderFor(first), this.genderFor(second)) === 'mixed'
            ? this.genderPriority
            : 0;
    }

    /**
     * Teams up a pool of players, repeatedly taking the highest scoring pair
     * still available. Preferences pull partners together, pairing history pushes
     * repeats apart, and ties fall to a random order.
     *
     * Stops early at `maxPairs`, which is how a ladies fixture gets its pairs
     * taken out of the women before the rest of the pool is teamed up.
     *
     * Records the pairings it makes. An odd player out is left unpaired.
     */
    protected formPairs(pool: string[], maxPairs: number = Infinity): [string, string][] {
        const available = this.shuffleArray(pool);
        const pairs: [string, string][] = [];

        while (available.length >= 2 && pairs.length < maxPairs) {
            let bestFirst = 0;
            let bestSecond = 1;
            let bestScore = -Infinity;

            for (let i = 0; i < available.length - 1; i++) {
                for (let j = i + 1; j < available.length; j++) {
                    const score = this.pairScore(available[i]!, available[j]!);

                    if (score > bestScore) {
                        bestScore = score;
                        bestFirst = i;
                        bestSecond = j;
                    }
                }
            }

            // Remove the later index first so the earlier one stays valid.
            const second = available.splice(bestSecond, 1)[0]!;
            const first = available.splice(bestFirst, 1)[0]!;

            pairs.push([first, second]);
            this.recordPairing(first, second);
        }

        return pairs;
    }

    /**
     * Teams up a round's pool, taking `ladiesPairs` pairs out of the women first.
     *
     * That reservation is the only part of the gender handling that is close to a
     * guarantee, which is why it is done before anything else gets a say. Asking
     * for more ladies pairs than the women on court can make simply yields fewer.
     * The rest of the pool is then teamed up as usual.
     */
    protected formRoundPairs(pool: string[], ladiesPairs: number = 0): [string, string][] {
        if (ladiesPairs < 1) {
            return this.formPairs(pool);
        }

        const ladies = this.formPairs(this.womenIn(pool), ladiesPairs);
        const alreadyPaired = new Set(ladies.flat());

        return [
            ...ladies,
            ...this.formPairs(pool.filter(player => !alreadyPaired.has(player)))
        ];
    }

    /**
     * Orders a round's teams so that, read two at a time, every fixture faces
     * like with like: ladies against ladies, mixed against mixed, men against
     * men. A makeup with an odd team left over plays whichever other leftover is
     * closest, which is where two men against two women can still turn up.
     *
     * The fixtures themselves are shuffled, so no makeup camps on court 1, and
     * an unpaired team stays last where a court without an opponent belongs.
     */
    protected orderTeamsIntoFixtures(teams: [string, string][]): [string, string][] {
        if (!this.ladiesFirst) {
            return this.shuffleArray(teams);
        }

        const byMakeup = new Map<PairMakeup, [string, string][]>();
        this.shuffleArray(teams).forEach(team => {
            const makeup = this.makeupOf(team);
            byMakeup.set(makeup, [...(byMakeup.get(makeup) ?? []), team]);
        });

        const fixtures: [string, string][][] = [];
        const leftovers: [string, string][] = [];

        MAKEUP_ORDER.forEach(makeup => {
            const group = byMakeup.get(makeup) ?? [];
            while (group.length >= 2) {
                fixtures.push([group.shift()!, group.shift()!]);
            }
            leftovers.push(...group);
        });

        while (leftovers.length >= 2) {
            fixtures.push([leftovers.shift()!, leftovers.shift()!]);
        }

        return [...this.shuffleArray(fixtures).flat(), ...leftovers];
    }

    /**
     * Puts one team's pairs in makeup order, ladies first. Ordering both sides
     * of a team fixture the same way is what lines ladies up against ladies and
     * mixed against mixed. Shuffled first, so the order within a makeup is still
     * random, and the sort is stable so that shuffle survives.
     */
    protected orderPairsByMakeup(pairs: [string, string][]): [string, string][] {
        const shuffled = this.shuffleArray(pairs);

        if (!this.ladiesFirst) {
            return shuffled;
        }

        return shuffled.sort((a, b) => makeupRank(this.makeupOf(a)) - makeupRank(this.makeupOf(b)));
    }

    // --- Rest rotation ----------------------------------------------------

    /**
     * Plans every round's rest pile for a pool of players in one go.
     *
     * Doing it up front is what lets a declared number of rests be honoured and
     * spread across the session. Picking resters a round at a time cannot: by the
     * time it notices someone is short, only the closing rounds are left.
     *
     * Call once per pool. Random doubles has a single pool, team mode has one per
     * team, because a team's resters can only come from that team.
     */
    protected buildRestPlan(pool: string[], slotsPerRound: number, totalRounds: number): RestPlan {
        const plan = new RestPlan({
            pool,
            totalRounds,
            slotsPerRound,
            declaredRests: this.declaredRestsOf,
            defaultRests: this.defaultRests,
            shuffle: items => this.shuffleArray(items)
        });

        this.recordUnmetRests(plan);

        return plan;
    }

    /**
     * Notes any declared number the courts would not allow. The usual cause is
     * the session simply not having that many rests to give out: the courts fix
     * how many players sit out each round, so there are exactly
     * `rounds x resters per round` rests to share.
     */
    private recordUnmetRests(plan: RestPlan): void {
        plan.unmetDeclarations().forEach(({ player, declared, planned }) => {
            this.warnings.push(
                `${player} asked for ${declared} ${rounds(declared)} of rest but the schedule could only give ${planned}. ` +
                `With this many players and courts there are only so many rests to go round.`
            );
        });
    }

    protected shuffleArray<T>(array: T[]): T[] {
        const arr = [...array];
        for (let i = arr.length - 1; i > 0; i--) {
            const randomIndex  = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[randomIndex]] = [arr[randomIndex]!, arr[i]!];
        }

        return arr;
    }

    protected abstract generateSchedule(): TSchedule;
    protected abstract createPDF(schedule: TSchedule): void;

}

function rounds(count: number): string {
    return count === 1 ? 'round' : 'rounds';
}

