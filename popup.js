const scanButton = document.querySelector('#scan');
const contactsButton = document.querySelector('#scanContacts');
const loadGroupsButton = document.querySelector('#loadGroups');
const groupPicker = document.querySelector('#groupPicker');
const groupList = document.querySelector('#groupList');
const groupCount = document.querySelector('#groupCount');
const scanSelectedButton = document.querySelector('#scanSelected');
const status = document.querySelector('#status');
const preview = document.querySelector('#preview');
const download = document.querySelector('#download');
let result;
let availableGroups = [];
let groupContext;

scanButton.addEventListener('click', () => startScan(scanMembers, 'group'));
contactsButton.addEventListener('click', () => startScan(scanVisibleContacts, 'contacts'));
loadGroupsButton.addEventListener('click', loadGroups);
scanSelectedButton.addEventListener('click', scanSelectedGroups);
groupList.addEventListener('change', updateSelection);

async function startScan(scanner, exportType) {
  scanButton.disabled = true;
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
    result = reply.result;
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
    scanButton.disabled = false;
    contactsButton.disabled = false;
    loadGroupsButton.disabled = false;
    updateSelection();
  }
}

async function loadGroups() {
  loadGroupsButton.disabled = true;
  groupPicker.hidden = false;
  groupCount.textContent = 'Loading…';
  groupList.replaceChildren();
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url?.startsWith('https://web.whatsapp.com/')) throw new Error('Open WhatsApp Web first.');
    const [reply] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: readGroups });
    if (reply.result.error) throw new Error(reply.result.error);
    availableGroups = reply.result.groups;
    groupContext = reply.result.context;
    for (const [index, group] of availableGroups.entries()) {
      const label = document.createElement('label');
      label.className = 'group-option';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = index;
      const name = document.createElement('span');
      name.textContent = group.name;
      label.append(checkbox, name);
      groupList.append(label);
    }
    status.textContent = reply.result.totalHint > availableGroups.length ? `Loaded ${availableGroups.length} of ${reply.result.totalHint} groups.` : 'Choose groups to scan.';
  } catch (error) {
    groupCount.textContent = '';
    status.textContent = error.message || 'Could not load WhatsApp groups.';
  } finally {
    loadGroupsButton.disabled = false;
    updateSelection();
  }
}

function updateSelection() {
  const selected = groupList.querySelectorAll('input:checked').length;
  scanSelectedButton.disabled = selected === 0;
  if (availableGroups.length) groupCount.textContent = `${selected} selected · ${availableGroups.length} found`;
}

async function scanSelectedGroups() {
  const selected = [...groupList.querySelectorAll('input:checked')].map(input => availableGroups[Number(input.value)]);
  if (!selected.length) return;
  for (const button of [scanButton, contactsButton, loadGroupsButton, scanSelectedButton]) button.disabled = true;
  status.textContent = `Scanning 0 of ${selected.length} groups…`;
  download.hidden = true;
  preview.replaceChildren();
  const scans = [];
  let tab;
  let restored = false;
  try {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url?.startsWith('https://web.whatsapp.com/')) throw new Error('Open WhatsApp Web first.');
    for (const [index, group] of selected.entries()) {
      status.textContent = `Scanning ${index + 1} of ${selected.length}: ${group.name}`;
      const [opened] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: openGroupAndMemberList, args: [group] });
      if (opened.result.error) {
        scans.push({ group: group.name, error: opened.result.error, entries: [], rowsObserved: 0, complete: false });
        continue;
      }
      const [reply] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: scanMembers, args: [group.name] });
      scans.push(reply.result);
    }
  } catch (error) {
    status.textContent = error.message || 'Group scan failed.';
  } finally {
    if (tab?.id && groupContext) {
      try {
        const [reply] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: restoreChat, args: [groupContext] });
        restored = reply.result.restored;
      } catch {}
    }
    for (const button of [scanButton, contactsButton, loadGroupsButton]) button.disabled = false;
    updateSelection();
  }
  if (!scans.length) return;
  result = mergeGroupResults(scans);
  result.exportType = 'groups';
  result.groupCount = scans.filter(scan => !scan.error).length;
  result.failedGroups = scans.filter(scan => scan.error).map(scan => scan.group);
  status.textContent = `${result.groupCount} of ${selected.length} groups scanned${restored ? '; original chat restored' : '; chat restoration uncertain'}.`;
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
  coverage.textContent = exportType === 'contacts' ? `Read ${data.rowsObserved} rendered chat rows without scrolling. Group chats may appear; off-screen contacts are omitted.` : exportType === 'groups' ? `${data.groupCount} groups scanned. Numbers deduplicated across groups.` : data.memberCount == null ? 'No readable member count; completion is based on reaching the apparent scroll end.' : `Observed ${data.rowsObserved} of ${data.memberCount} displayed members.`;
  preview.append(coverage);
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

