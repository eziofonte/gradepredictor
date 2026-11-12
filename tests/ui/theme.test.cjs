const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '../..');
const tick = () => new Promise(resolve => setImmediate(resolve));
async function setup(t, { reduced = false, storageBlocked = false, transition, savedTheme, page = 'index' } = {}) {
  const markup = fs.readFileSync(path.join(root, 'frontend/html', page + '.html'), 'utf8');
  const dom = new JSDOM(markup, { url: 'https://example.test', runScripts: 'outside-only' });
  t.after(() => dom.window.close()); await tick();
  const w = dom.window;
  w.matchMedia = () => ({ matches: reduced });
  if (savedTheme) w.localStorage.setItem('theme', savedTheme);
  if (storageBlocked) Object.defineProperty(w, 'localStorage', { get() { throw new Error('Storage is blocked'); } });
  const scrolls = [];
  w.scrollTo = position => scrolls.push(position);
  if (transition) w.document.startViewTransition = transition;
  w.eval(fs.readFileSync(path.join(root, 'frontend/js/theme-toggle.js'), 'utf8'));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  const toggle = w.document.querySelector('.theme-toggle input');
  const change = () => { toggle.checked = !toggle.checked; toggle.dispatchEvent(new w.Event('change')); };
  return { w, d: w.document, toggle, change, scrolls };
}

test('theme switch exposes checked state and applies light/dark themes even when storage is blocked', async t => {
  const { d, toggle, change } = await setup(t, { storageBlocked: true });
  assert.equal(d.documentElement.dataset.theme, 'dark');
  assert.equal(toggle.getAttribute('role'), 'switch');
  assert.equal(toggle.getAttribute('aria-checked'), 'false');
  assert.equal(toggle.hasAttribute('aria-pressed'), false);
  change();
  assert.equal(d.documentElement.dataset.theme, 'light');
  assert.equal(toggle.getAttribute('aria-checked'), 'true');
  assert.equal(toggle.getAttribute('aria-label'), 'Switch to dark theme');
  change();
  assert.equal(d.documentElement.dataset.theme, 'dark');
});

test('reduced motion applies the theme without starting a view transition', async t => {
  let calls = 0;
  const { d, change } = await setup(t, { reduced: true, transition: () => { calls++; } });
  change();
  assert.equal(calls, 0);
  assert.equal(d.documentElement.dataset.theme, 'light');
});

test('skipped transition animations are handled and preserve scroll after applying the theme', async t => {
  const { d, change, scrolls } = await setup(t, { transition: update => {
    update();
    return { ready: Promise.reject(new Error('Animation skipped')), finished: Promise.resolve() };
  }});
  change(); await tick();
  assert.equal(d.documentElement.dataset.theme, 'light');
  assert.equal(scrolls.length, 1);
  assert.equal(scrolls[0].behavior, 'instant');
});

test('a browser transition failure still applies the requested theme', async t => {
  const { d, change } = await setup(t, { transition: () => { throw new Error('Transition unavailable'); } });
  change();
  assert.equal(d.documentElement.dataset.theme, 'light');
  assert.equal(d.documentElement.hasAttribute('data-theme-transition'), false);
});

for (const page of ['index', 'assessment', 'hiw', 'history']) {
  test(`${page}: circular toggle restores and saves the theme preference`, async t => {
    const { w, d, toggle, change } = await setup(t, { page, savedTheme: 'light' });
    assert.equal(toggle.checked, true);
    assert.equal(toggle.getAttribute('aria-label'), 'Switch to dark theme');
    assert.equal(d.querySelectorAll('.theme-toggle').length, 1);
    assert.ok(d.querySelector('.theme-toggle-face[aria-hidden="true"] .theme-toggle-sun'));
    assert.ok(d.querySelector('.theme-toggle-moon'));
    change();
    assert.equal(d.documentElement.dataset.theme, 'dark');
    assert.equal(w.localStorage.getItem('theme'), 'dark');
    assert.equal(toggle.getAttribute('aria-checked'), 'false');
  });
}

test('circular transitions use the button center, cover the viewport and reject overlapping changes', async t => {
  let finish, calls = 0;
  const { w, d, toggle, change, scrolls } = await setup(t, { transition: update => {
    calls++;
    update();
    return { ready: Promise.resolve(), finished: new Promise(resolve => { finish = resolve; }) };
  }});
  d.querySelector('.theme-toggle').getBoundingClientRect = () => ({ left: 100, top: 200, width: 44, height: 44 });
  Object.defineProperty(w, 'scrollY', { value: 480 });
  change();
  assert.equal(d.documentElement.dataset.themeTransition, 'light');
  assert.equal(d.documentElement.style.getPropertyValue('--toggle-x'), '122px');
  assert.equal(d.documentElement.style.getPropertyValue('--toggle-y'), '222px');
  assert.equal(d.documentElement.style.getPropertyValue('--toggle-radius'), Math.ceil(Math.hypot(w.innerWidth - 122, w.innerHeight - 222)) + 'px');
  change();
  assert.equal(calls, 1);
  assert.equal(toggle.checked, true);
  finish(); await tick();
  assert.equal(d.documentElement.hasAttribute('data-theme-transition'), false);
  assert.ok(scrolls.every(position => position.top === 480));
  change();
  assert.equal(calls, 2);
  assert.equal(d.documentElement.dataset.themeTransition, 'dark');
  finish(); await tick();
});

test('a rejected transition releases the lock and still applies the theme', async t => {
  const { d, change } = await setup(t, { transition: () => ({
    ready: Promise.reject(new Error('Skipped')),
    finished: Promise.reject(new Error('Failed'))
  }) });
  change(); await tick();
  assert.equal(d.documentElement.dataset.theme, 'light');
  assert.equal(d.documentElement.hasAttribute('data-theme-transition'), false);
  change(); await tick();
  assert.equal(d.documentElement.dataset.theme, 'dark');
});
