const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const root = path.resolve(__dirname, '../..');
const tick = () => new Promise(resolve => setImmediate(resolve));
const reply = (records = [], total = records.length, status = 200) => ({ ok: status === 200, status, json: async () => status === 200 ? { results: records, pagination: { total, has_more: total > records.length } } : { error: 'Service unavailable' } });
const record = (id = 1) => ({ id, created_at: '2026-11-10T16:30:00Z', year_level: '2nd Year', academic_term: '1st Sem', program: 'BSIT', predicted_gwa: 2.15, performance_category: 'Good', daily_screen_time_hrs: 4, academic_app_usage_hrs: 0, social_media_hrs: 2, study_hours_per_day: 3, study_frequency_per_week: 5 });
function setup(t, { fetch = async () => reply([record()]), phone = false } = {}) {
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'frontend/html/history.html'), 'utf8'), { url: 'https://example.test/history.html', runScripts: 'outside-only', virtualConsole: new VirtualConsole() });
  t.after(() => dom.window.close());
  const w = dom.window, d = w.document;
  const media = new w.EventTarget(); media.matches = phone;
  w.matchMedia = () => media;
  w.fetch = fetch;
  w.AbortSignal = AbortSignal;
  w.authReady = Promise.resolve({ authenticated: true, user: { id: 42 }, csrf_token: 'csrf-test' });
  w.getFreshAuth = () => w.authReady;
  w.invalidateAuth = reason => { w.authInvalidated = true; w.dispatchEvent(new w.CustomEvent('auth:cleared', { detail: { reason, userId: '42' } })); };
  w.authHeaders = () => ({ 'X-CSRFToken': 'csrf-test', 'X-Expected-User': '42' });
  w.createMicrosoftSignIn = returnTo => { const link = d.createElement('a'); link.href = '/auth/login?next=' + encodeURIComponent(returnTo); link.textContent = 'Sign in with Microsoft'; return link; };
  d.querySelectorAll('dialog').forEach(dialog => {
    dialog.showModal = () => { dialog.setAttribute('open', ''); };
    dialog.close = () => { dialog.removeAttribute('open'); dialog.dispatchEvent(new w.Event('close')); };
  });
  const submit = () => d.querySelector('form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  w.eval(fs.readFileSync(path.join(root, 'frontend/js/history.js'), 'utf8'));
  return { w, d, media, submit };
}

test('the initial loading panel disappears once records are loaded', async t => {
  const { w, d } = setup(t);
  const stylesheet = d.createElement('style');
  stylesheet.textContent = fs.readFileSync(path.join(root, 'frontend/css/style.css'), 'utf8');
  d.head.append(stylesheet);
  await tick();
  const loading = d.querySelector('#history-empty');
  assert.equal(loading.hidden, true);
  assert.equal(w.getComputedStyle(loading).display, 'none');
  assert.equal(d.querySelector('#history-message').classList.contains('sr-only'), true);
  assert.equal(d.querySelector('#history-table').hidden, false);
});

test('23 records are shown in pages of 10 with next and previous navigation', async t => {
  const records = Array.from({ length: 23 }, (_, index) => record(index + 1));
  const { d } = setup(t, { fetch: async url => {
    const params = new URL(url, 'https://example.test').searchParams;
    const limit = Number(params.get('limit')), offset = Number(params.get('offset'));
    return { ok: true, status: 200, json: async () => ({ results: records.slice(offset, offset + limit), pagination: { total: records.length, has_more: offset + limit < records.length } }) };
  }});
  await tick();
  assert.equal(d.querySelectorAll('#history-table-body tr').length, 10);
  assert.equal(d.querySelector('#history-prev').disabled, true);
  d.querySelector('#history-next').click(); await tick();
  assert.equal(d.querySelectorAll('#history-table-body tr').length, 10);
  assert.equal(d.querySelector('[data-record-id]').dataset.recordId, '11');
  d.querySelector('#history-next').click(); await tick();
  assert.equal(d.querySelectorAll('#history-table-body tr').length, 3);
  assert.equal(d.querySelector('#history-next').disabled, true);
  d.querySelector('#history-prev').click(); await tick();
  assert.equal(d.querySelector('[data-record-id]').dataset.recordId, '11');
});

