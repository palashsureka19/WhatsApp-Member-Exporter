const $ = selector => document.querySelector(selector);
const loadButton = $('#load');
const picker = $('#picker');
const groupsElement = $('#groups');
const search = $('#search');
const selectedElement = $('#selected');
const exportButton = $('#export');
const cancelButton = $('#cancel');
const status = $('#status');
const coverage = $('#coverage');
const downloadButton = $('#download');
let groups = [];
const selected = new Set();
let entries = [];
let running = false;
let cancelled = false;
let tabId;
let filenameGroup = '';

function exportFilename(groupName, date = new Date()) {
  const safeName = groupName.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/, '') || 'Group';
  const day = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
  return `${safeName}Contacts-${day}.csv`;
}

function cleanPhone(value) {
  const digits = String(value || '').split('@')[0].replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15 ? '+' + digits : '';
}

function csv(rows) {
  const cell = value => {
    const text = String(value ?? '');
    const safe = /^[\s]*[=+\-@]|^[\t\r\n]/.test(text) && !/^\+\d{7,15}$/.test(text) ? "'" + text : text;
    return '"' + safe.replaceAll('"', '""') + '"';
  };
  return '\ufeff' + [['group', 'saved_as', 'whatsapp_name', 'phone_number', 'status'],
    ...rows.map(row => [row.group, row.saved_as, row.whatsapp_name, row.phone_number, row.status])]
    .map(row => row.map(cell).join(',')).join('\r\n');
}

async function whatsappTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url?.startsWith('https://web.whatsapp.com/')) throw new Error('Open WhatsApp Web first.');
  return tab.id;
}

async function bridge(tab, operation, argument) {
  const [reply] = await chrome.scripting.executeScript({
    target: { tabId: tab }, world: 'MAIN', func: bridgeCommand, args: [operation, argument ?? null],
  });
  if (!reply?.result) throw new Error('WhatsApp did not return data.');
  if (reply.result.error) throw new Error(reply.result.error);
  return reply.result;
}

async function prepareBridge(tab) {
  const [probe] = await chrome.scripting.executeScript({
    target: { tabId: tab }, world: 'MAIN',
    func: () => ({ own: !!window.__waExporterOwnWPP, occupied: !!window.WPP }),
  });
  if (!probe.result.own) {
    if (probe.result.occupied) throw new Error('Another WPP integration is active. Disable it, reload WhatsApp Web, then retry.');
    await chrome.scripting.executeScript({ target: { tabId: tab }, world: 'MAIN', files: ['wppconnect-wa.js'] });
    await chrome.scripting.executeScript({ target: { tabId: tab }, world: 'MAIN', func: () => { window.__waExporterOwnWPP = true; } });
  }
  await bridge(tab, 'ready');
}

// Runs in WhatsApp's page context; only plain, requested data returns to this extension.
async function bridgeCommand(operation, argument) {
  const WPP = window.WPP;
  if (!WPP) return { error: 'WhatsApp bridge did not load.' };
  if (operation === 'cancel') { window.__waExporterCancel = true; return { ok: true }; }
  if (operation === 'ready') {
    for (let i = 0; i < 80 && !WPP.isReady; i++) await new Promise(resolve => setTimeout(resolve, 250));
    return WPP.isReady ? { ok: true } : { error: 'WhatsApp bridge did not become ready. Reload WhatsApp Web and retry.' };
  }
  if (!WPP.isReady) return { error: 'WhatsApp bridge is not ready.' };
  if (operation === 'groups') {
    const chats = await WPP.chat.list({ onlyGroups: true });
    return { groups: chats.filter(chat => chat.id?.server === 'g.us').map(chat => ({
      id: chat.id._serialized, name: chat.formattedTitle || chat.name || chat.id.user,
      count: chat.groupMetadata?.participants?.length ?? null,
    })) };
  }
  if (operation !== 'members') return { error: 'Unknown operation.' };
  window.__waExporterCancel = false;
  const participants = await WPP.group.getParticipants(argument.id);
  const rows = [];
  for (const participant of participants) {
    if (window.__waExporterCancel) break;
    if (!argument.includeAdmins && (participant.isAdmin || participant.isSuperAdmin)) continue;
    const id = participant.id;
    if (!id?._serialized) continue;
    let contact;
    try { contact = await WPP.contact.get(id); } catch {}
    let phone = id.server === 'c.us' ? id.user : '';
    let mapping;
    if (!phone && id.server === 'lid') {
      try { mapping = await WPP.contact.getPnLidEntry(id); phone = mapping?.phoneNumber?.id || ''; } catch {}
    }
    const digits = String(phone).split('@')[0].replace(/\D/g, '');
    rows.push({
      memberId: id._serialized,
      saved_as: String(contact?.name || contact?.shortName || mapping?.contact?.name || ''),
      whatsapp_name: String(contact?.pushname || mapping?.contact?.pushname || ''),
      phone_number: digits.length >= 7 && digits.length <= 15 ? '+' + digits : '',
      admin: !!(participant.isAdmin || participant.isSuperAdmin),
    });
  }
  return { rows, rosterCount: participants.length, cancelled: !!window.__waExporterCancel };
}

