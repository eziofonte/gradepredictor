const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { installMedia } = require('./media.cjs');
const root = path.resolve(__dirname, '../..');
const tick = () => new Promise(resolve => setImmediate(resolve));
const prediction = { predicted_gwa: 2.15, performance_category: 'Good', suggestions: ['Plan study breaks.'], saved: false };
const response = (data = prediction, status = 200) => ({ ok: status === 200, status, json: async () => data });
async function setup(t, { page = 'index', fetch = async () => response(), width = 1440 } = {}) {
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'frontend/html', page + '.html'), 'utf8'), { url: `https://example.test/${page}.html`, runScripts: 'outside-only', virtualConsole: new VirtualConsole() });
  t.after(() => dom.window.close());
  const w = dom.window, d = w.document;
  await tick();
  const resize = installMedia(w, width);
  w.AbortSignal = AbortSignal;
  w.fetch = fetch;
  w.authReady = Promise.resolve({ authenticated: false, csrf_token: 'test' });
  w.getFreshAuth = () => w.authReady;
  w.authHeaders = () => ({ 'X-Expected-User': 'guest', 'X-CSRFToken': 'test' });
  w.createMicrosoftSignIn = () => { const link = d.createElement('a'); link.textContent = 'Sign in with Microsoft'; return link; };
  w.eval(fs.readFileSync(path.join(root, 'frontend/js/assessment.js'), 'utf8'));
  w.eval(fs.readFileSync(path.join(root, 'frontend/js/custom-select.js'), 'utf8'));
  d.dispatchEvent(new w.Event('DOMContentLoaded'));
  function fill() {
    for (const [id, value] of Object.entries({ academicTerm: '1st Sem', screenTime: '4', academicPhoneUse: '1', socialPhoneUse: '1', studyHours: '3', studyDays: '5' })) {
      d.getElementById(id).value = value;
      d.getElementById(id).dispatchEvent(new w.Event('input', { bubbles: true }));
    }
  }
  const submit = () => d.querySelector('form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  const key = (item, name) => item.dispatchEvent(new w.KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }));
  return { w, d, fill, submit, key, resize };
}

