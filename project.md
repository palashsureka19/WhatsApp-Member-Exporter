# WhatsApp Member Exporter

## Status: Groups workflow working in user test

This private Manifest V3 extension uses `activeTab` and `scripting` to read WhatsApp Web group data through the bundled Apache 2.0 WA-JS bridge and generate CSV locally. Version 0.5.0 was reported working by the user in Brave. Automated tests pass; exact Investor Circle coverage counts and CSV contents have not been independently checked in this session.

The Groups flow offers search, multi-selection, Select all, Include admins, cancellation, and unmasked CSV. It identifies groups by stable WhatsApp ID and leaves the current chat untouched. CSV filenames use `{Group Name}Contacts-YYYY-MM-DD.csv`; multiple selected groups use `Selected-GroupsContacts-YYYY-MM-DD.csv`.

## Implementation

- WA-JS 4.8.2 is bundled locally under its Apache 2.0 license. The extension asks its read-only group/contact APIs for available member data when the user starts an export. No contact data is sent to an exporter server or stored persistently.
- CSV fields are `group,saved_as,whatsapp_name,phone_number,status`. Phone IDs retain their international country codes; unresolved LID numbers receive blank phone cells and `phone_unavailable` status. Rows stay separate across groups. CSV formula-like text is neutralized.
- The current popup has Groups only. It displays roster, exported, phone, and unavailable counts per group.

## Historical release plan

The following plan led to version 0.5.0. Its manual release checks remain open where noted above.

1. **Prove the data path in Brave:** evaluate a maintainable, permitted way to access group data without opening its panel. The competitor's packaged page script calls an internal WhatsApp client bridge, but that does not establish a stable interface for us. Read Investor Circle by stable group ID and compare its 454-member display with returned member IDs, saved names, public names, and phone values. Check whether the signed-in user's own membership explains the observed 453-row result.
2. **Build our Groups flow:** replace the failing rendered-row scan after feasibility is established. Provide a searchable multi-select picker with counts, All Groups, selected chips, Include Admin, progress, cancellation, and clear partial coverage. Keep the current WhatsApp chat and member panels in place. Do not mix groups with duplicate titles.
3. **Export every available row:** generate CSV locally with `group,saved_as,whatsapp_name,phone_number,status`, without a free-tier cap or masking. Preserve international country codes. Use one row per group membership, including when a person appears in multiple selected groups. Keep name-only rows distinct with blank phone values and an explicit reason when WhatsApp supplies no number.
4. **Release gate:** run automated checks, then test **Investor Circle** in Brave. Compare roster, resolved-phone, and CSV row counts; check saved/public names, admins, duplicate names, missing phones, CSV encoding, cancellation, and UI state. Report unavailable member data rather than promising 454 phone numbers. Update Graphify and docs, then commit and push to the private remote.
5. **Maintenance:** isolate version-sensitive WhatsApp integration and report when WhatsApp Web changes, rather than silently exporting incomplete or misattributed data.

## Install for development

In Chrome or Brave, open `chrome://extensions` or `brave://extensions`, enable Developer mode, and choose **Load unpacked** on this folder. Reload the existing card after edits.

## Checks

- `node --check popup.js`
- `node --test tests/popup.test.mjs`
- `graphify update . --no-cluster`
- Manual: Investor Circle, a missing-phone case, interrupted scan, CSV download, and group identity check when two titles match. User reported the Groups export working; these specific counts and cases still need independent verification.

## Privacy and limits

No contact CSV belongs in the repo. The current extension has no server or persistent contact storage. WhatsApp Web has no stable public extension API for group membership. Saved and public names, hidden phone numbers, and complete coverage depend on what the signed-in WhatsApp client actually exposes. A displayed member count is a coverage check, not proof that every record includes a phone number.
