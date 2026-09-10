# LearnGerman

A personal German vocabulary learning app for desktop and phone browsers. The learner currently studies Standard German at B1 and aims for C1 or higher, with clear German definitions, accurate noun articles and plurals, and progressive practice based on vocabulary from lessons. B1 is a starting point, not a product limit.

**Status:** dictionary, Google Sheets vocabulary save/load, and progressive practice implemented. The user reports vocabulary persistence working; a practice-save failure has a tested recovery fix awaiting a live retry. Not deployed.

## Project guide

- [Project plan](docs/PROJECT_PLAN.md): requirements, proposed architecture, learning design, milestones, decisions, and unresolved questions.
- [Current status](docs/STATUS.md): completed work, verification, and the next step.
- [Agent instructions](AGENTS.md): tells Codex how to use and maintain this project's documentation.

These files form the project's durable memory. Keep them with the project when moving it or starting another task. They preserve written context; they are not a replacement for checking the current code and deployment state.

## Run locally

Requires Node.js 22 or later. There are no package dependencies to install. Node and Git are available in the current Codex runtime; this does not necessarily make them available in a separate Windows terminal.

From this project folder:

```powershell
node scripts/serve.mjs
```

Open [the local app](http://localhost:4173). Keep the terminal running while using it; Ctrl+C stops the server. It listens on this computer only. Phone access and a permanent online address require deployment later.

```powershell
node --test
node scripts/build.mjs
```

The build copies only `web/` into `dist/`, ready for a future static deployment. No application documentation, test fixtures, or local configuration is included. A build is not a deployment.

## What the first prototype does

- Searches WiktAPI and independently checks exact words.
- Resolves separated verb forms such as **holen ab → abholen** when the canonical dictionary entry explicitly confirms the separated form. The app explains the resolution and saves the canonical word; unconfirmed phrases retain the manual fallback.
- Offers German-character buttons above search to insert umlauts and ß/ẞ at the caret or replace selected text.
- Shows separate entries, available noun articles/plurals, German definitions, examples, and source links.
- Retains adjective Komparativ/Superlativ and verb Präteritum (ich form), Partizip II, and Perfekt auxiliary when dictionary tags provide them. These appear in details and Meine Auswahl and persist inside the saved JSON. Missing forms are left unknown.
- Manual entry offers matching adjective/verb fields. In Meine Auswahl, use **Wortformen ergänzen / bearbeiten**, then **Wortformen übernehmen** and **In Google Sheets speichern** to update an existing word's forms. Enter alternatives separated by semicolons. Older saved words still load with blank forms; they are not automatically looked up again.
- Uses blue for masculine der, red for feminine die, green for neuter das, and yellow for plural die. Search suggestions, details, and selected meanings show word types; selected nouns include their articles.
- Only the article text is colored, without a background or highlighting; the noun stays normal. Meine Auswahl shows the word type in italic beside the word. The search bar has no color legend or sample-word row. Lowercase noun searches also find the capitalized spelling, while retaining valid lowercase words.
- Lets you select meanings, explicitly save/load them through an app-created private Google spreadsheet, and download/import a JSON selection. Pending changes stay in page memory until saved; imports merge rather than replace. Undo is available for the last removal. The export contains current meanings, not the entire change history or future practice data.
- Offers a Wiktionary search in a separate tab and **Bedeutung manuell hinzufügen** below results, including when lookup fails. Paste a definition, correct the headword, choose its word type, and add noun article/plural, an optional example, and the source-page URL. Submit **Zur Auswahl hinzufügen**, then save to Google Sheets. Drafts stay intact when searching again.
- Provides a Google authorization test that creates a new private spreadsheet containing an invented example and reads it back.

Open the app's [Google setup guide](http://localhost:4173/setup.html) while the server is running, or read [the setup source](web/setup.html). The test needs a Google OAuth web Client ID configured for `http://localhost:4173`. Enter it in the app; do not provide a client secret. Google loads only when the connection section is opened.

To save: connect Google, create **Neue Vokabeltabelle erstellen** once, then press **In Google Sheets speichern** in Meine Auswahl. To return: connect using the same Google project/account, paste that table's link, and press **Tabelle öffnen**. The older connection-test sheet is not a vocabulary table. Arbitrary pasted sheets are not authorized automatically. Optional remembered Client ID/table-link settings are device-local; tokens are never stored. Read [the setup guide](web/setup.html) for GitHub Pages OAuth origins and a full save/reload test.

The sheet is an app-managed append-only change journal: do not edit or sort it directly. Repeated operations are deduplicated by event ID; unrelated device changes merge, while the last unique appended change wins for a shared meaning. Saving checks the schema, appends raw values, and confirms readback. Pending changes survive recoverable errors in the open page, but not a reload. Export current meanings before closing if saving fails.

Full editing of saved words/meanings and known grammatical forms is available in Meine Auswahl. Arbitrary-file Google Picker selection is not implemented. Separate library/sets work, daily-use refinements and offline support are skipped for now. The optional Google connection test remains separate from real vocabulary save/load.

## Practice and recover progress

On opening the app, Practice shows a compact overview. Expand **Lernfortschritt ansehen** for detailed progress or **Übungsoptionen** for early practice. After finishing a round, results appear in a separate card; **Zur Übersicht** closes it. Completed summaries do not reappear after refresh. Unfinished rounds and unsaved answers still recover after reopening the same sheet in the same browser tab.

The practice overview now shows new meanings and meanings with a review due now, plus separate meaning/grammar progress and per-word due dates. “Gefestigt” means three successful scheduled reviews in succession. The round summary lists the words and grammatical skills that need more work; retries count as additional answers but not additional learning goals.

In Meine Auswahl, open **Wort bearbeiten** to change the headword, word type, definition, example, full noun singular/plural forms, or adjective/verb forms. Use semicolons for alternatives and leave unknown forms blank. Choose **Änderungen übernehmen**, then explicitly save to Google Sheets. **Abbrechen** discards the editor draft. The original definition and source remain available; editing updates the same saved selection. Changing the definition restarts meaning practice while unchanged grammar retains its history.

For the planned phone test, see [GitHub Pages deployment](docs/DEPLOYMENT.md). The prepared destination is radubigu/LearnGerman; it has not been published by the agent. Daily-use connection/draft changes and offline support are skipped as requested.

Open your existing vocabulary table and save vocabulary changes, then click **Übung starten**. Rounds use up to five meanings from Meine Auswahl: learning cards, recognition, typed recall, and available noun/adjective/verb forms. Meanings and grammar have separate review schedules. Incorrect answers return later; unknown grammar is skipped. **Auch noch nicht fällige Wörter üben** includes words before their scheduled review time; correct early practice does not advance that date.

Results save automatically at round end into a separate review tab in the same spreadsheet. **Lernfortschritt sichern / laden** offers save retry, reload, and a separate progress JSON backup/import. A pending count refers to answers, including retries, rather than unique words. The same browser tab stores the current round and pending answers in sessionStorage so refreshing can restore them after reconnecting/opening the same sheet. Before closing the tab, save or download progress; vocabulary drafts must be saved/exported separately.

If saving reports **Ungültige Bedeutung**, download **Lernfortschritt herunterladen** before refreshing the same tab to load the fix. Reconnect Google, open the same sheet, then choose **Lernfortschritt speichern**. The updated app validates practice independently of vocabulary payloads, so a malformed vocabulary row does not prevent saving answers. Vocabulary load errors identify the row and leave existing selection untouched; repair needs separate inspection. Do not edit journal rows blindly. If needed, import your progress backup and save; stable event IDs prevent duplicate counting.

## Git on Windows

Git 2.53.0 was available inside the Codex session on 2026-09-06. To install Git for your regular Windows terminal, use the [official Git for Windows instructions](https://git-scm.com/install/windows):

```powershell
winget install --id Git.Git -e --source winget
```

Reopen PowerShell and run `git --version`. No system-wide Git installation was performed by this project. A repository/remote has not been initialized or published yet.

## Architecture direction

- GitHub Pages hosts the browser app.
- A private Google Sheet holds selected vocabulary and practice progress.
- Google authorization grants the browser access to that sheet.
- WiktAPI supplies German dictionary entries through an adaptation of an existing lookup script.

The app uses plain HTML/CSS and JavaScript modules, with built-in Node tooling. GitHub Pages remains the deployment target. The user reports connection and vocabulary save/reopen working. No GitHub repository or deployment has been created by the agent; live practice-save recovery and cross-device checks remain. See [integration findings](docs/INTEGRATION_FINDINGS.md) for verified behavior and gaps.

Public source must contain neither account credentials nor personal vocabulary/progress. Use invented examples for development fixtures and demonstrations.