for (const page of ['index', 'assessment']) {
  test(`${page}: field descriptions include units and help and invalid state clears on Reset`, async t => {
    const { w, d } = await setup(t, { page });
    const input = d.getElementById('academicPhoneUse');
    const ids = input.getAttribute('aria-describedby').split(' ');
    assert.ok(ids.includes('academicPhoneUse-hint'));
    assert.ok(ids.includes('academicPhoneUse-units'));
    assert.ok(ids.includes('academicPhoneUse-error'));
    assert.ok(ids.every(id => d.getElementById(id)));
    input.value = '-1'; input.dispatchEvent(new w.Event('input'));
    assert.equal(input.getAttribute('aria-invalid'), 'true');
    d.getElementById('reset-btn').click(); await tick();
    assert.equal(input.hasAttribute('aria-invalid'), false);
  });

  test(`${page}: keyboard dropdown selection and Reset keep every displayed value in sync`, async t => {
    const { d, key } = await setup(t, { page });
    const term = d.getElementById('academicTerm-control');
    term.focus(); key(term, 'ArrowDown'); key(term, 'ArrowDown'); key(term, 'Enter');
    assert.equal(d.getElementById('academicTerm').value, '2nd Sem');
    assert.match(term.textContent, /2nd Sem/);
    assert.equal(term.getAttribute('aria-expanded'), 'false');
    const year = d.getElementById('yearLevel-control');
    key(year, 'ArrowUp'); key(year, 'Enter');
    assert.equal(d.getElementById('yearLevel').value, '4th Year');
    const program = d.getElementById('program-control');
    key(program, 'ArrowDown'); key(program, 'ArrowDown'); key(program, 'Enter');
    assert.equal(d.getElementById('program').value, 'BSCS');
    d.getElementById('reset-btn').click(); await tick();
    assert.equal(d.getElementById('academicTerm').value, '');
    assert.equal(d.getElementById('yearLevel').value, '');
    assert.equal(d.getElementById('program').value, '');
    assert.match(year.textContent, /Select year level/);
    assert.match(program.textContent, /Select program/);
    assert.match(term.textContent, /Select term/);
    assert.equal(d.querySelector('label[for="academicTerm-control"]').id, 'academicTerm-label');
  });

  test(`${page}: pointer selection survives focus changes and saves each dropdown value`, async t => {
    const { w, d } = await setup(t, { page });
    for (const [id, index, expected] of [
      ['yearLevel', 1, '2nd Year'], ['academicTerm', 0, '1st Sem'], ['program', 1, 'BSCS']
    ]) {
      const trigger = d.getElementById(id + '-control');
      const option = d.getElementById(id + '-option-' + index);
      const select = d.getElementById(id);
      let changes = 0;
      select.addEventListener('change', () => changes++);
      trigger.focus(); trigger.click();
      const press = new w.MouseEvent('mousedown', { bubbles: true, cancelable: true });
      if (option.dispatchEvent(press)) d.getElementById('main-content').focus();
      // Browsers only dispatch the click to an option while its list remains open.
      if (!option.parentElement.hidden) option.click();
      assert.equal(select.value, expected);
      assert.match(trigger.textContent, new RegExp(expected));
      assert.equal(trigger.getAttribute('aria-expanded'), 'false');
      assert.equal(d.activeElement, trigger);
      assert.equal(changes, 1);
    }
    d.getElementById('reset-btn').click(); await tick();
    assert.equal(d.getElementById('program').value, '');
    assert.match(d.getElementById('program-control').textContent, /Select program/);
  });

  test(`${page}: a failed refresh keeps the previous result and gives a persistent form error`, async t => {
    let fail = false;
    const { d, fill, submit } = await setup(t, { page, fetch: async () => fail ? response({ error: 'Service unavailable.' }, 503) : response() });
    fill(); submit(); await tick();
    assert.equal(d.getElementById('result-gwa').textContent, '2.15');
    assert.equal(d.getElementById('result-filled').classList.contains('hidden'), false);
    assert.equal(d.querySelector('#result-panel .result-body #result-filled').id, 'result-filled');
    fail = true; submit(); await tick();
    assert.equal(d.getElementById('result-gwa').textContent, '2.15');
    assert.equal(d.getElementById('result-filled').classList.contains('hidden'), false);
    assert.equal(d.getElementById('assessment-message').hidden, false);
    assert.match(d.getElementById('assessment-message').textContent, /Service unavailable/);
    d.getElementById('reset-btn').click(); await tick();
    assert.equal(d.getElementById('assessment-message').hidden, true);
    assert.equal(d.getElementById('submit-btn').disabled, true);
  });
}

test('a pending prediction blocks repeated submission and Reset until completion', async t => {
  let complete, calls = 0;
  const { d, fill, submit } = await setup(t, { fetch: () => { calls++; return new Promise(resolve => { complete = resolve; }); } });
  fill(); submit(); submit(); await tick();
  assert.equal(calls, 1);
  assert.equal(d.querySelector('form').getAttribute('aria-busy'), 'true');
  assert.equal(d.getElementById('reset-btn').disabled, true);
  complete(response()); await tick();
  assert.equal(d.getElementById('reset-btn').disabled, false);
  assert.equal(d.getElementById('submit-btn').disabled, false);
  assert.equal(d.getElementById('result-gwa').getAttribute('aria-label'), 'Predicted GWA 2.15');
});

