/**
 * Who sits out, worked out for the whole session in one go.
 *
 * The old approach picked resters one round at a time, fewest rests first. That
 * is fair, but it cannot honour a declared number: by the time the scheduler
 * notices someone is short, only the last rounds are left, so their rests end up
 * bunched at the end of the evening. Planning the session up front fixes that.
 *
 * How it works:
 *
 *  1. Every player gets a target: their declared number, or the default.
 *  2. Targets are reconciled with capacity. The courts decide how many players
 *     must sit out each round, so the session has exactly
 *     `rounds x slotsPerRound` rests to hand out, no more and no fewer. Spare
 *     rests are handed to players who did not declare a number, and a shortfall
 *     is taken off them first, so declared numbers survive wherever possible.
 *  3. Each player's rests are placed on their ideal rounds: evenly spaced across
 *     the session, starting from a per player offset so players do not all want
 *     the same round. Where a round is already full the rest moves to the
 *     nearest round with room, preferring rounds that do not leave a player
 *     resting twice on the trot.
 *  4. Any round the placement left short is topped up, because the court
 *     arithmetic does not allow a round to run with too many players on court.
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
    private readonly shuffle: <T>(items: T[]) => T[];

    /** The number of rests the plan is aiming at, after reconciling capacity. */
    private readonly targets = new Map<string, number>();

    /** Round number (1 based) -> who sits out. */
    private readonly restersByRound: string[][];

    /** player -> the rounds they sit out. */
    private readonly restRounds = new Map<string, Set<number>>();

    constructor(options: RestPlanOptions) {
        this.pool = [...options.pool];
        this.totalRounds = Math.max(0, Math.floor(options.totalRounds));
        this.slotsPerRound = Math.min(Math.max(0, Math.floor(options.slotsPerRound)), this.pool.length);
        this.declaredRests = new Map(options.declaredRests ?? []);
        this.shuffle = options.shuffle ?? (items => [...items]);

        this.restersByRound = Array.from({ length: this.totalRounds }, () => []);
        this.pool.forEach(player => this.restRounds.set(player, new Set<number>()));

        this.setTargets(options.defaultRests ?? DEFAULT_RESTS_PER_PLAYER);
        this.reconcileTargetsWithCapacity();
        this.placeRests();
        this.fillShortRounds();
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

    // --- Targets ----------------------------------------------------------

    private setTargets(defaultRests: number): void {
        this.pool.forEach(player => {
            const declared = this.declaredRests.get(player);
            const wanted = declared ?? defaultRests;
            this.targets.set(player, this.clampToRounds(wanted));
        });
    }

    /**
     * Brings the total of all targets in line with the number of rests the
     * session actually has to give, since every round seats exactly
     * `slotsPerRound` players whatever anyone asked for.
     */
    private reconcileTargetsWithCapacity(): void {
        const capacity = this.totalRounds * this.slotsPerRound;
        const wanted = this.pool.reduce((total, player) => total + this.targetFor(player), 0);

        if (wanted > capacity) {
            this.adjustTargets(wanted - capacity, -1);
            return;
        }

        if (wanted < capacity) {
            this.adjustTargets(capacity - wanted, 1);
        }
    }

    /** Moves `count` rests onto (delta 1) or off (delta -1) players' targets. */
    private adjustTargets(count: number, delta: 1 | -1): void {
        for (let moved = 0; moved < count; moved++) {
            const player = this.pickTargetToAdjust(delta);

            // Everyone is pinned at 0 or at every round. Nothing more to move.
            if (!player) {
                return;
            }

            this.targets.set(player, this.targetFor(player) + delta);
        }
    }

    /**
     * Who flexes next. Players who declared a number are only touched once the
     * undeclared ones have nothing left to give, and within each group the
     * target furthest from the rest moves, so the flex spreads evenly.
     */
    private pickTargetToAdjust(delta: 1 | -1): string | undefined {
        const eligible = this.shuffle(this.pool).filter(player =>
            delta > 0 ? this.targetFor(player) < this.totalRounds : this.targetFor(player) > 0
        );

        if (eligible.length === 0) {
            return undefined;
        }

        // Sort is stable, so the shuffle above stays as the tie break.
        return eligible.sort((a, b) => {
            const declaredFirst = Number(this.declaredRests.has(a)) - Number(this.declaredRests.has(b));
            if (declaredFirst !== 0) {
                return declaredFirst;
            }

            return delta > 0
                ? this.targetFor(a) - this.targetFor(b)
                : this.targetFor(b) - this.targetFor(a);
        })[0];
    }

    // --- Placing rests into rounds ----------------------------------------

    private placeRests(): void {
        const order = this.shuffle(this.pool);

        // Staggering the starting point stops every player wanting the same
        // round, which would leave the plan leaning on the nearest round search.
        const offsets = new Map<string, number>();
        order.forEach((player, index) => offsets.set(player, index / Math.max(1, order.length)));

        // The more rests a player needs, the less room there is to move them
        // about, so they pick their rounds first.
        const byRoom = [...order].sort((a, b) => this.targetFor(b) - this.targetFor(a));

        byRoom.forEach(player => {
            const target = this.targetFor(player);

            for (let index = 0; index < target; index++) {
                this.claimRound(player, this.idealRound(index, target, offsets.get(player) ?? 0));
            }
        });
    }

    /** The round a player's nth rest wants, spacing their rests evenly. */
    private idealRound(index: number, target: number, offset: number): number {
        const spacing = this.totalRounds / target;
        return this.clampToRound(Math.floor((index + offset) * spacing) + 1);
    }

    /**
     * Books a rest as near to the wanted round as there is room for. Tries first
     * without leaving the player resting in back to back rounds, then settles
     * for any round with room.
     */
    private claimRound(player: string, wantedRound: number): boolean {
        for (const avoidBackToBack of [true, false]) {
            for (const round of this.roundsNearest(wantedRound)) {
                if (this.canRest(player, round, avoidBackToBack)) {
                    this.assignRest(player, round);
                    return true;
                }
            }
        }

        return false;
    }

    /** Every round, ordered by how far it is from the wanted one. */
    private roundsNearest(wantedRound: number): number[] {
        const rounds: number[] = [];

        const add = (round: number) => {
            if (round >= 1 && round <= this.totalRounds && !rounds.includes(round)) {
                rounds.push(round);
            }
        };

        add(wantedRound);
        for (let offset = 1; offset <= this.totalRounds; offset++) {
            add(wantedRound + offset);
            add(wantedRound - offset);
        }

        return rounds;
    }

    private canRest(player: string, round: number, avoidBackToBack: boolean): boolean {
        if (this.restersByRound[round - 1]!.length >= this.slotsPerRound) {
            return false;
        }

        const resting = this.restRounds.get(player)!;
        if (resting.has(round)) {
            return false;
        }

        return !(avoidBackToBack && (resting.has(round - 1) || resting.has(round + 1)));
    }

    /**
     * Tops up any round left short. The courts seat a fixed number of players,
     * so a round cannot simply run with fewer resters: someone has to sit out
     * even if it takes them past their number. Whoever is furthest behind their
     * target goes first, so the damage lands where it is least felt.
     */
    private fillShortRounds(): void {
        for (let round = 1; round <= this.totalRounds; round++) {
            while (this.restersByRound[round - 1]!.length < this.slotsPerRound) {
                const standIn = this.pickStandIn(round);

                if (!standIn) {
                    break;
                }

                this.assignRest(standIn, round);
            }
        }
    }

    private pickStandIn(round: number): string | undefined {
        const available = this.shuffle(this.pool)
            .filter(player => !this.restRounds.get(player)!.has(round));

        if (available.length === 0) {
            return undefined;
        }

        return available.sort((a, b) => this.shortfall(b) - this.shortfall(a))[0];
    }

    /** How many rests short of their target a player currently is. */
    private shortfall(player: string): number {
        return this.targetFor(player) - this.restsFor(player);
    }

    private assignRest(player: string, round: number): void {
        this.restersByRound[round - 1]!.push(player);
        this.restRounds.get(player)!.add(round);
    }

    private clampToRounds(rests: number): number {
        return Math.min(Math.max(0, Math.floor(rests)), this.totalRounds);
    }

    private clampToRound(round: number): number {
        return Math.min(Math.max(1, round), Math.max(1, this.totalRounds));
    }
}
