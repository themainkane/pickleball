import {RandomDoublesScheduler} from "./core/RandomDoublesScheduler";
import * as fs from "node:fs";


function execute(filePath: string, outputFile: string, date: string, partners?: string) {
    const csvContent = fs.readFileSync(filePath, 'utf-8');

    const outputStream = fs.createWriteStream(outputFile);

    const scheduler = new RandomDoublesScheduler(csvContent, outputStream, date, { partners });
    scheduler.run();
}

const args = process.argv.slice(2);

// Check if the user provided the necessary arguments
if (args.length < 3) {
    console.error("Usage: npx ts-node execute.ts <csvFilePath> <pdfOutputPath> <targetDate> [partners]");
    console.error("Example: npx ts-node execute.ts players.csv schedule.pdf '2024-06-01'");
    console.error("With preferred partners: npx ts-node execute.ts players.csv schedule.pdf '2024-06-01' 'Joe Kane & Ming Tan; Joe Kane & Grace Kemp'");
    process.exit(1);
}

const [csvFilePath, pdfOutputPath, targetDate, partners] = args;

if (!csvFilePath || !pdfOutputPath || !targetDate) {
    console.error("Please provide all required arguments.");
    process.exit(1);
}

// Run the application
execute(csvFilePath, pdfOutputPath, targetDate, partners);
