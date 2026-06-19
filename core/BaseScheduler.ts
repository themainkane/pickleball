import * as fs from 'fs';
import { parse } from 'csv-parse/sync';
import {Writable} from "node:stream";

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

export abstract class BaseScheduler <TSchedule> {
    protected players: string[] =[]

    constructor(
        protected csvContent: string,
        protected outputStream: Writable,
        protected targetDateColumn: string
    ) {}

    public run(): void {
        try {
            console.log(`Loading players for date: ${this.targetDateColumn}...`);
            this.loadPlayers();

            console.log(`Found ${this.players.length} players. Generating schedule...`);
            const schedule = this.generateSchedule();

            console.log(`Writing output to PDF...`);
            this.createPDF(schedule);
        } catch (error) {
            console.error("Failed to generate schedule:", error);
            throw error;
        }
    }
    protected loadPlayers(): void {
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
    }

    private formatPlayerName(name: string): string {
        const names = name.split(' ');
        return names.length === 1 ?
            `${names[0]}` : `${names[0]} ${names[names.length - 1].charAt(0).toUpperCase()}`;

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
