// Headless Edge checks use fictitious API responses and never contact the app database.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright-core');
const { PNG } = require('pngjs');
const root = path.resolve(__dirname, '../..');
const frontend = path.join(root, 'frontend');
const artifacts = process.env.ACAD_UI_ARTIFACTS || path.join(os.tmpdir(), 'acad-perf-mobile-qa');
const baseline = process.argv.includes('--baseline');
const mobileOnly = process.argv.includes('--mobile');
const requestedWidth = process.argv.find(arg => arg.startsWith('--width='));
function widths(defaults) {
  if (!requestedWidth) return defaults;
  const width = Number(requestedWidth.split('=')[1]);
  assert.ok(defaults.includes(width), 'Select a width from: ' + defaults.join(', '));
  return [width];
}
const record = { id: 1, created_at: '2026-11-10T16:30:00Z', year_level: '2nd Year', academic_term: '1st Sem', program: 'BSIT', predicted_gwa: 2.15, performance_category: 'Good', daily_screen_time_hrs: 4, academic_app_usage_hrs: 1, social_media_hrs: 1, study_hours_per_day: 3, study_frequency_per_week: 5 };
const prediction = { predicted_gwa: 2.15, performance_category: 'Good', suggestions: ['Plan regular study breaks.'], saved: false };
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
const sourceCache = new Map();
const server = http.createServer((req, res) => {
  let relative = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (relative === '/') relative = '/html/index.html';
  else if (/^\/[^/]+\.html$/.test(relative)) relative = '/html' + relative;
  // Public URLs stay stable while sources are grouped under frontend/.
  // The immutable baseline still uses the original repository layout.
  if (relative === '/style.css' || relative === '/css/style.css') relative = '/css/style.css';
  const file = path.resolve(frontend, '.' + relative);
  if (!file.startsWith(frontend + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
  const baselinePath = relative === '/css/style.css' ? 'style.css' : relative.slice(1);
  if (baseline && !sourceCache.has(file)) sourceCache.set(file, execFileSync('git', ['show', 'checkpoint/pre-mobile-2026-11-12:' + baselinePath], { cwd: root }));
  res.end(baseline ? sourceCache.get(file) : fs.readFileSync(file));
});
let browser, browserServer;
async function open(width, theme, pageName, signedIn = false, height = 900) {
  const context = await browser.newContext({ viewport: { width, height }, isMobile: width < 768, hasTouch: width < 768, reducedMotion: 'reduce', timezoneId: 'Asia/Manila', locale: 'en-PH' });
  await context.addInitScript(theme => localStorage.setItem('theme', theme), theme);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname !== '127.0.0.1') {
      // Stable offline font fallback; keep the legacy Tailwind configuration harmless.
      if (url.hostname === 'cdn.tailwindcss.com') return route.fulfill({ contentType: 'text/javascript', body: 'window.tailwind = {};' });
      return route.abort();
    }
    if (url.pathname === '/auth/session') return route.fulfill({ json: { authenticated: signedIn, user: signedIn ? { id: 42, name: 'DE LA CRUZ, Test Student With A Long Name' } : null, csrf_token: 'test-csrf' } });
    if (url.pathname === '/predict') return route.fulfill({ json: prediction });
    if (url.pathname === '/results') return route.fulfill({ json: { results: [record], pagination: { total: 1, has_more: false } } });
    return route.continue();
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/${pageName}.html`, { waitUntil: 'networkidle' });
  await page.evaluate(async () => { if (window.authReady) await window.authReady; await document.fonts.ready; });
  return { page, context, errors };
}
async function snapshot(page, name) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const folder = path.join(artifacts, baseline ? 'baseline-viewport' : 'actual-viewport');
  fs.mkdirSync(folder, { recursive: true });
  // Full-page Edge captures temporarily resize the layout viewport and can fire
  // breakpoint listeners at 767/768px. Capture real viewports and scroll explicitly.
  const bytes = await page.screenshot({ animations: 'disabled', path: path.join(folder, name + '.png') });
  if (!baseline) {
    const expected = path.join(artifacts, 'baseline-viewport', name + '.png');
    assert.ok(fs.existsSync(expected), `Missing baseline: ${name}; capture before editing the UI`);
    const actual = PNG.sync.read(bytes), reference = PNG.sync.read(fs.readFileSync(expected));
    assert.equal(actual.width, reference.width); assert.equal(actual.height, reference.height);
    // A one-channel rounding difference in decoded background JPEGs is harmless.
    let changed = 0;
    for (let i = 0; i < actual.data.length; i += 4) {
      if ([0, 1, 2, 3].some(channel => Math.abs(actual.data[i + channel] - reference.data[i + channel]) > 1)) changed++;
    }
    assert.equal(changed, 0, `Desktop screenshot changed: ${name} (${changed} pixels)`);
  }
}
async function desktop() {
  let count = 0;
  for (const width of widths([768, 1024, 1199, 1200, 1440])) {
    for (const theme of ['dark', 'light']) {
      for (const name of ['index', 'assessment', 'hiw', 'history', 'privacy', 'terms']) {
        const { page, context, errors } = await open(width, theme, name, name === 'history');
        await snapshot(page, `${name}-${width}-${theme}`); count++;
        if (name === 'index') {
          for (const section of ['how-it-works', 'assessment']) {
            await page.locator('#' + section).evaluate(element => element.scrollIntoView({ block: 'start', behavior: 'instant' }));
            await snapshot(page, `home-${section}-${width}-${theme}`); count++;
          }
          await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
        }
        if (name === 'assessment') {
          await page.locator('#academicTerm').selectOption('1st Sem', { force: true });
          for (const [id, value] of Object.entries({ screenTime: '4', academicPhoneUse: '1', socialPhoneUse: '1', studyHours: '3', studyDays: '5' })) await page.locator('#' + id).fill(value);
          await page.locator('#submit-btn').click();
          await page.locator('#save-status').waitFor();
          await page.locator('#submit-btn').focus();
          await snapshot(page, `prediction-${width}-${theme}`); count++;
        }
        if (name === 'history') {
          await page.locator('.account-trigger').click();
          await snapshot(page, `account-${width}-${theme}`); count++;
          await page.keyboard.press('Escape');
          await page.getByRole('button', { name: /view assessment from/i }).first().click();
          await snapshot(page, `history-detail-${width}-${theme}`); count++;
        }
        if (name === 'index' && width < 1200) {
          await page.locator('.nav-menu-toggle').click();
          assert.equal(await page.locator('.nav-menu-toggle').getAttribute('aria-expanded'), 'true', 'Tablet menu stays open');
          await snapshot(page, `tablet-navigation-${width}-${theme}`); count++;
        }
        assert.deepEqual(errors, [], `${name} JS errors`);
        await context.close();
      }
    }
    console.log(`${baseline ? 'Captured' : 'Matched'} desktop states at ${width}px`);
  }
  console.log(`${count} desktop screenshots ${baseline ? 'captured from the checkpoint' : 'matched (1-channel rounding tolerance)'}. Artifacts: ${artifacts}`);
}
async function mobile() {
  const folder = path.join(artifacts, 'mobile');
  fs.mkdirSync(folder, { recursive: true });
  const capture = (page, name) => page.screenshot({ animations: 'disabled', path: path.join(folder, name + '.png') });
  async function fits(page, label) {
    const problems = await page.evaluate(() => {
      const problems = [];
      if (document.documentElement.scrollWidth > innerWidth) problems.push(`Page overflow: ${document.documentElement.scrollWidth}/${innerWidth}`);
      for (const element of document.querySelectorAll('a, button, input, select, summary')) {
        if (element.classList.contains('skip-link') || !element.checkVisibility()) continue;
        const box = element.getBoundingClientRect();
        if (box.width && (box.left < -1 || box.right > innerWidth + 1)) problems.push(`Control offscreen: ${element.id || element.textContent.trim().slice(0, 40)} ${box.left}/${box.right}`);
      }
      return problems;
    });
    assert.deepEqual(problems, [], label);
  }
  for (const width of widths([320, 360, 390, 430, 767])) {
    for (const theme of ['dark', 'light']) {
      for (const name of ['index', 'assessment', 'hiw', 'history', 'privacy', 'terms']) {
        const { page, context, errors } = await open(width, theme, name, name === 'history', 844);
        await fits(page, `${name} ${width}px ${theme}`);
        if (width === 390) await capture(page, `${name}-${theme}`);
        if (name === 'index' || name === 'history') {
          const initialScroll = name === 'index' ? 260 : 0;
          await page.evaluate(top => scrollTo({ top, behavior: 'instant' }), initialScroll);
          const before = await page.evaluate(() => ({ scroll: scrollY, height: document.querySelector('.topnav').getBoundingClientRect().height, top: document.querySelector('.topnav').getBoundingClientRect().top }));
          assert.equal(before.top, 0, 'Phone header stays visible while reading');
          // Locator.click can auto-scroll a sticky button to its original flow
          // position. A real pointer tap tests scroll locking without that artifact.
          const menuBox = await page.locator('.nav-menu-toggle').boundingBox();
          await page.mouse.click(menuBox.x + menuBox.width / 2, menuBox.y + menuBox.height / 2);
          assert.equal(await page.locator('#mobile-navigation').evaluate(d => d.open), true);
          assert.equal(await page.evaluate(() => document.body.style.getPropertyValue('--mobile-nav-scroll-y')), -before.scroll + 'px', 'Drawer saves the original scroll');
          assert.equal(await page.locator('.topnav').evaluate(nav => nav.getBoundingClientRect().height), before.height);
          await fits(page, 'Open drawer');
          for (let i = 0; i < 12; i++) {
            await page.keyboard.press('Tab');
            assert.equal(await page.evaluate(() => document.querySelector('#mobile-navigation').contains(document.activeElement)), true, 'Drawer contains focus');
          }
          if (width === 390) await capture(page, `drawer-${name}-${theme}`);
          if (name === 'history') {
            await page.locator('.account-trigger').click();
            assert.equal(await page.locator('#mobile-navigation').evaluate(d => d.open), true);
            await fits(page, 'Account inside drawer');
            await page.keyboard.press('Escape');
            assert.equal(await page.locator('#account-panel').isVisible(), false);
            assert.equal(await page.locator('#mobile-navigation').evaluate(d => d.open), true);
          }
          await page.keyboard.press('Escape');
          assert.equal(await page.locator('#mobile-navigation').evaluate(d => d.open), false);
          assert.equal(await page.evaluate(() => scrollY), before.scroll, 'Drawer preserves scroll');
          assert.equal(await page.locator('.nav-menu-toggle').evaluate(e => e === document.activeElement), true);
          await page.locator('.nav-menu-toggle').click();
          await page.mouse.click(4, 400);
          assert.equal(await page.locator('#mobile-navigation').evaluate(d => d.open), false, 'Backdrop closes drawer');
          await page.locator('.nav-menu-toggle').click();
          await page.setViewportSize({ width: 768, height: 844 });
          await page.waitForFunction(() => !document.querySelector('#mobile-navigation').open);
          assert.equal(await page.locator('#mobile-navigation').evaluate(d => d.open), false);
          assert.equal(await page.evaluate(() => document.documentElement.classList.contains('mobile-nav-locked')), false);
          await page.setViewportSize({ width, height: 844 });
        }
        if (name === 'index') {
          await page.locator('.nav-menu-toggle').click();
          await page.locator('#mobile-navigation a[href="#assessment"]').click();
          assert.equal(await page.locator('#mobile-navigation').evaluate(d => d.open), false);
          await page.waitForFunction(() => document.querySelector('#assessment').getBoundingClientRect().top >= 63 && document.querySelector('#assessment').getBoundingClientRect().top < 90);
        }
        if (name === 'index' || name === 'assessment') {
          const next = page.locator('.mobile-assessment-next');
          const fillNumbers = async values => {
            for (const [id, value] of Object.entries(values)) await page.locator('#' + id).fill(value);
          };
          await next.click();
          assert.equal(await page.locator('#academicTerm-control').evaluate(e => e === document.activeElement), true);
          await page.locator('#academicTerm-control').click();
          await page.locator('#academicTerm-options [data-value="1st Sem"]').click();
          await next.click();
          assert.equal(await page.locator('form > .section:not([hidden]) h2').textContent(), 'Cellphone Usage');
          await fits(page, 'Phone usage step');
          if (width === 390) assert.ok((await next.boundingBox()).y + (await next.boundingBox()).height <= 844, 'Step 2 Next button fits without extra scrolling');
          if (width === 390) await capture(page, `step-2-${name}-${theme}`);
          await fillNumbers({ screenTime: '4', academicPhoneUse: '1', socialPhoneUse: '1' });
          await page.locator('#socialPhoneUse').press('Enter');
          assert.equal(await page.locator('form > .section:not([hidden]) h2').textContent(), 'Study Habits');
          await fillNumbers({ studyHours: '3', studyDays: '5' });
          await page.setViewportSize({ width: 768, height: 844 });
          await page.waitForFunction(() => !document.querySelector('#estimator-form').classList.contains('mobile-assessment'));
          assert.equal(await page.locator('form > .section:not([hidden])').count(), 3);
          assert.equal(await page.locator('#screenTime').inputValue(), '4');
          await page.locator('#studyHours').focus();
          await page.setViewportSize({ width, height: 844 });
          await page.waitForFunction(() => document.querySelector('#estimator-form').classList.contains('mobile-assessment'));
          assert.equal(await page.locator('form > .section:not([hidden]) h2').textContent(), 'Study Habits');
          await page.locator('#submit-btn').click();
          await page.locator('#save-status').waitFor();
          assert.equal(await page.locator('#estimator-form').isVisible(), false);
          assert.equal(await page.locator('#result-heading').evaluate(e => e === document.activeElement), true);
          await fits(page, 'Phone result');
          if (width === 390) {
            const editBox = await page.locator('.mobile-assessment-edit').boundingBox();
            assert.ok(editBox.y + editBox.height <= 844, 'Edit answers is reachable without extra scrolling');
          }
          if (width === 390) await capture(page, `result-${name}-${theme}`);
          await page.locator('.mobile-assessment-edit').click();
          assert.equal(await page.locator('#studyHours').inputValue(), '3');
          await page.locator('#reset-btn').click();
          assert.equal(await page.locator('#screenTime').inputValue(), '');
          assert.equal(await page.locator('#result-panel').isVisible(), false);
        }
        if (name === 'history') {
          await page.locator('#history-filter-toggle').click();
          await fits(page, 'History filters');
          await page.getByRole('button', { name: /view assessment from/i }).first().click();
          await fits(page, 'History details');
          const box = await page.locator('#history-detail').boundingBox();
          assert.ok(box.x >= 15 && box.x + box.width <= width - 15);
          await page.keyboard.press('Escape');
        }
        if (name === 'index') {
          await page.locator('.footer-legal a').first().click();
          await page.locator('.legal-dialog article').waitFor();
          await fits(page, 'Legal dialog');
          await page.keyboard.press('Escape');
        }
        assert.deepEqual(errors, [], `${name} mobile JS errors`);
        await context.close();
      }
    }
    console.log(`Mobile pages and interactions passed at ${width}px in both themes`);
  }
  // Short phone landscape viewport: controls and modal content must remain scrollable.
  const { page, context } = await open(744, 'dark', 'assessment', false, 390);
  await page.locator('.nav-menu-toggle').click();
  assert.equal(await page.locator('#mobile-navigation').evaluate(d => d.scrollHeight >= d.clientHeight), true);
  await page.keyboard.press('Escape');
  await fits(page, 'Phone landscape');
  await context.close();
  console.log(`Mobile browser checks passed. Screenshots: ${folder}`);
}
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browserServer = await chromium.launchServer({ executablePath: process.env.ACAD_BROWSER_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: true });
  browser = await chromium.connect(browserServer.wsEndpoint());
  if (mobileOnly) await mobile(); else await desktop();
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  console.log('Stopping the temporary test server and browser.');
  server.closeAllConnections(); server.close();
  // Terminate only this disposable browser server. Some Edge versions hang on
  // graceful shutdown after many isolated contexts on Windows.
  await browserServer?.kill();
  console.log('Browser test cleanup complete.');
});
