# WhatsApp Member Exporter

## Release 0.4.0 — validation status

The local regression suite passes, but **this release still needs a live WhatsApp scan after reloading the extension**. The last successful browser check reproduced the old 0.3.2 chat-opening failure and confirmed that small groups show members inline without a View all button. The latest reload/test attempt was blocked by the computer-control URL verification guard. Do not treat fixture tests as proof of compatibility with the current WhatsApp DOM.

This pass fixes the row activation target, waits for the selected chat to open, includes role-based header buttons, supports inline member lists, and opens View all when present. Discovery starts at the top and handles Groups under More lists. The filter badge is no longer treated as the total group count. Stop scan retains collected rows, and the preview reports per-group member counts and partial coverage. A narrow-panel scrolling regression was also fixed.

Phone parsing now preserves explicit international country codes before applying the Indian local-number rule. Chat exports read phone numbers only from a complete phone-number title, never from a message preview or a group title containing a phone number. A distinct WhatsApp name is exported only when visibly prefixed with `~`; status/about text is not guessed to be a name. CSV text fields are escaped and formula-like values are neutralized.

Chrome Manifest V3 extension that exports only participant and chat details rendered in WhatsApp Web. Scanning starts only after a user clicks a scan action. Parsing, preview, deduplication, and CSV generation run locally in the popup; there is no server, network request, or persistent contact storage.

## Current features

- Scan one selected group or all discovered groups without manually opening each chat; the extension opens group details and scrolls the rendered participant panel automatically.
- Choose one group or **All groups** from a compact dropdown. The extension activates WhatsApp's Groups filter, opens each selected group and its member list, gathers rendered members automatically, then attempts to restore the original chat and chat-list position. Scan failures now show the affected group and first error in the popup. Group discovery and member collection may move the WhatsApp chat/member panes while they run.
- Scan currently rendered chat rows without opening a contact panel or scrolling. This is a visible chat list export, not a full address-book export; group rows may be included and off-screen rows are omitted.
- Preview scanned rows, unique phone numbers, name-only entries, and member count coverage when WhatsApp shows a count.
- CSV columns: `group`, `saved_as`, `whatsapp_name`, `phone_number`, `status`. Name-only numbers remain blank. Displayed Indian 10-digit numbers and `91` numbers normalize to `+91XXXXXXXXXX`; explicit international `+` country codes are retained.
- Numbers deduplicate by normalized digits; records with no phone number are retained separately, even when their display names match.

## Install locally

1. Open `chrome://extensions` and turn on Developer mode.
2. Choose **Load unpacked** and select this folder.
3. Open WhatsApp Web. Click the extension and choose a scan action.
4. Review the preview before choosing **Download CSV**.

Brave: use `brave://extensions` instead. For this update, click **Reload** on the existing exporter card and confirm version **0.4.0**. Keep the extension popup open until scanning and download finish; closing it discards the in-memory preview and can interrupt a batch. You do not need to scroll member lists yourself. The extension moves the rendered lists automatically; it cannot collect rows WhatsApp never renders.

After editing, use **Reload** on the extension card in `chrome://extensions`.

## Development and checks

- `node --check popup.js`
- `node --test tests/popup.test.mjs`
- Refresh the code graph with `graphify update . --no-cluster`.

## Roadmap

1. **Current:** rendered group and visible chat scans, one/all group dropdown, local CSV, null-result handling, and tests for normalization/deduplication.
2. **Release gate still pending:** reload 0.4.0 in Brave, then compare behavior on a small group, a group requiring scrolling, and rows where WhatsApp shows only a name; confirm selectors, CSV download, cancellation and restoration behavior.
3. **Selector maintenance:** update selectors if WhatsApp Web changes its rendered DOM; report incomplete scans when rows or counts cannot be verified.

## Manual validation plan

1. **Small group:** choose a small group in the dropdown without opening its member list, scan, compare the preview with the displayed member count, and verify a CSV includes the expected fields.
2. **Long group:** use the group picker on a group requiring scrolling; confirm rows at the beginning and end are included and the original chat is restored.
3. **Name-only rows:** verify the number stays blank, names remain in the correct columns when displayed, and separate people with the same displayed name are not merged.
4. **Stop and partial results:** stop a longer scan and close the member panel during another scan; confirm previously collected rows remain exportable and coverage is partial.
5. **CSV and visible chats:** export a Unicode name, a multiline name and a number with a foreign country code. Confirm a number in a chat message is not assigned to that chat. Import the phone column as text in spreadsheet software to retain the leading plus.

## Automated checks in this pass

15 Node tests cover null script results, standalone injected functions, group discovery, delayed chat navigation, inline versus expanded member lists, failed-navigation rejection, recycled member rows, duplicate names, number deduplication, cancellation, detached panels, count mismatch, narrow-panel scrolling, country codes, message-preview exclusion and CSV escaping. These tests use synthetic data only. No real contacts or exported CSVs are committed.

## Limits and risks

WhatsApp Web is not a stable extension API. The panel, row, filter, and count selectors depend on its current rendered interface and may need maintenance. A member list that closes or changes during a scan is reported as partial when detected; group switching or chat restoration can fail if the interface changes or navigation is interrupted. A displayed member count helps compare coverage, but without one the end-of-list estimate is approximate. `whatsapp_name` is filled only when a distinct WhatsApp name is rendered; WhatsApp often exposes only one visible name. The extension cannot recover hidden numbers or enumerate the complete contact book.

The picker currently identifies groups by displayed title; identically titled groups cannot be reliably distinguished. English WhatsApp labels are required. Saved contacts that display only a name remain name-only exports. `saved_as` represents the displayed non-`~` name, not an independently verified address-book record. A scan is marked complete only when it reaches the apparent end and, when available, the observed row count matches the displayed member count. Membership changes during a scan can make that count mismatch.

## Files

- `manifest.json`: minimal MV3 permissions (`activeTab`, `scripting`).
- `popup.html`, `popup.js`: accessible popup, rendered-row readers, preview, and CSV export.
- `tests/popup.test.mjs`: Node built-in tests for number normalization, off-screen filtering, duplicate names, and number deduplication.
- `graphify-out/graph.json`: Graphify code graph.
