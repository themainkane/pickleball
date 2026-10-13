import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import { BaseScheduler, type RoundSchedule, type SchedulerOptions } from './BaseScheduler';
import { RandomDoublesScheduler } from './RandomDoublesScheduler';
import { TeamScheduler } from './TeamScheduler';
import type { Gender } from './Genders';

const DATE = '12/10/26';

/** Swallows the PDF stream the schedulers are built around. */
function sink(): Writable {
    return new Writable({ write(_chunk, _encoding, done) { done(); } });
}

/** A roster sheet with a gender column beside the date. */
function sheet(roster: Array<[string, Gender]>): string {
    return [`${DATE},Gender`, ...roster.map(([name, gender]) => `${name},${gender}`)].join('\n');
}

const women = (count: number): Array<[string, Gender]> =>
    Array.from({ length: count }, (_, index) => [`Fay ${LETTERS[index]}`, 'F']);

const men = (count: number): Array<[string, Gender]> =>
    Array.from({ length: count }, (_, index) => [`Max ${LETTERS[index]}`, 'M']);

const LETTERS = 'ABCDEFGHIJKLMNOP'.split('');

const isWoman = (player: string) => player.startsWith('Fay');
const allWomen = (team: string[]) => team.every(isWoman);

/** Fixtures where two women face two women. */
function ladiesFixtures(schedule: RoundSchedule[]): number {
    return schedule.reduce((count, round) =>
        count + round.matches.filter(match =>
            match.team2 !== null && allWomen(match.team1) && allWomen(match.team2)
        ).length, 0);
}

/** Fixtures where the two pairs are not made up the same way. */
function mismatchedFixtures(schedule: RoundSchedule[]): number {
    const makeup = (team: string[]) => team.filter(isWoman).length;

    return schedule.reduce((count, round) =>
        count + round.matches.filter(match =>
            match.team2 !== null && makeup(match.team1) !== makeup(match.team2)
        ).length, 0);
}

/** Opens up the parts of the base scheduler the gender handling hangs off. */
class TestScheduler extends BaseScheduler<void> {
    constructor(csvContent: string, options: SchedulerOptions = {}) {
        super(csvContent, sink(), DATE, options);
    }

    // Pinned, so a failure can be reproduced.
    protected override shuffleArray<T>(array: T[]): T[] {
        return [...array];
    }

    protected generateSchedule(): void {
        // Nothing to schedule: this scheduler exists to expose the pieces below.
    }

    protected createPDF(): void {
        // No output wanted.
    }

    public roster(): string[] {
        this.validate();
        return this.players;
    }

    public genderOfPlayer(player: string): Gender | undefined {
        return this.genderFor(player);
    }

    public scoreOf(first: string, second: string): number {
        return this.pairScore(first, second);
    }

    public roundPairs(pool: string[], ladiesPairs = 0): [string, string][] {
        return this.formRoundPairs(pool, ladiesPairs);
    }

    public fixtureOrder(teams: [string, string][]): [string, string][] {
        return this.orderTeamsIntoFixtures(teams);
    }

    public reservedRounds(totalRounds: number): Set<number> {
        return this.ladiesFixtureRounds(totalRounds);
    }
}

