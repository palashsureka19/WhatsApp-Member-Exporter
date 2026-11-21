const contactsButton = document.querySelector('#scanContacts');
const loadGroupsButton = document.querySelector('#loadGroups');
const groupPicker = document.querySelector('#groupPicker');
const groupSelect = document.querySelector('#groupSelect');
const groupCount = document.querySelector('#groupCount');
const scanSelectedButton = document.querySelector('#scanSelected');
const status = document.querySelector('#status');
const preview = document.querySelector('#preview');
const download = document.querySelector('#download');
let result;
let availableGroups = [];
let groupContext;
let busy = false;
let stopRequested = false;
let scanTabId;
const stopButton = document.querySelector('#stopScan');
stopButton.addEventListener('click', async () => {
  stopRequested = true;
  stopButton.disabled = true;
  status.textContent = 'Stopping after the current rows; keeping collected results…';
  if (scanTabId) {
    try { await chrome.scripting.executeScript({ target: { tabId: scanTabId }, func: () => { window.__waExportStop = true; } }); } catch {}
  }
});

contactsButton.addEventListener('click', () => startScan(scanVisibleContacts, 'contacts'));
loadGroupsButton.addEventListener('click', loadGroups);
scanSelectedButton.addEventListener('click', scanSelectedGroups);
groupSelect.addEventListener('change', updateSelection);

function injectedResult(reply, message) {
  if (!reply?.result || typeof reply.result !== 'object') throw new Error(message);
  return reply.result;
}

async function startScan(scanner, exportType) {
  if (busy) return;
  busy = true;
  contactsButton.disabled = true;
  loadGroupsButton.disabled = true;
  scanSelectedButton.disabled = true;
  download.hidden = true;
  status.textContent = exportType === 'contacts' ? 'Reading visible chat contacts…' : 'Scanning rendered member rows…';
  preview.replaceChildren();
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url?.startsWith('https://web.whatsapp.com/')) throw new Error('Open WhatsApp Web first.');
    const [reply] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: scanner });
    result = injectedResult(reply, 'WhatsApp did not return scan data. Keep the group open and try again.');
    if (result.error) throw new Error(result.error);
    result.exportType = exportType;
    status.textContent = exportType === 'contacts' ? 'Visible chat rows scanned; the full contact list may be incomplete.' : result.complete ? 'Scan reached the apparent end.' : 'Partial scan. Review coverage before export.';
    const summary = document.createElement('div');
    summary.className = 'summary';
    for (const [value, label] of [[result.rowsObserved, exportType === 'contacts' ? 'Chat rows' : 'Rows'], [result.uniqueNumbers, 'Numbers'], [result.nameOnly, 'Name only']]) {
      const metric = document.createElement('div');
      metric.className = 'metric';
      const number = document.createElement('strong');
      number.textContent = value;
      const caption = document.createElement('span');
      caption.textContent = label;
      metric.append(number, caption);
      summary.append(metric);
    }
    preview.append(summary);
    const coverage = document.createElement('p');
    coverage.className = 'coverage';
    coverage.textContent = exportType === 'contacts' ? `Read ${result.rowsObserved} rendered chat rows without scrolling. Group chats may appear; contacts outside the rendered list are omitted.` : result.memberCount == null ? 'WhatsApp showed no readable member count; coverage is based on reaching the apparent scroll end.' : `Observed ${result.rowsObserved} of ${result.memberCount} displayed members.`;
    preview.append(coverage);
    preview.append(download);
    const list = document.createElement('div');
    list.id = 'rows';
    for (const entry of result.entries) {
      const line = document.createElement('div');
      line.className = 'row';
      line.textContent = `${[entry.saved_as, entry.whatsapp_name].filter(Boolean).join(' · ') || 'Name not shown'} — ${entry.phone_number || 'name only'}`;
      list.append(line);
    }
    preview.append(list);
    download.hidden = !result.entries.length;
  } catch (error) {
    status.textContent = error.message || 'Scan failed. Open the group member list and try again.';
  } finally {
    busy = false;
    contactsButton.disabled = false;
    loadGroupsButton.disabled = false;
    updateSelection();
  }
}

