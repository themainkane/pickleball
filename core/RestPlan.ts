/**
 * Who sits out, worked out for the whole session in one go.
 *
 * Picking resters a round at a time cannot honour a declared number: by the time
 * the scheduler notices someone is short, only the last rounds are left, so their
 * rests end up bunched at the end of the evening. Planning the session up front
 * fixes that.
 *
 * How it works:
 *
 *  1. Every player is owed an allowance: the number of rests declared for them,
 *     or the default. A player only counts as rested once that allowance has been
 *     met, and a rested player is never given another rest while somebody is
 *     still owed one, so everybody sits out before anybody sits out again.
 *  2. The courts decide how many players must sit out each round, so the session
 *     has exactly `rounds x slotsPerRound` rests to hand out, no more and no
 *     fewer. Declared numbers are booked first so they survive a session short of
 *     rests, and spare rests go in further cycles to the players who did not
 *     declare a number, because a declaration is exact.
 *  3. Rounds are then filled in order, each seat going to whoever has the most
 *     rests still to take, longest wait first. Neediest first is what guarantees
 *     every allocation is delivered; longest wait first is what spreads a
 *     player's rests across the session instead of bunching them.
 *
 * Anything the plan could not honour is reported by `unmetDeclarations()` rather
 * than thrown, so a session still gets a schedule and the organiser gets told
 * what did not fit.
 */

import { DEFAULT_RESTS_PER_PLAYER } from './Rests';

export interface RestPlanOptions {
    /** The players this plan covers. In team mode, one plan per team. */
    pool: string[];
    totalRounds: number;
    /** How many of the pool must sit out each round. Fixed by the court count. */
    slotsPerRound: number;
    /** player -> declared number of rests. Players not named here take the default. */
    declaredRests?: Map<string, number>;
    /** Rests for players with no declared number. */
    defaultRests?: number;
    /** Used for tie breaks. Injected so tests can make a plan repeatable. */
    shuffle?: <T>(items: T[]) => T[];
}

/** A declared number the plan could not deliver, and what it managed instead. */
export interface UnmetRestDeclaration {
    player: string;
    declared: number;
    planned: number;
}

export class RestPlan {
    private readonly pool: string[];
    private readonly totalRounds: number;
    private readonly slotsPerRound: number;
    private readonly declaredRests: Map<string, number>;
    private readonly defaultRests: number;
    private readonly shuffle: <T>(items: T[]) => T[];

    /** The number of rests the plan is aiming at, after reconciling capacity. */
    private readonly targets = new Map<string, number>();

    /** Round number (1 based) -> who sits out. */
    private readonly restersByRound: string[][];

    /** player -> the rounds they sit out. */
    private readonly restRounds = new Map<string, Set<number>>();

    /** player -> the last round they were given, or 0 before their first rest. */
    private readonly lastRestRound = new Map<string, number>();

    constructor(options: RestPlanOptions) {
        this.pool = [...options.pool];
        this.totalRounds = Math.max(0, Math.floor(options.totalRounds));
        this.slotsPerRound = Math.min(Math.max(0, Math.floor(options.slotsPerRound)), this.pool.length);
        this.declaredRests = new Map(options.declaredRests ?? []);
        this.shuffle = options.shuffle ?? (items => [...items]);

        this.restersByRound = Array.from({ length: this.totalRounds }, () => []);
        this.pool.forEach(player => {
            this.restRounds.set(player, new Set<number>());
            this.lastRestRound.set(player, 0);
        });

        this.defaultRests = this.clampToRounds(options.defaultRests ?? DEFAULT_RESTS_PER_PLAYER);

        this.allocateRests();
        this.placeRests();
    }

    // --- Reading the plan -------------------------------------------------

    /** Who sits out in the given round. Rounds are 1 based. */
    public restersFor(round: number): string[] {
        return [...(this.restersByRound[round - 1] ?? [])];
    }

    /** How many rests the plan actually gives this player. */
    public restsFor(player: string): number {
        return this.restRounds.get(player)?.size ?? 0;
    }

    /** The number of rests the plan aimed at for this player. */
    public targetFor(player: string): number {
        return this.targets.get(player) ?? 0;
    }

    /**
     * Declared numbers the plan could not deliver. Empty when every declaration
     * was honoured, which is the normal case.
     */
    public unmetDeclarations(): UnmetRestDeclaration[] {
        const unmet: UnmetRestDeclaration[] = [];

        this.declaredRests.forEach((declared, player) => {
            // Declarations naming players outside this pool are not ours to judge.
            if (!this.restRounds.has(player)) {
                return;
            }

            const planned = this.restsFor(player);

            if (planned !== declared) {
                unmet.push({ player, declared, planned });
            }
        });

        return unmet;
    }

