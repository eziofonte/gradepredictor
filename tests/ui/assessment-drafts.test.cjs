const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const file = path.resolve(__dirname, '../../frontend/js/assessment-drafts.js');
const key = owner => 'acad-perf:assessment-draft:v1:' + owner;
function setup(t) {
  const dom = new JSDOM('', { url: 'https://example.test', runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  const w = dom.window;
  if (fs.existsSync(file)) w.eval(fs.readFileSync(file, 'utf8'));
  assert.ok(w.AssessmentDrafts, 'draft storage API is available');
  const draft = changes => ({ version: 1, revision: w.crypto.randomUUID(), updatedAt: w.Date.now(), step: 1,
    values: { yearLevel: '', academicTerm: '1st Sem', program: '', screenTime: '0', academicPhoneUse: '', socialPhoneUse: '', studyHours: '3', studyDays: '' },
    pendingSubmission: null, ...changes });
  return { w, store: w.AssessmentDrafts, draft };
}
test('drafts isolate owners and conditional removal preserves a newer revision', t => {
  const { store, draft } = setup(t);
  const guest = draft(), alice = draft(), bob = draft();
  for (const [owner, item] of [['guest', guest], ['user:42', alice], ['user:43', bob]]) assert.equal(store.write(owner, item), true);
  assert.equal(store.read('guest').values.screenTime, '0');
  assert.equal(store.read('user:42').revision, alice.revision);
  store.remove('user:42', guest.revision);
  assert.equal(store.read('user:42').revision, alice.revision);
  store.remove('user:42', alice.revision);
  assert.equal(store.read('user:42'), null);
  assert.equal(store.read('user:43').revision, bob.revision);
});
test('draft expires at 24 hours and reads never refresh last-edit time', t => {
  const { w, store, draft } = setup(t);
  const now = w.Date.now(), item = draft({ updatedAt: now - 86400000 + 1 });
  w.Date.now = () => now;
  assert.equal(store.write('guest', item), true);
  assert.equal(store.read('guest').updatedAt, item.updatedAt);
  w.Date.now = () => now + 1;
  assert.equal(store.read('guest'), null);
  assert.equal(w.localStorage.getItem(key('guest')), null);
});
test('corrupt, future, oversized, unknown and unsafe metadata is discarded', t => {
  const { w, store, draft } = setup(t);
  const now = w.Date.now(); w.Date.now = () => now;
  const invalid = ['{', JSON.stringify(draft({ version: 2 })), JSON.stringify(draft({ step: 3 })),
    JSON.stringify(draft({ updatedAt: NaN })), JSON.stringify(draft({ updatedAt: w.Date.now() + 300001 })),
    JSON.stringify(draft({ pendingSubmission: { id: 'bad', signature: '{}' } })),
    JSON.stringify(draft({ credentials: 'unexpected' })),
    JSON.stringify(draft({ pendingSubmission: { id: w.crypto.randomUUID(), signature: '{}', credentials: 'unexpected' } })),
    JSON.stringify(draft({ values: { ...draft().values, program: 'x'.repeat(65) } })),
    JSON.stringify(draft({ values: { ...draft().values, secret: 'bad' } })), ' '.repeat(8193)];
  for (const raw of invalid) {
    w.localStorage.setItem(key('guest'), raw);
    assert.equal(store.read('guest'), null);
    assert.equal(w.localStorage.getItem(key('guest')), null);
  }
  assert.equal(store.write('invalid-owner', draft()), false);
});
test('unavailable storage and quota failures do not throw', t => {
  const { w, store, draft } = setup(t);
  w.Storage.prototype.setItem = () => { throw new Error('quota'); };
  assert.equal(store.write('guest', draft()), false);
  Object.defineProperty(w, 'localStorage', { get() { throw new Error('blocked'); } });
  assert.equal(store.read('guest'), null);
  assert.doesNotThrow(() => store.remove('guest'));
});
