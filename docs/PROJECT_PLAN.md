# LearnGerman project plan

Last updated: 2026-09-20.

UI decision (updated 2026-09-20): the four-section interface is the default app at `/`; the former single-page interface and separate `/v2/` preview have been removed. The sections are Üben, Wörter hinzufügen, Meine Wörter, and Einstellungen. This uses the existing data model and Google Sheet and does not revive the declined sets/library milestone. See [INTERFACE_PLAN.md](INTERFACE_PLAN.md) for remaining validation criteria.

This document captures the discussion of 2026-09-05 and 2026-09-06. It is the working product and implementation guide. Consult [STATUS.md](STATUS.md) for actual progress; proposed functionality below is not a claim that it exists.

## 1. Purpose and confirmed requirements

Build a vocabulary app for a single person studying Standard German with a Preply teacher. B1 is the current level; C1 or higher is the goal. Avoid fixed B1 branding or treating B1 as a content ceiling. Existing exercises do not reliably show noun articles or plurals, can contain questionable entries, and do not give enough control over meanings.

The user wants to:

- Use the app from a browser, including at work and while travelling, with a usable phone layout.
- Add a list of words from lessons, including words suggested by the teacher.
- Search dictionary entries and select one or several meanings to study.
- Read clear German definitions and examples that support progression toward C1 or higher.
- See singular noun articles and plural forms with their articles.
- Retain adjective Komparativ/Superlativ and verb Präteritum (Imperfekt), Partizip II, and Perfekt auxiliary for later practice, with manual completion/correction.
- Use consistent noun colors: masculine der blue, feminine die red, neuter das green, plural die yellow.
- See word types in search suggestions, dictionary descriptions, and selected meanings. Selected nouns in Meine Auswahl must include articles.
- Enter a personal definition when lookup fails, and correct entries manually.
- Original request: delete multiple words or a set of words. The user later declined the separate library/sets milestone; retain current selection/removal controls and do not add sets now.
- Press Practice and be guided progressively through exercises such as multiple choice and flashcards.
- Keep Google account access data out of a future public GitHub repository.

There is one learner. Teacher collaboration, public learner registration, and commercial product features are outside the initial scope.

## 2. Current direction and decision status

| Topic | Status | Direction |
|---|---|---|
| Learner and language | Confirmed | One user; currently B1, aiming for C1 or higher; Standard German; clear German definitions |
| Main workflows | Updated 2026-09-06 | Chosen meanings, manual entries, existing selection controls, progressive practice; separate library/sets work declined |
| Hosting | User-proposed direction | GitHub Pages with publicly readable source |
| Persistence | Vocabulary round-trip reported working by user; practice verification pending | App-created private Google Sheet; vocabulary journal and separate review-event tab |
| Google authorization | Implemented; connection test reported working by user | Google browser authorization; no embedded account secrets |
| Dictionary | User-supplied starting point | Adapt the existing WiktAPI lookup script |
| Synchronization | Recommended for intended use | Same vocabulary and progress on computer and phone |
| Offline practice | Explicitly skipped for now, 2026-09-07 | No offline or installable-app work in this iteration |
| Framework and styling | Initial implementation choice | Plain HTML/CSS and JavaScript modules; dependency-free Node tooling for the first slice |
| Automatic definition simplification | Undecided | Preserve original definitions; no paid AI service assumed; no fixed B1 cap |

A discussion of an option does not mean its integration works or has been deployed. GitHub Pages plus Sheets is the working proposal to validate, not an irreversible commitment.

## 3. Vocabulary workflow

### Add and review

Update 2026-09-20: the connected vocabulary spreadsheet has a durable `import_baselist` queue. Its required source columns are `german_word` and `english_meaning`; the app accepts an existing two-column tab and adds the third `status` header on the first processed row. Blank status means open, while `skipped` means the learner already knows the word and `added` means at least one meaning was selected or manually created and then successfully saved to the normal vocabulary journal. Opening/loading the vocabulary table reads open baselist rows, and a dedicated refresh/start action is available in Wörter hinzufügen. Skips are written and read back immediately. Selecting or manually creating a meaning queues `added` immediately; **Fertig, nächstes Wort** only navigates the queue and is not required before saving early. Added markers remain pending until the corresponding vocabulary changes are confirmed, preventing an unsaved meaning from disappearing from the next session. Status writes verify the original row number, German word and English meaning and refuse a row changed concurrently. Completed rows remain in the source sheet but are excluded from later queues. New app-created vocabulary spreadsheets include an empty baselist tab with this schema.

Batch-size refinement, 2026-09-20: each `import_baselist` review session contains at most the first 50 open rows in Sheet order. Further open rows stay in the Sheet for a later load after the current batch is processed. The interface reports both the batch size and how many open rows remain for later.

