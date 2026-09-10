# LearnGerman project instructions

## Read first

Before planning or changing this project, read `docs/PROJECT_PLAN.md` and `docs/STATUS.md`. They are the durable project context and current handoff. Read this project's existing code before assuming the documentation matches implementation.

The user's latest instructions take precedence over this documentation. Distinguish confirmed requirements, proposed designs, validated behavior, and completed work. Resolve routine implementation choices within the authorized task; do not turn every open question into an approval gate.

## Product constraints

- This is a personal app for one learner studying Standard German. B1 is the current level; the goal is C1 or higher. Use clear German definitions and examples, allow progression beyond B1, and avoid fixed B1 branding or repeated level labels. The header should say Deutsch.
- Apply noun colors consistently: masculine singular der = blue, feminine singular die = red, neuter singular das = green, plural die = yellow. Use readable contrast and explicit article/number labels; plural die must never use feminine red.
- Color only the article text, never the noun text. No article background, highlighting, badge, or box. In Meine Auswahl, place the word type in italic beside the word, without a badge/box; allow wrapping when needed on narrow screens.
- Preserve the current interface direction. Do not reintroduce the der/die/das/die color legend or the Ausprobieren sample-word row below the search bar.
- Keep the practice overview compact; detailed progress and optional practice settings start collapsed. Separate current-round results into a dismissible card. Never restore a completed summary on a fresh visit; preserve unfinished rounds and pending answers independently. Avoid repeated word/definition lines and idle status filler.
- Keep a compact German-character button row above search (ä, ö, ü, ß and uppercase equivalents). Insert at the caret or replace selected text, restore focus to search, respect the input length limit, and do not submit automatically.
- Searching a lowercase noun must find its capitalized spelling. Preserve genuine lowercase entries and their priority (essen vs Essen); do not blindly capitalize all input or save the typed casing as the dictionary headword.
- Show word types in search suggestions, dictionary details, and Meine Auswahl. Nouns in Meine Auswahl must include their article. Preserve multiple possible types where applicable; do not guess an entry's type when source evidence is ambiguous.
- Core workflow: select one or more meanings, correct or create entries manually, and practise progressively. On 2026-09-06 the user declined the separate library/sets milestone; use Meine Auswahl for practice and do not introduce sets or a new library screen now.
- For nouns, show nominative singular article and full plural with article. Preserve dictionary entry and meaning distinctions; do not invent missing grammar or treat failed lookups as proof that a word does not exist.
- Current direction: static app targeted at GitHub Pages, private Google Sheet accessed through Google browser authorization, and adapted WiktAPI lookup. Local implementation exists; the user reports vocabulary persistence working. Practice is implemented but still needs live validation; deployment remains outstanding. Supabase is an alternative, not the default to introduce without a reason.
- Design for desktop and phone browsers and shared vocabulary/progress across devices. Offline practice is a later milestone.
- Prefer a small, understandable implementation appropriate for one user. Do not add multi-user administration, subscriptions, teacher access, or paid AI dependencies by default.
- On 2026-09-07 the user authorized the progress overview and full editing in Meine Auswahl, and selected radubigu/LearnGerman for a GitHub Pages phone test. They declined the proposed daily-use changes (persistent drafts, easier reconnect, sync refinements) and offline support for now; retain existing save/connect behavior.

## Data and credentials

- Assume repository source and deployed browser files are publicly readable.
- Never commit or embed passwords, OAuth access/refresh tokens, client secrets, service-account credentials, private vocabulary exports, or personal practice data. Never log tokens.
- The Google OAuth client ID is public configuration, not an account credential. A private spreadsheet ID is not authorization; keep it user configuration rather than hardcoding a personal link into public source.
- Use Google-hosted sign-in and restricted spreadsheet sharing. Prefer per-file authorization through a file picker or app-created file; validate this flow before relying on a pasted link.
- Keep temporary browser access tokens in memory. A build-time environment variable or GitHub Actions secret becomes public if bundled into browser code.
- Use stable record IDs, explicit save/error states, safe retry behavior, and export/restore. Avoid silent loss of changes across devices or duplicate practice results on retries.

## Continuing work

- Update `docs/STATUS.md` after meaningful work: what changed, what was actually verified, unresolved issues, and the next concrete step.
- Update `docs/PROJECT_PLAN.md` when scope or architecture changes. Keep its decision history concise and dated; preserve why superseded choices changed.
- Do not mark milestones complete without their acceptance checks. Do not claim a deployment, account connection, API validation, or test run that has not occurred.
- Record real setup/build/test commands in `README.md` once they exist. Use focused checks for dictionary mapping, persistence, synchronization, practice scheduling, and mobile usability; documentation-only changes need document review, not application tests.
- The original lookup script location and known behaviors are documented in the plan. Do not assume it exists on another machine.
