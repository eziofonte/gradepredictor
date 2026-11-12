// Focused real-browser checks; all accounts, cookies and API records are fictitious.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright-core');
const root = path.resolve(__dirname, '../../frontend');
const origin = 'https://acad-perf.test';
const artifacts = process.env.ACAD_UI_ARTIFACTS || path.join(os.tmpdir(), 'acad-perf-resume-qa');
const draftKey = owner => 'acad-perf:assessment-draft:v1:' + owner;
const entryPointsOnly = process.argv.includes('--entry-points-only');
const prediction = { predicted_gwa: 2.15, performance_category: 'Good', suggestions: [] };
const answers = { yearLevel: '2nd Year', academicTerm: '1st Sem', program: 'BSIT', screenTime: '0', academicPhoneUse: '1', socialPhoneUse: '2', studyHours: '3', studyDays: '5' };

async function installMock(context, { loseFirstResponse = false } = {}) {
  const submissions = new Map(), ids = [], logins = [];
  let flow;
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin !== origin) {
      if (url.hostname === 'cdn.tailwindcss.com') return route.fulfill({ contentType: 'text/javascript', body: 'window.tailwind = {};' });
      return route.abort();
    }
    const authenticated = /(?:^|;\s*)session=ordinary(?:;|$)/.test(req.headers().cookie || '');
    if (url.pathname === '/auth/session') return route.fulfill({ json: { authenticated, user: authenticated ? { id: 42, name: 'TEST, Student' } : null, csrf_token: 'browser-test-csrf' } });
    if (url.pathname === '/auth/login') {
      assert.equal(req.method(), 'GET');
      flow = { next: url.searchParams.get('next') };
      logins.push(flow);
      return route.fulfill({ status: 302, headers: { location: '/auth/callback' } });
    }
    if (url.pathname === '/auth/callback') {
      const duration = 28800;
      flow.expiresAt = Date.now() / 1000 + duration;
      return route.fulfill({ status: 302, headers: { location: flow.next, 'set-cookie': `session=ordinary; Path=/; Max-Age=${duration}; HttpOnly; Secure; SameSite=Lax` } });
    }
    if (url.pathname === '/auth/logout') {
      assert.equal(req.method(), 'POST');
      assert.equal(req.headers()['x-expected-user'], '42');
      return route.fulfill({ json: { ok: true }, headers: { 'set-cookie': 'session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax' } });
    }
    if (url.pathname === '/results') return route.fulfill({ json: { results: [], pagination: { total: 0, has_more: false } } });
    if (url.pathname === '/predict') {
      const data = req.postDataJSON();
      assert.equal(req.headers()['x-expected-user'], authenticated ? '42' : 'guest');
      if (data.submission_id) {
        ids.push(data.submission_id);
        submissions.set(data.submission_id, data);
      }
      if (loseFirstResponse && ids.length === 1) return route.abort('failed');
      return route.fulfill({ json: { ...prediction, saved: authenticated, assessment_id: authenticated ? 1 : undefined } });
    }
    let relative = url.pathname === '/' ? '/html/index.html' : url.pathname;
    if (/^\/[^/]+\.html$/.test(relative)) relative = '/html' + relative;
    const file = path.resolve(root, '.' + relative);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
    const contentType = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' }[path.extname(file)] || 'application/octet-stream';
    return route.fulfill({ body: fs.readFileSync(file), contentType });
  });
  return { submissions, ids, logins };
}
async function ready(page, name = 'assessment') {
  await page.goto(origin + '/' + name + '.html');
  await page.evaluate(async () => { await window.authReady; await document.fonts.ready; });
}
async function fill(page, width, hours = '3') {
  for (const id of ['yearLevel', 'academicTerm', 'program']) await page.locator('#' + id).selectOption(answers[id], { force: true });
  if (width < 768) await page.locator('.mobile-assessment-next').click();
  for (const id of ['screenTime', 'academicPhoneUse', 'socialPhoneUse']) await page.locator('#' + id).fill(answers[id]);
  if (width < 768) await page.locator('.mobile-assessment-next').click();
  await page.locator('#studyHours').fill(hours);
  await page.locator('#studyDays').fill('5');
}
async function draftIs(page, owner, hours) {
  await page.waitForFunction(({ key, hours }) => JSON.parse(localStorage.getItem(key) || 'null')?.values.studyHours === hours, { key: draftKey(owner), hours });
}
async function fits(page) {
  const issues = await page.evaluate(() => {
    const problems = [];
    if (document.documentElement.scrollWidth > innerWidth) problems.push('horizontal overflow');
    return problems;
  });
  assert.deepEqual(issues, []);
}