Queue presentation refinement, 2026-09-20: the word list communicates open, selected/completed and skipped states through its existing blue, green and muted text colors without appending visible state words such as `offen`, `added` or `skipped`. The state remains in each word button's accessible label. A selected Sheet-backed meaning becomes green immediately, including when the learner saves early without advancing to the next word.

Update 2026-09-19: word-list import optionally accepts exactly two tab-separated or quoted CSV columns: German headword and an existing English meaning. The English text is a transient review hint attached to that queue item; it is shown while choosing a German dictionary sense but is not added to normal search, saved meanings, Google Sheets, or practice. One-column import remains available. Every returned dictionary definition, including results from an ordinary single-word search, offers a compact **EN** action that requests a small DeepL German-to-English popup and falls back to a normal tab if the browser blocks it. This is a user-triggered confidence check, not an automatically selected or stored translation, and the definition text is handed to DeepL only when that action is opened.

Implemented 2026-09-18 and extended 2026-09-19: keep single-word search and add a word-list review queue within the same dictionary workspace. The learner can paste words or load a `.txt`, `.csv`, or `.tsv` file, preview the parsed rows, then open each word in the existing lookup to choose any number of meanings or add a manual entry. One-column automatic splitting accepts lines, commas, semicolons, and tabs; a line-only option preserves commas in phrases. The optional two-column mode is described above. Duplicates are removed within a batch without changing case (so `essen` and `Essen` remain distinct). Quoted CSV cells can contain separators. The pasted/file queue records words as viewed or skipped, but only selected meanings enter Meine Auswahl and the existing explicit Sheets save. That pasted/file queue remains a page-memory review aid rather than a durable draft; the later `import_baselist` status flow above is the durable source queue.

Above the search box, provide German-character buttons for ä, ö, ü, ß, Ä, Ö, Ü, and ẞ. Clicking inserts at the caret or replaces selected text and restores focus to the search field; it must not trigger a search. Keep buttons keyboard-accessible, usable on phones, and subject to the search length limit.

Search should show exact matches and useful suggestions, retaining different parts of speech and dictionary entries. For each word, let the learner select one or more senses and inspect grammar and examples before saving. Flag likely duplicates and let the learner add new senses to an existing word.

Lowercase noun input must resolve to the canonical capitalized entry, including when a limited prefix list omits the exact word. Search both original and initial-capital variants, merge duplicate suggestions, and prioritize a genuine original-case match (essen before Essen). Keep dictionary spelling in selected records and source links. Report partial service failures rather than treating them as absent words.

Treat network failures, malformed responses, rate limits, and absent entries as different conditions. An absent dictionary result means "not found in this dictionary," not "this word does not exist." Offer spelling suggestions, base-form lookup where available, and manual entry.

Separated verb suggestions such as “holen ab” can open the canonical “abholen” entry. For a limited recognized prefix pattern, look up the joined candidate and require its tagged active indicative main-clause forms to contain the original separated spelling before resolving. Preserve the original spelling in a visible explanation and use the canonical word for saved records/source links. Do not blindly reverse phrases. This also works when typing the separated form directly; unconfirmed forms retain normal lookup/manual fallback. Generic browser fetch errors must mention possible service/browser access failure rather than diagnosing the user's internet connection.

The manual fallback opens a Wiktionary search in a separate tab, preserving Unicode and the entered spelling. The learner copies a meaning into the app and can correct the headword, choose a word type, enter a noun's singular article and plural, add an example, and retain the actual source-page URL. Unknown grammar stays unknown. The manual form is also available after successful searches, preserves a draft across searches, and adds one meaning at a time to the current selection and JSON download. Selected meanings can now be explicitly saved to Sheets. Unsaved drafts remain session-only; editing saved entries is still pending.

### Entry content

Store the headword, part of speech, selected senses, source reference, original definition, optional simplified definition, example, personal notes, and available grammatical forms. Distinguish dictionary content, personal edits, and any future generated suggestions. Manual entries remain fully usable without source lookup.

Do not promise that an original dictionary explanation matches a particular proficiency level. Preserve it when adding a simplified explanation. For the initial version, manual editing can address difficult wording while automatic simplification is evaluated. The header should say Deutsch; avoid repeated B1 labels in the interface.

### Noun grammar

Default display uses nominative singular and plural. Show full forms, not just plural endings.

The fixed color convention is masculine singular der = blue, feminine singular die = red, neuter singular das = green, plural die = yellow. Apply it to article text in noun headings, grammatical forms, and selected vocabulary, then carry it into future library/practice screens. Use a readable darker yellow for plural article text, without a colored surface. Retain written articles and singular/plural labels so meaning does not depend on color alone.

Only the article text receives color; the noun itself keeps its normal text color. Articles must have no background, highlighting, padding, badge, or box. In Meine Auswahl, show the word type in italic on the same line as the word, without a box, with wrapping for long words or narrow screens. Preserve the current interface direction and omit the color legend and Ausprobieren sample-word row below the search bar.