function renderGroups() {
  const query = search.value.trim().toLocaleLowerCase();
  groupsElement.replaceChildren();
  for (const group of groups.filter(group => group.name.toLocaleLowerCase().includes(query))) {
    const label = document.createElement('label');
    label.className = 'group';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = selected.has(group.id);
    checkbox.addEventListener('change', () => {
      checkbox.checked ? selected.add(group.id) : selected.delete(group.id);
      updateSelection();
    });
    const name = document.createElement('span');
    name.textContent = group.name + (group.count == null ? '' : ` (${group.count})`);
    label.append(checkbox, name);
    groupsElement.append(label);
  }
  updateSelection();
}

function updateSelection() {
  selectedElement.textContent = `${selected.size} of ${groups.length} groups selected`;
  exportButton.disabled = running || !selected.size;
}

loadButton.addEventListener('click', async () => {
  if (running) return;
  loadButton.disabled = true;
  status.textContent = 'Loading WhatsApp groups…';
  try {
    tabId = await whatsappTab();
    await prepareBridge(tabId);
    groups = (await bridge(tabId, 'groups')).groups;
    selected.clear();
    picker.hidden = false;
    renderGroups();
    status.textContent = `Loaded ${groups.length} groups. Select groups to export.`;
  } catch (error) { status.textContent = error.message; }
  finally { loadButton.disabled = false; }
});

search.addEventListener('input', renderGroups);
$('#all').addEventListener('click', () => { groups.forEach(group => selected.add(group.id)); renderGroups(); });
$('#none').addEventListener('click', () => { selected.clear(); renderGroups(); });
cancelButton.addEventListener('click', async () => {
  cancelled = true;
  cancelButton.disabled = true;
  if (tabId) try { await bridge(tabId, 'cancel'); } catch {}
});

exportButton.addEventListener('click', async () => {
  if (running || !selected.size) return;
  running = true;
  cancelled = false;
  entries = [];
  const chosen = groups.filter(group => selected.has(group.id));
  filenameGroup = chosen.length === 1 ? chosen[0].name : 'Selected-Groups';
  const coverageLines = [];
  const seen = new Set();
  loadButton.disabled = true;
  cancelButton.hidden = false;
  cancelButton.disabled = false;
  downloadButton.hidden = true;
  updateSelection();
  try {
    tabId = await whatsappTab();
    for (const [index, group] of chosen.entries()) {
      if (cancelled) break;
      status.textContent = `Reading ${index + 1} of ${chosen.length}: ${group.name}`;
      try {
        const result = await bridge(tabId, 'members', { id: group.id, includeAdmins: $('#admins').checked });
        for (const row of result.rows) {
          const key = group.id + '\0' + row.memberId;
          if (seen.has(key)) continue;
          seen.add(key);
          entries.push({
            group: group.name, saved_as: row.saved_as, whatsapp_name: row.whatsapp_name,
            phone_number: cleanPhone(row.phone_number),
            status: row.phone_number ? 'number_found' : 'phone_unavailable',
          });
        }
        const exported = result.rows.length;
        const phones = result.rows.filter(row => row.phone_number).length;
        coverageLines.push(`${group.name}: ${exported} rows, ${phones} phones, ${exported - phones} without phone; roster ${result.rosterCount}${result.cancelled ? ' (cancelled)' : ''}`);
        if (result.cancelled) cancelled = true;
      } catch (error) { coverageLines.push(`${group.name}: failed: ${error.message}`); }
    }
    const phones = entries.filter(row => row.phone_number).length;
    status.textContent = `${cancelled ? 'Cancelled. ' : ''}${entries.length} rows; ${phones} phones; ${entries.length - phones} without phone.`;
    coverage.textContent = coverageLines.join('\n');
    downloadButton.hidden = !entries.length;
  } finally {
    running = false;
    loadButton.disabled = false;
    cancelButton.hidden = true;
    updateSelection();
  }
});

downloadButton.addEventListener('click', () => {
  if (!entries.length) return;
  const url = URL.createObjectURL(new Blob([csv(entries)], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = exportFilename(filenameGroup);
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