test('filter edits stay drafts; Apply resets pagination and uses API term values', async t => {
  const calls = [];
  const { w, d, submit } = setup(t, { fetch: async url => { calls.push(new URL(url, 'https://example.test')); return reply([record()], 30); } });
  await tick();
  d.querySelector('#history-next').click(); await tick();
  assert.equal(calls.at(-1).searchParams.get('offset'), '10');
  d.querySelector('#academic-term-filter').value = '1st Sem';
  d.querySelector('#academic-term-filter').dispatchEvent(new w.Event('change'));
  assert.equal(calls.length, 2);
  assert.equal(d.querySelector('#history-applied-filters').textContent, 'All assessments');
  submit(); await tick();
  assert.equal(calls.at(-1).searchParams.get('academic_term'), '1st Sem');
  assert.equal(calls.at(-1).searchParams.get('offset'), '0');
  assert.match(d.querySelector('#history-applied-filters').textContent, /1st Semester/);
  d.querySelector('#academic-term-filter').value = '2nd Sem';
  d.querySelector('#history-next').click(); await tick();
  assert.equal(calls.at(-1).searchParams.get('academic_term'), '1st Sem');
});

test('invalid inclusive date range is explained beside fields and never fetched; Reset clears both queries', async t => {
  const calls = [];
  const { d, submit } = setup(t, { fetch: async url => { calls.push(url); return reply([record()]); } });
  await tick();
  d.querySelector('#date-from').value = '2026-11-12'; d.querySelector('#date-to').value = '2026-11-11';
  submit();
  assert.equal(calls.length, 1);
  assert.equal(d.activeElement.id, 'date-to');
  assert.equal(d.querySelector('#history-date-error').hidden, false);
  d.querySelector('#date-to').value = '2026-11-12'; submit(); await tick();
  assert.match(calls.at(-1), /date_from=2026-11-12/);
  assert.match(calls.at(-1), /date_to=2026-11-12/);
  d.querySelector('#history-reset').click(); await tick();
  assert.doesNotMatch(calls.at(-1), /date_from|date_to/);
  assert.equal(d.querySelector('#date-from').value, '');
  assert.equal(d.querySelector('#history-applied-filters').textContent, 'All assessments');
});

test('typed dates outside the supported range are rejected before fetching history', async t => {
  const calls = [];
  const { d, submit } = setup(t, { fetch: async url => { calls.push(url); return reply([record()]); } });
  await tick();
  const from = d.querySelector('#date-from'), to = d.querySelector('#date-to');
  from.max = to.max = '2026-11-12';
  from.value = '2026-08-31';
  submit();
  assert.equal(calls.length, 1);
  assert.equal(d.activeElement, from);
  assert.match(d.querySelector('#history-date-error').textContent, /September 1, 2026/);
  from.value = '2026-09-01'; to.value = '2026-11-13';
  submit();
  assert.equal(calls.length, 1);
  assert.equal(d.activeElement, to);
  to.value = '2026-11-12'; submit(); await tick();
  assert.match(calls.at(-1), /date_from=2026-09-01/);
  assert.match(calls.at(-1), /date_to=2026-11-12/);
});

test('desktop table and phone cards expose one presentation; dates use Manila time and values are text', async t => {
  const sample = { ...record(), program: '<img src=x onerror=alert(1)>' };
  const { w, d, media } = setup(t, { fetch: async () => reply([sample]) });
  await tick();
  assert.equal(d.querySelectorAll('#history-table th').length, 5);
  assert.equal(d.querySelectorAll('[data-record-id]').length, 1);
  assert.match(d.querySelector('#history-table-body').textContent, /Nov 11, 2026/);
  assert.match(d.querySelector('#history-table-body').textContent, /12:30 AM/);
  assert.match(d.querySelector('#history-table-body').textContent, /2\.15/);
  assert.equal(d.querySelector('#history-table-body img'), null);
  d.querySelector('[data-record-id]').focus();
  media.matches = true; media.dispatchEvent(new w.Event('change'));
  assert.equal(d.querySelector('#history-table-body').children.length, 0);
  assert.equal(d.querySelector('#history-table').hidden, true);
  assert.equal(d.querySelectorAll('#history-cards article').length, 1);
  assert.equal(d.querySelectorAll('[data-record-id]').length, 1);
  assert.equal(d.activeElement.dataset.recordId, '1');
  assert.equal(d.querySelector('#history-filter-form').hidden, true);
  d.querySelector('#history-filter-toggle').click();
  assert.equal(d.querySelector('#history-filter-form').hidden, false);
});

test('View details retains every original input, including zero and missing values', async t => {
  const { d } = setup(t, { fetch: async () => reply([{ ...record(), program: null, social_media_hrs: null }]) });
  await tick();
  const action = d.querySelector('[data-record-id]'); action.click();
  assert.equal(d.querySelector('dialog').open, true);
  const values = [...d.querySelectorAll('#history-detail-fields dl > div')].map(item => item.textContent);
  assert.equal(values.length, 8);
  assert.ok(values.includes('Academic app usage0 hrs / day'));
  assert.ok(values.includes('Social media usage—'));
  assert.ok(values.includes('Program—'));
  assert.ok(values.includes('Study frequency5 days / week'));
  d.querySelector('#history-detail-close').click();
  assert.equal(d.activeElement, action);
});

