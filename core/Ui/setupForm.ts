/**
 * The roster/settings form shared by the PDF generator page and the live
 * dashboard. Markup, styles and browser script all live here so the two pages
 * can never drift apart.
 *
 * Both pages get the same field ids and name attributes, so the form works
 * either as a plain POST (PDF page) or read by script (dashboard).
 */

import { DEFAULT_RESTS_PER_PLAYER } from '../Rests';

/** Selectable court counts offered in the setup form. */
export const MIN_COURTS = 1;
export const MAX_COURTS = 8;
export const DEFAULT_COURTS = 4;

/** Builds the <option> list for a court count dropdown. */
export function courtOptions(selected: number = DEFAULT_COURTS): string {
    let options = '';
    for (let count = MIN_COURTS; count <= MAX_COURTS; count++) {
        options += `<option value="${count}"${count === selected ? ' selected' : ''}>${count}</option>`;
    }

    return options;
}

export interface SetupFormOptions {
    /** Element id given to the <form>. */
    formId: string;
    /** Set for a plain POST form. Leave out when script handles submitting. */
    action?: string;
    /** Text on the submit button. */
    submitLabel: string;
    /** Whether to offer the scoring system picker (live scoring only). */
    includeScoring?: boolean;
}

/** Styles for the shared form. Drop inside a page's <style> block. */
export function setupFormStyles(): string {
    return `
        .setup-form { text-align: left; }
        .setup-form label { display: block; margin-bottom: 5px; }
        .setup-form input[type="text"],
        .setup-form input[type="file"],
        .setup-form select,
        .setup-form textarea { width: 100%; box-sizing: border-box; padding: 8px; margin-bottom: 15px; font-size: 14px; }
        .setup-form input[type="number"] { display: block; width: 80px; padding: 8px; margin-bottom: 15px; font-size: 14px; }
        .setup-form .roster-row { display: flex; gap: 10px; align-items: center; margin-bottom: 15px; }
        .setup-form .roster-row input[type="file"] { margin-bottom: 0; }
        .setup-form .field-hint { font-size: 12px; color: #666; margin-bottom: 8px; }
        .setup-form .name-row { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; }
        .setup-form .name-row input[type="text"] { margin-bottom: 0; }
        .setup-form .secondary-btn { background: #eee; color: #333; font-size: 14px; padding: 8px 12px; margin-top: 0; white-space: nowrap; }
        .setup-form .secondary-btn:hover { background: #ddd; }
        .setup-form .add-name-btn { padding: 6px 14px; font-size: 18px; line-height: 1; margin-top: 0; }
    `;
}

/** The form markup itself. Wrap it in an element carrying class="setup-form". */
export function setupFormHtml(options: SetupFormOptions): string {
    const { formId, action, submitLabel, includeScoring = false } = options;
    const formAttributes = action
        ? ` action="${action}" method="POST" enctype="multipart/form-data"`
        : '';

    let step = 0;
    const label = (text: string) => `<label><b>${++step}. ${text}</b></label>`;

    return `
        <form id="${formId}"${formAttributes}>
            <!-- Filled in from the name boxes when the form is submitted. -->
            <input type="hidden" id="player-names" name="playerNames" />

            ${label('Players:')}
            <div class="roster-row">
                <span id="csv-file-wrap" style="flex: 1;">
                    <input type="file" id="csv-file" name="rosterFile" accept=".csv" aria-label="Upload roster CSV" />
                </span>
                <button type="button" id="manual-toggle" class="secondary-btn" onclick="toggleManualNames()">Enter names manually</button>
            </div>

            <div id="csv-date-field">
                <label for="target-date"><b>Target Date Column (e.g. 22/06/26):</b></label>
                <input type="text" id="target-date" name="targetDate" placeholder="DD/MM/YY" />
            </div>

            <div id="manual-names" style="display: none;">
                <div class="field-hint">One box per player, at least 4. Press Enter or + to add another.</div>
                <div id="name-rows"></div>
                <button type="button" class="add-name-btn" onclick="addNameRow()" aria-label="Add another player">+</button>
            </div>

            ${label('Game Mode:')}
            <select id="game-mode" name="gameMode">
                <option value="random">Random Doubles</option>
                <option value="teams">Teams</option>
            </select>

            ${label('Number of Rounds:')}
            <input type="number" id="rounds" name="rounds" value="8" min="1" required />

            ${label('Number of Courts:')}
            <select id="courts" name="courts">
                ${courtOptions()}
            </select>

            ${includeScoring ? `
            ${label('Scoring System:')}
            <select id="scoring-system" name="scoringSystem" onchange="renderScoringGuide()">
                <option value="pickleball">Pickleball</option>
                <option value="football">Football</option>
            </select>
            <div id="scoring-guide" class="field-hint" style="margin: -10px 0 15px;"></div>
            ` : ''}

            ${label('Preferred Partners (optional):')}
            <div class="field-hint">Prioritised, not guaranteed. Separate partners with &amp; and partnerships with ; or a new line. A player can have several partners.</div>
            <textarea id="partners" name="partners" rows="3" placeholder="Joe Kane &amp; Ming Tan; Joe Kane &amp; Grace Kemp; Emma Scargill &amp; Angela Wooding"></textarea>

            ${label('Rests per Player:')}
            <div class="field-hint">How many rounds each player sits out across the whole session.</div>
            <input type="number" id="rests-per-player" name="restsPerPlayer" value="${DEFAULT_RESTS_PER_PLAYER}" min="0" />

            ${label('Rests for Particular Players (optional):')}
            <div class="field-hint">Overrides the number above for the players you name. Their rests get spread evenly across the session, never bunched together. One entry per player, separated by ; or a new line.</div>
            <textarea id="player-rests" name="playerRests" rows="3" placeholder="Joe Kane: 3; Ming Tan: 0"></textarea>

            <button type="submit" style="width: 100%;">${submitLabel}</button>
        </form>
    `;
}

