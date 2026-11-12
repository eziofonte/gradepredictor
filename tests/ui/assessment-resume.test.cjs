const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { installMedia } = require('./media.cjs');
const root = path.resolve(__dirname, '../..');
const tick = () => new Promise(resolve => setImmediate(resolve));
const fields = ['yearLevel', 'academicTerm', 'program', 'screenTime', 'academicPhoneUse', 'socialPhoneUse', 'studyHours', 'studyDays'];
const key = owner => 'acad-perf:assessment-draft:v1:' + owner;
const guest = { authenticated: false, user: null, csrf_token: 'token' };
const alice = { authenticated: true, user: { id: 42 }, csrf_token: 'token' };
const answer = { yearLevel: '2nd Year', academicTerm: '1st Sem', program: 'BSIT', screenTime: '0', academicPhoneUse: '1', socialPhoneUse: '2', studyHours: '3', studyDays: '5' };
const result = { predicted_gwa: 2.15, performance_category: 'Good', suggestions: [], saved: false };
async function setup(t, { page = 'index', auth = guest, raw, width = 1440, fetch = async () => ({ ok: true, json: async () => result }) } = {}) {
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'frontend/html', page + '.html'), 'utf8'), { url: 'https://example.test/' + page + '.html', runScripts: 'outside-only', virtualConsole: new VirtualConsole() });
  t.after(() => dom.window.close());
  const w = dom.window, d = w.document;
  installMedia(w, width);
  w.AbortSignal = AbortSignal; w.fetch = fetch;
  w.authReady = Promise.resolve(auth);
  w.getFreshAuth = () => w.authReady;
  w.authHeaders = a => ({ 'X-Expected-User': a.authenticated ? String(a.user.id) : 'guest', 'X-CSRFToken': a.csrf_token });
  w.createMicrosoftSignIn = () => d.createElement('a');
  w.eval(fs.readFileSync(path.join(root, 'frontend/js/assessment-drafts.js'), 'utf8'));
  if (raw) for (const [owner, item] of Object.entries(raw)) w.localStorage.setItem(key(owner), JSON.stringify(item));
  w.eval(fs.readFileSync(path.join(root, 'frontend/js/assessment.js'), 'utf8'));
  w.eval(fs.readFileSync(path.join(root, 'frontend/js/custom-select.js'), 'utf8'));
  d.dispatchEvent(new w.Event('DOMContentLoaded'));
  await tick();
  const edit = (id, value) => { d.getElementById(id).value = value; d.getElementById(id).dispatchEvent(new w.Event('input')); };
  const flush = () => w.dispatchEvent(new w.PageTransitionEvent('pagehide'));
  return { w, d, edit, flush, submit: () => d.querySelector('form').dispatchEvent(new w.Event('submit', { cancelable: true, bubbles: true })) };
}
function draft(changes = {}) { return { version: 1, revision: crypto.randomUUID(), updatedAt: Date.now(), step: 2, values: { ...answer }, pendingSubmission: null, ...changes }; }