test('out-of-order replies cannot overwrite the latest applied filters or count', async t => {
  const queued = [];
  const { d, submit } = setup(t, { fetch: url => new Promise(resolve => queued.push({ url, resolve })) });
  await tick(); queued[0].resolve(reply([record()])); await tick();
  d.querySelector('#year-level-filter').value = '1st Year'; submit(); await tick();
  d.querySelector('#year-level-filter').value = '2nd Year'; submit(); await tick();
  queued[2].resolve(reply([record(2)], 2)); await tick();
  queued[1].resolve(reply([record(1)], 8)); await tick();
  assert.match(d.querySelector('#history-count').textContent, /^2 matching/);
  assert.match(d.querySelector('#history-applied-filters').textContent, /2nd Year/);
  assert.equal(d.querySelector('[data-record-id]').dataset.recordId, '2');
});

test('refresh failure keeps the old records, count, range and applied summary together, then Retry recovers', async t => {
  let fail = false;
  const { d, submit } = setup(t, { fetch: async () => fail ? reply([], 0, 503) : reply([record()], 12) });
  await tick();
  fail = true;
  d.querySelector('#year-level-filter').value = '4th Year'; submit(); await tick();
  assert.match(d.querySelector('#history-message').textContent, /previously loaded/);
  assert.equal(d.querySelector('#history-applied-filters').textContent, 'All assessments');
  assert.match(d.querySelector('#history-count').textContent, /^12 saved/);
  assert.equal(d.querySelector('#history-page').textContent, '1–1 of 12');
  assert.equal(d.querySelectorAll('#history-table-body tr').length, 1);
  fail = false; d.querySelector('#history-message button').click(); await tick();
  assert.match(d.querySelector('#history-applied-filters').textContent, /4th Year/);
});

for (const status of [401, 409]) {
  test(`${status}: session/account changes clear records and open details before showing recovery`, async t => {
    let fail = false;
    const { w, d, submit } = setup(t, { fetch: async () => fail ? reply([], 0, status) : reply([record()]) });
    await tick(); d.querySelector('[data-record-id]').click(); fail = true; submit(); await tick();
    assert.equal(w.authInvalidated, true);
    assert.equal(d.querySelector('#history-table-body').textContent, '');
    assert.equal(d.querySelector('#history-detail-fields').textContent, '');
    assert.equal(d.querySelector('dialog').open, false);
    assert.match(d.querySelector('#history-empty').textContent, status === 401 ? /session has expired/ : /account changed/);
  });
}