Search suggestions must show every known word type for a spelling. Detailed entries and selected meanings must carry the resolved type. Use explicit entry metadata first, then grammatical evidence or an unambiguous search type. Where the entry could have multiple types, show alternatives and an uncertainty label rather than matching by list position or guessing.

| Meaning | Singular | Plural |
|---|---|---|
| book | das Buch | die Bücher |
| financial institution | die Bank | die Banken |
| bench | die Bank | die Bänke |

The English labels above explain the design distinction; learner-facing definitions should be German.

Keep forms attached to their dictionary entry and, where reliably available, the relevant sense. The source may only associate forms with an entry; do not invent a more precise sense-to-form relationship. Let the learner resolve ambiguous mappings.

Support no usual plural, plural-only entries, alternative forms, and unknown grammar. Do not infer inherent noun gender from dative/plural articles or adjective agreement forms. Non-nouns and phrases must not be forced into noun fields.

### Adjective and verb grammar

Implemented 2026-09-06: selected adjectives store standalone Komparativ and Superlativ; verbs store Präteritum in first-person singular without the pronoun, Partizip II, and the Perfekt auxiliary (haben/sein). The headword already stores the base form. Use explicit dictionary tags, preserve alternate forms, and retain entry distinctions. Exclude declined adjective agreement forms, full predicative sentences, Konjunktiv, passive finite verbs, and other tenses from the corresponding learning fields. Do not manufacture regular forms or infer an auxiliary from meaning. An unknown form is not evidence that no form exists or that an adjective cannot be compared.

Optional `grammar` object fields in the saved meaning JSON are `comparative`, `superlative` (adjectives) or `preterite`, `participleII`, `auxiliary` (verbs), each an array of strings. `grammarSource` records dictionary or manual origin. Existing V1 records without these fields load unchanged: no spreadsheet migration and no silent dictionary refresh. Grammar is visible in dictionary details and Meine Auswahl; the manual form exposes fields for the selected POS. Existing selected adjectives/verbs can be completed/corrected via “Wortformen ergänzen / bearbeiten”, preserving record identity and definition/source. Apply the form edits, then explicitly save to Sheets. These edits use the existing event journal and JSON export/import. Multiple manual forms are separated by semicolons. Practice uses these saved forms without repeating API lookups per question.

### Library and sets

Superseded on 2026-09-06: the user declined the suggested separate library-and-sets step and authorized practice next. Use Meine Auswahl as the practice pool. Do not introduce set membership, a new library screen, or bulk-management work as a prerequisite. Existing individual removal/undo and vocabulary import/export remain. Earlier set-related designs are historical proposals, not current implementation requirements.

## 4. Progressive practice

### Planned read-only Kennenlernen rounds

Requested 2026-09-20; not yet implemented. Add a separate **Kennenlernen** action in the Üben section for relaxed exposure to the saved vocabulary. Before starting, the learner chooses **10**, **20**, or **30** random words. This is browsing, not testing: show one readable card at a time with the saved headword, word type, German definition, example and available noun/verb/adjective forms, plus position such as “7 von 20” and simple Previous/Next/Finish controls.

Choose randomly without replacement from the meanings currently available in Meine Wörter. Avoid showing the same headword twice in one round when enough distinct headwords exist; retain its specific saved meaning and grammar rather than merging dictionary entries. If the collection contains fewer items than requested, show all available items and explain the smaller total. Starting another Kennenlernen round creates a new random sample.

Kennenlernen must stay independent from scheduled practice: no questions, correctness buttons, retries, scoring, review events, streak or interval changes, daily-new admission, due counts, or “attempted” state. It does not need Google progress saving or interrupted-round recovery; the current page-memory round may simply end when the learner leaves it. Keep the normal practice overview and **Übung starten** action visually distinct so reading does not look like completed practice.

Presentation refinement (2026-09-07): keep overview, active round and completed-round results visually separate. On a fresh visit show compact new/due counts and the start action; place detailed progress under Lernfortschritt ansehen and optional early practice under Übungsoptionen. A completed-round result appears only in the current visit, in a distinct card with Zur Übersicht. Do not restore completed summaries on refresh, including old saved snapshots. Persist/recover unfinished rounds and pending answers independently. Group failed dimensions by entry, show the headword/definition once, and put raw answer/retry counts under Antwortstatistik. Keep unsaved/error notices visible; omit the idle “no unsaved results” message.

Update 2026-09-07: implemented an overview above Practice with new meanings, meanings having a previously attempted skill due now, and separate meaning/grammar counts (unpractised, learning, established). Established means at least three successful due reviews in succession; this is a scheduling indicator, not a language-level claim. Counts use current selected meanings only, omit unknown grammar, and include pending results. Per-word details show dimensions and due times. The round summary groups answers by skill so retries do not multiply learning goals, and lists failed words/forms even when a retry succeeds.