for (const page of ['index', 'assessment']) {
  test(`${page}: saves all fields including zero and silently restores custom selects and mobile step`, async t => {
    const first = await setup(t, { page });
    for (const id of fields) first.edit(id, answer[id]);
    first.flush();
    const saved = first.w.AssessmentDrafts.read('guest');
    assert.ok(saved, 'answers are saved during navigation');
    assert.equal(saved.values.screenTime, '0');
    const second = await setup(t, { page: page === 'index' ? 'assessment' : 'index', raw: { guest: { ...saved, step: 2 } }, width: 390 });
    assert.equal(second.d.getElementById('program').value, 'BSIT');
    assert.match(second.d.getElementById('program-control').textContent, /BSIT/);
    assert.equal(second.d.querySelector('form').dataset.mobileStep, '3');
    assert.equal(second.d.activeElement, second.d.body);
    assert.equal(second.w.AssessmentDrafts.read('guest').updatedAt, saved.updatedAt);
    second.d.getElementById('reset-btn').click(); second.flush();
    assert.equal(second.w.AssessmentDrafts.read('guest'), null);
  });
}
test('account drafts do not adopt guest answers and explicit sign-out deletes only this account', async t => {
  const { w, d, edit } = await setup(t, { auth: alice, raw: { guest: draft({ values: { ...answer, studyHours: '9' } }), 'user:42': draft() } });
  assert.equal(d.getElementById('studyHours').value, '3');
  edit('studyHours', '4');
  w.dispatchEvent(new w.CustomEvent('auth:cleared', { detail: { reason: 'signed-out', userId: '42' } }));
  w.dispatchEvent(new w.PageTransitionEvent('pagehide'));
  assert.equal(w.AssessmentDrafts.read('user:42'), null);
  assert.equal(w.AssessmentDrafts.read('guest').values.studyHours, '9');
  assert.equal(d.getElementById('studyHours').value, '');
});
test('account navigation and session expiry preserve draft before clearing answers', async t => {
  for (const reason of ['navigation', 'session-expired', 'identity-changed']) {
    const { w, d, edit } = await setup(t, { auth: alice });
    edit('studyHours', '4');
    w.dispatchEvent(new w.CustomEvent('auth:cleared', { detail: { reason, userId: '42' } }));
    assert.equal(w.AssessmentDrafts.read('user:42')?.values.studyHours, '4');
    assert.equal(d.getElementById('studyHours').value, '');
  }
});
test('early typing is not overwritten while identity lookup is pending', async t => {
  let resolve;
  const auth = new Promise(r => { resolve = r; });
  const { w, d, edit, flush } = await setup(t, { auth, raw: { guest: draft() } });
  edit('studyHours', '7'); flush();
  resolve(guest); await tick(); flush();
  assert.equal(d.getElementById('studyHours').value, '7');
  assert.equal(w.AssessmentDrafts.read('guest').values.studyHours, '7');
});
test('early typing stays visible but cannot replace a later draft from another tab', async t => {
  let resolve;
  const auth = new Promise(r => { resolve = r; });
  const { w, d, edit, flush } = await setup(t, { auth });
  const early = w.Date.now(); w.Date.now = () => early;
  edit('studyHours', '7');
  const later = draft({ updatedAt: early + 1, values: { ...answer, studyHours: '9' } });
  w.AssessmentDrafts.write('guest', later);
  resolve(guest); await tick(); flush();
  assert.equal(d.getElementById('studyHours').value, '7');
  assert.equal(w.AssessmentDrafts.read('guest').values.studyHours, '9');
});
test('Reset before account lookup finishes discards the eventual owner draft', async t => {
  let resolve;
  const auth = new Promise(r => { resolve = r; });
  const { w, d, flush } = await setup(t, { auth, raw: { 'user:42': draft() } });
  d.getElementById('reset-btn').click();
  resolve(alice); await tick(); flush();
  assert.equal(d.getElementById('studyHours').value, '');
  assert.equal(w.AssessmentDrafts.read('user:42'), null);
});
test('failed storage never blocks prediction and success is not saved again on navigation', async t => {
  const { w, edit, submit, flush, d } = await setup(t);
  w.Storage.prototype.setItem = () => { throw new Error('quota'); };
  for (const id of fields) edit(id, answer[id]);
  submit(); await tick(); flush();
  assert.equal(d.querySelector('#result-filled').classList.contains('hidden'), false);
  assert.equal(w.AssessmentDrafts.read('guest'), null);
});
test('save failure retains the signed-in draft and successful guest completion clears it', async t => {
  for (const auth of [alice, guest]) {
    const owner = auth.authenticated ? 'user:42' : 'guest';
    const { w, submit, flush } = await setup(t, { auth, raw: { [owner]: draft() } });
    submit(); await tick(); flush();
    assert.equal(!!w.AssessmentDrafts.read(owner), auth.authenticated);
  }
});
test('an unchanged tab and external removal cannot resurrect or overwrite another revision', async t => {
  const initial = draft();
  const { w, edit, flush } = await setup(t, { raw: { guest: initial } });
  const newer = draft({ values: { ...answer, studyHours: '8' } });
  w.AssessmentDrafts.write('guest', newer); flush();
  assert.equal(w.AssessmentDrafts.read('guest').revision, newer.revision);
  edit('studyHours', '6');
  w.AssessmentDrafts.remove('guest');
  w.dispatchEvent(new w.StorageEvent('storage', { key: key('guest'), newValue: null }));
  flush();
  assert.equal(w.AssessmentDrafts.read('guest'), null);
});
test('lost-response retry survives reload with the same submission ID and clears after saved success', async t => {
  let submitted;
  const first = await setup(t, { auth: alice, raw: { 'user:42': draft() }, fetch: async (_url, options) => { submitted = JSON.parse(options.body); throw new Error('response lost'); } });
  first.submit(); await tick();
  const saved = first.w.AssessmentDrafts.read('user:42');
  assert.ok(saved.pendingSubmission);
  assert.equal(saved.pendingSubmission.id, submitted.submission_id);
  let retried;
  const second = await setup(t, { auth: alice, raw: { 'user:42': saved }, fetch: async (_url, options) => { retried = JSON.parse(options.body); return { ok: true, json: async () => ({ ...result, saved: true }) }; } });
  second.submit(); await tick();
  assert.equal(retried.submission_id, submitted.submission_id);
  second.flush();
  assert.equal(second.w.AssessmentDrafts.read('user:42'), null);
});
test('successful older submission keeps edits made while the request was in flight', async t => {
  let resolve;
  const { w, edit, submit, flush } = await setup(t, { raw: { guest: draft() }, fetch: () => new Promise(r => { resolve = r; }) });
  submit(); await tick(); edit('studyHours', '9');
  resolve({ ok: true, json: async () => result }); await tick(); flush();
  assert.equal(w.AssessmentDrafts.read('guest').values.studyHours, '9');
});