test('initial failure, first empty visit, and no matches have distinct next actions', async t => {
  let status = 503;
  const { d, submit } = setup(t, { fetch: async () => reply([], 0, status) });
  await tick();
  assert.match(d.querySelector('#history-state').textContent, /couldn't load/);
  assert.ok(d.querySelector('#history-state button'));
  status = 200; d.querySelector('#history-state button').click(); await tick();
  assert.match(d.querySelector('#history-state').textContent, /No assessments yet/);
  assert.ok(d.querySelector('#history-state a'));
  assert.equal(d.querySelector('#history-manage').hidden, true);
  d.querySelector('#year-level-filter').value = '3rd Year'; submit(); await tick();
  assert.match(d.querySelector('#history-state').textContent, /No assessments match/);
  assert.equal(d.querySelector('#history-filter-panel').hidden, false);
  assert.equal(d.querySelector('#history-state button').textContent, 'Reset filters');
});

test('when a page disappears, the same applied query moves to the last valid page', async t => {
  const calls = [];
  const { d } = setup(t, { fetch: async url => {
    const offset = Number(new URL(url, 'https://example.test').searchParams.get('offset')); calls.push(offset);
    return offset ? reply([], 1) : reply([record()], calls.length === 1 ? 26 : 1);
  }});
  await tick(); d.querySelector('#history-next').click(); await tick(); await tick();
  assert.deepEqual(calls, [0, 10, 0]);
  assert.equal(d.querySelector('#history-page').textContent, '1–1 of 1');
  assert.equal(d.querySelector('#history-next').disabled, true);
});

test('single deletion confirmation identifies the record and Cancel returns to its details', async t => {
  const { w, d } = setup(t);
  w.confirm = () => { throw new Error('Browser confirmation must not be used'); };
  await tick(); d.querySelector('[data-record-id]').click();
  d.querySelector('#history-detail-delete').click();
  assert.equal(d.querySelector('#history-detail').open, false);
  assert.equal(d.querySelector('#history-confirm').open, true);
  assert.match(d.querySelector('#history-confirm-description').textContent, /Nov 11, 2026/);
  assert.match(d.querySelector('#history-confirm-description').textContent, /2\.15/);
  assert.equal(d.activeElement.id, 'history-confirm-cancel');
  d.querySelector('#history-confirm-cancel').click();
  assert.equal(d.querySelector('#history-confirm').open, false);
  assert.equal(d.querySelector('#history-detail').open, true);
  assert.equal(d.activeElement.id, 'history-detail-delete');
});

test('clear all warns about filters and backups and Escape returns focus', async t => {
  const { w, d } = setup(t);
  await tick();
  d.querySelector('#clear-btn').click();
  const modal = d.querySelector('#history-confirm');
  assert.match(d.querySelector('#history-confirm-description').textContent, /outside the current filters/);
  assert.match(d.querySelector('#history-confirm-retention').textContent, /30 days/);
  assert.equal(d.querySelector('#history-confirm-delete').textContent, 'Delete all assessments');
  modal.dispatchEvent(new w.Event('cancel', { cancelable: true }));
  assert.equal(modal.open, false);
  assert.equal(d.activeElement.id, 'clear-btn');
});

test('failed deletion keeps the record and dialog, blocks repetition, and supports a confirmed retry', async t => {
  let resolveDelete, deletes = 0, deleted = false;
  const { w, d } = setup(t, { fetch: async (url, options = {}) => {
    if (options.method === 'DELETE') {
      deletes++;
      if (deletes === 1) return await new Promise(resolve => { resolveDelete = resolve; });
      deleted = true; return reply([]);
    }
    return deleted ? reply([]) : reply([record()]);
  }});
  await tick(); d.querySelector('[data-record-id]').click(); d.querySelector('#history-detail-delete').click();
  const destructive = d.querySelector('#history-confirm-delete');
  destructive.click(); destructive.click();
  await tick();
  assert.equal(deletes, 1);
  assert.equal(destructive.disabled, true);
  assert.equal(d.querySelector('#history-confirm-cancel').disabled, true);
  d.querySelector('#history-confirm').dispatchEvent(new w.Event('cancel', { cancelable: true }));
  assert.equal(d.querySelector('#history-confirm').open, true);
  assert.equal(d.querySelectorAll('#history-table-body tr').length, 1);
  resolveDelete(reply([], 0, 503)); await tick();
  assert.equal(destructive.disabled, false);
  assert.equal(d.querySelector('#history-confirm-error').hidden, false);
  assert.equal(d.querySelectorAll('#history-table-body tr').length, 1);
  destructive.click(); await tick(); await tick();
  assert.equal(deletes, 2);
  assert.equal(d.querySelector('#history-confirm').open, false);
  assert.equal(d.querySelectorAll('#history-table-body tr').length, 0);
  assert.match(d.querySelector('#history-message').textContent, /Assessment deleted/);
  assert.equal(d.activeElement.id, 'history-title');
});

test('confirmed deletion remains acknowledged if refreshing the list fails', async t => {
  let deleted = false;
  const { d } = setup(t, { fetch: async (url, options = {}) => {
    if (options.method === 'DELETE') { deleted = true; return reply([]); }
    return deleted ? reply([], 0, 503) : reply([record()]);
  }});
  await tick(); d.querySelector('#clear-btn').click(); d.querySelector('#history-confirm-delete').click();
  await tick(); await tick();
  assert.match(d.querySelector('#history-message').textContent, /All assessments deleted/);
  assert.match(d.querySelector('#history-message').textContent, /previously loaded/);
});

test('account change clears private records and closes confirmation even during a pending delete', async t => {
  let finish;
  const { w, d } = setup(t, { fetch: async (url, options = {}) => options.method === 'DELETE' ? await new Promise(resolve => { finish = resolve; }) : reply([record()]) });
  await tick(); d.querySelector('#clear-btn').click(); d.querySelector('#history-confirm-delete').click();
  await tick();
  w.authInvalidated = true; w.dispatchEvent(new w.Event('auth:cleared')); w.dispatchEvent(new w.Event('auth:account-changed'));
  finish(reply([])); await tick();
  assert.equal(d.querySelector('#history-confirm').open, false);
  assert.equal(d.querySelector('#history-table-body').textContent, '');
  assert.match(d.querySelector('#history-empty').textContent, /account changed/);
});
