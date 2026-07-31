import express, { Request, Response } from 'express';
import multer from 'multer';
import { RandomDoublesScheduler } from './core/RandomDoublesScheduler';
import {TeamScheduler} from "./core/TeamScheduler";
import {defaultPdfConfig} from "./core/Pdf/pdfConfig";
import {PdfGenerator} from "./core/Pdf/PdfGenerator";

const app = express();
const port = process.env.PORT || 3000;
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
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
            <h1>🥒 White Rose Pickleball Scheduler</h1>
           <p>Upload your CSV to get a printable PDF, OR head to the live dashboard.</p>
            
            <div style="text-align: center; margin-bottom: 30px;">
                <a href="/live" class="live-link">🎾 Go to Live Scoring Dashboard 🎾</a>
            </div>
            
            <div class="box">
                <form action="/generate" method="POST" enctype="multipart/form-data">
                    <div>
                        <label><b>1. Select CSV File:</b></label><br>
                        <input type="file" name="rosterFile" accept=".csv" required />
                    </div>
                    
                    <div style="margin-top: 15px;">
                        <label><b>2. Target Date Column (e.g. 22/06/26):</b></label><br>
                        <input type="text" name="targetDate" placeholder="DD/MM/YY" required />
                    </div>
                     <div style="margin-top: 15px;">
                        <label><b>3. Select Game Mode:</b></label><br>
                        <select name="gameMode" style="padding: 5px; font-size: 14px;">
                            <option value="random">Random Doubles</option>
                            <option value="teams">Teams</option>
                        </select>
                    </div>
                     <div style="margin-top: 15px;">
                        <label><b>4. Number of Rounds:</b></label><br>
                        <input type="number" name="rounds" value="8" min="1" required style="padding: 5px; font-size: 14px; width: 80px;" />
                    </div>
                    
                    <button type="submit">Generate Schedule PDF</button>
                </form>
            </div>
        </body>
        </html>
    `);
});

app.post('/api/generate', upload.single('rosterFile'), (req: Request, res: Response) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
        if (!req.body.targetDate) return res.status(400).json({ error: 'Target date required.' });

        const gameMode = req.body.gameMode;
        const roundsCount = parseInt(req.body.rounds) || 8;
        const csvContent = req.file.buffer.toString('utf-8');

        let scheduler: RandomDoublesScheduler | TeamScheduler;
        if (gameMode === 'teams') {
            scheduler = new TeamScheduler(csvContent, res, req.body.targetDate,{ totalRounds: roundsCount } );
        } else {
            scheduler = new RandomDoublesScheduler(csvContent, res, req.body.targetDate,{ totalRounds: roundsCount });
        }

        const data = scheduler.getScheduleData();

        const responseJson: any = {
            mode: gameMode,
            players: data.players,
            schedule: data.schedule
        };

        if (gameMode === 'teams') {
            const teamScheduler = scheduler as TeamScheduler;
            responseJson.teamA = teamScheduler.teamA;
            responseJson.teamB = teamScheduler.teamB;
        }

        res.json(responseJson);
    } catch (error: any) {
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
                .sidebar { flex: 1; min-width: 300px; background: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); align-self: flex-start; position: sticky; top: 20px; }
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
                input[type="text"], input[type="file"], select { width: 100%; box-sizing: border-box; padding: 8px; margin-bottom: 15px; }
            </style>
        </head>
        <body>
            <div style="max-width: 1000px; margin: auto; display: flex; justify-content: space-between; align-items: center;">
                <h1>🎾 Live Scoring Dashboard</h1>
                <a href="/" style="color: #666;">← Back to PDF Generator</a>
            </div>
            
            <div id="setup-area" class="setup-form" style="display:none;">
                <h3>Start New Tournament</h3>
                <form id="start-form">
                    <label><b>1. Select CSV File:</b></label>
                    <input type="file" id="csv-file" accept=".csv" required />
                    
                  <label><b>2. Target Date Column:</b></label>
                    <input type="text" id="target-date" placeholder="DD/MM/YY" required />
                    
                    <label><b>3. Game Mode:</b></label>
                    <select id="game-mode">
                        <option value="random">Random Doubles</option>
                        <option value="teams">Teams</option>
                    </select>

                    <label><b>4. Number of Rounds:</b></label>
                    <input type="number" id="rounds" value="8" min="1" required />
                    
                    <button type="submit" style="width: 100%;">Generate & Start Scoring</button>
                </form>
            </div>

            <div class="container" id="app-area" style="display:none;">
                <div class="main" id="rounds-container"></div>
                <div class="sidebar">
                    <h2>Leaderboard</h2>
                    <div id="leaderboard-container"></div>
                    <br>
                    <div style="display: flex; flex-direction: column; gap: 10px;">
                        <button onclick="downloadPdf()" style="background: #2ecc71; width: 100%;">📥 Download PDF Schedule</button>
                        <button onclick="clearTournament()" style="background:#e74c3c; width:100%;">End Tournament & Clear Data</button>
                    </div>
                </div>
            </div>

            <script>
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
                    const file = document.getElementById('csv-file').files[0];
                    const date = document.getElementById('target-date').value;
                    const mode = document.getElementById('game-mode').value;
                    const rounds = document.getElementById('rounds').value;

                    const formData = new FormData();
                    formData.append('rosterFile', file);
                    formData.append('targetDate', date);
                    formData.append('gameMode', mode);
                    formData.append('rounds', rounds);

                    const res = await fetch('/api/generate', { method: 'POST', body: formData });
                    const data = await res.json();
                    
                    if(!res.ok) return alert('Error generating: ' + (data.error || 'Check date or CSV format.'));
                    
                    tournament = data;
                    matchScores = {};
                    saveState();
                    renderApp();
                });

                // 3. Point calculation logic
                function calculatePoints(myScore, oppScore) {
                    if (myScore === null || oppScore === null || isNaN(myScore) || isNaN(oppScore)) return 0;
                    if (myScore > oppScore) return 5;
                    if (myScore === oppScore) return 3;
                    if (myScore >= 7) return 1;
                    return 0;
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
                    const points = {};
                    tournament.players.forEach(p => points[p] = 0);

                    // Add up the points for every match played
                    tournament.schedule.forEach(r => {
                        r.matches.forEach((m, mIdx) => {
                            if (!m.team2) return; 
                            
                            const matchId = 'r' + r.roundNumber + '_m' + mIdx;
                            const s = matchScores[matchId];
                            if (s && s.t1 !== null && s.t2 !== null) {
                                const t1Pts = calculatePoints(s.t1, s.t2);
                                const t2Pts = calculatePoints(s.t2, s.t1);
                                
                                m.team1.forEach(p => points[p] += t1Pts);
                                m.team2.forEach(p => points[p] += t2Pts);
                            }
                        });
                    });

                    const lbDiv = document.getElementById('leaderboard-container');
                    
                    if (tournament.mode === 'teams' && tournament.teamA && tournament.teamB) {
                        const renderTeam = (teamName, members) => {
                            const sorted = members.map(p => ({p, pts: points[p]})).sort((a,b) => b.pts - a.pts);
                            return \`<h4 style="margin-bottom: 5px; color: #4169E1; border-bottom: 1px solid #eee;">\${teamName} Leaderboard</h4>
                                    \${sorted.map(x => \`<div class="leaderboard-row"><span>\${x.p}</span><b>\${x.pts}</b></div>\`).join('')}\`;
                        };
                        lbDiv.innerHTML = renderTeam('Team A', tournament.teamA) + '<br><br>' + renderTeam('Team B', tournament.teamB);
                    } else {
                        const sorted = tournament.players.map(p => ({p, pts: points[p]})).sort((a,b) => b.pts - a.pts);
                        lbDiv.innerHTML = sorted.map(x => \`<div class="leaderboard-row"><span>\${x.p}</span><b>\${x.pts}</b></div>\`).join('');
                    }
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
        if (!req.file) {
            console.error('No file uploaded.');
            return res.status(400).send('No file uploaded.');
        }
        const targetDate = req.body.targetDate || "Unknown Date"

        if (!targetDate) {
            console.error('Target date is required.');
            return res.status(400).send('Target date is required.');
        }

        const gameMode = req.body.gameMode;
        const roundsCount = parseInt(req.body.rounds) || 8;
        const csvContent = req.file.buffer.toString('utf-8');
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Schedule_${targetDate.replace(/\//g, '-')}.pdf"`);

        // Create the scheduler, passing in the string and the 'res' (Response) stream
        let scheduler: RandomDoublesScheduler | TeamScheduler;
        if (gameMode === 'teams') {
            scheduler = new TeamScheduler(csvContent, res, targetDate, { totalRounds: roundsCount });
        } else {
            scheduler = new RandomDoublesScheduler(csvContent, res, targetDate, { totalRounds: roundsCount });
        }


        // Run it! The PDF will pipe directly back to the user.
        scheduler.run();

    } catch (error: any) {
        console.error(error);
        // If they type the wrong date or the CSV is bad, show them the error
        res.status(500).send(`<h2>Error Generating Schedule:</h2><p>${error.message}</p><a href="/">Go Back</a>`);
    }
});

