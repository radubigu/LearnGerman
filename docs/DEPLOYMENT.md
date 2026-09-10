# GitHub Pages phone test

Target chosen by the user: `radubigu/LearnGerman`.

Status (2026-09-10): public repository created and source pushed to main. The deployment workflow is included. Pages deployment and Google origin configuration remain unverified. Repository creation/upload steps below are now complete.

## Publish the prototype

1. Create the public repository `LearnGerman` under `radubigu` if it does not already exist. Public application source is the agreed hosting direction; never upload private vocabulary/progress backups or account credentials.
2. Add the project source on branch `main`: `web/`, `scripts/`, `test/`, `docs/`, `.github/`, `.gitignore`, `package.json`, `README.md`, and `AGENTS.md`. Exclude `dist/`, `.local/`, credentials, exports, and other personal files. If using browser upload, ensure the hidden `.github/workflows/pages.yml` file is included. Normal Git push is preferable for later changes.
3. In repository Settings → Pages → Build and deployment, choose **GitHub Actions**.
4. In Actions, run **Test and deploy LearnGerman**. Later pushes to `main` run it automatically. The workflow tests first, builds only web assets into `dist/`, then publishes that artifact.
5. Use the URL reported by the successful deployment. For this repository the expected URL is `https://radubigu.github.io/LearnGerman/`; it is not confirmed live yet.

The workflow follows [GitHub's Pages workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages). No Google credentials or personal spreadsheet ID are needed in repository secrets or workflow configuration.

## Connect Google on the phone

In the existing Google OAuth web client, add `https://radubigu.github.io` as an Authorized JavaScript origin. Do not include `/LearnGerman/`. Keep the localhost origin for desktop development. Use the existing Google test-user account and retain restricted spreadsheet sharing.

Open the deployed app in Safari or Chrome, enter the public OAuth Client ID and existing vocabulary table link, connect Google, and choose Tabelle öffnen. The values remembered on the PC's localhost page do not automatically transfer to the phone/site.

## Acceptance checks

- Search, select and edit a sample meaning; check articles and forms on the narrow screen.
- Save on one device and explicitly load on the other; confirm definitions, examples and forms match.
- Finish a short practice round and verify no pending results remain after readback; load progress on the other device.
- Verify the overview distinguishes meanings from grammar and that a failed answer is listed once in the round summary even after a retry.
- Refresh a deployed subpage and return to the app; relative assets must load under `/LearnGerman/`.

This milestone adds online phone access. Persistent vocabulary drafts, automatic reconnect/sync changes, and offline practice were explicitly excluded by the user for now.
