/**
 * Leaderboard table for the live scoring dashboard.
 *
 * Two different things get counted here, and they are deliberately named apart:
 *  - "score"  : the in game points a player scored (for) and conceded (against)
 *  - "points" : what a player is awarded for the result of a match, per the
 *               chosen scoring system (Pickleball, Football, ...)
 *
 * The user picks the primary ranking metric, either Points or Win %. Score
 * difference, then score for, then score against are always the tie breakers
 * behind it. Clicking any column header sorts by that column straight away,
 * and the same tie breakers still apply underneath.
 *
 * Styles and browser script live here so the dashboard page stays readable.
 */

/** Styles for the leaderboard. Drop inside a page's <style> block. */
export function leaderboardStyles(): string {
    return `
        .metric-picker { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; font-size: 13px; margin-bottom: 8px; }
        .metric-picker label { display: inline-flex; gap: 4px; align-items: center; cursor: pointer; }
        .leaderboard-note { font-size: 12px; color: #666; margin-bottom: 10px; }
        .leaderboard-scroll { overflow-x: auto; margin-bottom: 8px; }
        .leaderboard { width: 100%; border-collapse: collapse; font-size: 12px; }
        .leaderboard caption { text-align: left; font-weight: bold; color: #4169E1; padding-bottom: 4px; }
        .leaderboard th, .leaderboard td { padding: 6px 4px; border-bottom: 1px solid #eee; text-align: right; white-space: nowrap; }
        .leaderboard thead th { border-bottom: 2px solid #ddd; vertical-align: bottom; }
        .leaderboard .player-col { text-align: left; }
        .leaderboard .rank-col { text-align: right; color: #999; }
        .leaderboard tbody tr:hover { background: #f7f9ff; }
        .leaderboard .sort-btn { background: none; border: 0; padding: 0; margin: 0; font: inherit; font-weight: bold; color: #333; cursor: pointer; }
        .leaderboard .sort-btn:hover { color: #4169E1; text-decoration: underline; }
        .leaderboard th.sorted .sort-btn { color: #4169E1; }
        .leaderboard-legend { font-size: 11px; color: #888; margin-bottom: 15px; }
    `;
}

/**
 * Browser script for the leaderboard. Drop inside a page's <script> block.
 *
 * Exposes to the page:
 *  - renderLeaderboardTables(containerId, tournament, matchScores, pointsFor)
 *  - sortLeaderboardBy(columnKey) / setPrimaryMetric(metricKey)
 *
 * `pointsFor(myScore, oppScore)` is supplied by the page so the leaderboard
 * does not need to know which scoring system is active.
 */
