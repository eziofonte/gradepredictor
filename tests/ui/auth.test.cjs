const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const root = path.resolve(__dirname, '../..');
const script = fs.readFileSync(path.join(root, 'js/auth.js'), 'utf8');
const signedIn = { authenticated: true, user: { id: 42, name: 'SURNAME Very Long <img src=x onerror=alert(1)> Display Name' }, csrf_token: 'test-token' };
const guest = { authenticated: false, user: null, csrf_token: 'guest-token' };
const reply = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
const tick = () => new Promise(resolve => setImmediate(resolve));

function setup(t, { page = 'history', narrow = false, fetch = async () => reply(signedIn), url, channel } = {}) {
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'html', page + '.html'), 'utf8'), {
    url: url || 'https://example.test/' + page + '.html', runScripts: 'outside-only', virtualConsole: new VirtualConsole()
  });
  t.after(() => dom.window.close());
  const w = dom.window;
  const media = new w.EventTarget();
  media.matches = narrow;
  w.matchMedia = () => media;
  w.AbortSignal = AbortSignal;
  w.fetch = fetch;
  if (channel) w.BroadcastChannel = class { constructor() { return channel; } };
  w.eval(script);
  return { w, d: w.document, media };
}

for (const page of ['index', 'hiw', 'assessment', 'history']) {
  test(`${page}: guest sign-in, logo, correct return path and navigation`, async t => {
    const { w, d } = setup(t, { page, fetch: async () => reply(guest) });
    await w.authReady;
    const link = d.querySelector('.nav-actions .microsoft-signin');
    assert.equal(link.getAttribute('aria-label'), 'Sign in with Microsoft');
    assert.equal(link.querySelector('img').getAttribute('src'), '/assets/icons/microsoft.svg');
    assert.equal(new URL(link.href).searchParams.get('next'), page === 'index' ? '/' : `/${page}.html`);
    assert.equal(d.querySelectorAll('.nav-disclosure .nav-links a').length, 4);
    assert.equal(d.querySelector('.account-name'), null);
    const first = new w.MouseEvent('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(first);
    assert.equal(link.getAttribute('aria-busy'), 'true');
    const duplicate = new w.MouseEvent('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(duplicate);
    assert.equal(duplicate.defaultPrevented, true);
    w.dispatchEvent(new w.PageTransitionEvent('pageshow'));
    assert.equal(link.hasAttribute('aria-disabled'), false);
    for (const note of d.querySelectorAll('[data-guest-account-note]')) assert.equal(note.hidden, false);
  });
}

test('account preserves full name as text, closes with Escape, outside click and Tab departure', async t => {
  const { w, d } = setup(t);
  await w.authReady;
  const trigger = d.querySelector('.account-trigger');
  const panel = d.querySelector('#account-panel');
  assert.equal(d.querySelector('.account-full-name').textContent, signedIn.user.name.replace('SURNAME ', 'SURNAME, '));
  assert.equal(d.querySelector('.account-name').textContent, 'SURNAME');
  assert.equal(panel.querySelector('img'), null);
  assert.equal(d.querySelector('.account-mobile-label').textContent, 'SURNAME');
  assert.equal(panel.querySelector('a'), null);
  assert.equal(panel.querySelectorAll('.account-panel-actions button').length, 1);
  assert.equal(panel.querySelector('.account-panel-actions button').textContent, 'Sign out');
  assert.equal(panel.hidden, true);
  trigger.click();
  assert.equal(panel.hidden, false);
  panel.querySelector('button').focus();
  d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(panel.hidden, true);
  assert.equal(d.activeElement, trigger);
  trigger.click(); d.body.click(); assert.equal(panel.hidden, true);
  trigger.click(); panel.querySelector('button').focus();
  d.querySelector('.nav-links a').focus(); assert.equal(panel.hidden, true);
});

for (const [raw, surname, fullName] of [
  ['TALAVERA DWAYNE EZAIL M.', 'TALAVERA', 'TALAVERA, DWAYNE EZAIL M.'],
  ['TALAVERA, DWAYNE EZAIL M.', 'TALAVERA', 'TALAVERA, DWAYNE EZAIL M.'],
  ['DE LA CRUZ, JUAN P.', 'DE LA CRUZ', 'DE LA CRUZ, JUAN P.'],
  ['  PEÑA-SANTOS   MARIA  L.  ', 'PEÑA-SANTOS', 'PEÑA-SANTOS, MARIA L.'],
  ['TALAVERA', 'TALAVERA', 'TALAVERA'],
  ['', 'PLM student', 'PLM student']
]) {
  test(`profile formats surname-first name: ${raw || 'missing name'}`, async t => {
    const auth = { ...signedIn, user: { ...signedIn.user, name: raw } };
    const { w, d } = setup(t, { fetch: async () => reply(auth) });
    await w.authReady;
    assert.equal(d.querySelector('.account-name').textContent, surname);
    assert.equal(d.querySelector('.account-mobile-label').textContent, surname);
    assert.equal(d.querySelector('.account-full-name').textContent, fullName);
    assert.equal(d.querySelector('.account-trigger').getAttribute('aria-label'), 'Account: ' + fullName);
    assert.equal(auth.user.name, raw);
  });
}

test('the public shared stylesheet keeps desktop account controls compact', async t => {
  const { w, d } = setup(t);
  const sheet = d.createElement('style');
  sheet.textContent = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
  d.head.append(sheet);
  await w.authReady;
  const style = selector => w.getComputedStyle(d.querySelector(selector));
  assert.equal(style('.account-icon').width, '18px');
  assert.equal(style('.account-icon').height, '18px');
  assert.equal(style('.account-chevron').width, '12px');
  assert.equal(style('.account-mobile-label').display, 'none');
  assert.equal(style('.nav-menu-toggle').display, 'none');
  assert.equal(style('.account-trigger').maxWidth, '184px');
  assert.equal(style('.account-panel').position, 'absolute');
});

test('loading has a reserved busy state and sign-in after a guest result returns to the form', async t => {
  let complete;
  const { w, d } = setup(t, { page: 'index', fetch: () => new Promise(resolve => { complete = resolve; }) });
  assert.equal(d.querySelector('.account-slot').getAttribute('aria-busy'), 'true');
  complete(reply(guest)); await w.authReady;
  d.querySelector('#result-filled').classList.remove('hidden');
  const link = d.querySelector('.nav-actions .microsoft-signin');
  link.click();
  assert.equal(new URL(link.href).searchParams.get('next'), '/#assessment');
});

test('mobile menu moves theme switch, excludes simultaneous panels, and restores focus', async t => {
  const { w, d, media } = setup(t, { narrow: true });
  await w.authReady;
  const menu = d.querySelector('.nav-menu-toggle');
  const trigger = d.querySelector('.account-trigger');
  assert.ok(d.querySelector('.nav-disclosure .theme-toggle'));
  menu.click(); assert.equal(menu.getAttribute('aria-expanded'), 'true');
  trigger.click(); assert.equal(menu.getAttribute('aria-expanded'), 'false');
  menu.click(); assert.equal(d.querySelector('#account-panel').hidden, true);
  d.querySelector('.nav-links a').focus();
  d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(d.activeElement, menu);
  assert.equal(menu.getAttribute('aria-expanded'), 'false');
  media.matches = false; media.dispatchEvent(new w.Event('change'));
  assert.ok(d.querySelector('.nav-actions .theme-toggle'));
});

test('failed session lookup offers Retry and History recovers using the new auth promise', async t => {
  let sessionCalls = 0, resultCalls = 0;
  const { w, d } = setup(t, { fetch: async url => {
    if (url === '/auth/session') { sessionCalls++; return sessionCalls === 1 ? reply({}, 503) : reply(signedIn); }
    resultCalls++;
    return reply({ results: [], pagination: { total: 0, has_more: false } });
  }});
  w.eval(fs.readFileSync(path.join(root, 'js/history.js'), 'utf8'));
  await assert.rejects(w.authReady); await tick();
  assert.equal(d.querySelector('.microsoft-signin'), null);
  assert.match(d.querySelector('.account-unavailable').textContent, /Account unavailable/);
  d.querySelector('.account-unavailable button').click();
  await w.authReady; await tick();
  assert.equal(sessionCalls, 2); assert.equal(resultCalls, 1);
  assert.equal(d.querySelector('#history-content').classList.contains('hidden'), false);
});

test('guest History uses full Microsoft button and offers guest assessment', async t => {
  const { w, d } = setup(t, { fetch: async () => reply(guest) });
  w.eval(fs.readFileSync(path.join(root, 'js/history.js'), 'utf8'));
  await w.authReady; await tick();
  const state = d.querySelector('#history-empty');
  assert.match(state.textContent, /PLM school account/);
  assert.equal(state.querySelector('.microsoft-short-label'), null);
  assert.ok(state.querySelector('a[href="/#assessment"]'));
});

test('sign-out disables repetition, retains private data on failure, and clears on confirmed retry', async t => {
  let complete, logoutCalls = 0, logoutHeaders;
  const { w, d } = setup(t, { fetch: async (url, options) => {
    if (url === '/auth/session') return reply(signedIn);
    logoutCalls++; logoutHeaders = options.headers;
    if (logoutCalls === 1) return await new Promise(resolve => { complete = resolve; });
    return reply({ ok: true });
  }});
  await w.authReady;
  const tbody = d.querySelector('#history-table-body');
  tbody.innerHTML = '<tr><td>Private record</td></tr>';
  d.querySelector('.account-trigger').click();
  const logout = d.querySelector('.account-panel-actions button');
  logout.click(); logout.click();
  assert.equal(logoutCalls, 1); assert.equal(logout.disabled, true);
  assert.equal(logoutHeaders['X-CSRFToken'], signedIn.csrf_token);
  assert.equal(logoutHeaders['X-Expected-User'], '42');
  complete(reply({}, 503)); await tick();
  assert.match(tbody.textContent, /Private record/);
  assert.equal(logout.disabled, false);
  const feedback = d.querySelector('.account-feedback');
  assert.equal(feedback.hidden, false);
  feedback.querySelector('button').click(); await tick();
  assert.equal(logoutCalls, 2); assert.equal(w.authInvalidated, true);
  assert.equal(tbody.textContent, '');
});

test('late History responses cannot restore records after private content is cleared', async t => {
  let complete;
  const { w, d } = setup(t, { fetch: async url => url === '/auth/session' ? reply(signedIn) : await new Promise(resolve => { complete = resolve; }) });
  w.eval(fs.readFileSync(path.join(root, 'js/history.js'), 'utf8'));
  await w.authReady; await tick();
  w.dispatchEvent(new w.PageTransitionEvent('pagehide', { persisted: true }));
  complete(reply({ results: [{ id: 1, created_at: '2026-11-11T00:00:00Z', predicted_gwa: 2.15 }], pagination: { total: 1, has_more: false } }));
  await tick();
  assert.equal(d.querySelector('#history-table-body').textContent, '');
  assert.equal(d.querySelector('#history-content').classList.contains('hidden'), true);
});

test('another tab changing account clears private content and offers reload', async t => {
  const posted = [];
  const channel = { postMessage: message => posted.push(message) };
  const { w, d } = setup(t, { channel });
  await w.authReady;
  d.querySelector('#history-table-body').innerHTML = '<tr><td>Private record</td></tr>';
  let changed = false;
  w.addEventListener('auth:account-changed', () => { changed = true; });
  assert.equal(posted[0].id, '42');
  channel.onmessage({ data: { type: 'identity', id: '42' } });
  assert.equal(w.authInvalidated, undefined);
  channel.onmessage({ data: { type: 'identity', id: '99' } });
  assert.equal(w.authInvalidated, true);
  assert.equal(changed, true);
  assert.equal(d.querySelector('#history-table-body').textContent, '');
  assert.match(d.querySelector('.account-unavailable').textContent, /Account changed/);
  assert.equal(d.querySelector('.account-unavailable button').textContent, 'Reload');
});

test('confirmed sign-out notifies other tabs', async t => {
  const posted = [];
  const channel = { postMessage: message => posted.push(message) };
  const { w, d } = setup(t, { channel, fetch: async url => url === '/auth/session' ? reply(signedIn) : reply({ ok: true }) });
  await w.authReady;
  d.querySelector('.account-trigger').click();
  d.querySelector('.account-panel-actions button').click();
  await tick();
  assert.equal(posted.at(-1).type, 'signed-out');
  assert.equal(w.authInvalidated, true);
});
