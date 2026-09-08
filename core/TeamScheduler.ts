import {BaseScheduler, DEFAULT_PARTNER_PRIORITY, type Match, type RoundSchedule} from './BaseScheduler';
import { Writable } from 'node:stream';
import {PdfGenerator} from "./Pdf/PdfGenerator";
import {defaultPdfConfig} from "./Pdf/pdfConfig";
import type {PartnersInput} from "./Partners";


export interface TeamConfig {
    courtsCount: number;
    totalRounds: number;
    /** Partnerships the scheduler favours, including keeping them on the same team. */
    partners: PartnersInput;
    /** How strongly to favour those partnerships. See DEFAULT_PARTNER_PRIORITY. */
    partnerPriority: number;
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
        super(csvContent, outputStream, targetDateColumn, config.partners, config.partnerPriority, config.rosterNames);

        this.config = {
            courtsCount: 4,
            totalRounds: 6,
            partners: [],
            partnerPriority: DEFAULT_PARTNER_PRIORITY,
            rosterNames: [],
            ...config
        };
    }

    protected generateSchedule(): RoundSchedule[] {
        // 1. Divide players into two even teams, keeping preferred partners together where possible
        this.splitIntoTeams();

        const restCounts = new Map<string, number>();
        this.players.forEach(p => restCounts.set(p, 0));

        let lastRestedA = new Set<string>();
        let lastRestedB = new Set<string>();

        this.resetPairHistory();

        const rounds: RoundSchedule[] = [];

        for (let round = 1; round <= this.config.totalRounds; round++) {
            // 2. Determine how many matches we can actually run
            // (Depends on courts available and players in the smallest team)
            const maxMatchesByPlayers = Math.min(
                Math.floor(this.teamA.length / 2),
                Math.floor(this.teamB.length / 2)
            );
            const activeMatches = Math.min(maxMatchesByPlayers, this.config.courtsCount);

            // Each match needs 2 players per team
            const playingPerTeam = activeMatches * 2;

            // 3. Select playing/resting players for this round
            const restingA = this.selectResters(this.teamA, this.teamA.length - playingPerTeam, lastRestedA, restCounts);
            const playingA = this.teamA.filter(p => !restingA.includes(p));
            lastRestedA = new Set(restingA);

            const restingB = this.selectResters(this.teamB, this.teamB.length - playingPerTeam, lastRestedB, restCounts);
            const playingB = this.teamB.filter(p => !restingB.includes(p));
            lastRestedB = new Set(restingB);

            // 4. Form pairs within each team, favouring preferred partnerships
            const pairsA = this.shuffleArray(this.formPairs(playingA));
            const pairsB = this.shuffleArray(this.formPairs(playingB));

            // 5. Create fixtures (Team A pair vs Team B pair)
            const matches: Match[] = [];
            for (let i = 0; i < activeMatches; i++) {
                matches.push({
                    court: i + 1,
                    team1: pairsA[i]!,
                    team2: pairsB[i]!
                });
            }

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

            if (pullToA > pullToB) {
                this.teamA.push(player);
            } else if (pullToB > pullToA) {
                this.teamB.push(player);
            } else if (this.teamA.length <= this.teamB.length) {
                this.teamA.push(player);
            } else {
                this.teamB.push(player);
            }
        });
    }

    private description = "11 minute timed games with a 1-2 minute break between rounds.\n5 points for a win\n3 points for a draw\n1 point for a loss with >7 points\n0 points for a loss with <7 points";
    protected createPDF(schedule: RoundSchedule[]): void {

        const generator = new PdfGenerator(
            this.outputStream,
            `Team Schedule ${this.targetDateColumn}`,
            this.description,
            defaultPdfConfig);
        generator.generate(schedule, undefined, this.preferredPairs);


        console.log(`Team A: ${this.teamA.join(', ')}`);
        console.log(`Team B: ${this.teamB.join(', ')}`);
        console.log(`Successfully generated ${schedule.length} rounds.`);
    }
}