export function leaderboardScript(): string {
    return `
        /**
         * Every column in the leaderboard. 'better' says which direction is the
         * good one, so a first click on a header sorts the useful way round.
         */
        const LEADERBOARD_COLUMNS = [
            { key: 'player',       label: 'Player', title: 'Player name',                                     better: 'asc'  },
            { key: 'played',       label: 'P',      title: 'Matches played',                                  better: 'desc' },
            { key: 'wins',         label: 'W',      title: 'Wins',                                            better: 'desc' },
            { key: 'draws',        label: 'D',      title: 'Draws',                                           better: 'desc' },
            { key: 'losses',       label: 'L',      title: 'Losses',                                          better: 'asc'  },
            { key: 'scoreFor',     label: 'SF',     title: 'Score for: in game points scored',                better: 'desc' },
            { key: 'scoreAgainst', label: 'SA',     title: 'Score against: in game points conceded',          better: 'asc'  },
            { key: 'scoreDiff',    label: 'Diff',   title: 'Score difference: score for minus score against', better: 'desc' },
            { key: 'winPct',       label: 'Win %',  title: 'Wins as a percentage of matches played',          better: 'desc' },
            { key: 'points',       label: 'Pts',    title: 'Points awarded for match results',                better: 'desc' }
        ];

        /** The metrics a user may rank the table by. */
        const PRIMARY_METRICS = [
            { key: 'points', label: 'Points' },
            { key: 'winPct', label: 'Win %' }
        ];

        /** Always applied behind whichever metric is ranking the table. */
        const TIE_BREAK_KEYS = ['scoreDiff', 'scoreFor', 'scoreAgainst'];

        const PRIMARY_METRIC_STORAGE_KEY = 'pb_primary_metric';

        let primaryMetric = localStorage.getItem(PRIMARY_METRIC_STORAGE_KEY) === 'winPct' ? 'winPct' : 'points';
        let sortKey = primaryMetric;
        let sortDirection = 'desc';

        /** Last render's inputs, so a header click can redraw on its own. */
        let leaderboardContext = null;

        function leaderboardColumn(key) {
            return LEADERBOARD_COLUMNS.filter(function (column) { return column.key === key; })[0];
        }

        function emptyStatsRow(player) {
            return { player: player, played: 0, wins: 0, draws: 0, losses: 0, points: 0, scoreFor: 0, scoreAgainst: 0 };
        }

        /** Credits one side of a finished match to each of its players. */
        function creditSide(statsByPlayer, team, myScore, oppScore, pointsFor) {
            const awarded = pointsFor(myScore, oppScore);

            team.forEach(function (player) {
                const row = statsByPlayer[player];
                if (!row) return;

                row.played += 1;
                row.points += awarded;
                row.scoreFor += myScore;
                row.scoreAgainst += oppScore;

                if (myScore > oppScore) row.wins += 1;
                else if (myScore === oppScore) row.draws += 1;
                else row.losses += 1;
            });
        }

        /** One row per player, counting only matches with both scores entered. */
        function buildLeaderboardStats(tournament, matchScores, pointsFor) {
            const statsByPlayer = {};
            tournament.players.forEach(function (player) {
                statsByPlayer[player] = emptyStatsRow(player);
            });

            tournament.schedule.forEach(function (round) {
                round.matches.forEach(function (match, matchIndex) {
                    if (!match.team2) return;

                    const entered = matchScores['r' + round.roundNumber + '_m' + matchIndex];
                    if (!entered) return;
                    if (entered.t1 === null || entered.t2 === null) return;
                    if (isNaN(entered.t1) || isNaN(entered.t2)) return;

                    creditSide(statsByPlayer, match.team1, entered.t1, entered.t2, pointsFor);
                    creditSide(statsByPlayer, match.team2, entered.t2, entered.t1, pointsFor);
                });
            });

            return tournament.players.map(function (player) {
                const row = statsByPlayer[player];
                row.scoreDiff = row.scoreFor - row.scoreAgainst;
                row.winPct = row.played === 0 ? 0 : (row.wins / row.played) * 100;
                return row;
            });
        }

        /**
         * The sort order: clicked column first, then the chosen metric, then the
         * score tie breakers, then name so the order never wobbles.
         */
        function sortChain() {
            const chain = [];
            const add = function (key, direction) {
                if (chain.some(function (step) { return step.key === key; })) return;
                chain.push({ key: key, direction: direction || leaderboardColumn(key).better });
            };

            add(sortKey, sortDirection);
            add(primaryMetric);
            TIE_BREAK_KEYS.forEach(function (key) { add(key); });
            add('player');

            return chain;
        }

        function compareValues(a, b) {
            if (typeof a === 'string' || typeof b === 'string') {
                return String(a).localeCompare(String(b));
            }
            return a - b;
        }

        function compareRows(a, b) {
            const chain = sortChain();
            for (let index = 0; index < chain.length; index++) {
                const step = chain[index];
                const result = compareValues(a[step.key], b[step.key]);
                if (result !== 0) return step.direction === 'asc' ? result : -result;
            }
            return 0;
        }

        function escapeLeaderboardText(value) {
            return String(value)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;');
        }

        function formatCell(column, row) {
            const value = row[column.key];
            if (column.key === 'player') return escapeLeaderboardText(value);
            if (column.key === 'winPct') return row.played === 0 ? '–' : value.toFixed(1) + '%';
            if (column.key === 'scoreDiff' && value > 0) return '+' + value;
            return String(value);
        }

        /** Radio buttons choosing what ranks the table. */
        function metricPickerHtml() {
            return '<div class="metric-picker" role="radiogroup" aria-label="Rank the leaderboard by">' +
                '<span><b>Rank by:</b></span>' +
                PRIMARY_METRICS.map(function (metric) {
                    return '<label><input type="radio" name="primary-metric" value="' + metric.key + '"' +
                        (primaryMetric === metric.key ? ' checked' : '') +
                        ' onchange="setPrimaryMetric(\\'' + metric.key + '\\')" />' + metric.label + '</label>';
                }).join('') +
                '</div>' +
                '<div class="leaderboard-note">Then score difference, score for, score against. Click any column to sort by it.</div>';
        }

        function headerCellHtml(column) {
            const isSorted = column.key === sortKey;
            const arrow = isSorted ? (sortDirection === 'asc' ? ' ▲' : ' ▼') : '';
            const ariaSort = isSorted
                ? ' aria-sort="' + (sortDirection === 'asc' ? 'ascending' : 'descending') + '"'
                : '';
            const classes = (column.key === 'player' ? 'player-col' : '') + (isSorted ? ' sorted' : '');

            return '<th scope="col"' + (classes.trim() ? ' class="' + classes.trim() + '"' : '') + ariaSort + '>' +
                '<button type="button" class="sort-btn" title="' + column.title + '"' +
                ' aria-label="Sort by ' + column.title + '"' +
                ' onclick="sortLeaderboardBy(\\'' + column.key + '\\')">' + column.label + arrow + '</button>' +
                '</th>';
        }

        function leaderboardTableHtml(caption, rows) {
            const sorted = rows.slice().sort(compareRows);

            const head = '<thead><tr><th scope="col" class="rank-col">#</th>' +
                LEADERBOARD_COLUMNS.map(headerCellHtml).join('') +
                '</tr></thead>';

            const body = '<tbody>' + sorted.map(function (row, index) {
                return '<tr><td class="rank-col">' + (index + 1) + '</td>' +
                    LEADERBOARD_COLUMNS.map(function (column) {
                        const cellClass = column.key === 'player' ? ' class="player-col"' : '';
                        return '<td' + cellClass + '>' + formatCell(column, row) + '</td>';
                    }).join('') +
                    '</tr>';
            }).join('') + '</tbody>';

            return '<div class="leaderboard-scroll"><table class="leaderboard">' +
                (caption ? '<caption>' + escapeLeaderboardText(caption) + '</caption>' : '') +
                head + body +
                '</table></div>' +
                '<div class="leaderboard-legend">P played, W won, D drawn, L lost, SF score for, ' +
                'SA score against, Diff score difference, Pts points awarded for results.</div>';
        }

        function drawLeaderboardTables() {
            if (!leaderboardContext) return;

            const container = document.getElementById(leaderboardContext.containerId);
            if (!container) return;

            const tournament = leaderboardContext.tournament;
            const rows = buildLeaderboardStats(tournament, leaderboardContext.matchScores, leaderboardContext.pointsFor);

            let html = metricPickerHtml();

            if (tournament.mode === 'teams' && tournament.teamA && tournament.teamB) {
                const rowsFor = function (members) {
                    return rows.filter(function (row) { return members.indexOf(row.player) !== -1; });
                };
                html += leaderboardTableHtml('Team A', rowsFor(tournament.teamA));
                html += leaderboardTableHtml('Team B', rowsFor(tournament.teamB));
            } else {
                html += leaderboardTableHtml(null, rows);
            }

            container.innerHTML = html;
        }

        /** Draws the leaderboard and remembers what it was drawn from. */
        function renderLeaderboardTables(containerId, tournament, matchScores, pointsFor) {
            leaderboardContext = {
                containerId: containerId,
                tournament: tournament,
                matchScores: matchScores,
                pointsFor: pointsFor
            };
            drawLeaderboardTables();
        }

        /** Header click: same column flips direction, a new one starts its best way round. */
        function sortLeaderboardBy(key) {
            const column = leaderboardColumn(key);
            if (!column) return;

            if (sortKey === key) {
                sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                sortKey = key;
                sortDirection = column.better;
            }

            drawLeaderboardTables();
        }

        /** Switches the ranking metric and re-sorts on it. */
        function setPrimaryMetric(key) {
            if (!PRIMARY_METRICS.some(function (metric) { return metric.key === key; })) return;

            primaryMetric = key;
            sortKey = key;
            sortDirection = leaderboardColumn(key).better;
            localStorage.setItem(PRIMARY_METRIC_STORAGE_KEY, key);

            drawLeaderboardTables();
        }
    `;
}
