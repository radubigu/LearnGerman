# Current project status

Updated: 2026-09-20.

## Durable import_baselist queue (2026-09-20)

- Added connected-Sheet loading for `import_baselist`. The existing `german_word` and `english_meaning` columns are accepted unchanged; a third `status` column is created by the first status write. New app-created vocabulary spreadsheets now include an empty import tab and all three headers.
- Only blank-status rows enter the review queue. Skipping writes and confirms `skipped` immediately. Completing a Sheet-backed item requires a selected dictionary meaning or a manual meaning; it is shown as pending until **In Google Sheets speichern** confirms the vocabulary journal and then writes and confirms `added`. This avoids hiding unsaved vocabulary on the next visit.
- Fixed a live-reported early-stop issue: after a successful skip, the import request now recalculates Google controls immediately. Previously the cleared busy state was not reflected in the already-rendered **In Google Sheets speichern** button, leaving it incorrectly disabled even with pending meanings and import markers.
- Removed the second early-stop dependency: selecting an existing dictionary meaning or adding one manually now queues the active baselist row for `added` immediately. Saving persists that row even when **Fertig, nächstes Wort** was never pressed; that control now only advances the review queue. Removing the selected meaning before saving removes the pending marker again.
- Simplified the queue at the user's request: visible `added`, `offen`, `skipped` and related state suffixes were removed from each word row. Open words remain blue, selected/completed words are green, and skipped words are muted; the same state text remains available through accessible button labels.
- Fixed a phone timing problem after opening the Google Sheet. The baselist action becomes tappable as soon as the vocabulary Sheet has been validated instead of waiting for every review/import read. If the learner taps while those slower background reads are still finishing, the app remembers the request and starts the baselist automatically when its rows arrive. If rows are already loaded, the same action starts the first open word without another Google request.
- Status updates re-read the source and verify row number, German word, and English meaning before writing. A moved or edited row fails visibly instead of marking a different word. Idempotent retries do not issue a duplicate write, and already `skipped`/`added` rows stay out of future loads.
- Local verification passed: 83 tests with single-process isolation, JavaScript syntax checks, the clean static build, a root HTTP smoke check for the new UI/transport, and `git diff --check`. The focused tests cover original two-column parsing, invalid rows/statuses, status-header creation, raw batch updates, row-identity protection, readback, and the new-sheet schema. No private spreadsheet or Google account was accessed, so the live OAuth/status round trip remains to be tested.

## Four-section app promoted to the default (2026-09-20)

- Replaced the root entry page with the accepted four-section interface: Üben, Wörter hinzufügen, Meine Wörter, and Einstellungen. Removed the former single-page interface and the separate `/v2/` copy instead of maintaining a redirect or duplicate app.
- Removed visible preview/version wording from navigation, headings, and browser titles. The only visible version reference is the small **App-Version 2** label in Settings.
- The existing Google Sheet tab/header names and browser storage keys ending in `V1` are intentionally unchanged compatibility identifiers; promoting the interface requires no migration and does not create a second vocabulary store.
- Local verification passed: all 80 automated tests, JavaScript syntax checks, the clean static build, root HTTP smoke test, old-route 404 check, and `git diff --check`. A browser pass confirmed the four root navigation items, version-free page title/header, and the single **App-Version 2** marker in Settings. The build now clears `dist/` first so removed routes cannot survive as stale output.
- Published release commit `4357dc8` to `main`. GitHub Actions run 35500296128 completed successfully, and `https://radubigu.github.io/LearnGerman/` returned HTTP 200 with the four-section navigation, one version label, title **Deutsch**, and no preview branding. The former `/v2/` URL returned HTTP 404. This verifies static deployment, not Google authorization or private-Sheet round trips.

## Planned next step: Kennenlernen rounds (2026-09-20)

