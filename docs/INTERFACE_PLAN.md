# Interface plan

Started: 2026-09-18. Promoted to the default app at `/` on 2026-09-20; the former single-page interface and separate preview were removed.

The four-item layout keeps the everyday tasks distinct: **Üben**, **Wörter hinzufügen**, **Meine Wörter**, and **Einstellungen**. It uses the existing selected meanings, practice rules, Google Sheet format, dictionary behavior, and noun-article colors. A small **App-Version 2** label in Settings is the only visible version marker.

## Implemented structure

- The navigation shows one section at a time, with a visible selected state, section heading, and word count.
- Üben contains the compact overview and practice flow.
- Wörter hinzufügen contains single-word search, pasted/file word-list review, dictionary meanings, and manual entry.
- Meine Wörter contains selected meanings, editing, removal, import/export, and explicit save/load controls.
- Einstellungen contains the Google Sheets connection and setup guide. Connection details stay collapsed until opened.
- The interface continues to use the existing application modules and storage format. No personal data is bundled with the static page, and no spreadsheet migration is required.

## Next UI/UX pass

1. Add the planned **Kennenlernen** browsing mode to Üben as a visually separate action from scored/scheduled practice. Offer 10/20/30 random words and Previous/Next cards, with no practice events or progress changes.
2. Continue phone checks with a long word, an unfinished list, and an active practice round. The four main screens were inspected at a simulated 390 × 844 viewport without horizontal overflow, and the user accepted the phone navigation; this is not a real-device or connected-Sheet check.
3. Verify the empty/disconnected next-action wording in real use and keep save/error states clear.
4. Decide later whether Meine Wörter needs a small local filter/search for large selections. Keep this within Meine Auswahl; do not introduce sets or a second library.

## Remaining acceptance checks

- Confirm all four destinations with mouse, touch, and keyboard on the deployed app.
- Confirm multiple selected meanings remain available when switching sections before saving.
- Confirm an active practice round keeps vocabulary answers out of view and can be paused/resumed.
- Verify Google connection, save/load, JSON backup, and practice recovery against the existing private Sheet without migration.
- Perform a real-phone check and a cross-device save/load round trip.
