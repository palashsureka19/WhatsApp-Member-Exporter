# WhatsApp Member Exporter

## Status: Groups workflow under repair

This private Manifest V3 extension uses `activeTab` and `scripting` to read rendered WhatsApp Web data, process it locally, preview results, and generate CSV. **Its live Groups scan is not ready for use.** Brave discovered groups and opened group info, but participant collection returned zero rows. Synthetic Node tests pass; they do not establish live compatibility. Current version 0.4.5 has a count-only diagnostic and conservative list selection so an unrelated group's members are not exported.

The user wants only the **Groups** experience: choose a group, start export, and receive the full available list without manually opening a group or scrolling a member panel. The installed purple extension demonstrated this interaction on Investor Circle (454 participants): it reported 453 contacts without visible WhatsApp navigation. Its free CSV had 453 rows, **443 masked as `***PRO***`**, leaving ten unmasked. Static investigation found that it uses an injected WhatsApp client bridge and a group participant API, rather than reading rendered rows. See `HANDOFF.md` for Evidence IDs, precise observations, and limits. Our extension does **not** yet match that result.

## Existing implementation

- A compact group picker discovers groups from the WhatsApp Web UI and offers a selected group or All Groups.
- The current scan opens group info, seeks rendered member rows, and attempts to scroll the participant list automatically. It reports scanned rows, unique phone numbers, name-only entries, and partial coverage.
- CSV fields are `group,saved_as,whatsapp_name,phone_number,status`. Explicit country codes are retained; displayed Indian local numbers normalize to `+91XXXXXXXXXX`. Number-bearing records deduplicate by normalized phone, while name-only rows stay separate.
- A separate visible Chats scan exists in source. The next release is scoped to Groups; do not expand Chats, Contacts, Labels, or Countries.
- Phone values come from member rows; a complete phone-number title is required for chat rows. CSV formula-like text is neutralized.

## Roadmap

1. **Data-source feasibility:** evaluate a maintainable, permitted way to access group data without opening its panel. The competitor's packaged page script calls an internal WhatsApp client bridge, but that does not establish a stable interface for us. Determine stable group IDs, member IDs, phone values, saved names, public names, and completeness. Keep collection local and initiated by Start Exporting.
2. **Groups flow:** replace the failing rendered-row scan only after feasibility is established. Provide a searchable multi-select picker with counts, All Groups, selected chips, Include Admin, progress, cancellation, and clear partial coverage. Do not mix groups with duplicate titles.
3. **Release gate:** test **Investor Circle**, comparing the count and exported rows with the 454-member display, then check number formatting, saved/public names, duplicate numbers, name-only entries, CSV encoding, and UI state after scanning. Do not promise 454 rows when some member data is unavailable.
4. **Maintenance:** isolate version-sensitive WhatsApp integration and report when WhatsApp Web changes, rather than silently exporting incomplete or misattributed data.

## Install for development

In Chrome or Brave, open `chrome://extensions` or `brave://extensions`, enable Developer mode, and choose **Load unpacked** on this folder. Reload the existing card after edits. Current Groups scanning is a development build; do not use its CSV as a complete roster.

## Checks

- `node --check popup.js`
- `node --test tests/popup.test.mjs`
- `graphify update . --no-cluster`
- Manual: small group, Investor Circle, a name-only case, interrupted scan, CSV download, and group identity check when two titles match.

## Privacy and limits

No contact CSV belongs in the repo. The current extension has no server or persistent contact storage. WhatsApp Web has no stable public extension API for group membership. Saved and public names, hidden phone numbers, and complete coverage depend on what the signed-in WhatsApp client actually exposes. A displayed member count is a coverage check, not proof that every record includes a phone number.
