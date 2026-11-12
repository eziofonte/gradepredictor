const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'frontend/js/history-calendar.js'), 'utf8');

function setup(t, { nativeOnly = false, value = '2026-11-12', now = '2026-11-12T04:00:00Z' } = {}) {
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'frontend/html/history.html'), 'utf8'), {
    url: 'https://example.test/history.html', runScripts: 'outside-only',
  });
  t.after(() => dom.window.close());
  const w = dom.window, d = w.document;
  const NativeDate = w.Date;
  w.Date = class extends NativeDate {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return new NativeDate(now).getTime(); }
  };
  const matches = w.HTMLElement.prototype.matches;
  w.HTMLElement.prototype.matches = function (selector) {
    return selector === ':popover-open' ? this.hasAttribute('data-test-open') : matches.call(this, selector);
  };
  if (!nativeOnly) {
    w.HTMLElement.prototype.showPopover = function () { this.setAttribute('data-test-open', ''); this.dispatchEvent(new w.Event('toggle')); };
    w.HTMLElement.prototype.hidePopover = function () { this.removeAttribute('data-test-open'); this.dispatchEvent(new w.Event('toggle')); };
  }
  w.HTMLElement.prototype.checkVisibility = () => true;
  d.querySelector('#date-from').value = value;
  w.eval(source);
  const calendar = d.querySelector('#history-calendar');
  const toggle = id => d.querySelector(`#${id}`).parentElement.querySelector('button');
  const press = key => d.activeElement.dispatchEvent(new w.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  return { w, d, calendar, toggle, press, setNow: value => { now = value; } };
}

test('opens the selected month with Sunday-first headings and neighboring days', t => {
  const { d, calendar, toggle } = setup(t);
  toggle('date-from').click();
  assert.equal(calendar.querySelector('h2').textContent, 'November 2026');
  assert.equal(calendar.querySelector('th').textContent, 'Su');
  assert.equal(calendar.querySelectorAll('[data-date]').length, 35);
  assert.equal(calendar.querySelectorAll('.history-calendar-outside').length, 5);
  assert.equal(calendar.querySelector('[aria-selected="true"] button').dataset.date, '2026-11-12');
  assert.equal(d.activeElement.dataset.date, '2026-11-12');
});

test('selecting a day changes only its field, emits change, and restores trigger focus', t => {
  const { d, calendar, toggle } = setup(t);
  let changes = 0;
  d.querySelector('#date-from').addEventListener('change', () => changes++);
  toggle('date-from').click();
  calendar.querySelector('[data-date="2026-11-10"]').click();
  assert.equal(d.querySelector('#date-from').value, '2026-11-10');
  assert.equal(d.querySelector('#date-to').value, '');
  assert.equal(changes, 1);
  assert.equal(calendar.matches(':popover-open'), false);
  assert.equal(d.activeElement, toggle('date-from'));
});

test('month arrows handle year changes and leap years', t => {
  const { calendar, toggle } = setup(t, { value: '2027-12-31', now: '2028-03-10T04:00:00Z' });
  toggle('date-from').click();
  calendar.querySelector('[data-month="1"]').click();
  assert.equal(calendar.querySelector('h2').textContent, 'January 2028');
  calendar.querySelector('[data-month="1"]').click();
  assert.equal(calendar.querySelector('h2').textContent, 'February 2028');
  assert.ok(calendar.querySelector('[data-date="2028-02-29"]:not(:disabled)'));
  calendar.querySelector('[data-month="-1"]').click();
  assert.equal(calendar.querySelector('h2').textContent, 'January 2028');
});

test('keyboard navigation crosses months and clamps PageDown to the last valid day', t => {
  const { d, calendar, toggle, press } = setup(t, { value: '2028-01-31', now: '2028-03-10T04:00:00Z' });
  toggle('date-from').click();
  press('PageDown');
  assert.equal(d.activeElement.dataset.date, '2028-02-29');
  press('ArrowRight');
  assert.equal(d.activeElement.dataset.date, '2028-03-01');
  press('Home');
  assert.equal(d.activeElement.dataset.date, '2028-02-27');
  press('End');
  assert.equal(d.activeElement.dataset.date, '2028-03-04');
  assert.equal(calendar.querySelectorAll('[tabindex="0"]').length, 1);
});

test('switching date fields, Escape, and later value changes keep the selection in sync', t => {
  const { d, calendar, toggle, press } = setup(t);
  toggle('date-from').click();
  press('Escape');
  assert.equal(calendar.matches(':popover-open'), false);
  assert.equal(d.activeElement, toggle('date-from'));
  d.querySelector('#date-to').value = '2026-10-15';
  toggle('date-to').click();
  assert.equal(calendar.querySelector('h2').textContent, 'October 2026');
  assert.equal(calendar.querySelector('#history-calendar-label').textContent, 'To date');
  calendar.querySelector('[data-date="2026-10-16"]').click();
  assert.equal(d.querySelector('#date-from').value, '2026-11-12');
  assert.equal(d.querySelector('#date-to').value, '2026-10-16');
});

test('native fields remain usable without popover support and disabled fields stay closed', t => {
  const native = setup(t, { nativeOnly: true });
  assert.equal(native.calendar, null);
  assert.equal(native.d.querySelector('#date-from').type, 'date');
  assert.equal(native.d.querySelector('#date-from').min, '2026-09-01');
  assert.equal(native.d.querySelector('#date-from').max, '2026-11-12');
  const enhanced = setup(t);
  enhanced.d.querySelector('#date-from').disabled = true;
  enhanced.toggle('date-from').click();
  assert.equal(enhanced.calendar.matches(':popover-open'), false);
});

test('September boundary disables earlier days, month navigation, and keyboard movement', t => {
  const { d, calendar, toggle, press } = setup(t, { value: '2026-09-01' });
  toggle('date-from').click();
  assert.equal(calendar.querySelector('[data-month="-1"]').disabled, true);
  assert.equal(calendar.querySelector('[data-date="2026-08-31"]').disabled, true);
  for (const key of ['ArrowLeft', 'ArrowUp', 'Home', 'PageUp']) {
    press(key);
    assert.equal(d.activeElement.dataset.date, '2026-09-01');
  }
  calendar.querySelector('[data-date="2026-08-31"]').click();
  assert.equal(d.querySelector('#date-from').value, '2026-09-01');
});

test('today is selectable while future dates and months are disabled', t => {
  const { d, calendar, toggle, press } = setup(t);
  toggle('date-from').click();
  assert.equal(calendar.querySelector('[data-date="2026-11-12"]').disabled, false);
  assert.equal(calendar.querySelector('[data-date="2026-11-13"]').disabled, true);
  assert.equal(calendar.querySelector('[data-month="1"]').disabled, true);
  for (const key of ['ArrowRight', 'ArrowDown', 'End', 'PageDown']) {
    press(key);
    assert.equal(d.activeElement.dataset.date, '2026-11-12');
  }
  calendar.querySelector('[data-date="2026-11-13"]').click();
  assert.equal(d.querySelector('#date-from').value, '2026-11-12');
});

test('date limits advance at Philippine midnight when the picker is reopened', t => {
  const { d, calendar, toggle, press, setNow } = setup(t, { now: '2026-11-12T15:59:00Z' });
  toggle('date-from').click();
  press('Escape');
  setNow('2026-11-12T16:01:00Z');
  toggle('date-from').click();
  assert.equal(d.querySelector('#date-from').max, '2026-11-13');
  assert.equal(d.querySelector('#date-to').max, '2026-11-13');
  assert.equal(calendar.querySelector('[data-date="2026-11-13"]').disabled, false);
});
