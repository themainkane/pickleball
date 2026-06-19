import {RandomDoublesScheduler} from "./core/RandomDoublesScheduler";


function execute(filePath: string, outputFile: string, date: string) {
    const scheduler = new RandomDoublesScheduler(filePath, outputFile, date);
    scheduler.run();
}

const args = process.argv.slice(2);

// Check if the user provided the necessary arguments
if (args.length < 3) {
    console.error("Usage: npx ts-node execute.ts <csvFilePath> <pdfOutputPath> <targetDate>");
    console.error("Example: npx ts-node execute.ts players.csv schedule.pdf '2024-06-01'");
    process.exit(1);
}

const [csvFilePath, pdfOutputPath, targetDate] = args;

if (!csvFilePath || !pdfOutputPath || !targetDate) {
    console.error("Please provide all required arguments.");
    process.exit(1);
}

// Run the application
execute(csvFilePath, pdfOutputPath, targetDate);
