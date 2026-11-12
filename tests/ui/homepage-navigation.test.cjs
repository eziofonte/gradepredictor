const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { installMedia } = require('./media.cjs');
const root = path.resolve(__dirname, '../..');

async function setup(t, url, reducedMotion = false) {
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'frontend/html/index.html'), 'utf8'), {
    url, runScripts: 'outside-only',
  });
  t.after(() => dom.window.close());
  await new Promise(resolve => setImmediate(resolve));
  const w = dom.window, scrolls = [], timers = new Map();
  installMedia(w, 1440, reducedMotion);
  w.requestAnimationFrame = () => 1;
  w.scrollTo = options => scrolls.push({ id: 'top', ...options });
  w.HTMLElement.prototype.scrollIntoView = function (options) { scrolls.push({ id: this.id, ...options }); };
  w.setTimeout = callback => { const id = timers.size + 1; timers.set(id, callback); return id; };
  w.clearTimeout = id => timers.delete(id);
  w.eval(fs.readFileSync(path.join(root, 'frontend/js/homepage-navigation.js'), 'utf8'));
  w.dispatchEvent(new w.Event('load'));
  return { w, scrolls, timers, finish: () => { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach(callback => callback()); } };
}

test('History guest arrival shows the homepage before smoothly scrolling to assessment', async t => {
  const { w, scrolls, timers, finish } = await setup(t, 'https://example.test/?scroll=assessment');
  assert.equal(scrolls.length, 1);
  assert.equal(scrolls[0].id, 'top');
  assert.equal(scrolls[0].behavior, 'instant');
  assert.equal(w.location.hash, '');
  assert.equal(timers.size, 1);
  finish();
  assert.equal(scrolls.at(-1).id, 'assessment');
  assert.equal(scrolls.at(-1).behavior, 'smooth');
  assert.equal(w.location.hash, '#assessment');
  assert.equal(w.location.search, '');
});

test('reduced motion skips the delay and scroll animation', async t => {
  const { scrolls, timers } = await setup(t, 'https://example.test/?scroll=assessment', true);
  assert.equal(timers.size, 0);
  assert.equal(scrolls.at(-1).id, 'assessment');
  assert.equal(scrolls.at(-1).behavior, 'instant');
});

test('user interaction cancels the pending arrival scroll and removes the one-time request', async t => {
  const { w, scrolls, timers, finish } = await setup(t, 'https://example.test/?scroll=assessment&keep=1');
  w.dispatchEvent(new w.Event('pointerdown'));
  assert.equal(timers.size, 0);
  finish();
  assert.equal(scrolls.length, 1);
  assert.equal(w.location.search, '?keep=1');
  assert.equal(w.location.hash, '');
});

test('existing assessment deep links retain immediate alignment', async t => {
  const { scrolls, timers } = await setup(t, 'https://example.test/index.html#assessment');
  assert.equal(timers.size, 0);
  assert.equal(scrolls.at(-1).id, 'assessment');
  assert.equal(scrolls.at(-1).behavior, 'instant');
});

test('ordinary homepage visits do not automatically scroll', async t => {
  const { scrolls, timers } = await setup(t, 'https://example.test/');
  assert.equal(scrolls.length, 0);
  assert.equal(timers.size, 0);
});