Scale update 2026-09-19: practice now controls admission from collections of 1,000 or more meanings. The default target is ten new meanings per local learning day, selectable as 5/10/15, with no more than five meanings in one short round. Saved review events determine how many meanings began today, so the quota follows synchronized progress without changing the Sheet format. Previously attempted due skills come first. More than 30 due skills reduces the new allowance to five; more than 60 pauses new meanings. At least ten recent learning-goal results also reduce the allowance below 85% accuracy and pause it below 75%. The overview shows due/overdue work, today's new allowance and estimated rounds. The target preference is device-local; synchronized review events provide the shared usage count after they are saved/reloaded.

Full saved-word editing now covers headword, POS, definition, example, noun singular/plural full forms, and adjective/verb grammar in Meine Auswahl. Existing dictionary records gain a validated immutable dictionaryReference on first edit, preserving the original selection key; manual records retain their ID. originalDefinition preserves the first explanation, source links remain intact, and edited entries are labelled. Normal put events and JSON imports preserve these fields. Definition changes reset meaning questions without resetting unchanged grammar questions; example-only edits retain existing progress. Apply edits, then explicitly save. Existing page-memory draft behavior is unchanged.

Implemented first slice on 2026-09-06 and scaled on 2026-09-19: short rounds draw up to five selected meanings from Meine Auswahl after vocabulary has been saved. Failed/overdue/due work is ordered before unlocked grammar and new meanings. Under normal load a round mixes up to three due words, one newly unlocked grammar item and up to two new meanings, then fills remaining capacity from the same priority queue. With 31–60 due skills a round uses up to four due words and one new meaning; above 60 it becomes review-only until the backlog falls. No set selection is required. Hide the vocabulary workspace during a round so it does not reveal answers; Pause restores it.

| Stage | Interaction | Purpose |
|---|---|---|
| Discover | Word card with meaning, grammar, and example | Understand the new item |
| Recognize | Match a word to a German definition | Recognize the selected meaning |
| Recall | Read a definition, recall the word, then reveal | Retrieve the word with less help |
| Produce | Type a word, choose an article, or supply a plural | Practise production and grammar |
| Review | Revisit after a scheduled interval | Maintain recall over time |

Track meaning recall, article knowledge, and plural knowledge separately. A correct word with the wrong article should not be treated as complete mastery. Flashcard results are self-assessed; typed and choice exercises can be checked automatically.

Use only selected meanings in exercises. Add context where a definition permits several valid answers. Recognize valid recorded alternatives. Set clear handling for capitalization, umlauts, ß, and typing errors; feedback should explain the issue rather than silently teach an incorrect form.

New or previously failed meanings start with a learning card, followed by multiple choice and typed recall. Distractors come only from saved words with different definitions; with no distinct distractor, use a self-assessed flashcard. Known due meanings use typed recall. Grammar is progressive: no grammar question accompanies a brand-new meaning; the first successful meaning review unlocks one available grammar dimension, and a second scheduled meaning success unlocks the remaining dimensions. Previously saved grammar progress remains available for compatibility. Each word receives at most one due or newly unlocked enabled grammar dimension per round. Plural practice is available through **Pluralformen üben** under the collapsed practice options and starts unchecked; disabled plural questions and progress are omitted from round planning and the overview without deleting saved results. Missing grammar is skipped; plural-only words have no singular-article/plural-conversion quiz. Grammar prompts include the saved definition to distinguish senses.

Typed answers accept recorded alternatives and selected words with an identical normalized definition. Nouns require proper capitalization; other answers ignore case. Trim/collapse spaces, normalize Unicode to NFC, but require the correct umlauts and ß. Noun recall accepts the bare word or a recorded full form; plural answers accept full or bare forms. Präteritum accepts an optional leading ich. These are exact-form exercises, not free-text semantic grading.

Show the saved answer after grading. The first mistake for a dimension inserts one typed retry later in the same round. Schedule each meaning/grammar dimension independently: successful due reviews advance through 1, 3, 7, 14, 30, 60, 120, 240 and 365 elapsed days. A failure schedules a 10-minute relearning review; after that succeeds, an established skill falls back two interval stages instead of losing all maturity. Aggregate by round and question key: any mistake in that round prevents promotion, even after a correct retry; several correct answers in one round promote only once. Correct early practice does not move the due date. “Nach fälligen Aufgaben auch vorzeitig üben” allows optional early rounds but does not bypass the daily new-meaning allowance. Due intervals use UTC milliseconds; only the daily admission count uses the browser's local calendar day.

Question keys hash the stable meaning identity, dimension, and accepted answers; correcting a form creates a fresh key for that dimension. Completed answers have stable UUID event IDs. Pausing or refreshing the same browser tab can restore the round snapshot and pending results from sessionStorage after reconnecting/opening the same sheet. A stale or invalid round is discarded with a warning while valid pending results are retained. Closing the tab still requires save/export; offline reopening is not implemented. As of 2026-09-07, the early-practice checkbox says “Auch noch nicht fällige Wörter üben”. Practice saving checks the vocabulary header independently of vocabulary payload parsing; a damaged word row must not block valid result backups. Reopening such a sheet enables progress recovery while reporting the vocabulary-load error and row number.

