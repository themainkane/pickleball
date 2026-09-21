import express, { Request, Response } from 'express';
import multer from 'multer';
import { RandomDoublesScheduler } from './core/RandomDoublesScheduler';
import {TeamScheduler} from "./core/TeamScheduler";
import {defaultPdfConfig} from "./core/Pdf/pdfConfig";
import {PdfGenerator} from "./core/Pdf/PdfGenerator";
import {
    DEFAULT_COURTS,
    MAX_COURTS,
    MIN_COURTS,
    setupFormHtml,
    setupFormScript,
    setupFormStyles
} from "./core/Ui/setupForm";
import { leaderboardScript, leaderboardStyles } from "./core/Ui/leaderboard";
import { DEFAULT_RESTS_PER_PLAYER } from "./core/Rests";

const app = express();
const port = process.env.PORT || 3000;
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
const upload = multer({ storage: multer.memoryStorage() });

/** Keeps a submitted court count inside the selectable range. */
function parseCourtsCount(value: unknown): number {
    const parsed = parseInt(String(value), 10);
    if (isNaN(parsed)) return DEFAULT_COURTS;
    return Math.min(MAX_COURTS, Math.max(MIN_COURTS, parsed));
}

/** Rests for players with no number of their own. Nonsense falls back to the default. */
function parseDefaultRests(value: unknown): number {
    const parsed = parseInt(String(value), 10);
    if (isNaN(parsed) || parsed < 0) return DEFAULT_RESTS_PER_PLAYER;
    return parsed;
}

/** The session settings both the PDF and the API routes read off the form. */
function parseSessionSettings(body: Record<string, unknown>) {
    return {
        totalRounds: parseInt(String(body.rounds)) || 8,
        courtsCount: parseCourtsCount(body.courts),
        partners: formField(body.partners),
        rests: formField(body.playerRests),
        defaultRests: parseDefaultRests(body.restsPerPlayer)
    };
}

/** A submitted text field as a string, with anything missing read as empty. */
function formField(value: unknown): string {
    return typeof value === 'string' ? value : '';
}

/** Splits a typed roster (one name per line, or comma separated) into names. */
function parsePlayerNames(value: unknown): string[] {
    if (typeof value !== 'string') return [];
    return value
        .split(/[\r\n,]+/)
        .map(name => name.trim())
        .filter(name => name !== '');
}

/** Today as DD/MM/YY, used when a typed roster comes in without a date. */
function todayLabel(): string {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${String(now.getFullYear()).slice(-2)}`;
}

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
                ${setupFormStyles()}
            </style>
        </head>
        <body>
            <h1>🥒 White Rose Pickleball Scheduler</h1>
           <p>Upload your CSV to get a printable PDF, OR head to the live dashboard.</p>
            
            <div style="text-align: center; margin-bottom: 30px;">
                <a href="/live" class="live-link">🎾 Go to Live Scoring Dashboard 🎾</a>
            </div>
            
            <div class="box setup-form">
                ${setupFormHtml({
                    formId: 'pdf-form',
                    action: '/generate',
                    submitLabel: 'Generate Schedule PDF'
                })}
            </div>
            <script>
                ${setupFormScript()}

                initSetupForm('pdf-form', { plainPost: true });
            </script>
        </body>
        </html>
    `);
});