for (const page of ['index', 'assessment']) {
  test(`${page}: phone steps validate locally, keep optional answers, and focus hidden-step errors`, async t => {
    let calls = 0;
    const { d, key, fill } = await setup(t, { page, width: 390, fetch: async () => { calls++; return response(); } });
    const sections = [...d.querySelectorAll('form > .section')];
    const next = d.querySelector('.mobile-assessment-next'), back = d.querySelector('.mobile-assessment-back');
    const visible = () => sections.map(section => !section.hidden);
    assert.deepEqual(visible(), [true, false, false]);
    assert.equal(d.querySelector('form').noValidate, true);
    assert.equal(d.getElementById('result-panel').hidden, true);
    next.click();
    assert.equal(d.activeElement.id, 'academicTerm-control');
    assert.equal(calls, 0);
    d.getElementById('academicTerm').value = '1st Sem';
    next.click();
    assert.deepEqual(visible(), [false, true, false]);
    assert.equal(d.activeElement, sections[1].querySelector('h2'));
    assert.equal(d.getElementById('yearLevel').value, '');
    next.click(); assert.equal(d.activeElement.id, 'screenTime');
    fill();
    key(d.getElementById('screenTime'), 'Enter');
    assert.deepEqual(visible(), [false, false, true]);
    assert.equal(calls, 0);
    back.click();
    assert.equal(d.getElementById('screenTime').value, '4');
    next.click();
    d.getElementById('screenTime').value = '25';
    d.getElementById('submit-btn').click();
    assert.deepEqual(visible(), [false, true, false]);
    assert.equal(d.activeElement.id, 'screenTime');
    assert.equal(calls, 0);
  });

  test(`${page}: phone result editing, failed retry and Start again preserve the correct state`, async t => {
    let fail = false;
    const { d, fill } = await setup(t, { page, width: 390, fetch: async () => fail ? response({ error: 'Unavailable' }, 503) : response() });
    fill();
    d.querySelector('.mobile-assessment-next').click();
    d.querySelector('.mobile-assessment-next').click();
    d.getElementById('submit-btn').click(); await tick();
    assert.equal(d.querySelector('form').hidden, true);
    assert.equal(d.getElementById('result-panel').hidden, false);
    assert.equal(d.activeElement.id, 'result-heading');
    assert.equal(d.getElementById('result-gwa').textContent, '2.15');
    d.querySelector('.mobile-assessment-edit').click();
    assert.equal(d.querySelector('form').hidden, false);
    assert.equal(d.getElementById('studyHours').value, '3');
    fail = true;
    d.getElementById('submit-btn').click(); await tick();
    assert.equal(d.querySelector('form').hidden, false);
    assert.match(d.getElementById('assessment-message').textContent, /previous prediction/);
    assert.equal(d.getElementById('result-panel').hidden, false);
    fail = false;
    d.getElementById('submit-btn').click(); await tick();
    d.querySelector('.mobile-assessment-restart').click(); await tick();
    assert.equal(d.querySelector('form').hidden, false);
    assert.equal(d.getElementById('screenTime').value, '');
    assert.equal(d.querySelector('form > .section').hidden, false);
    assert.equal(d.getElementById('result-panel').hidden, true);
  });
}

test('phone breakpoint restores full form validation, preserves values and closes dropdowns', async t => {
  const { d, fill, resize } = await setup(t, { width: 767 });
  fill();
  d.querySelector('.mobile-assessment-next').click();
  resize(768);
  assert.equal(d.querySelector('form').noValidate, false);
  assert.ok([...d.querySelectorAll('form > .section')].every(section => !section.hidden));
  assert.equal(d.getElementById('result-panel').hidden, false);
  assert.equal(d.querySelector('.mobile-assessment-next').hidden, true);
  assert.equal(d.getElementById('academicTerm').value, '1st Sem');
  d.getElementById('academicTerm-control').click();
  d.getElementById('studyHours').focus();
  resize(767);
  assert.equal(d.getElementById('academicTerm-control').getAttribute('aria-expanded'), 'false');
  assert.equal(d.querySelectorAll('form > .section')[2].hidden, false);
});

test('phone pending prediction blocks Back/Next/Reset and account invalidation clears result view', async t => {
  let complete;
  const { w, d, fill } = await setup(t, { width: 390, fetch: () => new Promise(resolve => { complete = resolve; }) });
  fill(); d.querySelector('.mobile-assessment-next').click(); d.querySelector('.mobile-assessment-next').click();
  d.getElementById('submit-btn').click(); await tick();
  assert.equal(d.querySelector('.mobile-assessment-back').disabled, true);
  assert.equal(d.getElementById('reset-btn').disabled, true);
  complete(response()); await tick();
  w.dispatchEvent(new w.Event('auth:cleared'));
  assert.equal(d.querySelector('form').hidden, false);
  assert.equal(d.getElementById('result-panel').hidden, true);
});