Save each practice result reliably, with a unique event ID so a retried save does not count twice. Show whether results are saved, pending, or failed. Sentence completion is a proposed extension once prompts can be made unambiguous.

## 5. Proposed architecture

The browser loads the app from GitHub Pages. It calls the dictionary service for lookups and Google's APIs, after authorization, for the private spreadsheet. GitHub holds application source and publishes static assets; it does not hold personal learning data or provide a server/database.

Keep vocabulary logic, practice logic, dictionary lookup, and persistence separate. A small persistence interface should make local prototypes possible without coupling the entire app to spreadsheet cell addresses. This is not a requirement to build multiple database implementations now.

### Google Sheets storage

First vocabulary implementation (2026-09-06): create a separate app-owned spreadsheet named LearnGerman — Wortschatz with a `LearnGerman_V1` tab and a versioned four-column header. Store append-only put/delete events: unique event ID, action, stable selection key, and complete meaning JSON. Dictionary selection keys include canonical word, entry index, sense index, and definition; manual keys use the manual UUID. Keep payload IDs, articles, plural forms, POS, examples, and sources intact. The older connection-test spreadsheet is not migrated or overwritten.

Save reads and validates the journal, appends only unconfirmed local events with RAW input, then confirms all submitted event IDs by reading back. Duplicate event IDs with identical content replay once; conflicting duplicates or malformed data fail visibly. Loading merges current remote events with pending local events and does not overwrite pending work. Independent-device changes to different keys survive; changes to the same key resolve by the last unique event appended by Google. This is explicit deterministic conflict resolution, not transactional isolation; all history remains in the sheet. Rows must not be edited or sorted manually.

Practice adds `LearnGerman_Review_V1` to the same spreadsheet on first result save, with two columns: event ID and result JSON. One batch creates the tab and version header together; old vocabulary tables load as having no results without being modified. Validate the vocabulary schema before adding a tab. Review JSON contains id, sessionId, questionKey, dimension, mode, correct, and UTC timestamp at. Read/RAW-append/readback and duplicate-ID checks support lost-response retries and concurrent results. Derived schedules are recomputed from the journal, not stored as mutable cells. Results auto-save at round end and offer explicit retry/load plus a separate versioned JSON merge import/export. Pending results and round snapshots use tab-scoped sessionStorage; OAuth tokens remain in memory only. Real account practice round-trip and cross-device behavior still need user validation.

User-facing controls: create once, reopen the same app-created file by link after Google authorization, Save, Load, undo last removal, and JSON merge import/export of current meanings. Reusing a link assumes the same Google application/account already has per-file authorization; arbitrary existing-sheet selection still needs Picker. Optional remembered Client ID and sheet link are browser-local configuration only. Tokens and pending vocabulary mutations are not stored locally; an unload warning and export support recovery, but unsaved changes do not survive closing. Automatic/background sync and offline durability remain later work. Validate actual cross-device access before marking M2/M4 complete.

Proposed logical records are listed below. The final tab layout should balance readable vocabulary with reliable data relationships.

| Record | Purpose |
|---|---|
| Entries | Stable ID, headword, part of speech, source-entry reference, forms |
| Meanings | Stable ID, entry ID, original/custom definitions, examples, source |
| Sets and memberships | Named groups and their entry/meaning associations |
| Review events | Unique event ID, item/sense, exercise dimension, result, timestamp |
| Review state | Next due time and learning state for each item and dimension |
| Metadata | Schema version and migration information |

Use stable IDs, never row numbers as identity. Sorting rows must not reassign a word's progress. Validate missing columns, duplicate IDs, malformed edits, and schema versions before writing.

Google Sheets is not a transactional application database. Single-user access can still mean two devices or tabs writing concurrently. Define retry, duplicate detection, and conflict behavior before daily use. Do not rely on a naive whole-sheet overwrite or claim a read-before-write check eliminates races. Prefer append-only practice events with deduplication; validate how concurrent vocabulary edits will be detected and resolved. If safe synchronization becomes disproportionate, revisit the storage choice with evidence.

Batch requests sensibly and handle quotas with bounded retries. Keep pending changes through recoverable failures. Direct spreadsheet editing is optional; identify user-editable columns and treat internal IDs/progress fields carefully.

### Google authorization and public source

