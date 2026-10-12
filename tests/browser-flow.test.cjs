const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const test = require('node:test');
const { chromium } = require('playwright');

test('unsent iPhone draft survives update; confirmation moves copied order to receiving', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    let pending = {};
    await page.route('https://www.gstatic.com/**', route => route.abort());
    await page.route('https://script.google.com/macros/**', async route => {
      const request = JSON.parse(route.request().postData());
      let response = { status: 'success' };
      if (request.action === 'loadDB') response.database = { categories: { '📦 บรรจุภัณฑ์': ['ขนมปัง A'] }, weightItems: [], itemMappings: {}, updatedAt: '' };
      if (request.action === 'loadDraft') response.draft = {};
      if (request.action === 'loadPendingOrder') response.pending = pending;
      if (request.action === 'recordOrder') {
        pending = { id: request.orderId, qtyData: request.qtyData, date: '2026-10-12' };
        response.pending = pending;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) });
    });
    await page.addInitScript(() => {
      const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map(p => [p.type, p.value]));
      const dateKey = `${parts.year}-${parts.month}-${parts.day}`;
      localStorage.setItem('boy_v4_database', JSON.stringify({ '📦 บรรจุภัณฑ์': ['ขนมปัง A'] }));
      localStorage.setItem('boy_draft_' + dateKey, JSON.stringify({ cart: { 'ขนมปัง A': 3 }, receiveQty: {}, receiveWgt: {}, returnQty: {}, returnWgt: {}, revenue: {}, timestamp: new Date().toISOString(), date: dateKey }));
    });
    let acceptDialogs = true;
    page.on('dialog', dialog => acceptDialogs ? dialog.accept() : dialog.dismiss());
    await page.goto(pathToFileURL(path.join(__dirname, '../index.html')).href);
    await page.waitForFunction(() => window.orderCart['ขนมปัง A'] === 3);
    assert.equal(await page.evaluate(() => window.orderCart['ขนมปัง A']), 3);
    await page.evaluate(() => window.copyOrderText());
    await page.waitForFunction(() => window.receiveQty['ขนมปัง A'] === 3);
    assert.equal(await page.evaluate(() => window.receiveChecked['ขนมปัง A']), false);
    assert.equal(await page.evaluate(() => window.orderCart['ขนมปัง A']), undefined);
    assert.equal(await page.locator('#receive-container input[type="checkbox"]').count(), 1);
    await page.reload();
    await page.waitForFunction(() => window.receiveQty['ขนมปัง A'] === 3);
    assert.equal(await page.evaluate(() => window.receiveChecked['ขนมปัง A']), false);
    acceptDialogs = false;
    await page.evaluate(() => {
      const card = document.querySelector('#receive-container .swipe-card');
      window.swipeStart({ touches: [{ clientX: 200 }], currentTarget: card });
      window.swipeEnd({ changedTouches: [{ clientX: 100 }], currentTarget: card }, 'ขนมปัง A', 'receive');
    });
    assert.equal(await page.evaluate(() => window.receiveQty['ขนมปัง A']), 3);
    assert.equal(await page.locator('#receive-container .swipe-card').count(), 1);
    acceptDialogs = true;
    await page.evaluate(() => {
      const card = document.querySelector('#receive-container .swipe-card');
      window.swipeStart({ touches: [{ clientX: 200 }], currentTarget: card });
      window.swipeEnd({ changedTouches: [{ clientX: 100 }], currentTarget: card }, 'ขนมปัง A', 'receive');
    });
    assert.equal(await page.evaluate(() => window.receiveQty['ขนมปัง A']), undefined);
  } finally {
    await browser.close();
  }
});