// --- PDF Download Endpoint for Live Dashboard ---
app.post('/api/download-pdf', express.json({limit: '10mb'}), (req: Request, res: Response) => {
    try {
        const { schedule, targetDate, mode, teamA, teamB } = req.body;

        if (!schedule ) {
            console.error("Missing schedule or targetDate! Body received was:", req.body);
            return res.status(400).send('Missing schedule or targetDate in request body.');
        }

        const safeTargetDate = typeof targetDate === 'string' ? targetDate : "Unknown_Date";
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Schedule_${safeTargetDate.replace(/\//g, '-')}.pdf"`);

        const description = "11 minute timed games with a 1-2 minute break between rounds.\n5 points for a win\n3 points for a draw\n1 point for a loss with >7 points\n0 points for a loss with <7 points";
        const generator = new PdfGenerator(res, `Schedule ${safeTargetDate}`, description, defaultPdfConfig);

        const teamsInfo = (mode === 'teams' && teamA && teamB) ? { teamA, teamB } : undefined;

        generator.generate(schedule, teamsInfo);
    } catch (error: any) {
        console.error(error);
        res.status(500).send('Error generating PDF');
    }
});

// --- Start the Server ---
app.listen(port, () => {
    console.log(`🚀 Server running locally at http://localhost:${port}`);
});