- Keep the spreadsheet sharing setting Restricted. A spreadsheet link identifies a file but does not grant the app access.
- Use Google's sign-in/consent dialog. The app never handles the Google password.
- Prefer the `drive.file` scope and a Google file picker or an app-created spreadsheet to grant access to a selected file. A pasted URL alone does not grant per-file authorization; verify the actual selection flow.
- Configure the Google Cloud project, required APIs, OAuth client, consent settings, and authorized browser origins for local development and the deployed app.
- Keep temporary access tokens in browser memory and request reconnection when needed. Never persist credentials in source, URLs, logs, exports, or service-worker caches.
- The OAuth client ID is public application configuration. Any required browser API key must have appropriate API and origin restrictions; it is not Google account authorization.
- Never ship a client secret, service-account key, access token, or refresh token. GitHub Actions secrets do not protect values subsequently bundled into JavaScript.
- Keep the personal spreadsheet selection out of public source. A private sheet ID is not itself a password, but there is no reason to publish it.
- Request minimum permissions. Do not grant broad Drive access merely to make linking a spreadsheet easier.

For a single-user project, validate personal-account consent/test-user behavior and token expiry without designing a general public account system. The public app UI is distinct from access to the learner's private sheet. Offline authorization behavior remains a later design problem.

### GitHub Pages

Build static assets with correct repository-relative paths and routing. Validate refreshes on the deployed URL and mobile access. Browser code cannot execute the existing Node CLI directly; its reusable lookup functions need a browser-compatible module.

Before publication, inspect tracked files and the generated bundle for secrets and personal data. Use invented data in examples/tests. No GitHub repository or deployment currently exists in this workspace, and documenting hosting does not publish it.

## 6. Existing dictionary reference

The user supplied this local script as inspiration:

`C:/Users/Radu/Documents/Codex/2026-09-05/i-x20/outputs/german-lookup.mjs`

The script was read during planning. Its reusable lookup approach has since been adapted into `web/dictionary.js`; the external reference file is unchanged. Its original path may be unavailable on another machine. See [integration findings](INTEGRATION_FINDINGS.md) for live API observations.

Observed behavior in the source:

- Calls `https://api.wiktapi.dev/v1/de` without an API key.
- Searches prefixes and independently checks exact entries, so limited suggestion results do not hide exact matches.
- Preserves different parts of speech for the same spelling and retains separate entries.
- Normalizes Unicode to NFC, encodes query values, checks response shapes, and uses a 15-second request timeout.
- Extracts nominative singular/plural forms with articles while filtering adjective declension forms.
- Displays German glosses, selected short examples, optional IPA, base-form suggestions, and Wiktionary attribution.
- Distinguishes unavailable lookups from missing words and includes a fallback source link.
- Retains Unicode and encoded-path cases in lookup coverage. Historical WiktAPI failures for umlauts were confirmed resolved by the user on 2026-09-19; continue treating special characters as regression cases rather than an open defect.

Before relying on WiktAPI, verify browser CORS behavior, availability, limits, terms, attribution requirements, and response structure. Test ordinary words, ambiguous entries, irregular plurals, adjective/noun distinctions, inflections, phrases, special characters, and missing words. The script is a useful starting point, not proof of API reliability or B1 suitability.

Retain accepted dictionary content in the learner's sheet so an API outage does not erase saved vocabulary. Saved online data still requires Google connectivity until local/offline support is implemented. Avoid requiring a paid AI API for initial functionality.

## 7. Delivery milestones and acceptance checks

### M0 — Durable project documentation

Deliver this plan, a current status handoff, a README, and a short AGENTS.md pointing to them. Keep proposals distinct from implementation.

Acceptance: future work in this folder can identify the objective, current direction, reference script, privacy constraints, and next step without reading the entire conversation.

### M1 — Validate the two external integrations

Inspect/adapt the dictionary approach using a small representative word sample. Prototype Google authorization and read/write against a private test spreadsheet using invented data. Record CORS, permission scope, token expiry, retry behavior, and any manual setup needed. Choose the static app stack based on these results.

Acceptance: representative dictionary cases are accounted for; one test record can be saved/read through authorized browser access; unauthorized access cannot read the restricted sheet; no account secret is required in the bundle. If an integration fails, document the concrete failure and the smallest viable fallback.

### M2 — Vocabulary library

Revised 2026-09-06: retain the existing selection, manual-entry, grammar-editing, removal/undo, export/import and explicit persistence slice. The user declined the proposed separate library/sets expansion. Move directly to M3; do not claim the original broader milestone is complete.

Acceptance for retained scope: select multiple meanings, preserve correct forms, save a missing word manually, edit supported grammar, remove/undo a selection, and round-trip vocabulary through Sheets/export. The user reports the vocabulary save/reload test working; cross-device/failure checks remain under M4.

### M3 — Learning sessions

Implement the Practice flow, cards, multiple choice, typed recall, article/plural exercises, and spaced review. Record scheduler rules and persist results with duplicate-safe retries.

Acceptance: only selected senses appear; mistakes cause appropriate follow-up; dimensions progress independently; reload/resume does not lose saved results or count retries twice; due dates behave correctly across day boundaries.

### M4 — Online daily-use release