async function loadGroups() {
  if (busy) return;
  busy = true;
  loadGroupsButton.disabled = true;
  contactsButton.disabled = true;
  scanSelectedButton.disabled = true;
  groupPicker.hidden = false;
  groupCount.textContent = 'Loading…';
  groupSelect.replaceChildren(new Option('Loading groups…', ''));
  groupSelect.disabled = true;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url?.startsWith('https://web.whatsapp.com/')) throw new Error('Open WhatsApp Web first.');
    const [reply] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: readGroups });
    const data = injectedResult(reply, 'WhatsApp did not return its group list. Reload WhatsApp Web and try again.');
    if (data.error) throw new Error(data.error);
    availableGroups = data.groups || [];
    groupContext = data.context;
    groupSelect.replaceChildren(new Option('Choose a group…', ''));
    if (availableGroups.length) {
      groupSelect.add(new Option(`All groups (${availableGroups.length})`, 'all'));
      availableGroups.forEach((group, index) => groupSelect.add(new Option(group.name, String(index))));
    }
    groupSelect.disabled = availableGroups.length === 0;
    status.textContent = data.totalHint > availableGroups.length ? `Loaded ${availableGroups.length} of ${data.totalHint} groups.` : `Loaded ${availableGroups.length} groups.`;
  } catch (error) {
    groupCount.textContent = '';
    availableGroups = [];
    groupSelect.replaceChildren(new Option('Could not load groups', ''));
    status.textContent = error.message || 'Could not load WhatsApp groups.';
  } finally {
    busy = false;
    contactsButton.disabled = false;
    loadGroupsButton.disabled = false;
    updateSelection();
  }
}

function updateSelection() {
  const selected = groupSelect.value;
  scanSelectedButton.disabled = busy || !selected;
  scanSelectedButton.querySelector('strong').textContent = selected === 'all' ? `Scan all ${availableGroups.length} groups` : 'Scan selected group';
  if (availableGroups.length) groupCount.textContent = `${availableGroups.length} found`;
}

async function scanSelectedGroups() {
  if (busy || !groupSelect.value) return;
  const selected = groupSelect.value === 'all' ? availableGroups : [availableGroups[Number(groupSelect.value)]].filter(Boolean);
  if (!selected.length) return;
  busy = true;
  stopRequested = false;
  stopButton.hidden = false;
  stopButton.disabled = false;
  groupSelect.disabled = true;
  for (const button of [contactsButton, loadGroupsButton, scanSelectedButton]) button.disabled = true;
  status.textContent = `Scanning 0 of ${selected.length} groups…`;
  download.hidden = true;
  preview.replaceChildren();
  const scans = [];
  let activeGroup;
  let tab;
  let restored = false;
  try {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url?.startsWith('https://web.whatsapp.com/')) throw new Error('Open WhatsApp Web first.');
    scanTabId = tab.id;
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => { window.__waExportStop = false; } });
    for (const [index, group] of selected.entries()) {
      if (stopRequested) break;
      activeGroup = group;
      status.textContent = `Scanning ${index + 1} of ${selected.length}: ${group.name}`;
      const [opened] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: openGroupAndMemberList, args: [group] });
      const openedData = injectedResult(opened, `WhatsApp did not return a result while opening “${group.name}”.`);
      if (openedData.error) {
        scans.push({ group: group.name, error: openedData.error, entries: [], rowsObserved: 0, complete: false });
        continue;
      }
      const [reply] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: scanMembers, args: [group.name] });
      scans.push(injectedResult(reply, `WhatsApp did not return scan data for “${group.name}”.`));
    }
  } catch (error) {
    scans.push({ group: activeGroup?.name || 'Group scan', error: error.message || 'Group scan failed.', entries: [], rowsObserved: 0, complete: false });
  } finally {
    if (tab?.id && groupContext) {
      try {
        const [reply] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: restoreChat, args: [groupContext] });
        restored = reply?.result?.restored === true;
      } catch {}
    }
    for (const button of [contactsButton, loadGroupsButton]) button.disabled = false;
    busy = false;
    scanTabId = null;
    stopButton.hidden = true;
    groupSelect.disabled = !availableGroups.length;
    updateSelection();
  }
  if (!scans.length) {
    status.textContent = 'Stopped before collecting any members.';
    return;
  }
  result = mergeGroupResults(scans);
  result.complete = result.complete && !stopRequested && scans.length === selected.length;
  result.exportType = 'groups';
  result.groupCount = scans.filter(scan => !scan.error).length;
  result.failedGroups = scans.filter(scan => scan.error).map(scan => ({ group: scan.group, error: scan.error }));
  result.coverage = scans.filter(scan => !scan.error).map(scan => `${scan.group}: ${scan.rowsObserved} / ${scan.memberCount ?? 'unknown'} members; ${scan.complete ? 'apparent end reached' : 'partial'}`);
  const firstFailure = result.failedGroups[0];
  status.textContent = `${stopRequested ? 'Stopped. ' : ''}${result.groupCount} of ${selected.length} groups scanned${restored ? '; original chat restored' : groupContext?.chat ? '; original chat could not be restored' : '; no previous chat to restore'}${firstFailure ? `; ${firstFailure.group}: ${firstFailure.error}` : ''}.`;
  renderResult(result, 'groups');
}

