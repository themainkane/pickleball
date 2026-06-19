import express, { Request, Response } from 'express';
import multer from 'multer';
import { RandomDoublesScheduler } from './core/RandomDoublesScheduler';

const app = express();
const port = process.env.PORT || 3000;

// Setup Multer to hold uploaded files in Memory (RAM) instead of saving to disk
const upload = multer({ storage: multer.memoryStorage() });

// --- 1. Serve the HTML Webpage ---
// When someone goes to localhost:3000, send them this HTML form
app.get('/', (req: Request, res: Response) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Pickleball Scheduler</title>
            <style>
                body { font-family: sans-serif; padding: 40px; max-width: 600px; margin: 0 auto; line-height: 1.6; }
                .box { border: 2px dashed #ccc; padding: 20px; border-radius: 8px; text-align: center; }
                button { background: #4169E1; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; font-size: 16px; margin-top: 15px; }
                button:hover { background: #3154b3; }
                input { margin: 10px 0; padding: 5px; }
            </style>
        </head>
        <body>
            <h1>🥒 Edlington Pickleball Scheduler</h1>
            <p>Upload your CSV.</p>
            <p>Ensure the column heading is formatted as DD/MM/YY and that column contains all your player names.</p>
            
            <div class="box">
                <!-- This form sends a POST request to /generate -->
                <form action="/generate" method="POST" enctype="multipart/form-data">
                    <div>
                        <label><b>1. Select CSV File:</b></label><br>
                        <input type="file" name="rosterFile" accept=".csv" required />
                    </div>
                    
                    <div style="margin-top: 15px;">
                        <label><b>2. Target Date Column (e.g. 22/06/26):</b></label><br>
                        <input type="text" name="targetDate" placeholder="DD/MM/YY" required />
                    </div>
                    
                    <button type="submit">Generate Schedule PDF</button>
                </form>
            </div>
        </body>
        </html>
    `);
});

app.post('/generate', upload.single('rosterFile'), (req: Request, res: Response) => {
    try {
        if (!req.file) {
            return res.status(400).send('No file uploaded.');
        }

        const targetDate = req.body.targetDate;
        if (!targetDate) {
            return res.status(400).send('Target date is required.');
        }

        // Convert the uploaded file buffer (RAM) into a raw string
        const csvContent = req.file.buffer.toString('utf-8');

        // Tell the user's browser "Get ready to download a PDF file!"
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Schedule_${targetDate.replace(/\//g, '-')}.pdf"`);

        // Create the scheduler, passing in the string and the 'res' (Response) stream
        const scheduler = new RandomDoublesScheduler(csvContent, res, targetDate);

        // Run it! The PDF will pipe directly back to the user.
        scheduler.run();

    } catch (error: any) {
        console.error(error);
        // If they type the wrong date or the CSV is bad, show them the error
        res.status(500).send(`<h2>Error Generating Schedule:</h2><p>${error.message}</p><a href="/">Go Back</a>`);
    }
});

// --- Start the Server ---
app.listen(port, () => {
    console.log(`🚀 Server running locally at http://localhost:${port}`);
});