Deploy to GitHub Pages with the Google integration, confirm phone layouts, and test cross-device data flow and failures. Document actual setup, build, deployment, and recovery steps.

Acceptance: add vocabulary on one device, practise on another, and see matching progress. Verify expired authorization, offline/network errors, retries, two-tab edits, denied access, deployed route refreshes, and absence of secrets/private data in published files. Clearly show unsaved changes.

### M5 — Travel enhancements

Add installable PWA behavior, explicit set downloads, offline practice, locally queued results, and synchronization when the app is open and online again. Keep authentication tokens out of persistent caches.

Acceptance: a previously downloaded set opens without a network; practice results survive closing/reopening; reconnecting synchronizes once without silently overwriting newer changes. Show what is and is not available offline. Do not depend on mobile background synchronization always running.

## 8. Costs, alternatives, and deferred scope

The aim is no required monthly infrastructure cost for modest personal use. This is a planning target, not a permanent pricing guarantee. External pricing and quotas were checked on 2026-09-06 and must be rechecked before deployment decisions.

- GitHub Pages supports static hosting with a public repository on GitHub Free.
- Standard Google Sheets API use has no additional charge within quotas; Google Cloud/OAuth configuration is still required.
- WiktAPI is called without a key by the reference script; its service terms and practical limits remain to be validated.
- Supabase was considered: its Free plan listed a 500 MB database, 50,000 monthly active users, 5 GB egress, and two active projects. It pauses after a week of inactivity and excludes automatic backups. Pro started at USD 25/month. It remains an alternative if Sheets creates excessive synchronization complexity.
- Local browser storage plus export/import was considered, but it does not automatically share vocabulary across devices.
- Sites hosting was discussed earlier. GitHub Pages is the user's more recent proposed hosting direction.

Defer teacher sharing, multiple users, subscriptions, direct Preply integration, Swiss German, pronunciation audio, a custom domain, and automatic AI definition rewriting unless subsequently requested. Importing a pasted list from Preply is sufficient initially; no access to the user's Preply account is required.

## 9. Open questions and next decisions

Current scope (2026-09-07): implement progress visibility and saved-vocabulary editing, then prepare online phone testing using radubigu/LearnGerman. The user explicitly declined the proposed daily-use smoother/reconnect/durable-draft/sync changes and offline support for now. M5 is paused. Browser access to GitHub was declined; local deployment preparation can proceed, but do not attempt alternative access to bypass that denial. See DEPLOYMENT.md for the prepared workflow and user setup steps.

Resolve these during the relevant milestone, without repeating questions already answered:

1. Can WiktAPI support browser lookups reliably, with acceptable licensing and grammatical coverage?
2. Can per-file Google authorization work smoothly for selecting/creating a private sheet on both desktop and phone?
3. What save/conflict strategy is sufficient for occasional use from two devices?
4. What representative lesson vocabulary should validate dictionary quality? Use invented test words until actual lesson words are available; never publish private lists by default.
5. Should simplified definitions initially be entered manually, or is another reliable source available? Any paid/generated approach is a separate decision.
6. Does the initial plain-JavaScript implementation remain appropriate as the app grows, and what final spreadsheet schema keeps it understandable?
7. What UI language and visual style does the learner prefer? German vocabulary definitions are confirmed; the interface language is not.
8. Which GitHub account/repository will be used for deployment? The user configured Google and reported the connection test working; keep personal account/project/file identifiers out of these documents.

The next validation step is a short practice round, result save/readback, same-tab refresh/resume and progress reload. The user has reported both connection-test and vocabulary save/reload success; this does not verify every acceptance check. Separate library/sets work is declined. Follow practice validation with the remaining integration and online release checks.

## 10. Decision history

