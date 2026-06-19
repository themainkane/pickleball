import PDFDocument from 'pdfkit';
import * as fs from 'fs';
import { RoundSchedule } from '../BaseScheduler';
import {PdfConfig} from "./pdfConfig";
import {Writable} from "node:stream";
export class PdfGenerator {
    constructor(
        private outputStream: Writable,
        private title: string,
        private description: string,
        private config: PdfConfig
    ) {}

    public generate(schedule: RoundSchedule[]): void {
        const doc = new PDFDocument({ margin: 50 });
        doc.pipe(this.outputStream);

        this.writeHeader(doc);

        schedule.forEach((round) => {
            if (!this.canFitNextRoundOnPage(doc)) {
                doc.addPage();
            }

            this.writeRound(doc, round);
        });

        doc.end();
    }

    private writeHeader(doc: typeof PDFDocument): void {
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

        doc.moveDown(2);
        doc.fillColor('black'); // Reset color
    }

    private writeRound(doc: typeof PDFDocument, round: RoundSchedule): void {
        doc.x = 50;
        doc.fontSize(16).fillColor('#4169E1').text(`Round ${round.roundNumber}`, { underline: true });
        doc.moveDown(0.5);

        const startY = doc.y + 15;

        round.matches.forEach((match, index) => {
            const x = 50 + index * (this.config.courtWidth + this.config.courtSpacing);
            const y = startY;

            this.drawCourt(doc, x, y, this.config.courtWidth, this.config.courtHeight, match);
        });

        doc.y = startY + this.config.courtHeight + this.config.restPileSpacing;
        doc.x = 50;


        const restText = round.restPile.length > 0 ? round.restPile.join(', ') : 'None';
        doc.fontSize(11).fillColor('gray')
            .text(`Rest Pile: ${restText}`)
            .fillColor('black');

        doc.moveDown(2);
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

    private canFitNextRoundOnPage(doc : typeof PDFDocument){
      return  doc.y + 200 < doc.page.height - doc.page.margins.bottom
    }
}