(async () => {
  fs.mkdirSync(artifacts, { recursive: true });
  const browserServer = await chromium.launchServer({ host: '127.0.0.1', executablePath: process.env.ACAD_BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, timeout: 20000 });
  try {
    const browser = await chromium.connect(browserServer.wsEndpoint(), { timeout: 20000 });
    for (const width of entryPointsOnly ? [] : [320, 390, 1024]) for (const theme of ['dark', 'light']) {
      const options = { viewport: { width, height: 900 }, reducedMotion: 'reduce', timezoneId: 'Asia/Manila', locale: 'en-PH' };
      let context = await browser.newContext(options);
      await context.addInitScript(theme => { try { localStorage.setItem('theme', theme); } catch { /* about:blank has no storage origin. */ } }, theme);
      let mock = await installMock(context);
      let page = await context.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await ready(page, 'index');
      await fill(page, width);
      await draftIs(page, 'guest', '3');
      const timestamp = await page.evaluate(key => JSON.parse(localStorage.getItem(key)).updatedAt, draftKey('guest'));
      await ready(page);
      await page.waitForFunction(() => document.getElementById('studyHours').value === '3');
      assert.equal(await page.locator('#screenTime').inputValue(), '0');
      assert.match(await page.locator('#program-control').textContent(), /BSIT/);
      if (width < 768) assert.equal(await page.locator('#estimator-form').getAttribute('data-mobile-step'), '3');
      assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).updatedAt, draftKey('guest')), timestamp);
      await page.locator('#reset-btn').click();
      await page.reload();
      await page.evaluate(() => window.authReady);
      assert.equal(await page.locator('#studyHours').inputValue(), '');
      assert.equal(await page.evaluate(key => localStorage.getItem(key), draftKey('guest')), null);
      await fill(page, width, '9');
      await draftIs(page, 'guest', '9');
      if (width < 1200) await page.locator('.nav-menu-toggle').click();
      await page.locator('.account-controls .microsoft-signin').click();
      await page.waitForFunction(() => !!document.querySelector('.account-trigger'));
      assert.equal(await page.locator('#signin-dialog').count(), 0);
      assert.equal(mock.logins.length, 1);
      assert.equal(mock.logins[0].next, '/assessment.html');
      await fits(page);
      await page.screenshot({ path: path.join(artifacts, `assessment-${width}-${theme}.png`) });
      assert.equal(await page.locator('#studyHours').inputValue(), '', 'guest answers stay separate');
      const cookie = (await context.cookies()).find(item => item.name === 'session');
      assert.ok(cookie.httpOnly && cookie.secure && cookie.sameSite === 'Lax');
      assert.ok(Math.abs(cookie.expires - mock.logins[0].expiresAt) < 1);
      await fill(page, width, '4');
      await draftIs(page, 'user:42', '4');
      const state = await context.storageState();
      await context.close();
      context = await browser.newContext({ ...options, storageState: state });
      mock = await installMock(context);
      page = await context.newPage();
      page.on('pageerror', e => errors.push(e.message));
      await ready(page);
      await page.waitForFunction(() => document.getElementById('studyHours').value === '4');
      assert.equal(await page.locator('.account-trigger').count(), 1);
      const otherTab = await context.newPage();
      otherTab.on('pageerror', e => errors.push(e.message));
      await ready(otherTab);
      await otherTab.waitForFunction(() => document.getElementById('studyHours').value === '4');
      await ready(page, 'history');
      if (width < 1200) await page.locator('.nav-menu-toggle').click();
      await page.locator('.account-trigger').click();
      await page.locator('.account-panel-actions button').click();
      await page.waitForFunction(() => !!document.querySelector('.microsoft-signin'));
      await otherTab.waitForFunction(() => window.authInvalidated === true);
      assert.equal(await otherTab.locator('#studyHours').inputValue(), '');
      assert.equal(await page.evaluate(key => localStorage.getItem(key), draftKey('user:42')), null);
      await page.waitForFunction(() => document.getElementById('studyHours').value === '9');
      assert.deepEqual(errors, []);
      await context.close();
      console.log(`${width}px ${theme}: drafts across pages/restart, separate identities, direct sign-in, cookie persistence and cross-tab sign-out passed`);
    }
    if (!entryPointsOnly) {
      const context = await browser.newContext({ viewport: { width: 390, height: 900 }, reducedMotion: 'reduce' });
      await context.addCookies([{ name: 'session', value: 'ordinary', url: origin, httpOnly: true, secure: true, sameSite: 'Lax', expires: Date.now() / 1000 + 28800 }]);
      const mock = await installMock(context, { loseFirstResponse: true });
      const page = await context.newPage();
      await ready(page); await fill(page, 390);
      await page.locator('#submit-btn').click();
      await page.locator('#assessment-message').waitFor({ state: 'visible' });
      assert.equal(mock.submissions.size, 1);
      await page.reload();
      await page.waitForFunction(() => document.getElementById('studyHours').value === '3');
      await page.locator('#submit-btn').click();
      await page.locator('#save-status').waitFor({ state: 'visible' });
      assert.equal(mock.ids.length, 2);
      assert.equal(mock.ids[0], mock.ids[1]);
      assert.equal(mock.submissions.size, 1);
      assert.equal(await page.evaluate(key => localStorage.getItem(key), draftKey('user:42')), null);
      await context.close();
      console.log(`Lost-response reload/retry preserved the submission ID and one saved record. Screenshots: ${artifacts}`);
    }
    for (const source of ['history', 'guest-result']) {
      const context = await browser.newContext({ viewport: { width: 390, height: 900 }, reducedMotion: 'reduce' });
      const mock = await installMock(context);
      const page = await context.newPage();
      await ready(page, source === 'history' ? 'history' : 'assessment');
      let trigger;
      if (source === 'history') trigger = page.locator('#history-empty .microsoft-signin');
      else {
        await fill(page, 390);
        await page.locator('#submit-btn').click();
        trigger = page.locator('#save-status .microsoft-signin');
      }
      await trigger.click();
      await page.waitForFunction(() => !!document.querySelector('.account-trigger'));
      assert.equal(await page.locator('#signin-dialog').count(), 0);
      assert.equal(mock.logins.length, 1);
      assert.equal(mock.logins[0].next, source === 'history' ? '/history.html' : '/assessment.html');
      await context.close();
    }
    console.log('History recovery and guest-result links sign in directly with the correct return target.');
  } finally {
    // Edge can hang on graceful close, and Playwright's Windows taskkill tree
    // cleanup is slow in restricted environments. Terminate only our own child.
    const child = browserServer.process();
    if (child.exitCode === null && child.signalCode === null) {
      const stopped = new Promise(resolve => child.once('exit', resolve));
      child.kill('SIGKILL');
      await stopped;
    }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