- The user requested a relaxed, read-only vocabulary-browsing mode named **Kennenlernen**, with a choice of 10, 20 or 30 random words from Meine Wörter.
- Planned cards show the saved word, word type, German definition, example and available grammar, with Previous/Next/Finish navigation and a visible position in the round. Sampling is without replacement and should avoid duplicate headwords when possible.
- This mode is deliberately separate from practice. Browsing must not create review events, score answers, change intervals or streaks, consume the daily-new allowance, or alter due/progress counts.
- This is a confirmed next-step requirement, not implemented behavior. The detailed behavior and edge cases are recorded in [PROJECT_PLAN.md](PROJECT_PLAN.md#planned-read-only-kennenlernen-rounds).

## English import hints and DeepL checks (2026-09-19)

- Fixed DeepL prefill truncation for definitions containing `/`, reported with `zum prüfenden/beurteilenden Betrachten`. DeepL treats an encoded ASCII slash as a fragment-route separator, so the outbound translator URL now substitutes the visually equivalent full-width slash while leaving the displayed and saved German definition unchanged. A live DeepL check confirmed that both alternatives were prefilled and translated; focused regression coverage records the exact encoded URL.
- Added an explicit two-column word-list mode for tab-separated or quoted CSV input: German word plus English meaning. Both values appear in preview and queue, and the English meaning is shown above dictionary results while that imported word is reviewed.
- The English text stays in the page-memory queue only. It is not added to ordinary single-word searches, selected meaning records, Google Sheets, JSON vocabulary exports or practice.
- Every returned dictionary definition now has a compact **EN** action immediately before its meaning checkbox. It opens DeepL with German as the source and English as the target; the full purpose remains available as an accessible label and tooltip. The app does not add an API key, call a paid translation API or store the result.
- Interaction refinement: **EN** now requests a centered 520 × 680 resizable DeepL popup on desktop and falls back to the normal external-tab link if the browser blocks it. Meaning text is no longer a checkbox label: clicking or double-clicking the row can select text without changing the choice, and only the checkbox itself adds or removes the meaning. All 80 tests, syntax checks, static build and `git diff --check` passed. A local V2 browser check confirmed that clicking definition text leaves the checkbox clear, the checkbox itself still toggles, and **EN** loads the requested definition into the reusable DeepL target. The Codex in-app browser represents that target as its existing DeepL tab, so popup window dimensions still need a normal desktop-browser check.
- Added parser coverage for TSV, quoted CSV, optional recognized headers, missing/extra columns and encoded DeepL links. All 80 automated tests passed in the sandbox-supported single-process mode; JavaScript syntax checks, the static build and `git diff --check` passed.
- A local V2 browser check confirmed both columns in preview/queue, the active English hint, per-definition DeepL links, and that a later ordinary search removes the imported hint. The follow-up `tall` request hit a WiktAPI/browser-access error, so it validated hint clearing and fallback presentation rather than a second successful result set. Desktop layout was visually inspected. No private Sheet was opened or changed.
- Remaining validation: check the compact DeepL action and a two-column queue at phone width before publishing.

## Large-vocabulary practice scheduling (2026-09-19)

- Implemented progressive scheduling for collections of 1,000+ meanings without changing the Google Sheet formats. The default daily admission target is 10 new meanings, with device-local 5/10/15 choices. Saved review events determine today's usage; due work always has priority.
- More than 30 due skills or a recent goal accuracy below 85% reduces the allowance to five. More than 60 due skills or accuracy below 75% pauses new meanings. Accuracy gates activate only after ten recent learning-goal results. The overview now shows due/overdue meanings, today's admission count/allowance and estimated rounds.
- Rounds still contain at most five meanings. Under normal load they mix up to three due words, one newly unlocked grammar item and up to two new meanings before filling spare capacity. With 31–60 due skills, rounds use up to four due words and one new meaning; above 60 they become review-only until the backlog falls.
- New meanings no longer receive grammar immediately. The first successful meaning review unlocks one eligible grammar dimension; the second scheduled success unlocks the rest. Existing saved grammar progress remains visible. Plural remains separately opt-in.
- Extended successful intervals from 60 days to 120, 240 and 365 days. A failed mature skill returns after ten minutes and, after successful relearning, falls back two stages instead of losing all maturity. Repeated recent failures are labelled as needing more practice.
- Optimized large-library planning by grouping identical definitions once and caching up to 10,000 stable question hashes. In a local 1,000-noun timing probe, first-round planning fell to about 42 ms and a cached round to about 9 ms. These are development-machine measurements, not phone benchmarks.
- Scale simulations used 1,000 invented nouns with article practice, plural practice off and perfect answers. Completing all scheduled work introduced 1,000 meanings in 100 days but rose to 140 prompts / 15 five-word rounds on peak days, confirming that the 10/day target is an intake ceiling rather than a promised short workload. Limiting use to three rounds per day produced an average 22 prompts/day and admitted 513 meanings in one year as the backlog gates slowed intake. Real mistakes will reduce intake further.
- Added focused quota, backlog, accuracy, same-spelling separation, progressive-grammar, long-interval and lapse-recovery tests. All 77 tests passed in the sandbox-supported single-process mode; JavaScript syntax checks, the static build and `git diff --check` passed.
- Browser check in an isolated local V2 tab confirmed the 5/10/15 control, revised early-practice wording, no console warnings/errors, and no horizontal overflow at 390 × 844. The connected overview/round UI was not exercised because the isolated tab intentionally did not open the user's private Sheet.
- Before this release request, public Pages still served commit `932d964`; the scheduler, word-list flow, translation changes, and four-section interface were local/uncommitted.

## Plural practice made optional (2026-09-19)

- Added **Pluralformen üben** under Übungsoptionen. It is unchecked by default; article and other eligible grammar practice continue normally, while plural questions are included only when the learner selects the option before starting a round.
- Round eligibility, grammar rotation, next-review messaging, and overview counts all use the same plural setting. Existing plural review history is retained and becomes visible/eligible again when the option is enabled.
- Added focused default-off/selected-on scheduling and overview coverage. JavaScript syntax checks, all 73 automated tests, and the static build passed. No browser visual check was performed.

## Practice answer emphasis fixed (2026-09-19)

- Article and plural answers in practice feedback now use the same emphasized answer wrapper as meaning and other grammar answers. Article-only coloring is preserved: the noun text keeps its normal color.
- The shared answer renderer covers both graded feedback and the self-assessed “Antwort zeigen” reveal. `node --check web/practice-ui.js`, all 72 automated tests, and the static build passed. No browser visual check was performed for this small presentation fix.

## Unicode dictionary lookup closed (2026-09-19)

- The user tested the current lookup and confirmed that Unicode words such as **Übung** now work. The earlier WiktAPI encoded-path failure is closed as resolved upstream/currently working; the app's existing NFC normalization and URL encoding remain unchanged.
- This is user-reported live validation. No application code changed and no automated tests were required for this documentation-only status update. The manual Wiktionary fallback remains useful for genuinely missing entries or service failures.

## V2 task flow refinement (2026-09-19)

- The user accepted the phone navigation. Kept the four sections and refined their next actions: Practice links to Settings when its table is not open, an empty Meine Wörter links to adding words or connecting Google, and a selected meaning in Wörter hinzufügen offers a direct route to Meine Wörter. Empty lists no longer emphasize disabled save/download controls. Shortened repeated section introductions.
- Navigation now focuses the new section heading for keyboard users. The skip link no longer resets a non-Practice section. Practice continues to keep vocabulary hidden during active rounds; other section buttons are disabled then by the existing V2 guard.
- Local browser check: the Practice action opened Settings and expanded Google controls; the empty-word action opened Add; selecting a sample Bank meaning displayed the count and direct list action; Meine Wörter showed its article, plural, and unsaved state. The skip link preserved Add. No personal Sheet was opened, read, or written. The browser had remembered connection configuration, which was not changed.
- At a simulated 390 × 844 browser viewport, Practice, Add, Words, and Settings content was visually inspected; document width equaled scroll width (no horizontal overflow in those states). Phone navigation acceptance is user feedback, not a real-device check. A long word/unfinished list, live practice round, and Google save/reload remain to be checked before promotion or deployment.

## Four-section interface prototype (historical, 2026-09-18)

- The four-section layout was originally created at `/v2/` beside the former root interface so Üben, Wörter hinzufügen, Meine Wörter, and Einstellungen could be evaluated safely. It reused the application modules, dictionary logic, practice rules, and Google Sheet format without adding a separate data store or credentials.
- Local browser navigation was verified among all four sections. A sample Bank meaning selected under Wörter hinzufügen appeared under Meine Wörter with its noun article, plural, and unsaved-change state. No personal Sheet was opened or modified. Desktop layout was visually inspected.
- The prototype's JavaScript syntax, static build, and HTTP entry points passed at the time. The user later accepted the layout, and the 2026-09-20 release above supersedes the temporary two-entry arrangement. Remaining validation is tracked in [INTERFACE_PLAN.md](INTERFACE_PLAN.md).

## Word-list review added (2026-09-18)

- Added paste and one-column text/CSV/TSV import above single-word search. The app previews words before adding them to a review queue. Automatic splitting handles lines, commas, semicolons and tabs; line-only mode keeps commas inside phrases. Exact duplicates in a batch are removed while case stays intact.
- Each queued word opens the existing dictionary search. The learner can choose multiple meanings, use manual fallback, mark the word viewed or skip it, and revisit any item. Selected meanings still use Meine Auswahl and explicit Google Sheets saving; the queue itself stays in page memory.
- Verified in the local browser with a three-word sample: parsing removed a duplicate, Bank showed distinct noun entries, a selected bank meaning appeared in Meine Auswahl, and Next opened the lowercase verb `essen` while still suggesting `Essen`. No personal sheet was read or changed. Desktop layout was visually inspected. File-picker and phone interaction remain unverified.
- All 72 tests passed using `node --test --experimental-test-isolation=none`; the standard `node --test` could not spawn child processes in this sandbox (`EPERM`). `node --check web/app.js` and `node scripts/build.mjs` passed. The local preview was started at `http://localhost:4173/` during verification; its continued availability is not guaranteed.
- Next: try a real lesson word list, including a phrase with a comma in line-only mode, then save selected meanings to the private Sheet and verify them after reload. Existing Pages deployment and live practice-save checks remain outstanding.

## Git publication completed (2026-09-10)

- Created the public repository radubigu/LearnGerman and pushed initial commit b490ba4 on main. Local main tracks origin/main. Git Credential Manager authentication completed through GitHub device sign-in; repository-local author uses radubigu and its GitHub no-reply address.
- All 69 tests and the static build passed before publication. Reviewed/staged 30 project files; generated dist and local configuration are excluded. Focused credential/private-sheet-link scan found no matches; staged whitespace check passed.
- These results supersede the historical no-repository/no-push notes below. GitHub Pages deployment and deployed Google authorization remain unverified. Next: enable Pages with GitHub Actions, verify the workflow, configure the Google origin, then test phone/cross-device save and practice.

## Current phase

User validation (2026-09-07): the user reports testing the current app in their browser and with simulated iPhone rendering, and is happy with it. This is user-reported browser/responsive validation, not a real-device or deployed Google sign-in/cross-device check. Next milestone is publishing the prepared prototype for an actual phone test; further feature expansion is not required first.

Latest refinement (2026-09-07): the user found the expanded progress area cluttered and reported an old completed round appearing after refresh. Completed summaries are now transient: old snapshots no longer restore them, and new snapshots persist unfinished rounds only. Pending review events remain independently recoverable. The overview is compact, with progress details and practice options collapsed; current-round results have their own card and a Zur Übersicht action. Repeated failed skills for one entry are grouped without repeating the word/definition. Idle saved-state filler is removed, while pending/error notices remain visible.

Validation for this refinement: all 69 tests passed, including completed legacy snapshot recovery with pending answers and unchanged unfinished-round resume/deduplication. JavaScript syntax checks and static build passed. No personal Google data or account state was changed; browser interaction/visual verification has not been performed.

Latest implementation (2026-09-07): progress overview and full saved-word editing are implemented locally. The user reported deleting the problematic sheet row and requested no further investigation. They declined daily-use smoother/durable-draft/reconnect/sync changes and offline support. Target for online phone testing is radubigu/LearnGerman; local Pages workflow and deployment guide are ready, but browser access to GitHub was declined, so no repository creation or publication occurred.

The user reports vocabulary save/reload working and declined the separate library/sets milestone. Progressive practice using Meine Auswahl is implemented. On 2026-09-07 the user completed a round but reported 14 pending answers and “Ungültige Bedeutung” at save. A matching failure was reproduced with an invalid vocabulary payload; the exact personal sheet row has not been inspected. The save/recovery dependency was fixed and needs a live retry. GitHub repository creation and deployment remain outstanding.

Current architecture: static app targeted at GitHub Pages + private Google Sheet + Google browser authorization + WiktAPI dictionary lookup with manual Wiktionary fallback. This is not a deployed system.

## Completed

- [x] Captured learner preferences: one user, Standard German, currently B1 and aiming for C1 or higher; clear German definitions without fixed-level branding.
- [x] Documented vocabulary management, noun grammar, selected meanings, and progressive practice requirements.
- [x] Recorded the existing lookup script's location and inspected behavior from the planning discussion.
- [x] Compared hosting and storage options and recorded privacy requirements.
- [x] Created durable project instructions, plan, README, and this handoff.
- [x] Implemented dictionary search, separate entries, noun forms, meaning selection, and session-selection download.
- [x] Implemented Google per-file authorization and a new-sheet create/read test with an in-app setup guide.
- [x] Ran focused tests (11 passed), syntax checks, a static build, and a local HTTP smoke check.
- [x] Added fixed noun colors: der blue, feminine die red, das green, plural die yellow; noun articles and word types now appear in Meine Auswahl.
- [x] Added word types in search suggestions and details, preserving search metadata and distinguishing adjective/verb entries using grammatical evidence.
- [x] Changed the header to Deutsch and removed B1 from visible interface text. Updated the project guide and agent instructions with the C1+ goal and color convention.
- [x] After these changes, all 15 tests passed; JavaScript syntax checks and the static build passed.
- [x] Lowercase noun lookup now checks the capitalized spelling while retaining valid lowercase entries; all 19 tests passed after this search change.
- [x] Article text alone is colored, with no backgrounds or badges. Meine Auswahl places word types in italic beside words. Removed the color legend and Ausprobieren row, and saved the user's styling preferences in the project guide.
- [x] Verified the final style/control removal in source; JavaScript syntax check and static build passed. No extra tests were added for this presentation-only refinement.
- [x] Added eight German-character buttons above search (ä, ö, ü, ß, Ä, Ö, Ü, ẞ), with insertion at the caret/selection, input-length guard, and focus restoration without submitting.
- [x] After character-button changes, JavaScript syntax check and static build passed; the running preview returned HTTP 200 with all eight buttons in the served HTML. Browser interaction testing was not performed.
- [x] Added a Wiktionary search link and manual-entry action to missing/error lookup states, plus a manual form available at any time below dictionary results. It preserves drafts across searches and supports word type, noun article/plural, pasted definition, example, and a source-page link.
- [x] Manual meanings appear in Meine Auswahl with the same article colors and inline italic word types; their manual origin and source are retained in the session JSON download. Blank definitions and unsafe source URLs are rejected. Multiple meanings can be added consecutively.
- [x] All 23 automated tests passed, including manual noun forms, unknown/non-noun grammar, validation, Unicode search links, and JSON round-trip checks. Browser interaction testing was not performed.
- [x] JavaScript syntax checks and the static build passed after the manual-entry change. Restarted the stopped local preview; HTML with the manual form/source field and the new JavaScript module both returned HTTP 200. Left the preview running.
- [x] Fixed malformed option tags that hid Substantiv in Wortart and der in the article dropdown. Renamed the noun option to “Substantiv (Nomen)” and added a hint explaining that it reveals article/plural fields. Static build passed; served HTML returned HTTP 200 with both corrected options and no malformed closing tags. Reviewed the existing noun-field change handler; browser interaction testing was not performed.

## Remaining milestones

Latest progress/editor work (2026-09-07):

- Added new/due meaning counts, separate meaning and grammar stages, per-word due dates, and a round summary listing failed skills once despite repeated attempts. Established means three successful scheduled reviews in succession, not complete mastery.
- Replaced the grammar-only editor with Wort bearbeiten for headword, POS, definition, example, full noun forms, and available adjective/verb forms. Added cancel, edited provenance and original-definition display. Dictionary selection identity/source and manual IDs survive edits, journal save/load and export/import. Definition edits get a fresh meaning-question key while unchanged grammar progress remains.
- All 67 tests passed; six new checks cover stable edited identities, journal/export round trips, noun alternatives, stale POS forms, definition/example progress behavior, due boundaries, skill counts and deduplicated round summaries. Syntax checks and static build passed. Real account save/load and phone/browser interaction checks for these additions remain pending.
- Prepared `.github/workflows/pages.yml` to test/build/publish only dist, and docs/DEPLOYMENT.md for the selected repository and OAuth origin. Workflow was reviewed against official Pages documentation but has not run on GitHub. No tokens or private spreadsheet links were added.

Latest practice and save recovery (2026-09-06–07):

- Added rounds of up to five selected meanings: learning cards, choices or self-assessment, typed recall, and one available grammar dimension per word per round. Saved forms supply questions without dictionary requests. Noun articles retain text-only colors.
- Meaning/article/plural/adjective/verb dimensions have independent review keys. Due successes advance through 1/3/7/14/30/60 elapsed days; mistakes reset to ten minutes and add one in-round retry. Correct early reviews do not advance due dates; results aggregate once per round/dimension, with any failure preventing promotion.
- Review events use stable IDs in a separate `LearnGerman_Review_V1` tab in the existing sheet, created with its header in one batch. RAW append/readback, retry deduplication, pending states, same-tab sessionStorage recovery, and separate progress JSON export/import are implemented. OAuth tokens remain in memory only.
- Reproduced “Ungültige Bedeutung” when progress save unnecessarily parsed an invalid vocabulary payload. Saving now checks only the vocabulary schema header and validates review records independently. Reopening a valid-schema sheet can restore progress even when vocabulary loading fails; invalid meanings now identify their row. No damaged vocabulary is silently skipped or overwritten.
- Changed “Auch vorzeitig üben” to “Auch noch nicht fällige Wörter üben”; pending counts now say Antworten and explain where to retry/download a backup.
- All 61 automated tests passed, including malformed-vocabulary progress recovery, scheduling boundaries, grammar rotation, grading, interrupted sessions, missing review tabs, lost create/append responses, concurrent events and duplicate-ID conflicts. Syntax checks and static build passed. Transport tests use invented data and mocked Google APIs; the user's actual 14 answers have not yet been confirmed saved.
- Browser inventory returned no accessible tabs, so no live page or personal sheet was inspected. Restarted the stopped local server; HTML and the Sheets module returned HTTP 200 with the clearer checkbox label and recovery code. The server remains running.

Latest lookup fix (2026-09-06):

- Confirmed WiktAPI search lists “holen ab”, while its encoded word endpoint returns 404 without Access-Control-Allow-Origin. Browser fetch can consequently surface a network-style error even though the search service works.
- Added source-verified separated-verb resolution for recognized patterns: selecting or typing “holen ab” opens “abholen” only after its finite active main-clause forms confirm the relationship. The UI explains the change; canonical spelling is used for meaning IDs, grammar, and source links. Unconfirmed phrases retain ordinary lookup/manual fallback.
- Reworded generic request errors to distinguish possible service/browser-access failures from a diagnosed internet outage; timeouts have their own message.
- The live check exposed subordinate-clause Präteritum alternatives (ich abholte). Excluded these from the displayed main-clause ich-form; the regression fixture now checks holte ab only.
- All 46 tests passed, including canonical lookup, direct separated input, false candidates, ordinary holen, cached exact results, cancellation, rate limiting, and browser-access error wording. No browser interaction or personal spreadsheet access was performed.
- Live resolution confirmed holen ab → abholen with dictionary meanings, Partizip II abgeholt and auxiliary haben. The subordinate-clause correction passed all 46 tests on rerun; syntax checks and the final static build passed. The served dictionary module returned HTTP 200 and the local preview remains running.

Latest grammar work (2026-09-06):

- Adjectives now retain Komparativ/Superlativ, and verbs Präteritum (ich form without pronoun), Partizip II, and Perfekt auxiliary (haben/sein). Only explicitly tagged forms are extracted; declined adjective endings, unrelated tenses, and finite passive/subjunctive forms are filtered.
- New grammar rows appear in dictionary details and Meine Auswahl. Manual entry has adjective/verb fieldsets; selected words offer a grammar-only editor that preserves their ID, meaning, and source. Edits queue normal pending changes for explicit Sheets save.
- Optional `grammar` arrays and `grammarSource` persist in meaning JSON. Old records and exports remain compatible with unknown forms; no automatic backfill or migration occurs. Grammar edits retain drafts across selection rerenders and trigger the unload warning.
- All 41 tests passed: 32 existing tests plus nine focused grammar tests covering source filtering, separable/irregular alternatives, missing forms, manual validation, old records, and journal/export preservation.
- Live read-only API checks mapped schnell to schneller/am schnellsten and gehen to ging/gegangen/sein. No personal vocabulary or spreadsheet was read or written by the agent. Live Sheets round-trip of the new grammar still needs user validation.
- Syntax checks and the static build passed. Updated HTML with adjective/verb fieldsets and the grammar module returned HTTP 200; no malformed closing tags were found. The preview remains running. No browser interaction or visual testing was performed.

Latest persistence work (2026-09-06):

- User-reported connection-test success is recorded as user validation, not an independently observed OAuth/readback test.
- Added new vocabulary-sheet creation, reopening by app-created sheet link, explicit Save and Load controls, pending/success/failure states, and preservation of all selected meaning/grammar/source fields.
- Added versioned append-only event storage, stable change IDs, raw-cell writes, schema checks, readback confirmation, and retry deduplication. Unrelated device changes merge; the last unique appended operation wins for the same meaning. Journal rows are app-managed and must not be edited/sorted directly.
- Added undo for the last removal and merge import of existing selection JSON exports. Local drafts/new changes remain pending during network activity and recoverable failures. They remain page-memory only until saved; closing/reloading still requires saving or exporting first.
- Optional device-local settings remember only the public Client ID and private table link, never OAuth tokens. A link can reopen a sheet already created by this Google app; it cannot authorize arbitrary sheets. This reopen flow still needs a live reload/cross-device check.
- All 32 tests passed, including event merge, delete/retry behavior, edits during saves, JSON preservation, invalid schemas/source URLs, RAW append, lost-response retry, and readback failures. Transport is mocked; no real user vocabulary was accessed by the agent.
- Updated the setup guide and README with vocabulary save/reload and GitHub Pages OAuth origin instructions. No cloud configuration or deployment was changed by the agent.
- Final syntax checks and static build passed. The running server returned HTTP 200 for the updated HTML and library module; save/open/import controls were present, all referenced control IDs existed, and no malformed closing tags were found. No browser interaction or mobile visual check was performed. The local server remains running.

- [ ] M1: validate dictionary behavior and private Sheets browser read/write; select the app stack.
- [ ] M2: retain current selection/persistence slice; separate library/sets expansion declined. Remaining release checks still apply.
- [ ] M3: progressive practice implemented; validate live saves and recovery before marking complete.
- [ ] M4: deploy and verify online daily use across computer and phone.
- [ ] M5: add and verify offline travel features.

See [PROJECT_PLAN.md](PROJECT_PLAN.md) for each milestone's acceptance checks.

## Verification and limitations

- The original script's lookup approach is now adapted in `web/dictionary.js`; the external file remains unchanged.
- Live HTTP dictionary probes confirmed separate noun plurals and permissive CORS headers. Encoded-word failures were observed, including an explicit Straße 404 containing the encoded spelling.
- Read [INTEGRATION_FINDINGS.md](INTEGRATION_FINDINGS.md) for exact observations and verification limits.
- The 67 automated tests use invented definitions and mocked API transport. Public dictionary grammar was additionally checked live. The user reported Google connection and vocabulary save/load success, then a failed practice save, and later deleted row 5. Personal vocabulary/progress has not been accessed by the agent.
- Selection persists when explicitly saved to Sheets. Vocabulary drafts are page-memory only. Vocabulary JSON exports restore meanings/grammar; a separate practice JSON export restores review events. Practice rounds/pending results survive same-tab refresh through sessionStorage, but closing the tab requires save/export. Full saved-entry editing is implemented; separate library/sets work, daily-use refinements and offline support are skipped for now.
- Historical checks on 2026-09-06 returned 404 for Übung and Übungen. On 2026-09-19 the user confirmed that the current lookup works, so the Unicode issue is closed. The manual Wiktionary flow remains a fallback for other lookup failures.
- Git is available inside Codex; no system Git installation, repository initialization, commit, push, or deployment has occurred.
- Local preview served HTTP 200. Browser interaction and mobile layout testing have not run.
- After the user reported the page unreachable, restarted the local preview and confirmed HTTP 200 at `http://localhost:4173/`. Left the server running for the user. This is a temporary local process, not permanent hosting; check its current state rather than assuming it survives a restart.
- Node is now available at `C:/Program Files/nodejs/node.exe`. The user can run `node scripts/serve.mjs` from the project directory in a regular terminal.

## Next concrete step

First run a live private-Sheet check of `import_baselist`: load an original two-column row, confirm skip writes `skipped`, then select and save a different row and confirm it becomes `added` only after the vocabulary meaning is readable from the journal. Reload and confirm neither completed row returns. After that, continue with the documented read-only **Kennenlernen** flow in Üben, including the 10/20/30 selector, random sampling, browsing navigation and explicit separation from practice progress. Retain the existing practice-recovery, Google-origin, phone and cross-device checks. Leave the deleted-row investigation, declined daily-use refinements and offline work out of scope.

Needed during setup: intended GitHub repository, Google Cloud/OAuth configuration, and a private test spreadsheet selected or created through the intended authorization flow. Keep account credentials and private file identifiers out of these documents.

## Handoff maintenance

After meaningful work, update this file with completed behavior, commands/checks actually run, remaining failures or uncertainties, and the next actionable step. Update the plan only when requirements or design decisions change. Do not mark planned behavior as implemented.
