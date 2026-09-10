# Initial integration findings

Date: 2026-09-06. Milestone M1 is in progress, not complete.

## Runtime and implementation

Git 2.53.0.windows.3 and Node v24.19.0 are callable in the Codex session through its bundled runtime. This does not establish that Git/Node are on the user's ordinary Windows PATH. No installer has been run.

The first slice uses plain HTML/CSS, browser JavaScript modules, and dependency-free Node build/test/preview scripts. This matches static GitHub Pages hosting and keeps the integration experiment small. No Sites hosting resource or hosting manifest was created because the user chose GitHub Pages.

The interface is German, with an English setup guide as a practical initial choice. The interface language is not a newly confirmed user requirement.

## WiktAPI observations

Live read-only HTTP requests were made to `https://api.wiktapi.dev/v1/de`. These were shell requests, not a full browser interaction test.

| Case | Observation |
|---|---|
| Buch | HTTP 200; nominative das Buch / die Bücher present |
| Bank | Two entries; one has die Bänke, the other die Banken |
| begabt | Four entries; adjective declension forms are present and must not be used as noun gender |
| zwischen | A word lookup returns an entry |
| schnell | Live grammar mapping: schneller and am schnellsten from standalone comparative/superlative tags; declined forms excluded |
| gehen | Live grammar mapping: ging from past + ich / first-person singular active indicative, gegangen from participle-2 perfect, sein from auxiliary perfect |
| holen ab | Listed by prefix search; encoded detail endpoint returns 404 with literal holen%20ab and no Access-Control-Allow-Origin. Canonical abholen succeeds and includes wir/sie holen ab as tagged finite forms; app now resolves this evidenced relationship |
| Bücher | Encoded-path lookup returned an error response |
| Straße | HTTP 404; error says it looked for literal `Stra%C3%9Fe` |
| sich freuen | Encoded-path lookup returned an error response; this alone does not establish that an entry exists |
| invented missing word | Error response, kept distinct from a service outage |

The Buch response to a request with `Origin: http://localhost:4173` included `access-control-allow-origin: *`, supporting direct browser fetches. Browser behavior still needs end-to-end validation.

The Bank entry payloads lacked `pos` even though documentation examples show it. Initially the UI displayed a generic entry label. Following the user's word-type request, the adapter now preserves search metadata and resolves missing types from grammatical evidence or a single known search type. Ambiguous entries retain possible types and an uncertainty label. Forms and senses remain grouped by the returned entry.

Live follow-up probes confirmed `begabt` search results include both `adj` and `verb`. Its detailed entries omit `pos`: the adjective has declension tags; verb entries have imperative/indicative tags or an explicit form-of definition naming the verb. The adapter uses this evidence instead of assuming search-result order matches entry order.

The adapter preserves exact lookup independently from prefix search, separates 404 from service failures, validates payload shape, handles cancellation/timeouts, and filters adjective agreement forms. The UI offers a direct Wiktionary link when lookup fails. It does not silently replace an encoded word with a different spelling.

The [WiktAPI quickstart](https://wiktapi.dev/quickstart) states that no API key is required. The [about page](https://wiktapi.dev/about) describes the project as free and open source. A published service quota/SLA and a complete content-licensing assessment have not been established. The UI retains dictionary attribution and links to Wiktionary licensing. Revisit attribution requirements before publication and wider export/import work.

## Google Sheets experiment

Implemented, with mocked transport tests:

- Google-hosted browser authorization using only `drive.file`, without incremental broad scopes.
- Token kept in module memory; disconnect and expiry clear it.
- Create a new test spreadsheet containing an invented word in the initial create request.
- Read back that known test row; malformed content does not count as successful verification.
- Explicit denied-permission, expired-token, popup, and network error handling.
- App links to the newly created sheet, without embedding a personal file ID in source.

There is no client secret, service account, account allowlist, or personal spreadsheet ID in the implementation. Unit tests contain clearly invented tokens/IDs, not real credentials.

The user subsequently configured Google, encountered the Testing-mode 403, and reported that the connection test worked after the tester-list guidance. This is user-reported success, not agent-observed consent/readback. Restricted sharing, unauthorized access, mobile sign-in, expiry, and cross-device reopening still need validation.

The next slice now implements vocabulary save/load via a separate app-created spreadsheet. It uses an append-only versioned event journal and confirms saves by readback; retries deduplicate event IDs. Optional local configuration stores Client ID and table link, never tokens. A pasted app-created sheet link is validated by reading the expected schema after authorization, with no broader Drive scope. Live reopening after reload and from the future GitHub origin remains unverified; arbitrary existing-file Picker support remains pending. See PROJECT_PLAN.md for exact concurrency and recovery limitations.

Creation requests are not retried automatically. A timeout may mean a file was created but the response was lost; the setup guide directs the user to check Drive before repeating creation. This experiment is not the production synchronization design.

## Checks actually run

- `node --check web/app.js`, `node --check web/dictionary.js`, `node --check web/sheets.js`: passed.
- `node --test`: 11 tests passed, covering exact search behavior, error distinctions, noun mapping, adjective filtering, examples, encoding, Google scopes, expiry/disconnect, and test-row verification.
- The first sandboxed test attempt failed to spawn workers (`EPERM`); rerunning outside the sandbox passed.
- `node scripts/build.mjs`: generated the static assets successfully.
- `node scripts/serve.mjs` and a request to `http://localhost:4173`: HTTP 200. A preview-open request was queued in Codex.
- No browser automation/visual QA, real Google account test, repository creation, or deployment was performed.

## Next steps

1. Validate new vocabulary-table create/save/readback/reopen using invented meanings and the user's configured Google account.
2. Verify restricted sharing, denied access, token expiry, and two-device synchronization.
3. The manual Wiktionary fallback is implemented; automatic Unicode lookup and complete attribution review remain open.
4. Broaden the library to editing/sets and later practice after validating this persistence slice. Latest automated result: 32 tests passed with mocked transports; no live vocabulary write was performed by the agent.