    // --- How many rests each player gets ----------------------------------

    /**
     * Shares out the session's rests, in cycles of each player's allowance.
     *
     * Declared numbers go first, so a session that cannot fit everyone's rests
     * takes the shortfall off the players who did not ask for a number. Whatever
     * is left over is then cycled among those undeclared players, and only when
     * they can take no more does a declared number get pushed past what was
     * asked for, because the courts seat a fixed number of players every round.
     */
    private allocateRests(): void {
        this.pool.forEach(player => this.targets.set(player, 0));

        const declared = this.pool.filter(player => this.declaredRests.has(player));
        const undeclared = this.pool.filter(player => !this.declaredRests.has(player));

        let budget = this.totalRounds * this.slotsPerRound;

        budget -= this.grantRests(declared, player => this.allowanceFor(player), budget);
        budget -= this.grantRests(undeclared, () => this.totalRounds, budget);
        this.grantRests(declared, () => this.totalRounds, budget);
    }

    /** The rests a player is owed before they count as rested. */
    private allowanceFor(player: string): number {
        return this.clampToRounds(this.declaredRests.get(player) ?? this.defaultRests);
    }

    /**
     * Hands out up to `budget` rests among `players`, each one going to whoever
     * has the fewest so far. That climbs a level at a time: everybody is given
     * one rest before anybody is given two. No player is taken past `ceiling`.
     *
     * Returns how many rests it managed to hand out, which falls short of the
     * budget only when every player has hit their ceiling.
     */
    private grantRests(players: string[], ceiling: (player: string) => number, budget: number): number {
        let granted = 0;

        while (granted < budget) {
            // Sort is stable, so the shuffle stays as the tie break.
            const next = this.shuffle(players)
                .filter(player => this.targetFor(player) < ceiling(player))
                .sort((a, b) => this.targetFor(a) - this.targetFor(b))[0];

            if (!next) {
                break;
            }

            this.targets.set(next, this.targetFor(next) + 1);
            granted++;
        }

        return granted;
    }

    // --- Which rounds they sit out ----------------------------------------

    /**
     * Places every allocated rest into a round.
     *
     * Seats go to whoever is furthest behind their even share of the session, so
     * a player's rests land spread out rather than bunched. A player who needs
     * every remaining round jumps the queue, which is what makes the allocation
     * deliverable in full: they can never be squeezed out and left short while
     * somebody else rests more often than they were given.
     */
    private placeRests(): void {
        for (let round = 1; round <= this.totalRounds; round++) {
            while (this.restersByRound[round - 1]!.length < this.slotsPerRound) {
                const rester = this.pickRester(round);

                // Only when the pool has no rests left to give, which the court
                // arithmetic rules out unless a round could not be filled at all.
                if (!rester) {
                    break;
                }

                this.assignRest(rester, round);
            }
        }
    }

    /**
     * Who takes the next seat in a round.
     *
     * Anyone who now needs every remaining round comes first, because the session
     * has no later round left to give them. Otherwise it is whoever owes the most
     * against their even share of the session, and of those the player who has
     * waited longest, so rests come round evenly and back to back rests only
     * happen where the seats leave no choice.
     */
    private pickRester(round: number): string | undefined {
        const roundsLeft = this.totalRounds - round + 1;
        const outOfRounds = (player: string) => Number(this.outstanding(player) >= roundsLeft);

        return this.shuffle(this.pool)
            .filter(player => this.outstanding(player) > 0 && !this.restRounds.get(player)!.has(round))
            .sort((a, b) =>
                (outOfRounds(b) - outOfRounds(a)) ||
                (this.restDebt(b, round) - this.restDebt(a, round)) ||
                (this.lastRestFor(a) - this.lastRestFor(b))
            )[0];
    }

    /**
     * How far behind their even share of the session a player is by this round.
     * Three rests across twelve rounds is due its second by round eight, so come
     * round eight that player outranks anyone already up to date.
     */
    private restDebt(player: string, round: number): number {
        if (this.totalRounds === 0) {
            return 0;
        }

        return (this.targetFor(player) * round) / this.totalRounds - this.restsFor(player);
    }

    /** How many of a player's allocated rests are still to be placed. */
    private outstanding(player: string): number {
        return this.targetFor(player) - this.restsFor(player);
    }

    /** The last round a player sits out, or 0 before their first rest. */
    private lastRestFor(player: string): number {
        return this.lastRestRound.get(player) ?? 0;
    }

    private assignRest(player: string, round: number): void {
        this.restersByRound[round - 1]!.push(player);
        this.restRounds.get(player)!.add(round);
        this.lastRestRound.set(player, round);
    }

    private clampToRounds(rests: number): number {
        return Math.min(Math.max(0, Math.floor(rests)), this.totalRounds);
    }
}
