import {
    BaseScheduler,
    DEFAULT_GENDER_PRIORITY,
    DEFAULT_PARTNER_PRIORITY,
    type Match,
    type RoundSchedule
} from './BaseScheduler';
import { Writable } from 'node:stream';
import {PdfGenerator} from "./Pdf/PdfGenerator";
import {defaultPdfConfig} from "./Pdf/pdfConfig";
import type {PartnersInput} from "./Partners";
import {DEFAULT_RESTS_PER_PLAYER, type RestsInput} from "./Rests";
import {type GendersInput, WOMEN_PER_LADIES_PAIR} from "./Genders";


export interface TeamConfig {
    courtsCount: number;
    totalRounds: number;
    /** Partnerships the scheduler favours, including keeping them on the same team. */
    partners: PartnersInput;
    /** How strongly to favour those partnerships. See DEFAULT_PARTNER_PRIORITY. */
    partnerPriority: number;
    /** Rest counts declared for named players. See Rests. */
    rests: RestsInput;
    /** Rests for every player with no declared number of their own. */
    defaultRests: number;
    /** Genders declared for named players. Only shapes fixtures. See Genders. */
    genders: GendersInput;
    /** The 'Ladies First' toggle. Off means gender plays no part. */
    ladiesFirst: boolean;
    /** How strongly to favour mixed pairs. See DEFAULT_GENDER_PRIORITY. */
    genderPriority: number;
    /** Names typed straight into the UI. When set, the CSV is ignored. */
    rosterNames: string[];
}

export class TeamScheduler extends BaseScheduler<RoundSchedule[]> {
    private config: TeamConfig;
    public teamA: string[] = [];
    public teamB: string[] = [];

    constructor(
        csvContent: string,
        outputStream: Writable,
        targetDateColumn: string,
        config: Partial<TeamConfig> = {}
    ) {
        super(csvContent, outputStream, targetDateColumn, config);

        this.config = {
            courtsCount: 4,
            totalRounds: 6,
            partners: [],
            partnerPriority: DEFAULT_PARTNER_PRIORITY,
            rests: [],
            defaultRests: DEFAULT_RESTS_PER_PLAYER,
            genders: [],
            ladiesFirst: true,
            genderPriority: DEFAULT_GENDER_PRIORITY,
            rosterNames: [],
            ...config
        };
    }

    protected generateSchedule(): RoundSchedule[] {
        // 1. Divide players into two even teams, keeping preferred partners together where possible
        this.splitIntoTeams();

        // 2. Work out how many matches we can actually run. This depends only on
        // the courts available and the size of the smaller team, so it holds for
        // every round of the session.
        const maxMatchesByPlayers = Math.min(
            Math.floor(this.teamA.length / 2),
            Math.floor(this.teamB.length / 2)
        );
        const activeMatches = Math.min(maxMatchesByPlayers, this.config.courtsCount);

        // Each match needs 2 players per team
        const playingPerTeam = activeMatches * 2;

        // 3. Plan each team's rests for the whole session. A team's resters can
        // only come from that team, so the two teams get a plan each and a
        // player's declared number is honoured within their own team's capacity.
        const restPlanA = this.buildRestPlan(this.teamA, this.teamA.length - playingPerTeam, this.config.totalRounds);
        const restPlanB = this.buildRestPlan(this.teamB, this.teamB.length - playingPerTeam, this.config.totalRounds);

        this.resetPairHistory();

        // Rounds that owe a ladies fixture. In team mode that needs two women
        // playing on each side, so a round short of them passes the debt on.
        const ladiesFixtureRounds = this.ladiesFixtureRounds(this.config.totalRounds);
        let ladiesFixturesOwed = 0;

        const rounds: RoundSchedule[] = [];

        for (let round = 1; round <= this.config.totalRounds; round++) {
            // 4. Take this round's resters from each team's plan
            const restingA = restPlanA.restersFor(round);
            const playingA = this.teamA.filter(p => !restingA.includes(p));

            const restingB = restPlanB.restersFor(round);
            const playingB = this.teamB.filter(p => !restingB.includes(p));

            // 5. Form pairs within each team, favouring preferred partnerships,
            // then mixed pairs, with a ladies pair set aside on each side in the
            // rounds that owe a ladies fixture.
            if (ladiesFixtureRounds.has(round)) {
                ladiesFixturesOwed++;
            }

            const reserveLadiesFixture = ladiesFixturesOwed > 0
                && activeMatches > 0
                && this.womenIn(playingA).length >= WOMEN_PER_LADIES_PAIR
                && this.womenIn(playingB).length >= WOMEN_PER_LADIES_PAIR;

            if (reserveLadiesFixture) {
                ladiesFixturesOwed--;
            }

            const ladiesPairsPerTeam = reserveLadiesFixture ? 1 : 0;

            // Both sides ordered the same way, so fixture n faces like with like.
            const pairsA = this.orderPairsByMakeup(this.formRoundPairs(playingA, ladiesPairsPerTeam));
            const pairsB = this.orderPairsByMakeup(this.formRoundPairs(playingB, ladiesPairsPerTeam));

            // 6. Create fixtures (Team A pair vs Team B pair), shuffled so no
            // fixture camps on the same court every round.
            const fixtures: Array<[[string, string], [string, string]]> = [];
            for (let i = 0; i < activeMatches; i++) {
                fixtures.push([pairsA[i]!, pairsB[i]!]);
            }

            const matches: Match[] = this.shuffleArray(fixtures).map(([team1, team2], index) => ({
                court: index + 1,
                team1,
                team2
            }));

            rounds.push({
                roundNumber: round,
                matches,
                restPile: [...restingA, ...restingB]
            });
        }

        return rounds;
    }