function mergeGroupResults(scans) {
  const numbers = new Map();
  const nameOnly = [];
  for (const scan of scans) for (const entry of scan.entries || []) {
    if (!entry.phone_number) {
      nameOnly.push(entry);
      continue;
    }
    const key = entry.phone_number.replace(/\D/g, '');
    const existing = numbers.get(key);
    if (existing) {
      if (!existing.saved_as) existing.saved_as = entry.saved_as;
      if (!existing.whatsapp_name) existing.whatsapp_name = entry.whatsapp_name;
      if (!existing.groups.includes(entry.group)) existing.groups.push(entry.group);
    } else numbers.set(key, { ...entry, groups: [entry.group] });
  }
  const entries = [...numbers.values(), ...nameOnly];
  return { entries, rowsObserved: scans.reduce((sum, scan) => sum + (scan.rowsObserved || 0), 0), uniqueNumbers: numbers.size, nameOnly: nameOnly.length, complete: scans.every(scan => scan.complete && !scan.error) };
}

function renderResult(data, exportType) {
  const summary = document.createElement('div');
  summary.className = 'summary';
  for (const [value, label] of [[data.rowsObserved, exportType === 'contacts' ? 'Chat rows' : 'Rows'], [data.uniqueNumbers, 'Numbers'], [data.nameOnly, 'Name only']]) {
    const metric = document.createElement('div');
    metric.className = 'metric';
    const number = document.createElement('strong');
    number.textContent = value;
    const caption = document.createElement('span');
    caption.textContent = label;
    metric.append(number, caption);
    summary.append(metric);
  }
  preview.append(summary);
  const coverage = document.createElement('p');
  coverage.className = 'coverage';
  coverage.textContent = exportType === 'contacts' ? `Read ${data.rowsObserved} rendered chat rows without scrolling. Group chats may appear; off-screen contacts are omitted.` : exportType === 'groups' ? `${data.groupCount} of ${data.groupCount + (data.failedGroups?.length || 0)} groups scanned. Numbers deduplicated across groups.` : data.memberCount == null ? 'No readable member count; completion is based on reaching the apparent scroll end.' : `Observed ${data.rowsObserved} of ${data.memberCount} displayed members.`;
  preview.append(coverage);
  if (data.coverage?.length) {
    const details = document.createElement('details');
    const heading = document.createElement('summary');
    heading.textContent = data.complete ? 'Member coverage' : 'Partial results — review member coverage';
    details.append(heading);
    for (const text of data.coverage) {
      const line = document.createElement('p');
      line.className = 'coverage';
      line.textContent = text;
      details.append(line);
    }
    preview.append(details);
  }
  if (data.failedGroups?.length) {
    const failures = document.createElement('p');
    failures.className = 'coverage';
    failures.textContent = `Could not scan ${data.failedGroups.length} group(s): ${data.failedGroups.slice(0, 3).map(item => `${item.group}: ${item.error}`).join(' · ')}`;
    preview.append(failures);
  }
  preview.append(download);
  const list = document.createElement('div');
  list.id = 'rows';
  for (const entry of data.entries) {
    const line = document.createElement('div');
    line.className = 'row';
    const name = [entry.saved_as, entry.whatsapp_name].filter(Boolean).join(' · ') || 'Name not shown';
    const group = entry.groups?.join(', ') || entry.group;
    line.textContent = `${group ? `${group}: ` : ''}${name} — ${entry.phone_number || 'name only'}`;
    list.append(line);
  }
  preview.append(list);
  download.hidden = !data.entries.length;
}

