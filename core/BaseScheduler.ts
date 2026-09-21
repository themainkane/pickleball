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
export const DEFAULT_PARTNER_PRIORITY = 10;

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

    /** Anything the schedule could not honour, worth telling the organiser about. */
    protected warnings: string[] = [];

    /** How many times each pair of players has been teamed up so far. */
    private pairCounts: Map<string, Map<string, number>> = new Map();

    protected partnersInput: PartnersInput;
    protected partnerPriority: number;
    protected restsInput: RestsInput;
    protected defaultRests: number;
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

       playerRows.forEach((row) => {
            const playerName = row[targetColumnIndex];

            if (playerName && playerName.trim() !== '') {
                this.players.push(this.formatPlayerName(playerName));
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
            .map(name => this.formatPlayerName(name));

        if (this.players.length < 4) {
            throw new Error("Not enough players. Please enter at least 4 names.");
        }

        this.applyRosterSettings();
    }

    /** Resolves every setting that names players against the loaded roster. */
    protected applyRosterSettings(): void {
        this.applyPartners();
        this.applyRests();
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
     */
    protected pairScore(first: string, second: string): number {
        const bonus = this.isPreferredPartnership(first, second) ? this.partnerPriority : 0;
        return bonus - this.timesPaired(first, second);
    }

    /**
     * Teams up a pool of players, repeatedly taking the highest scoring pair
     * still available. Preferences pull partners together, pairing history pushes
     * repeats apart, and ties fall to a random order.
     *
     * Records the pairings it makes. An odd player out is left unpaired.
     */
    protected formPairs(pool: string[]): [string, string][] {
        const available = this.shuffleArray(pool);
        const pairs: [string, string][] = [];

        while (available.length >= 2) {
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