| Date | Discussion outcome |
|---|---|
| 2026-09-05 | Established vocabulary control, articles/plurals, manual entries, bulk deletion, and progressive practice as the product core. |
| 2026-09-05 | User specified simple German definitions, Standard German, and B1 level. |
| 2026-09-05 to 2026-09-06 | Discussed online access, shared progress, and offline practice as separate capabilities. |
| 2026-09-06 | User proposed GitHub hosting; Supabase and local storage were compared. |
| 2026-09-06 | User provided the WiktAPI lookup script; source was inspected. |
| 2026-09-06 | User proposed a Google Sheet as storage and confirmed this is solely for personal use. |
| 2026-09-06 | Established the requirement to keep Google access data out of public source; proposed Google browser authorization to a restricted sheet. |
| 2026-09-06 | User requested durable project documentation to guide future work. No app implementation or deployment was requested in this documentation step. |
| 2026-09-06 | User authorized starting implementation. Built the first dictionary/meaning-selection slice and a Google Sheets connection experiment. Actual Google validation and deployment remain pending. |
| 2026-09-06 | Selected dependency-free HTML/CSS/JavaScript for the initial static app. Confirmed Git is callable inside Codex; supplied standard Windows installation instructions without installing it system-wide. |
| 2026-09-06 | User specified noun colors (der blue, feminine die red, das green, plural die yellow), articles in Meine Auswahl, and word-type labels throughout lookup/selection. Implemented in the prototype. |
| 2026-09-06 | User clarified B1 is current proficiency and C1 or higher is the goal. Removed fixed B1 interface branding and recorded the direction in project instructions. |
| 2026-09-06 | User refined noun styling to article-only color and inline italic word types in Meine Auswahl. Also requested lowercase noun lookup; original and capitalized searches now preserve both noun and lowercase entries. |
| 2026-09-06 | User approved the current interface direction, requested text-only article colors with no backgrounds, and removed the color legend and Ausprobieren row. This supersedes the earlier highlighted-article treatment. |
| 2026-09-06 | User requested German-character support above search. Added lowercase/uppercase umlaut and Eszett insertion buttons with caret/selection handling. |
| 2026-09-06 | User chose a manual Wiktionary fallback for failed lookups such as Übungen. Added external search plus a paste/edit form, noun grammar, optional example/source, and session-selection export. The automatic Unicode lookup problem recorded then was later closed on 2026-09-19. |
| 2026-09-19 | User tested the current lookup and confirmed Unicode words such as Übung work. Closed the earlier encoded-path issue as resolved; retained the manual Wiktionary fallback for unrelated missing entries and service failures. |
| 2026-09-19 | User requested plural questions as an explicit practice option. Added **Pluralformen üben**, unchecked by default; disabled plural skills are omitted from round planning and overview counts while saved progress remains intact. |
| 2026-09-20 | User approved the four-section interface as the default and requested publication. The root entry page now uses it, the former interface and `/v2/` duplicate are removed, and the only visible version marker is in Settings. Existing versioned Sheet tab names remain unchanged for data compatibility. |
| 2026-09-19 | User approved scaling Practice beyond 1,000 meanings. Added a 5/10/15 daily new-meaning target (10 default), event-derived daily usage, due-first mixed rounds, backlog/accuracy gates, progressive grammar unlocking, 120/240/365-day intervals, and two-stage maturity fallback after a lapse. Existing vocabulary and review Sheet formats remain compatible. |
| 2026-09-06 | User reported Google connection-test success and authorized real vocabulary persistence. Added explicit save/load through a separate app-created sheet, append-only changes with retry deduplication, merge import, undo, and optional local connection settings. Same OAuth client/account is intended for GitHub Pages after adding its exact origin; deployment and live vocabulary round-trip remain unverified. |
| 2026-09-06 | User agreed to saving adjective comparison forms and requested the analogous verb forms. Added tagged dictionary extraction, manual entry and selected-word grammar corrections for Komparativ/Superlativ and Präteritum/Partizip II/Perfekt auxiliary. Optional JSON fields preserve compatibility with previously saved words. |
| 2026-09-06 | User reported vocabulary save/reload working, asked about remembered OAuth Client ID (public optional device configuration), declined the separate library/sets step, and authorized practice. Implemented short guided rounds using Meine Auswahl, independent review dimensions, duplicate-safe review events in the existing sheet, same-tab resume, and progress backup. Live practice validation remains pending. |
| 2026-09-07 | User completed a practice round but reported 14 pending answers and an invalid-meaning save error. Reproduced a vocabulary-payload validation dependency and separated practice saving/recovery from vocabulary payload parsing, retaining schema checks. Clarified the early-practice label. Actual personal-sheet corruption and successful result readback remain unverified. |
| 2026-09-07 | User reported deleting row 5 and asked to leave that error behind. Do not continue investigating or repairing the private sheet unless requested. Later authorized progress overview/full editing, declined daily-use changes and offline support, and chose radubigu/LearnGerman for phone deployment. Features and local Pages workflow implemented; remote publication remains blocked by declined GitHub browser access. |
| 2026-09-20 | User requested a separate Kennenlernen round for browsing 10/20/30 random words without testing. Recorded it as the next feature: read-only cards from Meine Wörter with no review events, scheduling, scoring, daily-quota use, or progress changes. |

## 11. Reference sources

These support the technical discussion; they do not substitute for integration tests.

- [GitHub Pages overview](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
- [Google Sheets browser quickstart](https://developers.google.com/workspace/sheets/api/quickstart/js)
- [Google Sheets API scopes](https://developers.google.com/workspace/sheets/api/scopes)
- [Google browser token model](https://developers.google.com/identity/oauth2/web/guides/use-token-model)
- [Google OAuth best practices](https://developers.google.com/identity/protocols/oauth2/resources/best-practices)
- [Google Sheets API limits and cost](https://developers.google.com/workspace/sheets/api/limits)
- [Supabase pricing](https://supabase.com/pricing)
- [Kaikki dictionary data](https://kaikki.org/)
- [Installable web apps](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable)
- [Offline web app operation](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Offline_and_background_operation)
- [Codex project instructions through AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