describe('Ladies First', () => {
    describe('reading gender', () => {
        it('takes it from a gender column without putting it in the roster', () => {
            const scheduler = new TestScheduler(sheet([...women(2), ...men(2)]));

            assert.deepEqual(scheduler.roster(), ['Fay A', 'Fay B', 'Max A', 'Max B']);
            assert.equal(scheduler.genderOfPlayer('Fay A'), 'F');
            assert.equal(scheduler.genderOfPlayer('Max B'), 'M');
        });

        it('takes it from the name itself', () => {
            const scheduler = new TestScheduler('', {
                rosterNames: ['Fay Ash (F)', 'Fay Birch (F)', 'Max Ash (M)', 'Max Birch']
            });

            assert.deepEqual(scheduler.roster(), ['Fay A', 'Fay B', 'Max A', 'Max B']);
            assert.equal(scheduler.genderOfPlayer('Fay A'), 'F');
            assert.equal(scheduler.genderOfPlayer('Max B'), undefined);
        });

        it('lets the form correct what the sheet said', () => {
            const scheduler = new TestScheduler(sheet([...women(2), ...men(2)]), {
                genders: 'Max B: F'
            });

            scheduler.roster();
            assert.equal(scheduler.genderOfPlayer('Max B'), 'F');
        });

        it('schedules happily when nobody has a gender', () => {
            const scheduler = new TestScheduler('', {
                rosterNames: ['Fay Ash', 'Fay Birch', 'Max Ash', 'Max Birch']
            });

            assert.equal(scheduler.roster().length, 4);
            assert.equal(scheduler.genderOfPlayer('Fay A'), undefined);
        });
    });

    describe('favouring mixed pairs', () => {
        const roster = sheet([...women(2), ...men(2)]);

        it('prefers a mixed pair to a pair of the same gender', () => {
            const scheduler = new TestScheduler(roster);
            scheduler.roster();

            assert.ok(scheduler.scoreOf('Fay A', 'Max A') > scheduler.scoreOf('Fay A', 'Fay B'));
            assert.ok(scheduler.scoreOf('Fay A', 'Max A') > scheduler.scoreOf('Max A', 'Max B'));
        });

        it('still puts a preferred partnership first', () => {
            const scheduler = new TestScheduler(roster, { partners: 'Fay Ash & Fay Birch' });
            scheduler.roster();

            assert.ok(scheduler.scoreOf('Fay A', 'Fay B') > scheduler.scoreOf('Fay A', 'Max A'));
        });

        it('does not drag the same mixed pair back together round after round', () => {
            const scheduler = new TestScheduler(roster);
            scheduler.roster();

            // One round together is enough to cancel the mixed bonus out.
            scheduler.roundPairs(['Fay A', 'Max A']);

            assert.ok(scheduler.scoreOf('Fay A', 'Max A') <= scheduler.scoreOf('Fay B', 'Max B'));
        });

        it('ignores gender entirely once the toggle is off', () => {
            const scheduler = new TestScheduler(roster, { ladiesFirst: false });
            scheduler.roster();

            assert.equal(scheduler.scoreOf('Fay A', 'Max A'), scheduler.scoreOf('Fay A', 'Fay B'));
            assert.deepEqual(scheduler.reservedRounds(12), new Set());
        });
    });

    describe('reserving a ladies fixture', () => {
        it('sets aside two rounds, spread across the session', () => {
            const scheduler = new TestScheduler(sheet([...women(4), ...men(4)]));
            scheduler.roster();

            assert.deepEqual(scheduler.reservedRounds(12), new Set([4, 8]));
        });

        it('reserves nothing when the women could not fill one', () => {
            const scheduler = new TestScheduler(sheet([...women(3), ...men(5)]));
            scheduler.roster();

            assert.deepEqual(scheduler.reservedRounds(12), new Set());
        });

        it('takes the ladies pairs out of the women before anyone else is teamed up', () => {
            const scheduler = new TestScheduler(sheet([...women(4), ...men(4)]));
            const pool = scheduler.roster();

            const pairs = scheduler.roundPairs(pool, 2);

            assert.equal(pairs.length, 4);
            assert.equal(pairs.filter(pair => allWomen(pair)).length, 2);
        });

        it('gives back what it can when the women are short', () => {
            const scheduler = new TestScheduler(sheet([...women(2), ...men(6)]));
            const pool = scheduler.roster();

            const pairs = scheduler.roundPairs(pool, 2);

            assert.equal(pairs.length, 4);
            assert.equal(pairs.filter(pair => allWomen(pair)).length, 1);
        });
    });

    describe('putting fixtures together', () => {
        it('faces like with like', () => {
            const scheduler = new TestScheduler(sheet([...women(4), ...men(4)]));
            scheduler.roster();

            const ordered = scheduler.fixtureOrder([
                ['Fay A', 'Fay B'],
                ['Max A', 'Max B'],
                ['Fay C', 'Fay D'],
                ['Max C', 'Max D']
            ]);

            const fixtures = [ordered.slice(0, 2), ordered.slice(2, 4)];
            const sameMakeup = (fixture: [string, string][]) =>
                fixture[0]!.filter(isWoman).length === fixture[1]!.filter(isWoman).length;

            assert.ok(fixtures.every(sameMakeup));
        });

        it('puts the odd pairs left over together, at the back', () => {
            const scheduler = new TestScheduler(sheet([...women(4), ...men(4)]));
            scheduler.roster();

            // One ladies pair, two mixed, one mens: only the mixed pairs can face
            // like with like, so the other two have to make do with each other.
            const ordered = scheduler.fixtureOrder([
                ['Fay A', 'Max A'],
                ['Fay B', 'Fay C'],
                ['Max B', 'Max C'],
                ['Fay D', 'Max D']
            ]);

            assert.deepEqual(ordered.slice(0, 2), [['Fay A', 'Max A'], ['Fay D', 'Max D']]);
            assert.deepEqual(ordered.slice(2, 4), [['Fay B', 'Fay C'], ['Max B', 'Max C']]);
        });

        it('leaves a team with no opponent at the back', () => {
            const scheduler = new TestScheduler(sheet([...women(4), ...men(2)]));
            scheduler.roster();

            const ordered = scheduler.fixtureOrder([
                ['Fay A', 'Fay B'],
                ['Fay C', 'Fay D'],
                ['Max A', 'Max B']
            ]);

            assert.deepEqual(ordered[2], ['Max A', 'Max B']);
        });
    });

    describe('a whole random doubles session', () => {
        // 16 players on 4 courts means nobody rests, so the women are always
        // available and the reserved rounds can always be honoured.
        const roster = sheet([...women(6), ...men(10)]);
        const settings = { courtsCount: 4, totalRounds: 8, defaultRests: 0 };

        it('gets its ladies fixtures', () => {
            const { schedule } = new RandomDoublesScheduler(roster, sink(), DATE, settings).getScheduleData();

            assert.ok(ladiesFixtures(schedule) >= 2, 'expected at least two ladies fixtures');
        });

        it('rarely puts two men against two women', () => {
            const { schedule } = new RandomDoublesScheduler(roster, sink(), DATE, settings).getScheduleData();

            // 4 courts x 8 rounds = 32 fixtures. A handful are unavoidable when a
            // makeup has an odd pair left over.
            assert.ok(mismatchedFixtures(schedule) <= 8, 'expected most fixtures to face like with like');
        });

        it('says nothing about gender in what it hands back', () => {
            const data = new RandomDoublesScheduler(roster, sink(), DATE, settings).getScheduleData();

            assert.deepEqual(Object.keys(data).sort(), [
                'players', 'preferredPairs', 'restDeclarations', 'schedule', 'warnings'
            ]);
            assert.ok(!JSON.stringify(data).match(/gender/i));
        });

        it('still gives everyone a game with the toggle off', () => {
            const { schedule } = new RandomDoublesScheduler(roster, sink(), DATE, {
                ...settings,
                ladiesFirst: false
            }).getScheduleData();

            assert.equal(schedule.length, 8);
            schedule.forEach(round => assert.equal(round.matches.length, 4));
        });
    });

    describe('a whole team session', () => {
        const roster = sheet([...women(6), ...men(10)]);
        const settings = { courtsCount: 4, totalRounds: 6, defaultRests: 0 };

        it('splits the women across both teams', () => {
            const scheduler = new TeamScheduler(roster, sink(), DATE, settings);
            scheduler.getScheduleData();

            assert.ok(scheduler.teamA.filter(isWoman).length >= 2);
            assert.ok(scheduler.teamB.filter(isWoman).length >= 2);
        });

        it('gets its ladies fixtures', () => {
            const { schedule } = new TeamScheduler(roster, sink(), DATE, settings).getScheduleData();

            assert.ok(ladiesFixtures(schedule) >= 2, 'expected at least two ladies fixtures');
        });
    });
});
