import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../popup.js', import.meta.url), 'utf8');
function functionFrom(name, globals = {}) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1);
  const end = source.indexOf('\n}', start) + 2;
  return vm.runInNewContext('(' + (source.slice(start - 6, start) === 'async ' ? 'async ' : '') + source.slice(start, end) + ')', globals);
}

test('phone normalization keeps international codes and rejects invalid IDs', () => {
  const cleanPhone = functionFrom('cleanPhone');
  assert.equal(cleanPhone('14155550132@c.us'), '+14155550132');
  assert.equal(cleanPhone('+91 98765 43210'), '+919876543210');
  assert.equal(cleanPhone('123@lid'), '');
});

test('export filename uses group name and local calendar date', () => {
  const exportFilename = functionFrom('exportFilename');
  assert.equal(exportFilename('Investor Circle', new Date(2026, 10, 22)), 'Investor CircleContacts-2026-11-22.csv');
  assert.equal(exportFilename('A/B:*', new Date(2026, 0, 3)), 'A_B__Contacts-2026-01-03.csv');
});

test('bridge passes serializable arguments for commands without payloads', async () => {
  let passedArgs;
  const bridge = functionFrom('bridge', {
    bridgeCommand() {},
    chrome: { scripting: { executeScript: async injection => {
      passedArgs = injection.args;
      return [{ result: { ok: true } }];
    } } },
  });
  await bridge(7, 'ready');
  assert.deepEqual(Array.from(passedArgs), ['ready', null]);
});

test('CSV keeps membership rows, Unicode, and neutralizes formulas', () => {
  const csv = functionFrom('csv');
  const output = csv([{ group: 'दोस्त', saved_as: '=1+1', whatsapp_name: 'A\nB', phone_number: '+14155550132', status: 'number_found' }]);
  assert.ok(output.startsWith('\ufeff"group","saved_as","whatsapp_name","phone_number","status"\r\n'));
  assert.match(output, /"'=1\+1"/);
  assert.match(output, /"A\nB"/);
  assert.match(output, /"\+14155550132"/);
});

test('bridge identifies groups by ID and exports unavailable LID phones without inventing numbers', async () => {
  const contacts = {
    '111@c.us': { name: 'Saved', pushname: 'Public' },
    'abc@lid': { pushname: 'LID name' },
  };
  const window = { WPP: {
    isReady: true,
    chat: { list: async () => [{ id: { server: 'g.us', _serialized: '1@g.us', user: '1' }, formattedTitle: 'Same' }, { id: { server: 'g.us', _serialized: '2@g.us', user: '2' }, formattedTitle: 'Same' }] },
    group: { getParticipants: async () => [
      { id: { server: 'c.us', user: '111', _serialized: '111@c.us' }, isAdmin: true },
      { id: { server: 'lid', user: 'abc', _serialized: 'abc@lid' }, isAdmin: false },
    ] },
    contact: { get: async id => contacts[id._serialized], getPnLidEntry: async () => ({}) },
  } };
  const command = functionFrom('bridgeCommand', { window });
  const groups = await command('groups');
  assert.equal(groups.groups.length, 2);
  assert.notEqual(groups.groups[0].id, groups.groups[1].id);
  const result = await command('members', { id: '1@g.us', includeAdmins: false });
  assert.equal(result.rosterCount, 2);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].phone_number, '');
  assert.equal(result.rows[0].whatsapp_name, 'LID name');
});
