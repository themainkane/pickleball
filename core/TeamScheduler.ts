import { BaseScheduler, RoundSchedule, Match } from './BaseScheduler';
import { Writable } from 'node:stream';
import {PdfGenerator} from "./Pdf/PdfGenerator";
import {defaultPdfConfig} from "./Pdf/pdfConfig";


export interface TeamConfig {
    courtsCount: number;
    totalRounds: number;
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
        super(csvContent, outputStream, targetDateColumn);

        this.config = {
            courtsCount: 4,
            totalRounds: 6,
            ...config
        };
    }

    protected generateSchedule(): RoundSchedule[] {
        // 1. Shuffle all players and divide them evenly into two teams
        const shuffledPlayers = this.shuffleArray([...this.players]);
        const midPoint = Math.ceil(shuffledPlayers.length / 2);
        this.teamA = shuffledPlayers.slice(0, midPoint);
        this.teamB = shuffledPlayers.slice(midPoint);

        const restCounts = new Map<string, number>();
        this.players.forEach(p => restCounts.set(p, 0));

        let lastRestedA = new Set<string>();
        let lastRestedB = new Set<string>();

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
            const { playing: playingA, resting: restingA, newLastRested: newLastRestedA } =
                this.selectPlayers(this.teamA, playingPerTeam, lastRestedA, restCounts);
            lastRestedA = newLastRestedA;

            const { playing: playingB, resting: restingB, newLastRested: newLastRestedB } =
                this.selectPlayers(this.teamB, playingPerTeam, lastRestedB, restCounts);
            lastRestedB = newLastRestedB;

            // 4. Form random pairs within each team
            const pairsA = this.formPairs(playingA);
            const pairsB = this.formPairs(playingB);

            // 5. Create fixtures (Team A pair vs Team B pair)
            const matches: Match[] = [];
            for (let i = 0; i < activeMatches; i++) {
                matches.push({
                    court: i + 1,
                    team1: pairsA[i],
                    team2: pairsB[i]
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

    // Helper to rotate resting players evenly
    private selectPlayers(team: string[], playingCount: number, lastRested: Set<string>, restCounts: Map<string, number>) {
        const restingCount = team.length - playingCount;
        let eligibleToRest = team.filter(p => !lastRested.has(p));

        if (eligibleToRest.length < restingCount) {
            eligibleToRest = [...team];
        }

        eligibleToRest = this.shuffleArray(eligibleToRest);
        eligibleToRest.sort((a, b) => restCounts.get(a)! - restCounts.get(b)!);

        const resting = eligibleToRest.slice(0, restingCount);
        const playing = team.filter(p => !resting.includes(p));

        resting.forEach(p => restCounts.set(p, restCounts.get(p)! + 1));

        return { playing, resting, newLastRested: new Set(resting) };
    }

    // Helper to pair up active players
    private formPairs(players: string[]): [string, string][] {
        const shuffled = this.shuffleArray([...players]);
        const pairs: [string, string][] = [];
        for (let i = 0; i < shuffled.length; i += 2) {
            pairs.push([shuffled[i], shuffled[i + 1]]);
        }
        return pairs;
    }

    private description = "11 minute timed games with a 1-2 minute break between rounds.\n5 points for a win\n3 points for a draw\n1 point for a loss with >7 points\n0 points for a loss with <7 points";
    protected createPDF(schedule: RoundSchedule[]): void {

        const generator = new PdfGenerator(
            this.outputStream,
            `Team Schedule ${this.targetDateColumn}`,
            this.description,
            defaultPdfConfig);
        generator.generate(schedule);


        console.log(`Team A: ${this.teamA.join(', ')}`);
        console.log(`Team B: ${this.teamB.join(', ')}`);
        console.log(`Successfully generated ${schedule.length} rounds.`);
    }
}