app.post('/api/generate', upload.single('rosterFile'), (req: Request, res: Response) => {
    try {
        const rosterNames = parsePlayerNames(req.body.playerNames);

        if (!req.file && rosterNames.length === 0) {
            return res.status(400).json({ error: 'Upload a CSV or type in some player names.' });
        }
        if (!req.file && rosterNames.length < 4) {
            return res.status(400).json({ error: 'Please enter at least 4 player names.' });
        }
        if (req.file && rosterNames.length === 0 && !req.body.targetDate) {
            return res.status(400).json({ error: 'Target date required.' });
        }

        const targetDate = req.body.targetDate || todayLabel();
        const gameMode = req.body.gameMode;
        const settings = parseSessionSettings(req.body);
        const scoringSystem = req.body.scoringSystem === 'football' ? 'football' : 'pickleball';
        const csvContent = req.file ? req.file.buffer.toString('utf-8') : '';

        let scheduler: RandomDoublesScheduler | TeamScheduler;
        if (gameMode === 'teams') {
            scheduler = new TeamScheduler(csvContent, res, targetDate, { ...settings, rosterNames });
        } else {
            scheduler = new RandomDoublesScheduler(csvContent, res, targetDate, { ...settings, rosterNames });
        }

        const data = scheduler.getScheduleData();

        const responseJson = {
            mode: gameMode,
            targetDate,
            scoringSystem,
            players: data.players,
            preferredPairs: data.preferredPairs,
            restDeclarations: data.restDeclarations,
            warnings: data.warnings,
            schedule: data.schedule
        };

        if (gameMode === 'teams') {
            const teamScheduler = scheduler as TeamScheduler;
            responseJson.teamA = teamScheduler.teamA;
            responseJson.teamB = teamScheduler.teamB;
        }

        res.json(responseJson);
    } catch (error: Error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/live', (req: Request, res: Response) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Live Scoring</title>
            <style>
                body { font-family: sans-serif; padding: 20px; background: #f4f7f6; }
                .container { max-width: 1000px; margin: auto; display: flex; gap: 20px; flex-wrap: wrap; }
                .main { flex: 2; min-width: 400px; }
                .sidebar { flex: 1; min-width: 340px; background: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); align-self: flex-start; position: sticky; top: 20px; }
                .card { background: #fff; padding: 15px; margin-bottom: 15px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
                h1, h2, h3 { color: #333; margin-top: 0; }
                .match { border-bottom: 1px solid #eee; padding: 15px 0; display: flex; flex-direction: column; gap: 10px; }
                .match:last-child { border-bottom: none; }
                .team-input { display: flex; justify-content: space-between; align-items: center; background: #fafafa; padding: 10px; border-radius: 6px;}
                input[type="number"] { width: 60px; padding: 8px; border: 1px solid #ccc; border-radius: 4px; font-size: 16px; text-align: center; }
                button { background: #4169E1; color: white; border: none; padding: 10px 15px; border-radius: 5px; cursor: pointer; font-size: 16px;}
                button:hover { background: #3154b3; }
                .leaderboard-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
                .setup-form { background: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); max-width: 500px; margin: auto;}
                ${setupFormStyles()}
                ${leaderboardStyles()}
            </style>
        </head>
        <body>
            <div style="max-width: 1000px; margin: auto; display: flex; justify-content: space-between; align-items: center;">
                <h1>🎾 Live Scoring Dashboard</h1>
                <a href="/" style="color: #666;">← Back to PDF Generator</a>
            </div>
            
            <div id="setup-area" class="setup-form" style="display:none;">
                <h3>Start New Tournament</h3>
                ${setupFormHtml({
                    formId: 'start-form',
                    submitLabel: 'Generate & Start Scoring',
                    includeScoring: true
                })}
            </div>

            <div class="container" id="app-area" style="display:none;">
                <div class="main" id="rounds-container"></div>
                <div class="sidebar">
                    <h2>Leaderboard</h2>
                    <div id="scoring-system-info"></div>
                    <div id="partners-container"></div>
                    <div id="leaderboard-container"></div>
                    <br>
                    <div style="display: flex; flex-direction: column; gap: 10px;">
                        <button onclick="downloadPdf()" style="background: #2ecc71; width: 100%;">📥 Download PDF Schedule</button>
                        <button onclick="clearTournament()" style="background:#e74c3c; width:100%;">End Tournament & Clear Data</button>
                    </div>
                </div>
            </div>

            <script>
                ${setupFormScript()}
                ${leaderboardScript()}
                // 1. Load Data from LocalStorage
                let tournament = JSON.parse(localStorage.getItem('pb_tournament')) || null;
                let matchScores = JSON.parse(localStorage.getItem('pb_scores')) || {};

                function saveState() {
                    localStorage.setItem('pb_tournament', JSON.stringify(tournament));
                    localStorage.setItem('pb_scores', JSON.stringify(matchScores));
                }

                function clearTournament() {
                    if(confirm('Are you sure? This deletes the current schedule and all points!')) {
                        localStorage.removeItem('pb_tournament');
                        localStorage.removeItem('pb_scores');
                        location.reload();
                    }
                }

                async function downloadPdf() {
                    if (!tournament) return;
                    
                    // Send the actively generated schedule to the backend to turn it into a PDF
                    const res = await fetch('/api/download-pdf', {
                        method: 'POST',
                        headers: { 
                            'Content-Type': 'application/json' 
                        },
                        body: JSON.stringify(tournament)
                    });
                    
                    if (res.ok) {
                        const blob = await res.blob();
                        const url = window.URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = 'Live_Schedule_Export.pdf';
                        a.click();
                        window.URL.revokeObjectURL(url);
                    } else {
                        alert('Failed to generate PDF. Check server logs.');
                    }
                }

                // 2. Handle generating the schedule via API
                document.getElementById('start-form').addEventListener('submit', async (e) => {
                    e.preventDefault();
                    if (!rosterIsValid()) return;

                    const formData = new FormData();
                    if (manualNamesActive()) {
                        formData.append('playerNames', rosterNamesText());
                    } else {
                        formData.append('rosterFile', document.getElementById('csv-file').files[0]);
                        formData.append('targetDate', document.getElementById('target-date').value);
                    }
                    formData.append('gameMode', document.getElementById('game-mode').value);
                    formData.append('rounds', document.getElementById('rounds').value);
                    formData.append('courts', document.getElementById('courts').value);
                    formData.append('partners', document.getElementById('partners').value);
                    formData.append('restsPerPlayer', document.getElementById('rests-per-player').value);
                    formData.append('playerRests', document.getElementById('player-rests').value);
                    formData.append('scoringSystem', document.getElementById('scoring-system').value);

                    const res = await fetch('/api/generate', { method: 'POST', body: formData });
                    const data = await res.json();
                    
                    if(!res.ok) return alert('Error generating: ' + (data.error || 'Check date or CSV format.'));
                    
                    tournament = data;
                    matchScores = {};
                    saveState();
                    renderApp();
                });

                // 3. Point calculation logic (SCORING_SYSTEMS comes from the shared form script)
                function activeSystem() {
                    const key = (tournament && tournament.scoringSystem) || 'pickleball';
                    return SCORING_SYSTEMS[key] || SCORING_SYSTEMS.pickleball;
                }

                function calculatePoints(myScore, oppScore) {
                    if (myScore === null || oppScore === null || isNaN(myScore) || isNaN(oppScore)) return 0;
                    return activeSystem().points(myScore, oppScore);
                }

                // 4. Input score handler
                window.handleScoreChange = function(roundNum, matchIdx, isTeam1, value) {
                    const matchId = 'r' + roundNum + '_m' + matchIdx;
                    if (!matchScores[matchId]) matchScores[matchId] = { t1: null, t2: null };
                    
                    const parsedValue = value === '' ? null : parseInt(value);
                    if(isTeam1) matchScores[matchId].t1 = parsedValue;
                    else matchScores[matchId].t2 = parsedValue;
                    
                    saveState();
                    renderLeaderboard();
                }

                // 5. Render the UI
                function renderApp() {
                    if(!tournament) {
                        document.getElementById('setup-area').style.display = 'block';
                        document.getElementById('app-area').style.display = 'none';
                        renderScoringGuide();
                        initSetupForm('start-form');
                        return;
                    }
                    
                    document.getElementById('setup-area').style.display = 'none';
                    document.getElementById('app-area').style.display = 'flex';

                    const roundsDiv = document.getElementById('rounds-container');
                    roundsDiv.innerHTML = tournament.schedule.map((r, rIdx) => \`
                        <div class="card">
                            <h3 style="color: #4169E1; border-bottom: 2px solid #eee; padding-bottom: 5px;">Round \${r.roundNumber}</h3>
                            \${r.matches.map((m, mIdx) => {
                                const matchId = 'r' + r.roundNumber + '_m' + mIdx;
                                const scores = matchScores[matchId] || {t1: null, t2: null};
                                const hasOpponent = !!m.team2;
                                return \`
                                    <div class="match">
                                        <div style="font-weight: bold; color: #666;">Court \${m.court}</div>
                                        <div class="team-input">
                                            <span>\${m.team1.join(' & ')}</span>
                                            <input type="number" placeholder="Score"
                                                value="\${scores.t1 !== null ? scores.t1 : ''}" 
                                                oninput="handleScoreChange(\${r.roundNumber}, \${mIdx}, true, this.value)"
                                            />
                                        </div>
                                        <div class="team-input">
                                            \${hasOpponent ? \`
                                                <span>\${m.team2.join(' & ')}</span>
                                                <input type="number" placeholder="Score"
                                                    value="\${scores.t2 !== null ? scores.t2 : ''}" 
                                                    oninput="handleScoreChange(\${r.roundNumber}, \${mIdx}, false, this.value)"
                                                />
                                            \` : '<span style="color:#999; font-style:italic;">No Opponent (Resting)</span>'}
                                        </div>
                                    </div>
                                \`;
                            }).join('')}
                        </div>
                    \`).join('');

                    renderLeaderboard();
                }

                function renderLeaderboard() {
                    const system = activeSystem();
                    const systemDiv = document.getElementById('scoring-system-info');
                    systemDiv.innerHTML = \`<h4 style="margin: 0 0 5px; color: #4169E1;">Scoring: \${system.name}</h4>
                         <div style="font-size: 12px; color: #666; margin-bottom: 15px;">\${system.guide}</div>\`;

                    const partnersDiv = document.getElementById('partners-container');
                    const preferredPairs = tournament.preferredPairs || [];
                    const restDeclarations = tournament.restDeclarations || [];
                    const warnings = tournament.warnings || [];

                    partnersDiv.innerHTML =
                        (preferredPairs.length === 0 ? '' :
                            \`<h4 style="margin: 0 0 5px; color: #4169E1;">Preferred Partnerships</h4>
                             <div style="font-size: 14px; color: #555; margin-bottom: 15px;">
                                \${preferredPairs.map(p => \`<div>🤝 \${p[0]} &amp; \${p[1]}</div>\`).join('')}
                             </div>\`) +
                        (restDeclarations.length === 0 ? '' :
                            \`<h4 style="margin: 0 0 5px; color: #4169E1;">Rests Booked</h4>
                             <div style="font-size: 14px; color: #555; margin-bottom: 15px;">
                                \${restDeclarations.map(r => \`<div>😴 \${r.player}: \${r.rests}</div>\`).join('')}
                             </div>\`) +
                        (warnings.length === 0 ? '' :
                            \`<div style="font-size: 13px; color: #a04000; background: #fdf3e7; border-radius: 6px; padding: 10px; margin-bottom: 15px;">
                                \${warnings.map(w => \`<div>⚠️ \${w}</div>\`).join('')}
                             </div>\`);

                    // Wins, losses, score for/against and points all come out of
                    // the entered scores in the leaderboard module.
                    renderLeaderboardTables('leaderboard-container', tournament, matchScores, calculatePoints);
                }

                // Kick off app
                renderApp();
            </script>
        </body>
        </html>
    `);
});

app.post('/generate', upload.single('rosterFile'), (req: Request, res: Response) => {
    try {
        const rosterNames = parsePlayerNames(req.body.playerNames);

        if (!req.file && rosterNames.length === 0) {
            console.error('No roster supplied.');
            return res.status(400).send('Upload a CSV or type in some player names. <a href="/">Go Back</a>');
        }

        const usingCsv = !!req.file && rosterNames.length === 0;
        if (usingCsv && !req.body.targetDate) {
            console.error('Target date is required.');
            return res.status(400).send('Target date is required. <a href="/">Go Back</a>');
        }

        const targetDate = req.body.targetDate || todayLabel();

        const gameMode = req.body.gameMode;
        const settings = parseSessionSettings(req.body);
        const csvContent = req.file ? req.file.buffer.toString('utf-8') : '';

        // Create the scheduler, passing in the string and the 'res' (Response) stream
        let scheduler: RandomDoublesScheduler | TeamScheduler;
        if (gameMode === 'teams') {
            scheduler = new TeamScheduler(csvContent, res, targetDate, { ...settings, rosterNames });
        } else {
            scheduler = new RandomDoublesScheduler(csvContent, res, targetDate, { ...settings, rosterNames });
        }

        // Surface roster, partner and rest problems as HTML before we start streaming a PDF
        scheduler.validate();

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Schedule_${targetDate.replace(/\//g, '-')}.pdf"`);


        // Run it! The PDF will pipe directly back to the user.
        scheduler.run();

    } catch (error: Error) {
        console.error(error);
        // If they type the wrong date or the CSV is bad, show them the error
        res.status(500).send(`<h2>Error Generating Schedule:</h2><p>${error.message}</p><a href="/">Go Back</a>`);
    }
});

// --- PDF Download Endpoint for Live Dashboard ---
app.post('/api/download-pdf', express.json({limit: '10mb'}), (req: Request, res: Response) => {
    try {
        const { schedule, targetDate, mode, teamA, teamB, preferredPairs, restDeclarations } = req.body;

        if (!schedule ) {
            console.error("Missing schedule or targetDate! Body received was:", req.body);
            return res.status(400).send('Missing schedule or targetDate in request body.');
        }

        const safeTargetDate = typeof targetDate === 'string' ? targetDate : "Unknown_Date";
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Schedule_${safeTargetDate.replace(/\//g, '-')}.pdf"`);

        const description = "11 minute timed games with a 1-2 minute break between rounds.\n5 points for a win\n3 points for a draw\n1 point for a loss with >7 points\n0 points for a loss with <7 points";
        const generator = new PdfGenerator(res, `Schedule ${safeTargetDate}`, description, defaultPdfConfig);

        generator.generate(schedule, {
            teams: (mode === 'teams' && teamA && teamB) ? { teamA, teamB } : undefined,
            preferredPairs: Array.isArray(preferredPairs) ? preferredPairs : undefined,
            restDeclarations: Array.isArray(restDeclarations) ? restDeclarations : undefined
        });
    } catch (error: Error) {
        console.error(error);
        res.status(500).send('Error generating PDF');
    }
});

// --- Start the Server ---
app.listen(port, () => {
    console.log(`🚀 Server running locally at http://localhost:${port}`);
});
