import {BaseScheduler, type Match, type RoundSchedule} from "./BaseScheduler";
import PDFDocument from "pdfkit";
import * as fs from "node:fs";
import {PdfGenerator} from "./Pdf/PdfGenerator";
import {defaultPdfConfig} from "./Pdf/pdfConfig";
import {Writable} from "node:stream";

export interface DoublesConfig {
    courtsCount: number;
    playersPerCourt: number;
    totalRounds: number;
}

export class RandomDoublesScheduler extends BaseScheduler<RoundSchedule[]> {
    private config: DoublesConfig;

    constructor(
        csvContent: string,
        outputStream: Writable,
        targetDateColumn: string,
        config: Partial<DoublesConfig> = {}
    ) {
        super(csvContent, outputStream, targetDateColumn);

        this.config = {
            courtsCount: 4,
            playersPerCourt: 4,
            totalRounds: 12,
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

        const pairCounts = new Map<string, Map<string, number>>();
        this.players.forEach(p => {
            const map = new Map<string, number>();
            this.players.forEach(p2 => map.set(p2, 0));
            pairCounts.set(p, map);
        });

        const rounds: RoundSchedule[] = [];

        for (let round = 1; round <= this.config.totalRounds; round++) {

            let eligibleToRest = this.players.filter(player => !lastRested.has(player));

            if (eligibleToRest.length < numResters) {
                eligibleToRest = [...this.players];
            }

            eligibleToRest = this.shuffleArray(eligibleToRest);
            eligibleToRest.sort((a, b) => restCounts.get(a)! - restCounts.get(b)!);

            const currentResters = eligibleToRest.slice(0, numResters);
            const playingThisRound = this.players.filter(p => !currentResters.includes(p));

            currentResters.forEach(p => restCounts.set(p, restCounts.get(p)! + 1));
            lastRested = new Set(currentResters);

            // --- B. Form Unique Pairs ---
            let availablePlayers = this.shuffleArray([...playingThisRound]);
            const teams: [string, string][] = [];

            while (availablePlayers.length >= 2) {
                const p1 = availablePlayers.shift()!;

                let bestP2Idx = 0;
                let minPairings = Infinity;

                for (let i = 0; i < availablePlayers.length; i++) {
                    const p2 = availablePlayers[i]!;
                    const count = pairCounts.get(p1)!.get(p2)!;
                    if (count < minPairings) {
                        minPairings = count;
                        bestP2Idx = i;
                    }
                }

                const p2 = availablePlayers.splice(bestP2Idx, 1)[0]!;
                teams.push([p1, p2]);

                pairCounts.get(p1)!.set(p2, pairCounts.get(p1)!.get(p2)! + 1);
                pairCounts.get(p2)!.set(p1, pairCounts.get(p2)!.get(p1)! + 1);
            }

            const matches: Match[] = [];
            for (let i = 0; i < activeCourtsCount; i++) {
                const team1 = teams.shift() || null;
                const team2 = teams.shift() || null;

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

        generator.generate(schedule);
    }
}
