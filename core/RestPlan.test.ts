import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RestPlan, type RestPlanOptions } from './RestPlan';

/** A pool of predictable player names. */
function pool(size: number): string[] {
    return Array.from({ length: size }, (_, index) => `P${String(index + 1).padStart(2, '0')}`);
}

/** Plans with the tie break pinned, so a failure can be reproduced. */
function plan(options: Omit<RestPlanOptions, 'shuffle'>): RestPlan {
    return new RestPlan({ ...options, shuffle: items => [...items] });
}

function restCounts(restPlan: RestPlan, players: string[]): number[] {
    return players.map(player => restPlan.restsFor(player));
}

describe('RestPlan', () => {
    it('gives everybody a rest before giving anybody a second', () => {
        // 17 players with 1 sitting out of 12 rounds: only 12 rests to share, so
        // some players get none. Nobody should get two while that is true.
        const players = pool(17);
        const restPlan = plan({ pool: players, totalRounds: 12, slotsPerRound: 1 });

        assert.equal(Math.max(...restCounts(restPlan, players)), 1);
    });

    it('spreads spare rests a level at a time', () => {
        // 48 rests between 20 players: everybody twice, then 8 players a third time.
        const players = pool(20);
        const restPlan = plan({ pool: players, totalRounds: 12, slotsPerRound: 4 });
        const counts = restCounts(restPlan, players);

        assert.equal(Math.min(...counts), 2);
        assert.equal(Math.max(...counts), 3);
        assert.equal(counts.filter(count => count === 3).length, 8);
    });

    it('counts a player as rested only once their whole allowance is met', () => {
        // An allowance of 2 with only 24 rests between 20 players cannot be met.
        // Everybody should still take their first rest before anybody takes a
        // second, so the counts sit on one level or the one above it.
        const players = pool(20);
        const restPlan = plan({ pool: players, totalRounds: 12, slotsPerRound: 2, defaultRests: 2 });
        const counts = restCounts(restPlan, players);

        assert.equal(Math.min(...counts), 1);
        assert.equal(Math.max(...counts), 2);
        assert.equal(counts.filter(count => count === 2).length, 4);
    });

    it('honours a declared number exactly', () => {
        const players = pool(20);
        const restPlan = plan({
            pool: players,
            totalRounds: 12,
            slotsPerRound: 4,
            declaredRests: new Map([['P01', 5], ['P02', 0]])
        });

        assert.equal(restPlan.restsFor('P01'), 5);
        assert.equal(restPlan.restsFor('P02'), 0);
        assert.deepEqual(restPlan.unmetDeclarations(), []);
    });

    it('takes a shortfall off the players who did not declare a number', () => {
        // 12 rests, and 3 of them are spoken for.
        const players = pool(17);
        const restPlan = plan({
            pool: players,
            totalRounds: 12,
            slotsPerRound: 1,
            declaredRests: new Map([['P01', 3]])
        });

        assert.equal(restPlan.restsFor('P01'), 3);
        assert.deepEqual(restPlan.unmetDeclarations(), []);
        assert.equal(Math.max(...restCounts(restPlan, players.slice(1))), 1);
    });

    it('reports a declared number the session cannot fit', () => {
        // 4 rests all told, and two players asking for 4 each.
        const restPlan = plan({
            pool: pool(6),
            totalRounds: 4,
            slotsPerRound: 1,
            declaredRests: new Map([['P01', 4], ['P02', 4]])
        });

        assert.deepEqual(restPlan.unmetDeclarations().sort((a, b) => a.player.localeCompare(b.player)), [
            { player: 'P01', declared: 4, planned: 2 },
            { player: 'P02', declared: 4, planned: 2 }
        ]);
    });

    it('spreads a rest allowance across the session', () => {
        const restPlan = plan({
            pool: pool(20),
            totalRounds: 12,
            slotsPerRound: 4,
            declaredRests: new Map([['P01', 3]])
        });

        const rounds = restRoundsOf(restPlan, 'P01', 12);

        assert.equal(rounds.length, 3);
        rounds.forEach((round, index) => {
            if (index > 0) {
                assert.ok(round - rounds[index - 1]! >= 3, `rests bunched together: ${rounds.join(',')}`);
            }
        });
    });

    it('seats exactly as many resters as the courts leave over, every round', () => {
        const restPlan = plan({ pool: pool(22), totalRounds: 8, slotsPerRound: 6 });

        for (let round = 1; round <= 8; round++) {
            const resters = restPlan.restersFor(round);
            assert.equal(resters.length, 6, `round ${round} seated ${resters.length} resters`);
            assert.equal(new Set(resters).size, 6, `round ${round} seated someone twice`);
        }
    });

    it('delivers every rest it allocated, whatever the session looks like', () => {
        // The plan is only fair if what a player is given is what they get, so
        // check it over a spread of sessions and random tie breaks.
        for (let players = 8; players <= 24; players++) {
            for (const rounds of [4, 6, 8, 12]) {
                for (const slots of [0, 1, 2, 5, players]) {
                    const roster = pool(players);
                    const restPlan = new RestPlan({
                        pool: roster,
                        totalRounds: rounds,
                        slotsPerRound: slots,
                        declaredRests: new Map([['P01', 3], ['P02', 0]]),
                        shuffle: shuffleRandomly
                    });

                    const label = `${players} players, ${rounds} rounds, ${slots} out`;
                    let seated = 0;

                    for (let round = 1; round <= rounds; round++) {
                        const resters = restPlan.restersFor(round);
                        assert.equal(resters.length, Math.min(slots, players), `${label}: round ${round} short`);
                        seated += resters.length;
                    }

                    roster.forEach(player => {
                        assert.equal(
                            restPlan.restsFor(player),
                            restPlan.targetFor(player),
                            `${label}: ${player} did not get the rests they were allocated`
                        );
                    });

                    assert.equal(seated, rounds * Math.min(slots, players), `${label}: wrong number of rests`);
                }
            }
        }
    });

    it('copes with a session that has no rests to give', () => {
        const noSlots = plan({ pool: pool(16), totalRounds: 8, slotsPerRound: 0 });
        const noRounds = plan({ pool: pool(16), totalRounds: 0, slotsPerRound: 4 });

        assert.deepEqual(restCounts(noSlots, pool(16)), new Array(16).fill(0));
        assert.deepEqual(restCounts(noRounds, pool(16)), new Array(16).fill(0));
        assert.deepEqual(noRounds.restersFor(1), []);
    });

    it('ignores a declaration for somebody outside the pool', () => {
        const restPlan = plan({
            pool: pool(8),
            totalRounds: 4,
            slotsPerRound: 1,
            declaredRests: new Map([['Someone Else', 3]])
        });

        assert.deepEqual(restPlan.unmetDeclarations(), []);
    });
});

/** The rounds a player sits out, in order. */
function restRoundsOf(restPlan: RestPlan, player: string, totalRounds: number): number[] {
    const rounds: number[] = [];

    for (let round = 1; round <= totalRounds; round++) {
        if (restPlan.restersFor(round).includes(player)) {
            rounds.push(round);
        }
    }

    return rounds;
}

function shuffleRandomly<T>(items: T[]): T[] {
    const shuffled = [...items];

    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
    }

    return shuffled;
}
