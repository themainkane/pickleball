import {BaseScheduler, DEFAULT_PARTNER_PRIORITY, type Match, type RoundSchedule} from "./BaseScheduler";
import {PdfGenerator} from "./Pdf/PdfGenerator";
import {defaultPdfConfig} from "./Pdf/pdfConfig";
import {Writable} from "node:stream";
import type {PartnersInput} from "./Partners";

export interface DoublesConfig {
    courtsCount: number;
    playersPerCourt: number;
    totalRounds: number;
    /** Partnerships the scheduler favours when forming teams. */
    partners: PartnersInput;
    /** How strongly to favour those partnerships. See DEFAULT_PARTNER_PRIORITY. */
    partnerPriority: number;
    /** Names typed straight into the UI. When set, the CSV is ignored. */
    rosterNames: string[];
}

export class RandomDoublesScheduler extends BaseScheduler<RoundSchedule[]> {
    private config: DoublesConfig;

    constructor(
        csvContent: string,
        outputStream: Writable,
        targetDateColumn: string,
        config: Partial<DoublesConfig> = {}
    ) {
        super(csvContent, outputStream, targetDateColumn, config.partners, config.partnerPriority, config.rosterNames);

        this.config = {
            courtsCount: 4,
            playersPerCourt: 4,
            totalRounds: 12,
            partners: [],
            partnerPriority: DEFAULT_PARTNER_PRIORITY,
            rosterNames: [],
            ...config
        };
    }

    protected generateSchedule(): RoundSchedule[] {
        const totalPlayers = this.players.length;
        const maxPossibleCourts = Math.floor(totalPlayers / this.config.playersPerCourt);
        const activeCourtsCount = Math.min(maxPossibleCourts, this.config.courtsCount);
        const playingPerRound = activeCourtsCount * this.config.playersPerCourt;
        const numResters = totalPlayers - playingPerRound;
        const restCounts = new Map<string, number>();

        this.players.forEach(p => restCounts.set(p, 0));
        let lastRested = new Set<string>();

        this.resetPairHistory();

        const rounds: RoundSchedule[] = [];

        for (let round = 1; round <= this.config.totalRounds; round++) {

            // --- A. Rotate the rest pile (fewest rests first) ---
            const currentResters = this.selectResters(this.players, numResters, lastRested, restCounts);
            lastRested = new Set(currentResters);

            const restingThisRound = new Set(currentResters);
            const playingThisRound = this.players.filter(p => !restingThisRound.has(p));

            // --- B. Team everyone up, favouring preferred partnerships ---
            const teams = this.formPairs(playingThisRound);

            // Shuffle so the same teams don't camp on the same court every round.
            const orderedTeams = this.shuffleArray(teams);

            const matches: Match[] = [];
            for (let i = 0; i < activeCourtsCount; i++) {
                const team1 = orderedTeams.shift() || null;
                const team2 = orderedTeams.shift() || null;

                if (team1) {
                    matches.push({
                        court: i + 1,
                        team1,
                        team2
                    });
                }
            }

            rounds.push({
                roundNumber: round,
                matches,
                restPile: currentResters
            });
        }
            return rounds;
    }

    private description = "11 minute games to 11, if you win inside 11 minutes, start again.\n1-2 minute break between rounds.";

    protected createPDF(schedule: RoundSchedule[]): void {
       const generator = new PdfGenerator(
           this.outputStream,
           `Match Schedule ${this.targetDateColumn}`,
           this.description,
           defaultPdfConfig
       );

        generator.generate(schedule, undefined, this.preferredPairs);
    }
}