    /**
     * Splits the roster into two teams that differ in size by at most one.
     *
     * Players with the most preferred partners are placed first and each player
     * joins whichever team already holds more of their preferred partners, so
     * partnerships land on the same team where the size limit allows it. A player
     * with partners on both sides simply follows one of them.
     *
     * With nothing to follow, the player joins the team holding fewer of their
     * own gender. That keeps the women spread across both sides, which is what
     * lets each team field mixed pairs and puts a ladies pair on each side of a
     * ladies fixture.
     */
    private splitIntoTeams(): void {
        const capacityA = Math.ceil(this.players.length / 2);
        const capacityB = this.players.length - capacityA;

        const placementOrder = this.shuffleArray(this.players)
            .sort((a, b) => this.preferredPartnersFor(b).size - this.preferredPartnersFor(a).size);

        this.teamA = [];
        this.teamB = [];

        placementOrder.forEach(player => {
            if (this.teamA.length >= capacityA) {
                this.teamB.push(player);
                return;
            }
            if (this.teamB.length >= capacityB) {
                this.teamA.push(player);
                return;
            }

            const pullToA = this.countPreferredPartnersIn(player, this.teamA);
            const pullToB = this.countPreferredPartnersIn(player, this.teamB);

            if (pullToA !== pullToB) {
                (pullToA > pullToB ? this.teamA : this.teamB).push(player);
                return;
            }

            // Nothing to follow: level the genders up, so both teams can field
            // mixed pairs and a ladies fixture has women on each side. Team sizes
            // are capped above, so this cannot run the teams lopsided.
            const sameGenderInA = this.countSameGenderIn(player, this.teamA);
            const sameGenderInB = this.countSameGenderIn(player, this.teamB);

            if (sameGenderInA !== sameGenderInB) {
                (sameGenderInA < sameGenderInB ? this.teamA : this.teamB).push(player);
                return;
            }

            (this.teamA.length <= this.teamB.length ? this.teamA : this.teamB).push(player);
        });
    }

    private description = "11 minute timed games with a 1-2 minute break between rounds.\n5 points for a win\n3 points for a draw\n1 point for a loss with >7 points\n0 points for a loss with <7 points";
    protected createPDF(schedule: RoundSchedule[]): void {

        const generator = new PdfGenerator(
            this.outputStream,
            `Team Schedule ${this.targetDateColumn}`,
            this.description,
            defaultPdfConfig);
        generator.generate(schedule, {
            preferredPairs: this.preferredPairs,
            restDeclarations: this.restDeclarations
        });


        console.log(`Team A: ${this.teamA.join(', ')}`);
        console.log(`Team B: ${this.teamB.join(', ')}`);
        console.log(`Successfully generated ${schedule.length} rounds.`);
    }
}