download.addEventListener('click', () => {
  if (!result?.entries?.length) return;
  const quote = (value, protect = true) => {
    const text = String(value ?? '');
    return `"${(protect && /^[=+\-@\t\r]/.test(text) ? `'${text}` : text).replaceAll('"', '""')}"`;
  };
  const rows = [['group', 'saved_as', 'whatsapp_name', 'phone_number', 'status'], ...result.entries.map(entry => [entry.groups?.join('; ') || entry.group || '', entry.saved_as, entry.whatsapp_name, entry.phone_number, entry.status])];
  const blob = new Blob(['\ufeff' + rows.map(row => row.map((value, index) => quote(value, index !== 3)).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
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
  const buttons = [...document.querySelectorAll('button,[role="button"]')].filter(visible);
  const groupFilter = buttons.find(el => /^Groups(?:\s+\d+)?$/i.test(label(el)));
  if (!groupFilter) return { error: 'Could not find WhatsApp’s Groups filter.' };
  const activeFilter = buttons.find(el => el.getAttribute('aria-pressed') === 'true' || el.getAttribute('aria-selected') === 'true' || el.classList.contains('selected'));
  const context = { filter: activeFilter ? label(activeFilter) : 'All', chat: currentChatName(), scrollTop: 0 };
  const pane = document.querySelector('#pane-side,[role="grid"][aria-label*="Chat list"]');
  if (!pane) return { error: 'Could not find the WhatsApp chat list.' };
  const hosts = [pane, ...pane.querySelectorAll('*')].filter(el => el.scrollHeight > el.clientHeight + 20 && /auto|scroll/.test(getComputedStyle(el).overflowY));
  const host = hosts.sort((a, b) => b.clientHeight - a.clientHeight)[0] || pane;
  context.scrollTop = host.scrollTop;
  const totalHint = Number(label(groupFilter).match(/\d+/)?.[0]) || null;
  if (groupFilter.getAttribute('aria-pressed') !== 'true' && groupFilter.getAttribute('aria-selected') !== 'true') groupFilter.click();
  await new Promise(resolve => setTimeout(resolve, 250));
  const groups = [];
  const known = new Set();
  const collect = () => {
    let rows = [...pane.querySelectorAll('[data-testid="cell-frame-container"]')];
    if (!rows.length) rows = [...pane.querySelectorAll('[role="row"]')];
    for (const row of rows.filter(visible)) {
      const title = row.querySelector('[data-testid="cell-frame-title"]') || row.querySelector('span[title]');
      const name = (title?.getAttribute('title') || title?.innerText || row.innerText || '').split('\n')[0].trim();
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
  const restoreFilter = buttons.find(el => label(el).toLowerCase().startsWith(context.filter.toLowerCase()));
  if (restoreFilter && restoreFilter !== groupFilter) restoreFilter.click();
  await new Promise(resolve => setTimeout(resolve, 180));
  host.scrollTop = context.scrollTop;
  return { groups, totalHint, context };
}

function currentChatName() {
  const header = document.querySelector('#main header');
  const info = [...(header?.querySelectorAll('button') || [])].find(el => /^(Group info|Contact info)/i.test(el.getAttribute('aria-label') || el.title || el.innerText || ''));
  const label = info?.getAttribute('aria-label') || info?.title || info?.innerText || '';
  return label.replace(/^(Group info|Contact info)\s*/i, '').trim() || header?.querySelector('[title]')?.getAttribute('title') || header?.innerText?.split('\n')[0]?.trim() || '';
}

async function openGroupAndMemberList(group) {
  const visible = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width && r.height && s.display !== 'none' && s.visibility !== 'hidden'; };
  const label = el => (el.getAttribute('aria-label') || el.innerText || el.title || '').replace(/\s+/g, ' ').trim();
  const groups = [...document.querySelectorAll('button,[role="button"]')].find(el => /^Groups(?:\s+\d+)?$/i.test(label(el)));
  if (!groups) return { error: 'Could not find WhatsApp’s Groups filter.' };
  if (groups.getAttribute('aria-pressed') !== 'true' && groups.getAttribute('aria-selected') !== 'true') groups.click();
  await new Promise(resolve => setTimeout(resolve, 200));
  const pane = document.querySelector('#pane-side,[role="grid"][aria-label*="Chat list"]');
  const hosts = pane ? [pane, ...pane.querySelectorAll('*')].filter(el => el.scrollHeight > el.clientHeight + 20 && /auto|scroll/.test(getComputedStyle(el).overflowY)) : [];
  const host = hosts.sort((a, b) => b.clientHeight - a.clientHeight)[0] || pane;
  if (!pane || !host) return { error: 'Could not find the WhatsApp group list.' };
  let selectedRow;
  for (let step = 0; step < 100 && !selectedRow; step++) {
    const rows = [...pane.querySelectorAll('[data-testid="cell-frame-container"],[role="row"]')].filter(visible);
    selectedRow = rows.find(row => {
      const title = row.querySelector('[data-testid="cell-frame-title"]') || row.querySelector('span[title]');
      return (title?.getAttribute('title') || title?.innerText || row.innerText || '').split('\n')[0].trim() === group.name;
    });
    if (selectedRow) break;
    const top = host.scrollTop;
    host.scrollTop = Math.min(top + Math.max(120, host.clientHeight * 0.75), host.scrollHeight);
    await new Promise(resolve => setTimeout(resolve, 150));
    if (host.scrollTop === top) break;
  }
  if (!selectedRow) return { error: `Could not locate group “${group.name}” in the chat list.` };
  selectedRow.click();
  await new Promise(resolve => setTimeout(resolve, 450));
  let info = [...document.querySelectorAll('[role="complementary"],aside')].find(el => visible(el) && /Group info/i.test(el.innerText || ''));
  if (!info) {
    const header = document.querySelector('#main header');
    const button = [...(header?.querySelectorAll('button') || [])].find(el => /Group info/i.test(label(el)));
    if (!button) return { error: `Could not open group info for “${group.name}”.` };
    button.click();
    await new Promise(resolve => setTimeout(resolve, 300));
    info = [...document.querySelectorAll('[role="complementary"],aside')].find(el => visible(el) && /Group info/i.test(el.innerText || ''));
  }
  if (!info) return { error: `Group info did not open for “${group.name}”.` };
  let viewAll = [...info.querySelectorAll('button,[role="button"]')].find(el => /^View all\b/i.test(label(el)));
  if (!viewAll) {
    const count = [...info.querySelectorAll('button,[role="button"]')].find(el => /^\d[\d,]* members?$/i.test(label(el)));
    count?.click();
    await new Promise(resolve => setTimeout(resolve, 220));
    viewAll = [...info.querySelectorAll('button,[role="button"]')].find(el => /^View all\b/i.test(label(el)));
  }
  if (!viewAll) return { error: `Could not open the member list for “${group.name}”.` };
  viewAll.click();
  await new Promise(resolve => setTimeout(resolve, 300));
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
  row.click();
  return { restored: true };
}

async function scanMembers(groupName = '') {
  const visible = element => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
  };
  const panels = [...document.querySelectorAll('[role="dialog"], [aria-modal="true"], [role="complementary"], aside')].filter(visible).filter(el => /members?/i.test(el.innerText || ''));
  const lists = panels.flatMap(root => [...root.querySelectorAll('[role="list"]')]).filter(visible);
  const list = lists.find(el => el.querySelector('[role="listitem"]'));
  if (!list) return { error: 'Could not find a rendered member list. Open group info and choose View all first.' };
  const candidates = [list, ...panels.flatMap(root => [root, ...root.querySelectorAll('*')])].filter(el => {
    const style = getComputedStyle(el);
    return visible(el) && el.querySelector('[role="listitem"]') && el.scrollHeight > el.clientHeight + 20 && /auto|scroll/.test(style.overflowY);
  });
  const panel = candidates.sort((a, b) => a.clientHeight - b.clientHeight)[0] || list;
  const memberCount = (() => {
    const text = panels.map(el => el.innerText || '').join(' ').slice(0, 800);
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
      const found = raw.match(numberPattern)?.[0]?.replace(/\s+/g, ' ').trim() || '';
      const digits = found.replace(/\D/g, '');
      const phone = digits.length === 10 ? `+91${digits}` : digits.length === 11 && digits.startsWith('0') ? `+91${digits.slice(1)}` : digits.length === 12 && digits.startsWith('91') ? `+${digits}` : found.trim().startsWith('+') && digits.length >= 7 && digits.length <= 15 ? `+${digits}` : '';
      const names = raw.split(/\r?\n/).map(line => line.replace(numberPattern, '').trim()).filter(line => line && !/^(group admin|admin|available|you|add member tag)$/i.test(line));
      const whatsappLine = names.find(line => /^~\s*/.test(line));
      const savedLine = names.find(line => !/^~\s*/.test(line));
      const saved_as = savedLine || '';
      const whatsapp_name = whatsappLine ? whatsappLine.replace(/^~\s*/, '') : names.length > 1 ? names[1] : '';
      const entry = { group: groupName || currentChatName(), saved_as, whatsapp_name, name: saved_as || whatsapp_name || '', phone_number: phone, status: phone ? 'number_found' : 'name_only' };
      if (phone) {
        const key = phone.replace(/\D/g, '');
        if (!numbers.has(key)) numbers.set(key, entry);
      } else {
        nameless.set(`${position}\u0000${raw}`, entry);
      }
    }
    return rows.length;
  };
  for (let step = 0; step < 500; step++) {
    const before = numbers.size + nameless.size;
    readRows();
    panel.scrollTop = Math.min(panel.scrollTop + Math.max(120, panel.clientHeight * 0.7), panel.scrollHeight);
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
  const complete = panel.isConnected && visible(panel) && panel.scrollTop + panel.clientHeight >= panel.scrollHeight - 4;
  const close = panels.flatMap(root => [...root.querySelectorAll('button')]).find(button => visible(button) && /^(close|back)$/i.test(button.getAttribute('aria-label') || button.title || button.innerText || ''));
  close?.click();
  return { entries, rowsObserved: observedRows.size, uniqueNumbers: numbers.size, nameOnly: nameless.size, memberCount, group: groupName || currentChatName(), complete };
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
    const text = (row.innerText || displayName).trim();
    if (!displayName) continue;
    const found = text.match(numberPattern)?.[0]?.replace(/\s+/g, ' ').trim() || '';
    const digits = found.replace(/\D/g, '');
    const phone = digits.length === 10 ? `+91${digits}` : digits.length === 11 && digits.startsWith('0') ? `+91${digits.slice(1)}` : digits.length === 12 && digits.startsWith('91') ? `+${digits}` : found.startsWith('+') && digits.length >= 7 && digits.length <= 15 ? `+${digits}` : '';
    const whatsapp_name = /^~\s*/.test(displayName) ? displayName.replace(/^~\s*/, '') : '';
    const saved_as = whatsapp_name ? '' : displayName.replace(numberPattern, '').trim();
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
