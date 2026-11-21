import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../popup.js', import.meta.url), 'utf8');

function loadFunction(name, globals = {}) {
  let start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} exists`);
  if (source.slice(start - 6, start) === 'async ') start -= 6;
  const end = source.indexOf('\n}', start) + 2;
  const context = vm.createContext(globals);
  return vm.runInContext(`(${source.slice(start, end)})`, context);
}

function row(text, top, titleText = text) {
  const title = { getAttribute: () => titleText, innerText: titleText };
  return {
    innerText: text,
    getBoundingClientRect: () => ({ top, bottom: top + 36, width: 300, height: 36 }),
    querySelector: () => title,
  };
}

test('Choose groups handles a null injected result and restores a usable dropdown', async () => {
  const elements = new Map();
  const element = id => elements.get(id) || elements.set(id, {
    addEventListener() {},
    replaceChildren(...children) { this.children = children; this.value = children[0]?.value || ''; },
    add(option) { (this.children ||= []).push(option); },
    querySelector() { return { textContent: '' }; },
    textContent: '', value: '', disabled: false,
  }).get(id);
  const context = vm.createContext({
    document: { querySelector: selector => element(selector) },
    chrome: {
      tabs: { query: async () => [{ id: 7, url: 'https://web.whatsapp.com/' }] },
      scripting: { executeScript: async () => [null] },
    },
    Option: class { constructor(text, value) { this.text = text; this.value = value; } },
  });
  vm.runInContext(source, context);
  await context.loadGroups();
  assert.match(element('#status').textContent, /did not return its group list/i);
  assert.equal(element('#groupSelect').children[0].text, 'Could not load groups');
  assert.equal(element('#scanSelected').disabled, true);
});

test('injected-script null results produce a useful error instead of a null property crash', () => {
  const readResult = loadFunction('injectedResult');
  assert.throws(() => readResult(undefined, 'No scan data'), /No scan data/);
  assert.throws(() => readResult({ result: null }, 'No group data'), /No group data/);
  assert.equal(readResult({ result: { groups: [] } }, 'No data').groups.length, 0);
});

test('functions passed to executeScript do not rely on popup-scope helpers', () => {
  for (const name of ['readGroups', 'openGroupAndMemberList', 'restoreChat', 'scanMembers', 'scanVisibleContacts']) {
    const start = source.indexOf(`function ${name}(`);
    assert.notEqual(start, -1, `${name} exists`);
    const end = source.indexOf('\n}', start) + 2;
    assert.doesNotMatch(source.slice(start, end), /currentChatName\s*\(/, `${name} is self-contained`);
  }
});

test('readGroups runs as a standalone injected function', async () => {
  const groupFilter = {
    innerText: 'Groups 1',
    classList: { contains: () => false },
    getAttribute: name => name === 'aria-pressed' ? 'true' : null,
    getBoundingClientRect: () => ({ width: 40, height: 24 }),
  };
  const pane = { scrollTop: 0, scrollHeight: 100, clientHeight: 100, querySelectorAll: () => [] };
  const readGroups = loadFunction('readGroups', {
    document: {
      querySelectorAll: () => [groupFilter],
      querySelector: selector => selector === '#main header' ? null : pane,
    },
    getComputedStyle: () => ({ display: 'block', visibility: 'visible', overflowY: 'visible' }),
    setTimeout: callback => callback(),
  });
  const result = await readGroups();
  assert.equal(result.groups.length, 0);
  assert.equal(result.context.chat, '');
});

test('readGroups activates the group filter and ignores unread-message badges as names', async () => {
  let pressed = false;
  const groupFilter = {
    innerText: 'Groups',
    classList: { contains: () => false },
    getAttribute: name => name === 'aria-pressed' ? String(pressed) : null,
    getBoundingClientRect: () => ({ width: 60, height: 24 }),
    click: () => { pressed = true; },
  };
  const makeRow = name => ({
    innerText: name,
    getBoundingClientRect: () => ({ width: 300, height: 36 }),
    querySelector: () => ({ getAttribute: () => name, innerText: name }),
  });
  const pane = {
    scrollTop: 0, scrollHeight: 100, clientHeight: 100,
    querySelectorAll: selector => selector === '[data-testid="cell-frame-container"]' ? [makeRow('Group Alpha'), makeRow('3 unread messages\nGroup Beta\n9:30\nPreview')] : [],
  };
  const readGroups = loadFunction('readGroups', {
    document: {
      querySelectorAll: () => [groupFilter],
      querySelector: selector => selector === '#main header' ? null : pane,
    },
    getComputedStyle: () => ({ display: 'block', visibility: 'visible', overflowY: 'visible' }),
    setTimeout: callback => callback(),
  });
  const result = await readGroups();
  assert.equal(pressed, true);
  assert.deepEqual(JSON.parse(JSON.stringify(result.groups.map(group => group.name))), ['Group Alpha', 'Group Beta']);
});

test('visible contact scan normalizes Indian numbers and preserves displayed country codes', () => {
  const rows = [row('9876543210\nPreview', 10, '9876543210'), row('+1 (415) 555-0132\nPreview', 50, '+1 (415) 555-0132')];
  const list = {
    scrollTop: 0,
    getBoundingClientRect: () => ({ top: 0, bottom: 120, width: 300, height: 120 }),
    querySelectorAll: () => rows,
  };
  const scan = loadFunction('scanVisibleContacts', {
    document: { querySelector: () => list },
    getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
  });
  const result = scan();
  assert.deepEqual(JSON.parse(JSON.stringify(result.entries.map(entry => entry.phone_number))), ['+919876543210', '+14155550132']);
  assert.deepEqual(JSON.parse(JSON.stringify(result.entries.map(entry => entry.saved_as))), ['', '']);
});

test('visible contact scan ignores off-screen rows and keeps same-name rows distinct', () => {
  const rows = [row('Sam', 10), row('Sam', 50), row('Hidden', 140)];
  const list = {
    scrollTop: 0,
    getBoundingClientRect: () => ({ top: 0, bottom: 100, width: 300, height: 100 }),
    querySelectorAll: () => rows,
  };
  const scan = loadFunction('scanVisibleContacts', {
    document: { querySelector: () => list },
    getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
  });
  const result = scan();
  assert.equal(result.nameOnly, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(result.entries.map(entry => entry.saved_as))), ['Sam', 'Sam']);
});

test('group result merge deduplicates by number and retains same-name entries', () => {
  const merge = loadFunction('mergeGroupResults');
  const result = merge([
    { entries: [{ group: 'One', saved_as: 'Alex', phone_number: '+919876543210' }, { group: 'One', saved_as: 'Sam', phone_number: '' }] },
    { entries: [{ group: 'Two', saved_as: 'Alex work', phone_number: '+91 9876543210' }, { group: 'Two', saved_as: 'Sam', phone_number: '' }] },
  ]);
  assert.equal(result.uniqueNumbers, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(result.entries[0].groups)), ['One', 'Two']);
  assert.equal(result.nameOnly, 2);
});

test('contact titles do not borrow numbers from messages or group names', () => {
  const rows = [row('Sam\nCall +91 9876543210', 0, 'Sam'), row('Team +91 9876543210 & friends', 40), row('+354 123 4567', 80)];
  const list = { scrollTop: 0, getBoundingClientRect: () => ({ top: 0, bottom: 140, width: 300, height: 140 }), querySelectorAll: () => rows };
  const scan = loadFunction('scanVisibleContacts', { document: { querySelector: () => list }, getComputedStyle: () => ({ display: 'block', visibility: 'visible' }) });
  const result = scan();
  assert.equal(result.uniqueNumbers, 1);
  assert.equal(result.entries[0].phone_number, '+3541234567');
  assert.equal(result.nameOnly, 2);
  assert.equal(result.entries[2].saved_as, 'Team +91 9876543210 & friends');
});

function memberHarness(texts, { count = texts.length, stop = false, disconnect = false } = {}) {
  let top = 0;
  let ticks = 0;
  const window = { __waExportStop: false };
  const list = {
    isConnected: true, parentElement: null, clientHeight: 80, scrollHeight: texts.length * 40,
    get scrollTop() { return top; },
    set scrollTop(value) { top = Math.max(0, Math.min(value, this.scrollHeight - this.clientHeight)); },
    getBoundingClientRect: () => ({ top: 0, bottom: 80, width: 300, height: 80 }),
    getAttribute: () => String(count), removeAttribute() {},
    querySelector: () => ({}),
    querySelectorAll: () => {
      // Reuse two row objects as a virtual list does; identity is not a member ID.
      return pool.map((item, offset) => {
        item.index = Math.floor(top / 40) + offset;
        item.innerText = texts[item.index] || '';
        return item;
      }).filter(item => item.innerText);
    },
  };
  const pool = [0, 1].map(() => ({ index: 0, getBoundingClientRect() { return { top: this.index * 40 - top, bottom: this.index * 40 - top + 40, width: 300, height: 40 }; } }));
  const scan = loadFunction('scanMembers', {
    window,
    document: { body: {}, querySelector: selector => selector === '#main header' ? null : list },
    getComputedStyle: () => ({ display: 'block', visibility: 'visible', overflowY: 'auto' }),
    setTimeout: callback => { if (++ticks === 2) { if (stop) window.__waExportStop = true; if (disconnect) list.isConnected = false; } callback(); },
  });
  return () => scan('Test group');
}

test('member scanning handles recycled rows, identical names, phone deduplication and explicit country codes', async () => {
  const scan = memberHarness(['Sam', 'Sam', '+354 123 4567\n~Iceland', '+91 98765 43210\n~Asha', '+919876543210\n~Asha', 'You\nAdd member tag']);
  const result = await scan();
  assert.equal(result.rowsObserved, 6);
  assert.equal(result.nameOnly, 3);
  assert.equal(result.uniqueNumbers, 2);
  assert.equal(result.complete, true);
  assert.equal(result.entries.find(entry => entry.phone_number === '+3541234567').whatsapp_name, 'Iceland');
  assert.equal(result.entries.filter(entry => entry.saved_as === 'Sam').length, 2);
  assert.equal(result.entries.find(entry => entry.saved_as === 'You').phone_number, '');
});

test('member count mismatches, cancellation and detached panels report partial results', async () => {
  for (const options of [{ count: 9 }, { stop: true }, { disconnect: true }]) {
    const result = await memberHarness(['Sam', 'Alex', 'Ben', 'Jo'], options)();
    assert.equal(result.complete, false);
    assert.ok(result.entries.length > 0);
  }
});

test('member status text is never inferred to be a phone or WhatsApp name', async () => {
  const result = await memberHarness(['Sam\nCall 9876543210 tomorrow', '+91 9876543210\nAvailable'])();
  assert.equal(result.uniqueNumbers, 1);
  const sam = result.entries.find(entry => entry.saved_as === 'Sam');
  assert.equal(sam.phone_number, '');
  assert.equal(sam.whatsapp_name, '');
  assert.equal(result.entries[0].saved_as, '');
});

test('CSV quotes Unicode and multiline names and neutralizes spreadsheet formulas', () => {
  const csv = loadFunction('buildCsv')([{ group: 'दोस्त', saved_as: '  =HYPERLINK("bad")', whatsapp_name: 'A\nB', phone_number: '+919876543210', status: 'number_found' }]);
  assert.ok(csv.startsWith('\ufeff"group","saved_as","whatsapp_name","phone_number","status"\r\n'));
  assert.ok(csv.includes('"\'  =HYPERLINK(""bad"")"'));
  assert.ok(csv.includes('"A\nB"'));
  assert.ok(csv.includes('"+919876543210"'));
  const invalid = loadFunction('buildCsv')([{ phone_number: '=1+1' }]);
  assert.ok(invalid.includes('"\'=1+1"'));
});

function openHarness({ large = false, opensChat = true } = {}) {
  let chat = false;
  let info = false;
  let members = false;
  let expanded = false;
  let ticks = 0;
  let clicked = false;
  const element = (text, extra = {}) => ({ innerText: text, getAttribute: () => null, getBoundingClientRect: () => ({ width: 100, height: 40 }), closest: () => null, ...extra });
  const filter = element('Groups', { classList: { contains: () => false }, getAttribute: key => key === 'aria-pressed' ? 'true' : null });
  const target = element('', { dispatchEvent: () => { clicked = true; }, click() {} });
  const title = element('Test', { getAttribute: () => 'Test' });
  const row = element('Test', { querySelector: selector => selector.includes('tabindex') ? target : title });
  const pane = { scrollTop: 150, scrollHeight: 200, clientHeight: 200, querySelectorAll: selector => selector === '*' ? [] : [row] };
  const header = element('Test');
  const button = element('Group info Test', { dispatchEvent() {}, click: () => { info = true; } });
  const count = element(large ? '20 members' : '4 members', { dispatchEvent() {}, click: () => { members = true; } });
  const all = element('View all (20)', { dispatchEvent() {}, click: () => { expanded = true; } });
  const attrs = {};
  const list = element('members', { querySelector: () => ({}), setAttribute: (key, value) => { attrs[key] = value; } });
  const open = loadFunction('openGroupAndMemberList', {
    window: {}, MouseEvent: class { constructor(type) { this.type = type; } },
    document: {
      querySelector: selector => selector === '#main header' ? header : pane,
      querySelectorAll: selector => {
        if (selector.startsWith('#main header')) return chat ? [button] : [];
        if (selector === '[role="list"]') return members && (!large || expanded) ? [list] : [];
        if (selector === '[data-wa-export-members]') return [];
        return info ? [filter, count, ...(large ? [all] : [])] : [filter];
      },
    },
    getComputedStyle: () => ({ display: 'block', visibility: 'visible', overflowY: 'visible' }),
    setTimeout: callback => { if (clicked && ++ticks >= 3 && opensChat) chat = true; callback(); },
  });
  return { run: () => open({ name: 'Test' }), attrs, pane, expanded: () => expanded };
}

test('opening a group waits for navigation and supports inline small-group members without View all', async () => {
  const harness = openHarness();
  assert.equal((await harness.run()).ok, true);
  assert.equal(harness.pane.scrollTop, 0);
  assert.equal(harness.attrs['data-wa-export-count'], '4');
  assert.equal(harness.expanded(), false);
});

test('opening a larger group expands View all, but failed navigation cannot scan a different chat', async () => {
  const large = openHarness({ large: true });
  assert.equal((await large.run()).ok, true);
  assert.equal(large.expanded(), true);
  assert.match((await openHarness({ opensChat: false }).run()).error, /Could not open the chat/);
});
