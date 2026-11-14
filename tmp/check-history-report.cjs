const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('../tests/ui/node_modules/playwright-core');

const root = path.resolve(__dirname, '../frontend');
const out = path.resolve(__dirname, 'history-report-qa');
fs.mkdirSync(out, { recursive: true });
const normal = { id: 1, created_at: '2026-11-13T15:05:00Z', predicted_gwa: 1.94, performance_category: 'Good', program: 'BSCS', year_level: '3rd Year', academic_term: '1st Sem', daily_screen_time_hrs: 7, academic_app_usage_hrs: 2, social_media_hrs: 1, study_hours_per_day: 3, study_frequency_per_week: 5 };
let record = normal;
const server = http.createServer((req, res) => {
  if (req.url.startsWith('/results?')) {
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ results: [record], pagination: { total: 1, has_more: false } }));
  }
  if (req.url.startsWith('/js/auth.js')) {
    res.setHeader('Content-Type', 'text/javascript');
    return res.end('window.authReady = Promise.resolve({ authenticated: true, user: { id: 1 } });');
  }
  const file = path.join(root, new URL(req.url, 'http://localhost').pathname);
  if (!file.startsWith(root) || !fs.existsSync(file)) { res.statusCode = 404; return res.end(); }
  res.setHeader('Content-Type', ({ '.css': 'text/css', '.js': 'text/javascript', '.html': 'text/html', '.png': 'image/png' })[path.extname(file)] || 'application/octet-stream');
  res.end(fs.readFileSync(file));
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  const errors = [];
  try {
    const page = await browser.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://fonts.googleapis.com/**', route => route.abort());
    async function open(width, theme, data = normal, height = 900) {
      record = data;
      await page.setViewportSize({ width, height });
      await page.goto(`http://127.0.0.1:${server.address().port}/html/history.html`);
      await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
      await page.getByRole('button', { name: 'View assessment from' }).click();
      await page.waitForFunction(() => document.querySelector('#history-detail').open);
    }
    for (const [width, theme] of [[1280, 'dark'], [1280, 'light'], [390, 'dark'], [320, 'light']]) {
      await open(width, theme);
      assert.equal(await page.locator('#history-detail dt').count(), 8);
      assert.equal(await page.locator('#history-detail h3').allTextContents().then(x => x.join('|')), 'Academic details|Daily habits');
      assert.equal(await page.locator('#history-detail .history-gwa').textContent(), '1.94');
      assert.match(await page.locator('#history-detail-date').textContent(), /Nov 13, 2026.*11:05/);
      assert.equal(await page.locator('#history-detail').evaluate(d => d.scrollWidth <= d.clientWidth), true, 'dialog must not overflow horizontally');
      const box = await page.locator('#history-detail').boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= width, 'dialog fits viewport');
      await page.locator('#history-detail').screenshot({ path: path.join(out, `${width}-${theme}.png`) });
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('#history-detail').open);
      assert.match(await page.locator(':focus').getAttribute('aria-label'), /^View assessment/);
    }
    await open(390, 'dark');
    assert.equal(await page.locator(':focus').getAttribute('id'), 'history-detail-close');
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.locator(':focus').getAttribute('id'), 'history-detail-done');
    await page.keyboard.press('Tab');
    // Native dialog navigation may visit browser chrome before cycling back.
    const inside = await page.evaluate(() => document.activeElement === document.body || document.querySelector('#history-detail').contains(document.activeElement));
    assert.equal(inside, true, 'Tab must not reach the inert history page');
    if (await page.evaluate(() => document.activeElement === document.body)) await page.keyboard.press('Tab');
    assert.equal(await page.locator(':focus').getAttribute('id'), 'history-detail-close');
    await page.getByRole('button', { name: 'Close assessment details', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('#history-detail').open);
    await page.getByRole('button', { name: 'View assessment from' }).click();
    await page.locator('#history-detail-done').click();
    await page.waitForFunction(() => !document.querySelector('#history-detail').open);
    await page.getByRole('button', { name: 'View assessment from' }).click();
    await page.locator('#history-detail-delete').click();
    await page.waitForFunction(() => document.querySelector('#history-confirm').open);
    assert.equal(await page.locator('#history-detail').evaluate(d => d.open), false);
    assert.equal(await page.locator('#history-confirm').evaluate(d => getComputedStyle(d).padding), '20px');
    await page.locator('#history-confirm-cancel').click();
    await page.waitForFunction(() => document.querySelector('#history-detail').open);
    assert.equal(await page.locator(':focus').getAttribute('id'), 'history-detail-delete');
    for (const category of ['Excellent', 'Good', 'Satisfactory', 'Failing']) {
      await open(320, 'dark', { ...normal, performance_category: category, program: 'BachelorOfScienceInComputerScienceWithAVeryLongProgramName', daily_screen_time_hrs: 0, academic_app_usage_hrs: null, social_media_hrs: '', study_hours_per_day: 0, study_frequency_per_week: null }, 568);
      assert.equal(await page.locator('#history-detail .history-category').textContent(), category);
      assert.deepEqual(await page.locator('#history-detail dd').allTextContents(), ['BachelorOfScienceInComputerScienceWithAVeryLongProgramName', '3rd Year', '1st Semester', '0 hrs / day', '—', '—', '0 hrs / day', '—']);
      assert.equal(await page.locator('#history-detail').evaluate(d => d.scrollWidth <= d.clientWidth), true);
      assert.equal(await page.locator('#history-detail-fields').evaluate(d => [...d.querySelectorAll('dt')].every(dt => dt.getBoundingClientRect().right <= dt.nextElementSibling.getBoundingClientRect().left)), true, 'labels do not overlap values');
      await page.locator('#history-detail-done').click();
    }
    await open(320, 'light', { id: 2, predicted_gwa: null });
    assert.equal(await page.locator('#history-detail .history-gwa').textContent(), '—');
    assert.ok((await page.locator('#history-detail dd').allTextContents()).every(value => value === '—'));
    await page.evaluate(() => window.dispatchEvent(new Event('auth:cleared')));
    await page.waitForFunction(() => !document.querySelector('#history-detail').open);
    assert.equal(await page.locator('#history-detail-fields').textContent(), '');
    assert.deepEqual(errors, []);
    console.log('PASS: desktop/mobile, both themes, eight fields, dates, wrapping, missing/zero values, categories, keyboard trap, Escape, both close controls, focus restoration, delete cancellation, auth clearing.');
    console.log(`Screenshots: ${out}`);
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
