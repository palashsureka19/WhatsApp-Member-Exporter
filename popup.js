const scanButton = document.querySelector('#scan');
const status = document.querySelector('#status');
const preview = document.querySelector('#preview');
const download = document.querySelector('#download');
let result;

scanButton.addEventListener('click', async () => {
  scanButton.disabled = true;
  download.hidden = true;
  status.textContent = 'Scanning rendered member rows…';
  preview.replaceChildren();
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url?.startsWith('https://web.whatsapp.com/')) throw new Error('Open WhatsApp Web first.');
    const [reply] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: scanMembers });
    result = reply.result;
    if (result.error) throw new Error(result.error);
    status.textContent = result.complete ? 'Scan reached the apparent end.' : 'Partial scan. Review coverage before export.';
    const summary = document.createElement('p');
    summary.className = 'summary';
    summary.textContent = `Rows observed: ${result.rowsObserved} · Unique numbers: ${result.uniqueNumbers} · Name only: ${result.nameOnly}${result.memberCount == null ? '' : ` · Displayed members: ${result.memberCount}`}`;
    preview.append(summary);
    const coverage = document.createElement('p');
    coverage.className = 'muted';
    coverage.textContent = result.memberCount == null ? 'WhatsApp showed no readable member count; coverage is based on reaching the apparent scroll end.' : `Observed ${result.rowsObserved} of ${result.memberCount} displayed members.`;
    preview.append(coverage);
    const list = document.createElement('div');
    list.id = 'rows';
    for (const entry of result.entries) {
      const line = document.createElement('div');
      line.className = 'row';
      line.textContent = `${entry.name} — ${entry.phone_number || 'name only'}`;
      list.append(line);
    }
    preview.append(list);
    download.hidden = !result.entries.length;
  } catch (error) {
    status.textContent = error.message || 'Scan failed. Open the group member list and try again.';
  } finally {
    scanButton.disabled = false;
  }
});

download.addEventListener('click', () => {
  if (!result?.entries?.length) return;
  const quote = value => {
    const text = String(value ?? '');
    return `"${( /^[=+\-@\t\r]/.test(text) ? `'${text}` : text).replaceAll('"', '""')}"`;
  };
  const rows = [['name', 'phone_number', 'status'], ...result.entries.map(({ name, phone_number, status }) => [name, phone_number, status])];
  const blob = new Blob(['\ufeff' + rows.map(row => row.map(quote).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'whatsapp-group-members.csv';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

async function scanMembers() {
  const visible = element => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
  };
  const panels = [...document.querySelectorAll('[role="dialog"], [aria-modal="true"]')].filter(visible);
  const candidates = panels.flatMap(panel => [panel, ...panel.querySelectorAll('*')]).filter(el => {
    if (!visible(el)) return false;
    const style = getComputedStyle(el);
    return el.scrollHeight > el.clientHeight + 30 && /auto|scroll/.test(style.overflowY);
  });
  const panel = candidates.sort((a, b) => a.clientHeight - b.clientHeight)[0];
  if (!panel) return { error: 'Could not find a scrollable member panel. Open the group member list first.' };
  const memberCount = (() => {
    const text = (panels[0]?.innerText || '').slice(0, 500);
    const match = text.match(/(?:participants|members)\s*\(?\s*(\d{1,4})\s*\)?/i);
    return match ? Number(match[1]) : null;
  })();
  const numbers = new Map();
  const nameless = new Map();
  let rowsObserved = 0;
  let stagnant = 0;
  let previousTop = -1;
  const numberPattern = /\+\s*\d[\d\s().-]{5,}\d|\b\d{7,15}\b/g;
  const readRows = () => {
    const rows = [...panel.querySelectorAll('[role="listitem"], [role="button"]')].filter(visible);
    const unique = new Set();
    for (const row of rows) {
      const raw = (row.innerText || '').replace(/\s+/g, ' ').trim();
      if (!raw || raw.length > 180 || unique.has(raw)) continue;
      unique.add(raw);
      const found = raw.match(numberPattern)?.[0]?.replace(/\s+/g, ' ').trim();
      const name = raw.replace(numberPattern, '').replace(/[·•,\s]+$/g, '').trim() || raw;
      rowsObserved++;
      if (found) {
        const key = found.replace(/\D/g, '');
        if (key.length >= 7) numbers.set(key, { name, phone_number: found, status: 'number_found' });
        else nameless.set(raw, { name, phone_number: '', status: 'name_only' });
      } else nameless.set(raw, { name, phone_number: '', status: 'name_only' });
    }
    return unique.size;
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
  return { entries, rowsObserved: numbers.size + nameless.size, uniqueNumbers: numbers.size, nameOnly: nameless.size, memberCount, complete: panel.isConnected && visible(panel) && panel.scrollTop + panel.clientHeight >= panel.scrollHeight - 4 };
}