function buildCsv(entries) {
  const quote = (value, protect = true) => {
    const text = String(value ?? '');
    return `"${(protect && /^(?:\s*[=+\-@]|[\t\r\n])/.test(text) ? `'${text}` : text).replaceAll('"', '""')}"`;
  };
  const rows = [['group', 'saved_as', 'whatsapp_name', 'phone_number', 'status'], ...entries.map(entry => [entry.groups?.join('; ') || entry.group || '', entry.saved_as, entry.whatsapp_name, entry.phone_number, entry.status])];
  return '\ufeff' + rows.map(row => row.map((value, index) => quote(value, index !== 3 || !/^\+\d{7,15}$/.test(String(value)))).join(',')).join('\r\n');
}

download.addEventListener('click', () => {
  if (!result?.entries?.length) return;
  const blob = new Blob([buildCsv(result.entries)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = result.exportType === 'contacts' ? 'whatsapp-visible-contacts.csv' : result.exportType === 'groups' ? 'whatsapp-selected-groups.csv' : 'whatsapp-group-members.csv';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

async function readGroups() {
  const visible = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width && r.height && s.display !== 'none' && s.visibility !== 'hidden'; };
  const label = el => (el.getAttribute('aria-label') || el.innerText || el.title || '').replace(/\s+/g, ' ').trim();
  const rowName = row => {
    const title = row.querySelector('[data-testid="cell-frame-title"]') || row.querySelector('span[title]');
    const preferred = (title?.getAttribute('title') || title?.innerText || '').split('\n')[0].trim();
    const noise = text => !text || /^\d+\s+unread messages?$/i.test(text) || /^(?:\d{1,2}:\d{2}|Yesterday|Today|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)$/i.test(text) || /^(?:pinned chat|muted chat|view status|new messages will disappear)/i.test(text);
    if (preferred && !noise(preferred)) return preferred;
    return (row.innerText || '').split(/\r?\n/).map(line => line.trim()).find(line => !noise(line)) || '';
  };
  const selected = el => el.getAttribute('aria-pressed') === 'true' || el.getAttribute('aria-selected') === 'true' || el.getAttribute('aria-checked') === 'true' || el.classList.contains('selected');
  let buttons = [...document.querySelectorAll('button,[role="button"]')].filter(visible);
  const activeFilter = buttons.find(el => /^(All|Unread|Favourites|Favorites|Groups)(?:\s+\d+)?$/i.test(label(el)) && selected(el));
  let groupFilter = buttons.find(el => /^Groups(?:\s+\d+)?$/i.test(label(el)));
  if (!groupFilter) {
    buttons.find(el => /^More lists$/i.test(label(el)))?.click();
    await new Promise(resolve => setTimeout(resolve, 200));
    buttons = [...document.querySelectorAll('button,[role="button"],[role="menuitem"],[role="menuitemradio"],[role="menuitemcheckbox"]')].filter(visible);
    groupFilter = buttons.find(el => /^Groups(?:\s+\d+)?$/i.test(label(el)));
  }
  if (!groupFilter) return { error: 'Could not find WhatsApp’s Groups filter.' };
  const header = document.querySelector('#main header');
  const info = [...(header?.querySelectorAll('button,[role="button"]') || [])].find(el => /^(Group info|Contact info)/i.test(el.getAttribute('aria-label') || el.title || el.innerText || ''));
  const infoLabel = info?.getAttribute('aria-label') || info?.title || info?.innerText || '';
  const chat = infoLabel.replace(/^(Group info|Contact info)\s*/i, '').trim() || header?.querySelector('[title]')?.getAttribute('title') || header?.innerText?.split('\n')[0]?.trim() || '';
  const context = { filter: activeFilter ? label(activeFilter).replace(/\s+\d+$/, '') : 'All', chat, scrollTop: 0 };
  const originalPane = document.querySelector('#pane-side,[role="grid"][aria-label*="Chat list"]');
  if (!originalPane) return { error: 'Could not find the WhatsApp chat list.' };
  const originalHosts = [originalPane, ...originalPane.querySelectorAll('*')].filter(el => el.scrollHeight > el.clientHeight + 20 && /auto|scroll/.test(getComputedStyle(el).overflowY));
  const originalHost = originalHosts.sort((a, b) => b.clientHeight - a.clientHeight)[0] || originalPane;
  context.scrollTop = originalHost.scrollTop;
  // The filter badge counts unread chats, not all groups.
  const totalHint = null;
  if (!selected(groupFilter)) groupFilter.click();
  await new Promise(resolve => setTimeout(resolve, 350));
  if (![...document.querySelectorAll('button,[role="button"]')].some(el => /^Groups(?:\s+\d+)?$/i.test(label(el)) && selected(el))) return { error: 'WhatsApp did not activate the Groups filter.' };
  const pane = document.querySelector('#pane-side,[role="grid"][aria-label*="Chat list"]');
  if (!pane) return { error: 'Could not find the WhatsApp group list after selecting Groups.' };
  const hosts = [pane, ...pane.querySelectorAll('*')].filter(el => el.scrollHeight > el.clientHeight + 20 && /auto|scroll/.test(getComputedStyle(el).overflowY));
  const host = hosts.sort((a, b) => b.clientHeight - a.clientHeight)[0] || pane;
  const groups = [];
  const known = new Set();
  host.scrollTop = 0;
  await new Promise(resolve => setTimeout(resolve, 180));
  const collect = () => {
    let rows = [...pane.querySelectorAll('[data-testid="cell-frame-container"]')];
    if (!rows.length) rows = [...pane.querySelectorAll('[role="row"]')];
    for (const row of rows.filter(visible)) {
      const name = rowName(row);
      if (name && !known.has(name)) { known.add(name); groups.push({ name }); }
    }
  };
  for (let step = 0; step < 100; step++) {
    const before = groups.length;
    collect();
    const top = host.scrollTop;
    host.scrollTop = Math.min(top + Math.max(120, host.clientHeight * 0.75), host.scrollHeight);
    await new Promise(resolve => setTimeout(resolve, 150));
    if (host.scrollTop === top && groups.length === before) break;
  }
  const restoreFilter = [...document.querySelectorAll('button,[role="button"]')].find(el => label(el).toLowerCase().replace(/\s+\d+$/, '') === context.filter.toLowerCase());
  if (restoreFilter && restoreFilter !== groupFilter) restoreFilter.click();
  await new Promise(resolve => setTimeout(resolve, 180));
  const restoredPane = document.querySelector('#pane-side,[role="grid"][aria-label*="Chat list"]');
  const restoredHosts = restoredPane ? [restoredPane, ...restoredPane.querySelectorAll('*')].filter(el => el.scrollHeight > el.clientHeight + 20 && /auto|scroll/.test(getComputedStyle(el).overflowY)) : [];
  const restoredHost = restoredHosts.sort((a, b) => b.clientHeight - a.clientHeight)[0] || restoredPane;
  if (restoredHost) restoredHost.scrollTop = context.scrollTop;
  return { groups, totalHint, context };
}

async function openGroupAndMemberList(group) {
  const waitFor = async predicate => {
    for (let attempt = 0; attempt < 40; attempt++) {
      if (window.__waExportStop) return null;
      const value = predicate();
      if (value) return value;
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    return null;
  };
  const activate = element => {
    element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
    element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
    element.click();
  };
  const visible = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width && r.height && s.display !== 'none' && s.visibility !== 'hidden'; };
  const label = el => (el.getAttribute('aria-label') || el.innerText || el.title || '').replace(/\s+/g, ' ').trim();
  const rowName = row => {
    const title = row.querySelector('[data-testid="cell-frame-title"]') || row.querySelector('span[title]');
    const preferred = (title?.getAttribute('title') || title?.innerText || '').split('\n')[0].trim();
    const noise = text => !text || /^\d+\s+unread messages?$/i.test(text) || /^(?:\d{1,2}:\d{2}|Yesterday|Today|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)$/i.test(text) || /^(?:pinned chat|muted chat|view status|new messages will disappear)/i.test(text);
    if (preferred && !noise(preferred)) return preferred;
    return (row.innerText || '').split(/\r?\n/).map(line => line.trim()).find(line => !noise(line)) || '';
  };
  const selected = el => el.getAttribute('aria-pressed') === 'true' || el.getAttribute('aria-selected') === 'true' || el.getAttribute('aria-checked') === 'true' || el.classList.contains('selected');
  let groups = [...document.querySelectorAll('button,[role="button"]')].find(el => /^Groups(?:\s+\d+)?$/i.test(label(el)));
  if (!groups) {
    [...document.querySelectorAll('button,[role="button"]')].find(el => /^More lists$/i.test(label(el)))?.click();
    await new Promise(resolve => setTimeout(resolve, 200));
    groups = [...document.querySelectorAll('button,[role="button"],[role="menuitem"],[role="menuitemradio"],[role="menuitemcheckbox"]')].find(el => visible(el) && /^Groups(?:\s+\d+)?$/i.test(label(el)));
  }
  if (!groups) return { error: 'Could not find WhatsApp’s Groups filter.' };
  if (!selected(groups)) groups.click();
  await new Promise(resolve => setTimeout(resolve, 350));
  if (![...document.querySelectorAll('button,[role="button"]')].some(el => /^Groups(?:\s+\d+)?$/i.test(label(el)) && selected(el))) return { error: 'WhatsApp did not activate the Groups filter.' };
  const pane = document.querySelector('#pane-side,[role="grid"][aria-label*="Chat list"]');
  const hosts = pane ? [pane, ...pane.querySelectorAll('*')].filter(el => el.scrollHeight > el.clientHeight + 20 && /auto|scroll/.test(getComputedStyle(el).overflowY)) : [];
  const host = hosts.sort((a, b) => b.clientHeight - a.clientHeight)[0] || pane;
  if (!pane || !host) return { error: 'Could not find the WhatsApp group list.' };
  host.scrollTop = 0;
  await new Promise(resolve => setTimeout(resolve, 180));
  let selectedRow;
  for (let step = 0; step < 100 && !selectedRow; step++) {
    if (window.__waExportStop) return { error: 'Scan stopped.' };
    const rows = [...pane.querySelectorAll('[data-testid="cell-frame-container"],[role="row"]')].filter(visible);
    selectedRow = rows.find(row => rowName(row) === group.name);
    if (selectedRow) break;
    const top = host.scrollTop;
    host.scrollTop = Math.min(top + Math.max(120, host.clientHeight * 0.75), host.scrollHeight);
    await new Promise(resolve => setTimeout(resolve, 150));
    if (host.scrollTop === top) break;
  }
  if (!selectedRow) return { error: `Could not locate group “${group.name}” in the chat list.` };
  activate(selectedRow.querySelector('[tabindex="0"], [role="gridcell"]') || selectedRow.querySelector('span[title]') || selectedRow);
  const infoButton = await waitFor(() => [...document.querySelectorAll('#main header button,#main header [role="button"]')].find(el => visible(el) && /Group info/i.test(label(el)) && (label(el).replace(/^Group info\s*/i, '') === group.name || document.querySelector('#main header')?.innerText.split('\n').some(line => line.trim() === group.name))));
  if (!infoButton) return { error: `Could not open the chat for “${group.name}”.` };
  activate(infoButton);
  const controls = () => [...document.querySelectorAll('button,[role="button"]')].filter(el => visible(el) && !el.closest('#pane-side') && !el.closest('#main'));
  const count = await waitFor(() => controls().find(el => /^\d[\d,]* members?$/i.test(label(el))));
  if (!count) return { error: `Group info did not open for “${group.name}”.` };
  const memberCount = Number(label(count).replace(/\D/g, ''));
  activate(count);
  await new Promise(resolve => setTimeout(resolve, 300));
  const viewAll = controls().find(el => /^View all\b/i.test(label(el)));
  if (viewAll) activate(viewAll);
  const list = await waitFor(() => [...document.querySelectorAll('[role="list"]')].find(el => visible(el) && !el.closest('#pane-side') && !el.closest('#main') && el.querySelector('[role="listitem"]')));
  if (!list) return { error: `Could not find member rows for “${group.name}”.` };
  for (const previous of document.querySelectorAll('[data-wa-export-members]')) previous.removeAttribute('data-wa-export-members');
  list.setAttribute('data-wa-export-members', 'true');
  list.setAttribute('data-wa-export-count', String(memberCount));
  return { ok: true };
}

async function restoreChat(context) {
  const visible = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width && r.height && s.display !== 'none' && s.visibility !== 'hidden'; };
  const label = el => (el.getAttribute('aria-label') || el.innerText || el.title || '').replace(/\s+/g, ' ').trim();
  if (context.filter) {
    const filter = [...document.querySelectorAll('button,[role="button"]')].find(el => label(el).toLowerCase().startsWith(context.filter.toLowerCase()));
    if (filter && filter.getAttribute('aria-pressed') !== 'true') filter.click();
  }
  await new Promise(resolve => setTimeout(resolve, 220));
  const pane = document.querySelector('#pane-side,[role="grid"][aria-label*="Chat list"]');
  if (!pane) return { restored: false };
  const hosts = [pane, ...pane.querySelectorAll('*')].filter(el => el.scrollHeight > el.clientHeight + 20 && /auto|scroll/.test(getComputedStyle(el).overflowY));
  const host = hosts.sort((a, b) => b.clientHeight - a.clientHeight)[0] || pane;
  host.scrollTop = context.scrollTop || 0;
  await new Promise(resolve => setTimeout(resolve, 180));
  if (!context.chat) return { restored: false };
  const rows = [...pane.querySelectorAll('[data-testid="cell-frame-container"],[role="row"]')].filter(visible);
  const row = rows.find(el => {
    const title = el.querySelector('[data-testid="cell-frame-title"]') || el.querySelector('span[title]');
    return (title?.getAttribute('title') || title?.innerText || el.innerText || '').split('\n')[0].trim() === context.chat;
  });
  if (!row) return { restored: false };
  const target = row.querySelector('[tabindex="0"], [role="gridcell"]') || row.querySelector('span[title]') || row;
  target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
  target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
  target.click();
  for (let attempt = 0; attempt < 30; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 150));
    if (document.querySelector('#main header')?.innerText.split('\n').some(line => line.trim() === context.chat)) return { restored: true };
  }
  return { restored: false };
}

async function scanMembers(groupName = '') {
  const header = document.querySelector('#main header');
  const activeGroup = groupName || header?.querySelector('[title]')?.getAttribute('title') || header?.innerText?.split('\n')[0]?.trim() || '';
  const visible = element => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
  };
  const list = document.querySelector('[data-wa-export-members="true"]');
  if (!list) return { error: 'Could not find a rendered member list. Open group info and choose View all first.' };
  const panels = [];
  for (let parent = list.parentElement; parent && parent !== document.body; parent = parent.parentElement) panels.push(parent);
  const candidates = [list, ...panels].filter(el => {
    const style = getComputedStyle(el);
    return visible(el) && el.querySelector('[role="listitem"]') && el.scrollHeight > el.clientHeight + 20 && /auto|scroll/.test(style.overflowY);
  });
  const panel = candidates.sort((a, b) => a.clientHeight - b.clientHeight)[0] || list;
  const memberCount = (() => {
    const explicit = Number(list.getAttribute('data-wa-export-count'));
    if (explicit > 0) return explicit;
    const text = panels.slice(0, 2).map(el => el.innerText || '').join(' ').slice(0, 800);
    const match = text.match(/(\d{1,4})\s*members?/i) || text.match(/(?:participants|members)\s*\(?\s*(\d{1,4})\s*\)?/i);
    return match ? Number(match[1]) : null;
  })();
  const numbers = new Map();
  const nameless = new Map();
  const observedRows = new Set();
  let stagnant = 0;
  let previousTop = -1;
  const numberPattern = /\+\s*\d[\d\s().-]{5,}\d|\b\d{7,15}\b/g;
  const readRows = () => {
    if (!list.isConnected || !visible(list)) return 0;
    const listRect = list.getBoundingClientRect();
    const rows = [...list.querySelectorAll('[role="listitem"]')].filter(row => {
      if (!visible(row)) return false;
      const rect = row.getBoundingClientRect();
      return rect.bottom > listRect.top && rect.top < listRect.bottom;
    });
    for (const row of rows) {
      const raw = (row.innerText || '').trim();
      if (!raw || raw.length > 220) continue;
      const rect = row.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      const position = Math.round(panel.scrollTop + rect.top - panelRect.top);
      observedRows.add(`${position}\u0000${raw}`);
      const found = raw.split(/\r?\n/).map(line => line.trim()).find(line => /^\+?\s*\d[\d ().-]{5,}\d$/.test(line)) || '';
      const digits = found.replace(/\D/g, '');
      const phone = found.startsWith('+') && digits.length >= 7 && digits.length <= 15 ? `+${digits}` : digits.length === 10 ? `+91${digits}` : digits.length === 11 && digits.startsWith('0') ? `+91${digits.slice(1)}` : digits.length === 12 && digits.startsWith('91') ? `+${digits}` : '';
      const names = raw.split(/\r?\n/).map(line => line.replace(numberPattern, '').trim()).filter(line => line && !/^(group admin|admin|available|add member tag)$/i.test(line));
      const whatsappLine = names.find(line => /^~\s*/.test(line));
      const firstLine = raw.split(/\r?\n/)[0].trim();
      const savedLine = names.includes(firstLine) && !/^~\s*/.test(firstLine) ? firstLine : '';
      const saved_as = savedLine || '';
      const whatsapp_name = whatsappLine ? whatsappLine.replace(/^~\s*/, '') : '';
      const entry = { group: activeGroup, saved_as, whatsapp_name, name: saved_as || whatsapp_name || '', phone_number: phone, status: phone ? 'number_found' : 'name_only' };
      if (phone) {
        const key = phone.replace(/\D/g, '');
        if (!numbers.has(key)) numbers.set(key, entry);
      } else {
        nameless.set(`${position}\u0000${raw}`, entry);
      }
    }
    return rows.length;
  };
  panel.scrollTop = 0;
  await new Promise(resolve => setTimeout(resolve, 180));
  for (let step = 0; step < 500; step++) {
    if (window.__waExportStop || !panel.isConnected || !visible(panel)) break;
    const before = numbers.size + nameless.size;
    readRows();
    panel.scrollTop = Math.min(panel.scrollTop + Math.max(1, panel.clientHeight * 0.7), panel.scrollHeight);
    await new Promise(resolve => setTimeout(resolve, 180));
    readRows();
    const moved = panel.scrollTop !== previousTop;
    const grew = numbers.size + nameless.size > before;
    stagnant = moved || grew ? 0 : stagnant + 1;
    previousTop = panel.scrollTop;
    if (!panel.isConnected || !visible(panel)) break;
    if (panel.scrollTop + panel.clientHeight >= panel.scrollHeight - 4 && stagnant >= 2) break;
  }
  readRows();
  const entries = [...numbers.values(), ...nameless.values()];
  const complete = !window.__waExportStop && panel.isConnected && visible(panel) && panel.scrollTop + panel.clientHeight >= panel.scrollHeight - 4 && (memberCount == null || observedRows.size === memberCount);
  list.removeAttribute('data-wa-export-members');
  list.removeAttribute('data-wa-export-count');
  const close = panels.flatMap(root => [...root.querySelectorAll('button,[role="button"]')]).find(button => visible(button) && !button.closest('#pane-side') && /^(close|back)$/i.test(button.getAttribute('aria-label') || button.title || ''));
  close?.click();
  return { entries, rowsObserved: observedRows.size, uniqueNumbers: numbers.size, nameOnly: nameless.size, memberCount, group: activeGroup, complete };
}

function scanVisibleContacts() {
  const visible = element => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
  };
  const list = document.querySelector('#pane-side, [data-testid="chat-list"], [role="grid"][aria-label*="Chat list"]');
  if (!list || !visible(list)) return { error: 'Could not find the visible WhatsApp chat list.' };
  const rows = [...list.querySelectorAll('[data-testid="cell-frame-container"], [role="row"], [role="listitem"]')].filter(visible);
  if (!rows.length) return { error: 'No rendered chat rows found. Open the Chats list and try again.' };
  const numberPattern = /\+\s*\d[\d\s().-]{5,}\d|\b\d{7,15}\b/g;
  const numbers = new Map();
  const nameOnly = new Map();
  const viewport = list.getBoundingClientRect();
  let rowsObserved = 0;
  for (const row of rows) {
    const rect = row.getBoundingClientRect();
    if (rect.bottom <= viewport.top || rect.top >= viewport.bottom) continue;
    rowsObserved++;
    const title = row.querySelector('[data-testid="cell-frame-title"]') || row.querySelector('span[title]');
    const displayName = (title?.getAttribute('title') || title?.innerText || row.getAttribute('aria-label') || row.innerText || '').split('\n')[0].trim();
    // Chat previews contain other people's numbers; only the title identifies this chat.
    const text = displayName;
    if (!displayName) continue;
    const found = /^\+?\s*\d[\d ().-]{5,}\d$/.test(text) ? text : '';
    const digits = found.replace(/\D/g, '');
    const phone = found.startsWith('+') && digits.length >= 7 && digits.length <= 15 ? `+${digits}` : digits.length === 10 ? `+91${digits}` : digits.length === 11 && digits.startsWith('0') ? `+91${digits.slice(1)}` : digits.length === 12 && digits.startsWith('91') ? `+${digits}` : '';
    const whatsapp_name = /^~\s*/.test(displayName) ? displayName.replace(/^~\s*/, '') : '';
    const saved_as = whatsapp_name || phone ? '' : displayName;
    const entry = { group: '', saved_as, whatsapp_name, name: saved_as || whatsapp_name || '', phone_number: phone, status: phone ? 'number_found' : 'name_only' };
    if (phone) {
      const key = phone.replace(/\D/g, '');
      if (!numbers.has(key)) numbers.set(key, entry);
    } else {
      const position = Math.round(list.scrollTop + rect.top - viewport.top);
      nameOnly.set(`${position}\u0000${displayName}`, entry);
    }
  }
  const entries = [...numbers.values(), ...nameOnly.values()];
  return { entries, rowsObserved, uniqueNumbers: numbers.size, nameOnly: nameOnly.size };
}
