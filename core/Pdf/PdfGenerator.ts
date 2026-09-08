import PDFDocument from 'pdfkit';
import * as fs from 'fs';
import { RoundSchedule } from '../BaseScheduler';
import {PdfConfig} from "./pdfConfig";
import {Writable} from "node:stream";
import type {PreferredPair} from "../Partners";
export class PdfGenerator {
    constructor(
        private outputStream: Writable,
        private title: string,
        private description: string,
        private config: PdfConfig
    ) {}

    public generate(
        schedule: RoundSchedule[],
        teamsInfo?: { teamA: string[], teamB: string[] },
        preferredPairs?: PreferredPair[]
    ): void {
        const doc = new PDFDocument({ margin: 50 });
        doc.pipe(this.outputStream);

        this.writeHeader(doc, preferredPairs);

        schedule.forEach((round) => {
            if (!this.canFitNextRoundOnPage(doc, round)) {
                doc.addPage();
            }

            this.writeRound(doc, round);
        });

            if (teamsInfo) {
                doc.addPage();
                this.writeTeamsPage(doc, teamsInfo);
            }
        doc.end();
    }

    private writeTeamsPage(doc: typeof PDFDocument, teamsInfo: { teamA: string[], teamB: string[] }): void {
        doc.fontSize(20)
            .fillColor('#4169E1')
            .text('Tournament Teams', { align: 'center' }).moveDown(1);

        // Team A
        doc.fontSize(16).fillColor('#2c3e50').text('Team A', { underline: true }).moveDown(0.5);
        doc.fontSize(12).fillColor('black');
        teamsInfo.teamA.forEach(player => doc.text(`• ${player}`));

        doc.moveDown(1.5);

        // Team B
        doc.fontSize(16).fillColor('#2c3e50').text('Team B', { underline: true }).moveDown(0.5);
        doc.fontSize(12).fillColor('black');
        teamsInfo.teamB.forEach(player => doc.text(`• ${player}`));
    }

    private writeHeader(doc: typeof PDFDocument, preferredPairs?: PreferredPair[]): void {
        doc.fontSize(24)
            .fillColor('#4169E1')
            .text('Edlington Pickleball Club', { align: 'center', }).moveDown(0.3);

        doc.fontSize(16)
            .fillColor('#2c3e50')
            .text(this.title, { align: 'center' });

        doc.moveDown(0.5);

        doc.fontSize(12)
            .fillColor('#7f8c8d')
            .text(this.description, { align: 'center' });

        if (preferredPairs && preferredPairs.length > 0) {
            doc.moveDown(0.5);
            doc.fontSize(11)
                .fillColor('#4169E1')
                .text(
                    `Preferred partnerships: ${preferredPairs.map(([first, second]) => `${first} & ${second}`).join(' | ')}`,
                    { align: 'center' }
                );
        }

        doc.moveDown(2);
        doc.fillColor('black'); // Reset color
    }

    private writeRound(doc: typeof PDFDocument, round: RoundSchedule): void {
        doc.x = 50;
        doc.fontSize(16).fillColor('#4169E1').text(`Round ${round.roundNumber}`, { underline: true });
        doc.moveDown(0.5);

        const startY = doc.y + 15;
        const perRow = this.courtsPerRow(doc);
        const rowHeight = this.config.courtHeight + this.config.courtRowSpacing;

        round.matches.forEach((match, index) => {
            const x = 50 + (index % perRow) * (this.config.courtWidth + this.config.courtSpacing);
            const y = startY + Math.floor(index / perRow) * rowHeight;

            this.drawCourt(doc, x, y, this.config.courtWidth, this.config.courtHeight, match);
        });

        const rows = Math.max(1, Math.ceil(round.matches.length / perRow));
        doc.y = startY + (rows - 1) * rowHeight + this.config.courtHeight + this.config.restPileSpacing;
        doc.x = 50;


        const restText = round.restPile.length > 0 ? round.restPile.join(', ') : 'None';
        doc.fontSize(11).fillColor('gray')
            .text(`Rest Pile: ${restText}`)
            .fillColor('black');

        doc.moveDown(2);
    }

    /** How many courts fit side by side within the page margins. */
    private courtsPerRow(doc: typeof PDFDocument): number {
        const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
        const perRow = Math.floor(
            (usableWidth + this.config.courtSpacing) / (this.config.courtWidth + this.config.courtSpacing)
        );
        return Math.max(1, perRow);
    }

    /**
     * Draws a vertical Pickleball court
     */
    private drawCourt(doc: typeof PDFDocument, x: number, y: number, w: number, h: number, match: RoundSchedule['matches'][0]): void {
        const netY = y + h / 2;

        // 1. Label the court
        doc.fontSize(11).fillColor('#2c3e50').text(`Court ${match.court}`, x, y - 15, { width: w, align: 'center' });

        // 2. Draw the Outer Court Boundary
        doc.rect(x, y, w, h).lineWidth(1).strokeColor('black').stroke();

        // 3. Draw the Net
        doc.moveTo(x, netY).lineTo(x + w, netY)
            .dash(5, { space: 4 }).strokeColor('gray').stroke().undash();

        // 4. Draw the Kitchen Lines
        const kitchenOffset = 25;
        doc.moveTo(x, netY - kitchenOffset).lineTo(x + w, netY - kitchenOffset)
            .lineWidth(0.5).strokeColor('lightgray').stroke();
        doc.moveTo(x, netY + kitchenOffset).lineTo(x + w, netY + kitchenOffset)
            .lineWidth(0.5).strokeColor('lightgray').stroke();

        // 5. Place the Player Names
        doc.fontSize(11).fillColor('black');

        // Team 1 (Top Side of the Court)
        doc.text(match.team1[0], x, y + 15, { width: w, align: 'center' });
        doc.text(match.team1[1], x, y + 35, { width: w, align: 'center' });

        // Team 2 (Bottom Side of the Court)
        if (match.team2) {
            doc.text(match.team2[0], x, netY + 15, { width: w, align: 'center' });
            doc.text(match.team2[1], x, netY + 35, { width: w, align: 'center' });
        } else {
            doc.fillColor('gray').text('No Opponent', x, netY + 25, { width: w, align: 'center' });
        }

        this.resetStrokeColour(doc)
    }

    private resetStrokeColour(doc: typeof PDFDocument){
        doc.strokeColor('black');
    }

    private canFitNextRoundOnPage(doc : typeof PDFDocument, round: RoundSchedule){
      return  doc.y + this.estimateRoundHeight(doc, round) < doc.page.height - doc.page.margins.bottom
    }

    /** Round heading + however many rows of courts it needs + the rest pile line. */
    private estimateRoundHeight(doc: typeof PDFDocument, round: RoundSchedule): number {
        const rows = Math.max(1, Math.ceil(round.matches.length / this.courtsPerRow(doc)));
        return 60 + rows * (this.config.courtHeight + this.config.courtRowSpacing);
    }
}
