import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../popup.js', import.meta.url), 'utf8');

function loadFunction(name, globals = {}) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} exists`);
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

test('visible contact scan normalizes Indian numbers and preserves displayed country codes', () => {
  const rows = [row('Asha\n9876543210', 10, 'Asha'), row('Ben\n+1 (415) 555-0132', 50, 'Ben')];
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
  assert.deepEqual(JSON.parse(JSON.stringify(result.entries.map(entry => entry.saved_as))), ['Asha', 'Ben']);
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
