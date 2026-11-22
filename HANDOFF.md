# Next chat handoff

## Start here

- Repo: `C:\Users\rajes\OneDrive\Desktop\WhatsApp-Member-Exporter`; private GitHub `palashsureka19-cpu/WhatsApp-Member-Exporter`, branch `master`.
- Read `project.md` and source before editing. Shell commands require `rtk` per `C:\Users\rajes\.codex\RTK.md`; Git needs `-c safe.directory=C:/Users/rajes/OneDrive/Desktop/WhatsApp-Member-Exporter`.
- User wants **Groups only**, with a searchable group picker and one-click export that does not open or scroll the WhatsApp member panel. Test **Investor Circle**, not the small Everything group. Keep private contact data out of Git and chat output.

## Competitor workflow observed, 22 November 2026

In Brave, the installed purple **WA Contacts Extractor** (version 2.1.44) was run end to end. Its Groups tab offers a searchable multi-select picker, participant counts, All Groups, Include Admin, and Start Exporting. Searching for Investor Circle initially said No Data. Scrolling **inside the picker** exposed `Investor Circle (454 participants)`; it was selected as a chip. Start Exporting finished in about ten seconds and reported **453 contact information**. No WhatsApp chat or member panel navigation was observed during the run. CSV, Excel, JSON, and VCard appeared as format options. The popup said free accounts can export at most 10, yet the CSV download actually contained **453 data rows** (57,916 bytes).

The downloaded private file is `C:\Users\rajes\Downloads\WA-EXTRACTOR-Investor Circle_1795331508264.csv`. Its header is `country_code,country_name,phone_number,formatted_phone,is_my_contact,saved_name,public_name,is_blocked,labels,last_msg_text,last_msg_date,last_msg_type,last_msg_status`. Only header and row count were inspected; values were not reviewed or committed. This demonstrates the desired interaction and available output, **not** how the competitor retrieves data. Access to WhatsApp's internal client state is a plausible inference, not verified. Do not copy its proprietary code into this repo.

## Current exporter status

The local MV3 extension is version 0.4.5, but its group scan remains **unusable in live Brave testing**. The picker found 73 groups. Versions 0.4.2-0.4.5 opened group info but returned zero member rows. A diagnostic saw one list and 28 items while a selected small group showed four members and another group's overlay was visible. A broader list selector was tried, then reverted because it could attribute the wrong group's members. Chat restoration also failed in prior live attempts. Synthetic tests pass but cannot validate WhatsApp's current UI. Do not claim the extension can export Investor Circle yet.

The next implementation should first establish a reliable, group-bound data source that supports the user's no-panel workflow, and establish whether it provides saved name, public name, and phone for each member. Define the trust and privacy boundary before replacing the DOM reader. If WhatsApp exposes only a partial set, report that explicitly. Identify groups by stable ID, not only a possibly duplicated title; keep collection local and user initiated. Then test Investor Circle end to end, including CSV fields, coverage against 454, deduplication, cancellation, and restoring the current chat if navigation is ever needed.

## Reverse engineering skill status

The user invoked `$reverse-engineer-anything`. Its skill is `C:\Users\rajes\.codex\skills\reverse-engineer-anything\SKILL.md`. No REA MCP tools or `rea` CLI were connected. The documented `npx rea-agents@latest` fallback was attempted from a trusted temp directory, but it requires Node >=24.22.1 (or ^22.23.4 / >=26.12.1), while this PC has Node 24.18.0. Thus there is **no REA Evidence report or decompilation result**. Runtime observation and the installed manifest are the only competitor evidence so far. The installed manifest requests WhatsApp host access, `storage`, `identity`, and `unlimitedStorage`; that does not establish whether contact data is transmitted.

## Verification before release

Run `node --check popup.js`, `node --test tests/popup.test.mjs`, and `graphify update . --no-cluster`. Reload the unpacked extension in `brave://extensions` after source edits. A live Investor Circle export with correctly bound members and a verified CSV is the release gate. Keep the popup open during current scans; closing it can interrupt the scan.