/**
 * Browser script for the shared form. Drop inside a page's <script> block, then
 * call initSetupForm('<formId>') once the form is in the document.
 *
 * Exposes to the page:
 *  - SCORING_SYSTEMS: point rules and their plain English guides
 *  - collectManualNames() / rosterNamesText(): the typed names, top to bottom
 *  - rosterIsValid(): warns when fewer than 4 names were typed
 *  - manualNamesActive(): whether the user chose to type names
 */
export function setupFormScript(): string {
    return `
        const SCORING_SYSTEMS = {
            pickleball: {
                name: 'Pickleball',
                guide: 'Win: 5, Draw: 3, Loss with 7+ points: 1, Loss under 7 points: 0',
                points: function(myScore, oppScore) {
                    if (myScore > oppScore) return 5;
                    if (myScore === oppScore) return 3;
                    if (myScore >= 7) return 1;
                    return 0;
                }
            },
            football: {
                name: 'Football',
                guide: 'Win: 3, Draw: 1, Loss: 0',
                points: function(myScore, oppScore) {
                    if (myScore > oppScore) return 3;
                    if (myScore === oppScore) return 1;
                    return 0;
                }
            }
        };

        let manualNames = false;

        function manualNamesActive() {
            return manualNames;
        }

        function collectManualNames() {
            return Array.from(document.querySelectorAll('#name-rows input[type="text"]'))
                .map(input => input.value.trim())
                .filter(name => name !== '');
        }

        /** Adds one name box with its own edit and remove buttons. */
        function addNameRow(value) {
            const row = document.createElement('div');
            row.className = 'name-row';

            const input = document.createElement('input');
            input.type = 'text';
            input.placeholder = 'Player name';
            input.value = value || '';
            input.setAttribute('aria-label', 'Player name');
            input.addEventListener('keydown', event => {
                if (event.key === 'Enter') {
                    // Enter means "next player", not "submit the form".
                    event.preventDefault();
                    addNameRow();
                }
            });

            const editButton = document.createElement('button');
            editButton.type = 'button';
            editButton.className = 'secondary-btn';
            editButton.textContent = '✏️';
            editButton.title = 'Edit this name';
            editButton.setAttribute('aria-label', 'Edit this player name');
            editButton.addEventListener('click', () => {
                input.readOnly = false;
                input.focus();
                input.setSelectionRange(input.value.length, input.value.length);
            });

            const removeButton = document.createElement('button');
            removeButton.type = 'button';
            removeButton.className = 'secondary-btn';
            removeButton.textContent = '🗑️';
            removeButton.title = 'Remove this player';
            removeButton.setAttribute('aria-label', 'Remove this player');
            removeButton.addEventListener('click', () => {
                row.remove();
                if (document.querySelectorAll('#name-rows .name-row').length === 0) {
                    addNameRow();
                }
            });

            row.append(input, editButton, removeButton);
            document.getElementById('name-rows').appendChild(row);
            input.focus();
        }

        /** Switches between uploading a CSV and typing names in. */
        function toggleManualNames() {
            manualNames = !manualNames;

            document.getElementById('manual-names').style.display = manualNames ? 'block' : 'none';
            document.getElementById('csv-file-wrap').style.display = manualNames ? 'none' : 'block';
            document.getElementById('csv-date-field').style.display = manualNames ? 'none' : 'block';
            document.getElementById('manual-toggle').textContent = manualNames ? 'Upload a CSV instead' : 'Enter names manually';

            // Hidden required fields block submitting, so required follows visibility.
            document.getElementById('csv-file').required = !manualNames;
            document.getElementById('target-date').required = !manualNames;

            if (manualNames) {
                document.getElementById('csv-file').value = '';
                if (document.querySelectorAll('#name-rows .name-row').length === 0) {
                    addNameRow();
                }
            }
        }

        function renderScoringGuide() {
            const select = document.getElementById('scoring-system');
            const guide = document.getElementById('scoring-guide');
            if (!select || !guide) return;
            guide.textContent = (SCORING_SYSTEMS[select.value] || SCORING_SYSTEMS.pickleball).guide;
        }

        /** The typed names as one per line, ready to post. */
        function rosterNamesText() {
            return collectManualNames().join('\\n');
        }

        /** Warns and returns false when a typed roster is too short. */
        function rosterIsValid() {
            if (manualNames && collectManualNames().length < 4) {
                alert('Please enter at least 4 player names.');
                return false;
            }
            return true;
        }

        /**
         * Wires up the form. Pass { plainPost: true } when the browser submits
         * the form itself, so the typed names get copied into the hidden field.
         */
        function initSetupForm(formId, options) {
            const form = document.getElementById(formId);
            if (!form) return;

            document.getElementById('csv-file').required = !manualNames;
            document.getElementById('target-date').required = !manualNames;
            renderScoringGuide();

            if (options && options.plainPost) {
                form.addEventListener('submit', event => {
                    document.getElementById('player-names').value = rosterNamesText();
                    if (!rosterIsValid()) event.preventDefault();
                });
            }
        }
    `;
}
