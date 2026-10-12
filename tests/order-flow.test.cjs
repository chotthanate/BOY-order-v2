const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

test('confirmed orders survive reload and checked receiving is removed from pending', () => {
  const cells = new Map();
  const properties = new Map();
  const writtenRows = [];
  const sheet = {
    getLastRow: () => 4,
    getRange: (_row, _col, rows) => ({
      getValues: () => Array.from({ length: rows }, () => ['']),
      setValues: values => writtenRows.push(...values),
    }),
  };
  const config = {
    getRange: key => ({
      getValue: () => cells.get(key),
      setValue: value => cells.set(key, value),
      clearContent: () => cells.delete(key),
    }),
  };
  const context = {
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    SpreadsheetApp: { openById: () => ({ getSheets: () => [config], getSheetByName: () => sheet }) },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: key => properties.get(key),
      setProperty: (key, value) => properties.set(key, value),
      deleteProperty: key => properties.delete(key),
    }) },
    Utilities: { formatDate: (_date, _zone, format) => format === 'yyyy-MM-dd' ? '2026-10-12' : '12/10/2026' },
    ContentService: { MimeType: { JSON: 'JSON' }, createTextOutput: value => ({ setMimeType: () => value }) },
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../apps-script/รหัส.js'), 'utf8'), context);
  const call = data => JSON.parse(context.doPost({ postData: { contents: JSON.stringify(data) } }));

  const first = call({ action: 'recordOrder', orderId: 'a', qtyData: { 'ขนมปัง': 3, 'ส้ม': 2 }, categories: { 'ของ': ['ขนมปัง', 'ส้ม'] } });
  assert.equal(first.status, 'success');
  assert.equal(call({ action: 'loadPendingOrder' }).pending.qtyData['ขนมปัง'], 3);
  assert.equal(call({ action: 'recordOrder', orderId: 'a', qtyData: { 'ขนมปัง': 3 } }).pending.qtyData['ขนมปัง'], 3);

  const received = call({ action: 'receive', orderId: 'a', receivedItems: ['ขนมปัง'], qtyData: { 'ขนมปัง': 3 } });
  assert.equal(received.status, 'success');
  assert.equal(writtenRows.length, 1);
  assert.deepEqual(Object.keys(call({ action: 'loadPendingOrder' }).pending.qtyData), ['ส้ม']);
  assert.equal(call({ action: 'receive', orderId: 'a', receivedItems: ['ส้ม'], qtyData: { 'ส้ม': 2 } }).status, 'success');
  assert.equal(call({ action: 'loadPendingOrder' }).pending.id, undefined);
});
