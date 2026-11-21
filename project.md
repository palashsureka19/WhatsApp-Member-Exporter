# WhatsApp Member Exporter

Chrome Manifest V3 extension that exports only participant and chat details rendered in WhatsApp Web. Scanning starts only after a user clicks a scan action. Parsing, preview, deduplication, and CSV generation run locally in the popup; there is no server, network request, or persistent contact storage.

## Current features

- Scan an already-open group member list, scrolling inside the rendered participant panel.
- Choose multiple groups from WhatsApp's rendered Groups chat filter. The extension opens each selected group and its member list, scans it, then attempts to restore the original chat and chat-list position.
- Scan currently rendered chat rows without opening a contact panel or scrolling. This is a visible chat list export, not a full address-book export; group rows may be included and off-screen rows are omitted.
- Preview scanned rows, unique phone numbers, name-only entries, and member count coverage when WhatsApp shows a count.
- CSV columns: `group`, `saved_as`, `whatsapp_name`, `phone_number`, `status`. Name-only numbers remain blank. Displayed Indian 10-digit numbers and `91` numbers normalize to `+91XXXXXXXXXX`; explicit international `+` country codes are retained.
- Numbers deduplicate by normalized digits; records with no phone number are retained separately, even when their display names match.

## Install locally

1. Open `chrome://extensions` and turn on Developer mode.
2. Choose **Load unpacked** and select this folder.
3. Open WhatsApp Web. Click the extension and choose a scan action.
4. Review the preview before choosing **Download CSV**.

After editing, use **Reload** on the extension card in `chrome://extensions`.

## Development and checks

- `node --check popup.js`
- `node --test tests/popup.test.mjs`
- Refresh the code graph with `graphify update . --no-cluster`.

## Roadmap

1. **First version:** rendered group and visible chat scans, selected-group traversal, local CSV, and tests for normalization/deduplication.
2. **Manual WhatsApp validation:** compare behavior on a small group, a group requiring scrolling, and rows where WhatsApp shows only a name; confirm current selectors and restoration behavior.
3. **Selector maintenance:** update selectors if WhatsApp Web changes its rendered DOM; report incomplete scans when rows or counts cannot be verified.

## Manual validation plan

1. **Small group:** scan an open member list, compare the preview with the visible member count, and verify a CSV includes the expected fields.
2. **Long group:** use the group picker on a group requiring scrolling; confirm rows at the beginning and end are included and the original chat is restored.
3. **Name-only rows:** verify the number stays blank, names remain in the correct columns when displayed, and separate people with the same displayed name are not merged.

## Limits and risks

WhatsApp Web is not a stable extension API. The panel, row, filter, and count selectors depend on its current rendered interface and may need maintenance. A member list that closes or changes during a scan is reported as partial when detected; group switching or chat restoration can fail if the interface changes or navigation is interrupted. A displayed member count helps compare coverage, but without one the end-of-list estimate is approximate. `whatsapp_name` is filled only when a distinct WhatsApp name is rendered; WhatsApp often exposes only one visible name. The extension cannot recover hidden numbers or enumerate the complete contact book.

## Files

- `manifest.json`: minimal MV3 permissions (`activeTab`, `scripting`).
- `popup.html`, `popup.js`: accessible popup, rendered-row readers, preview, and CSV export.
- `tests/popup.test.mjs`: Node built-in tests for number normalization, off-screen filtering, duplicate names, and number deduplication.
- `graphify-out/graph.json`: Graphify code graph.
