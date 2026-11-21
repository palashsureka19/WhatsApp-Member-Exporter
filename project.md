# WhatsApp Member Exporter

Small, local-only Chrome extension that exports participant details rendered in an open WhatsApp Web group member list.

## Current version

- Manifest V3 with `activeTab` and `scripting` permissions.
- Scans only after **Scan members** is clicked on `https://web.whatsapp.com/`.
- Reads visible participant rows, scrolls a detected member panel, and deduplicates numbered entries by digits while retaining the displayed number.
- Shows observed entries, unique numbers, name-only entries, and a rendered member count when found.
- Creates CSV in the popup. No server, API calls, persistent storage, or dependencies.

## Install for local use

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode**.
3. Choose **Load unpacked** and select this folder.
4. Open WhatsApp Web, open a group, and open its member list.
5. Open the extension, choose **Scan members**, review the preview, then download CSV.

## Files

- `manifest.json`: extension permissions and popup entry point.
- `popup.html`: small popup UI.
- `popup.js`: scan, preview, and CSV generation.

## Roadmap

1. **First version (current):** scan rendered rows, show coverage, export `name,phone_number,status`.
2. **Manual validation:** verify saved and unsaved contact rendering; test small, scrolling, and name-only groups against current WhatsApp Web.
3. **Selector hardening:** adjust panel and row detection only from observed WhatsApp Web DOM behavior; surface uncertain or incomplete scans clearly.
4. **Coverage refinement:** compare unique observed rows with WhatsApp's displayed member count and report count mismatches.

## Known limits

WhatsApp Web changes its DOM. Panel and participant-row detection use generic rendered UI roles, so a UI change can prevent or limit scans. The extension cannot export numbers WhatsApp does not render. Without a readable member count, end-of-scroll is only an estimate. The popup and scan remain open until completion; closing the member list ends the scan with collected rows marked partial when available.
