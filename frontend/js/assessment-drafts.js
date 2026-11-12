// Browser-only answers. Authentication credentials never belong in this store.
(() => {
  const prefix = 'acad-perf:assessment-draft:v1:';
  const fields = ['yearLevel', 'academicTerm', 'program', 'screenTime', 'academicPhoneUse', 'socialPhoneUse', 'studyHours', 'studyDays'];
  const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every(key => Object.prototype.hasOwnProperty.call(value, key));
  const validOwner = owner => typeof owner === 'string' && /^(guest|user:[1-9]\d*)$/.test(owner);
  function valid(draft) {
    return exactKeys(draft, ['version', 'revision', 'updatedAt', 'step', 'values', 'pendingSubmission']) && draft.version === 1 && uuid(draft.revision)
      && Number.isFinite(draft.updatedAt) && draft.updatedAt > 0
      && Date.now() - draft.updatedAt < 86400000 && draft.updatedAt <= Date.now() + 300000
      && Number.isInteger(draft.step) && draft.step >= 0 && draft.step <= 2
      && exactKeys(draft.values, fields)
      && fields.every(key => typeof draft.values[key] === 'string' && draft.values[key].length <= 64)
      && (draft.pendingSubmission === null || (exactKeys(draft.pendingSubmission, ['id', 'signature'])
        && uuid(draft.pendingSubmission.id) && typeof draft.pendingSubmission.signature === 'string'
        && draft.pendingSubmission.signature.length <= 2048));
  }
  function remove(owner, expectedRevision) {
    if (!validOwner(owner)) return;
    try {
      if (expectedRevision !== undefined && read(owner)?.revision !== expectedRevision) return;
      localStorage.removeItem(prefix + owner);
    } catch { /* Storage may be unavailable; the live form still works. */ }
  }
  function read(owner) {
    if (!validOwner(owner)) return null;
    try {
      const raw = localStorage.getItem(prefix + owner);
      if (raw === null) return null;
      const draft = raw.length <= 8192 && new TextEncoder().encode(raw).length <= 8192 ? JSON.parse(raw) : null;
      if (valid(draft)) return draft;
    } catch { /* Invalid JSON or inaccessible storage is treated as no draft. */ }
    remove(owner);
    return null;
  }
  function write(owner, draft) {
    if (!validOwner(owner) || !valid(draft)) return false;
    try {
      const raw = JSON.stringify(draft);
      if (new TextEncoder().encode(raw).length > 8192) return false;
      localStorage.setItem(prefix + owner, raw);
      return true;
    } catch { return false; }
  }
  window.AssessmentDrafts = { read, write, remove };
})();
