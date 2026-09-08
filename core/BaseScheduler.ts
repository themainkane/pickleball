import { parse } from 'csv-parse/sync';
import {Writable} from "node:stream";
import {buildPreferenceMap, parsePartners, type PartnersInput, type PreferredPair, resolvePartners} from "./Partners";

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

    /** How many times each pair of players has been teamed up so far. */
    private pairCounts: Map<string, Map<string, number>> = new Map();

    constructor(
        protected csvContent: string,
        protected outputStream: Writable,
        protected targetDateColumn: string,
        protected partnersInput: PartnersInput = [],
        protected partnerPriority: number = DEFAULT_PARTNER_PRIORITY,
        /**
         * Roster typed straight into the UI. When this has names the CSV is
         * ignored entirely, so no date column is needed.
         */
        protected rosterNames: string[] = []
    ) {}

    public run(): void {
        try {
            console.log(`Loading players for date: ${this.targetDateColumn}...`);
            this.loadPlayers();

            if (this.preferredPairs.length > 0) {
                console.log(`Preferred partnerships: ${this.describePreferredPairs()}`);
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

    public getScheduleData(): { players: string[], schedule: TSchedule, preferredPairs: PreferredPair[] } {
        this.loadPlayers();
        const schedule = this.generateSchedule();
        return { players: this.players, schedule, preferredPairs: this.preferredPairs };
    }

    public getPreferredPairs(): PreferredPair[] {
        return this.preferredPairs;
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

        this.applyPartners();
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

        this.applyPartners();
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
     * Picks who sits out this round: fewest rests so far first, avoiding anyone
     * who rested last round, with a random tiebreak. Increments restCounts for
     * the chosen players.
     */
    protected selectResters(
        pool: string[],
        numResters: number,
        lastRested: Set<string>,
        restCounts: Map<string, number>
    ): string[] {
        if (numResters <= 0) {
            return [];
        }

        const byFairness = this.shuffleArray(pool)
            .sort((a, b) => (restCounts.get(a) ?? 0) - (restCounts.get(b) ?? 0));

        const resters = [
            ...byFairness.filter(player => !lastRested.has(player)),
            ...byFairness.filter(player => lastRested.has(player))
        ].slice(0, numResters);

        resters.forEach(player => restCounts.set(player, (restCounts.get(player) ?? 0) + 1));

        return resters;
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
