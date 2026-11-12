const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const root = path.resolve(__dirname, '../..');
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

function setup(t, page) {
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'frontend/html', page + '.html'), 'utf8'), {
    url: 'https://example.test/' + page + '.html', runScripts: 'outside-only', virtualConsole: new VirtualConsole()
  });
  t.after(() => dom.window.close());
  const w = dom.window;
  w.eval(fs.readFileSync(path.join(root, 'frontend/js/how-it-works.js'), 'utf8'));
  const d = w.document;
  return { w, d, items: [...d.querySelectorAll('.how-works-item')], triggers: [...d.querySelectorAll('.how-works-item summary')] };
}

for (const page of ['index', 'hiw']) {
  test(`${page}: How It Works starts collapsed and keeps all explanation content available`, t => {
    const { d, items } = setup(t, page);
    assert.equal(items.length, 4);
    assert.deepEqual(items.map(item => item.open), [false, false, false, false]);
    assert.equal(items[0].querySelectorAll('li').length, 5);
    assert.deepEqual([...d.querySelectorAll('.how-works-bands dd')].map(el => el.textContent), ['1.00–1.75', '1.76–2.50', '2.51–3.00', '3.01–5.00']);
    assert.match(items[3].textContent, /synthetic data/);
    assert.match(items[3].textContent, /not an official grade/);
    assert.ok(d.getElementById(d.querySelector('#how-it-works').getAttribute('aria-labelledby')));
  });

  test(`${page}: opening another explanation closes the previous one and allows all to collapse`, async t => {
    const { d, items, triggers } = setup(t, page);
    // Exercise the fallback used by browsers without native exclusive groups.
    items.forEach(item => item.removeAttribute('name'));
    const unrelated = d.createElement('details');
    unrelated.open = true; d.body.append(unrelated);
    await tick();
    triggers[0].click(); await tick(); await tick();
    assert.deepEqual(items.map(item => item.open), [true, false, false, false]);
    triggers[1].click(); await tick(); await tick();
    assert.deepEqual(items.map(item => item.open), [false, true, false, false]);
    triggers[1].click(); await tick();
    assert.equal(items.some(item => item.open), false);
    assert.equal(unrelated.open, true);
  });

  test(`${page}: arrow keys wrap focus, Home/End work, and Tab keeps native behavior`, t => {
    const { w, d, items, triggers } = setup(t, page);
    const key = value => d.activeElement.dispatchEvent(new w.KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true }));
    triggers[0].focus(); key('ArrowUp'); assert.equal(d.activeElement, triggers[3]);
    key('ArrowDown'); assert.equal(d.activeElement, triggers[0]);
    key('End'); assert.equal(d.activeElement, triggers[3]);
    key('Home'); assert.equal(d.activeElement, triggers[0]);
    const tab = new w.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    triggers[0].dispatchEvent(tab); assert.equal(tab.defaultPrevented, false);
    assert.deepEqual(items.map(item => item.open), [false, false, false, false]);
  });
}
