# Next chat handoff

## Start here

- Repo: `C:\Users\rajes\OneDrive\Desktop\WhatsApp-Member-Exporter`; private GitHub `palashsureka19-cpu/WhatsApp-Member-Exporter`, branch `master`.
- Read `project.md` and source before editing. Shell commands require `rtk` per `C:\Users\rajes\.codex\RTK.md`; Git needs `-c safe.directory=C:/Users/rajes/OneDrive/Desktop/WhatsApp-Member-Exporter`.
- User wants **Groups only**, with a searchable group picker and one-click export that does not open or scroll the WhatsApp member panel. **Our extension must export every phone/name row the signed-in WhatsApp client actually makes available, unmasked and free.** Build this independently in our repo; do not modify, unlock, or reuse the competitor's paid extension. Test **Investor Circle**, not the small Everything group. Keep private contact data out of Git and chat output.
- The user authorizes using their PC and Brave to debug WhatsApp Web, and allows at most two subagents when useful. They plan to clear this chat, so treat this file as the task handoff.

## Competitor workflow observed, 22 November 2026

In Brave, the installed purple **WA Contacts Extractor** (version 2.1.44) was run end to end. Its Groups tab offers a searchable multi-select picker, participant counts, All Groups, Include Admin, and Start Exporting. Searching for Investor Circle initially said No Data. Scrolling **inside the picker** exposed `Investor Circle (454 participants)`; it was selected as a chip. Start Exporting finished in about ten seconds and reported **453 contact information**. No WhatsApp chat or member panel navigation was observed during the run. CSV, Excel, JSON, and VCard appeared as format options. The CSV contained **453 data rows** (57,916 bytes), but **443 rows have their phone and saved-name fields replaced by `***PRO***`**. Only ten rows were unmasked in this free download.

The downloaded private file is `C:\Users\rajes\Downloads\WA-EXTRACTOR-Investor Circle_1795331508264.csv`. Its header is `country_code,country_name,phone_number,formatted_phone,is_my_contact,saved_name,public_name,is_blocked,labels,last_msg_text,last_msg_date,last_msg_type,last_msg_status`. Header, row count, and masking counts were inspected; actual contact values were not reviewed or committed. Do not copy the competitor's proprietary code into this repo.

## REA and static mechanism findings

Node 26.13.1 made the `$reverse-engineer-anything` CLI fallback usable. REA analyzed the installed extension's `manifest.json`, `assets/i.js`, and `assets/w.js` as inert source and saved complete Evidence to `C:\Users\rajes\AppData\Local\Temp\wa-rea-core-20261122.json` (parent Evidence ID `ev_710aecdd03a993cd9b972cace3d0b58e3d53547b2f99e146992df0fcfec8d5ef`; artifact SHA-256 `60fc2425c8a76a8ec2b6eb5c5554483a4552c39ef8b74a0ab7cc1b4eb9f0fe48`). Source selection leaves 60 inventoried files outside this REA pass; semantic node, unknown, and alias-selection limits make its relationship graph partial. A prior popup pass timed out; an overlay pass hit an internal alias-state limit. Do not treat those incomplete graphs as proof of absence.

Direct inspection of the packaged `assets/i.js` shows the mechanism: an injected `__WPP_MANAGER__` finds a `WPP_24uvb`/`WPP` WhatsApp client bridge; group discovery uses `chat.list({onlyGroups:true})` and `group.getParticipants` for counts. Export selects groups by `id.user`, calls `group.getParticipants(group.id)`, maps participant contacts, and obtains phone numbers from `c.us` IDs or `contact.getPnLidEntry` for LID IDs. It derives saved/public names from contact fields. It skips `isMe`; that could explain 454 displayed versus 453 exported, but the exact cause of the one-row difference was not proven. The popup sends a command through the content script to this injected page script. This is static source observation plus a matching runtime UI result; the code was not executed by REA. The privacy/network behavior of the competitor was not established.

## Current exporter status

The local MV3 extension is version 0.4.5, but its group scan remains **unusable in live Brave testing**. The picker found 73 groups. Versions 0.4.2-0.4.5 opened group info but returned zero member rows. A diagnostic saw one list and 28 items while a selected small group showed four members and another group's overlay was visible. A broader list selector was tried, then reverted because it could attribute the wrong group's members. Chat restoration also failed in prior live attempts. Synthetic tests pass but cannot validate WhatsApp's current UI. Do not claim the extension can export Investor Circle yet.

The next implementation should first establish whether a maintainable, permitted group-bound data source is available to our extension and whether it provides saved name, public name, and phone for each member. The competitor uses an internal WhatsApp client bridge, which is version-sensitive. Define the trust and privacy boundary before replacing the DOM reader. If WhatsApp exposes only a partial set, report that explicitly; **never mask available rows or impose a paid tier in our extension**. Identify groups by stable ID, not only a possibly duplicated title; keep collection local and user initiated. Then test Investor Circle end to end, including CSV fields, coverage against 454, deduplication, cancellation, and restoring the current chat if navigation is ever needed.

## Concrete resume sequence

1. Inspect current `manifest.json`, `popup.js`, `popup.html`, tests, and Git status. Preserve unrelated changes. Use the REA findings above as evidence for design, not source code to copy.
2. Probe the signed-in Brave WhatsApp tab to establish a reliable group/member data path and coverage. Keep probes local and avoid sending contact data to any service. If the internal interface is unavailable, report the exact limitation before designing around it.
3. Implement only the Groups flow in our extension. Export actual available rows with `saved_as`, `whatsapp_name`, and normalized `phone_number` (including displayed international country codes), without masking or a row limit. Keep name-only rows separate and blank in the phone column.
4. Run automated checks and a live Investor Circle test. Compare the displayed group count with collected rows and usable phone rows; inspect CSV headers and aggregate counts without exposing contact values. Reload the unpacked extension, update Graphify and these docs, then commit and push to the private remote.

The user invoked `$reverse-engineer-anything`. Its skill is `C:\Users\rajes\.codex\skills\reverse-engineer-anything\SKILL.md`. No REA MCP tools are connected, so use the documented CLI fallback with the now compatible Node runtime. The installed manifest requests WhatsApp host access, `storage`, `identity`, and `unlimitedStorage`; that does not establish whether contact data is transmitted.

## Verification before release

Run `node --check popup.js`, `node --test tests/popup.test.mjs`, and `graphify update . --no-cluster`. Reload the unpacked extension in `brave://extensions` after source edits. A live Investor Circle export with correctly bound members and a verified CSV is the release gate. Keep the popup open during current scans; closing it can interrupt the scan.
