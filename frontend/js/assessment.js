const form = document.getElementById('estimator-form');
const resultEmpty = document.getElementById('result-empty');
const resultFilled = document.getElementById('result-filled');
const resultPanel = document.getElementById('result-panel');
const submitBtn = document.getElementById('submit-btn');
const resetBtn = document.getElementById('reset-btn');
const resultGwa = document.getElementById('result-gwa');
const resultSuggestions = document.getElementById('result-suggestions');
const assessmentMessage = document.getElementById('assessment-message');
let submitting = false;
let resultTimers = [];
let markerPosition = null;
let pendingSubmission = null;
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const later = (action, delay) => resultTimers.push(setTimeout(action, delay));
function clearResultTimers() { resultTimers.forEach(clearTimeout); resultTimers = []; }

const requiredIds = ['yearLevel', 'academicTerm', 'program', 'screenTime', 'academicPhoneUse', 'socialPhoneUse', 'studyHours', 'studyDays'];
const yearInput = document.getElementById('yearLevel');
const termInput = document.getElementById('academicTerm');
function validateThirdYearTerm() {
  termInput.setCustomValidity(yearInput.value === '3rd Year' && termInput.value === 'Midyear'
    ? 'Select a completed first or second semester for third year.' : '');
}
yearInput.addEventListener('change', validateThirdYearTerm);
termInput.addEventListener('change', validateThirdYearTerm);

requiredIds.forEach(id => {
  const input = document.getElementById(id);
  const descriptions = new Set((input.getAttribute('aria-describedby') || '').split(' ').filter(Boolean));
  const hint = input.closest('.field')?.querySelector('.field-hint');
  const unit = input.closest('.input-shell')?.querySelector('.unit-tag');
  if (hint?.textContent.trim()) { hint.id ||= id + '-hint'; descriptions.add(hint.id); }
  if (unit) { unit.id ||= id + '-units'; descriptions.add(unit.id); }
  if (document.getElementById(id + '-error')) descriptions.add(id + '-error');
  input.setAttribute('aria-describedby', [...descriptions].join(' '));
});

function updateFieldError(id) {
  const input = document.getElementById(id);
  const shell = input.closest('.input-shell');
  const error = document.getElementById(`${id}-error`);
  input.setAttribute('aria-invalid', String(!input.validity.valid));
  shell?.querySelector('.custom-select-trigger')?.setAttribute('aria-invalid', String(!input.validity.valid));

  if (input.validity.valid) {
    if (shell) shell.classList.remove('has-error');
    if (error) error.textContent = '';
    return true;
  }

  if (shell) shell.classList.add('has-error');
  if (error) {
    error.textContent = input.validity.valueMissing
      ? 'This field is required.'
      : 'Enter a value within the allowed range.';
  }
  return false;
}

function checkFormValid() {
  submitBtn.disabled = submitting || (!mobileAssessment.active() && !requiredIds.every(id => document.getElementById(id).value !== ''));
  mobileAssessment.setBusy(submitting);
}

// Enhance the same form on phones; keep the complete form and its existing
// browser validation at tablet/desktop widths, including after a live resize.
const mobileAssessment = (() => {
  const phone = window.matchMedia('(max-width: 767px)');
  const sections = [...form.querySelectorAll(':scope > .section')];
  const originalNoValidate = form.noValidate;
  const progress = document.createElement('div');
  progress.className = 'mobile-assessment-progress';
  progress.hidden = true;
  progress.innerHTML = '<p aria-live="polite"></p><div class="mobile-assessment-track" aria-hidden="true"><span></span><span></span><span></span></div>';
  form.prepend(progress);
  const actions = submitBtn.parentElement;
  const makeButton = (label, className) => {
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = label; button.className = className; button.hidden = true;
    return button;
  };
  const back = makeButton('Back', 'btn-secondary mobile-assessment-back');
  const next = makeButton('Next', 'btn-primary mobile-assessment-next');
  const edit = makeButton('Edit answers', 'btn-secondary mobile-assessment-edit');
  const restart = makeButton('Start again', 'btn-secondary mobile-assessment-restart');
  actions.prepend(back, next);
  const resultActions = document.createElement('div');
  resultActions.className = 'mobile-result-actions'; resultActions.hidden = true;
  resultActions.append(edit, restart); resultPanel.append(resultActions);
  const resultHeading = document.getElementById('result-heading');
  resultHeading.tabIndex = -1;
  sections.forEach(section => { section.querySelector('h2').tabIndex = -1; });
  form.querySelectorAll('input[type="number"]').forEach(input => { input.inputMode = input.id === 'studyDays' ? 'numeric' : 'decimal'; });
  let step = 0, hasResult = false, resultView = false, previousVisible = false;

  function closeSelects() {
    form.querySelectorAll('.custom-select-wrapper').forEach(wrapper => wrapper.dispatchEvent(new Event('select:close')));
  }
  function focus(element) {
    element.focus({ preventScroll: true });
    element.scrollIntoView?.({ block: 'nearest', behavior: 'instant' });
  }
  function render() {
    const mobile = phone.matches;
    form.classList.toggle('mobile-assessment', mobile);
    form.dataset.mobileStep = String(step + 1);
    form.parentElement.classList.toggle('mobile-assessment-panel', mobile);
    form.noValidate = mobile || originalNoValidate;
    form.hidden = mobile && resultView;
    resultPanel.hidden = mobile && (!hasResult || (!resultView && !previousVisible));
    progress.hidden = !mobile;
    sections.forEach((section, index) => { section.hidden = mobile && index !== step; });
    progress.querySelector('p').textContent = `Step ${step + 1} of 3`;
    progress.querySelectorAll('.mobile-assessment-track span').forEach((segment, index) => segment.classList.toggle('complete', index <= step));
    back.hidden = !mobile || step === 0;
    next.hidden = !mobile || step === sections.length - 1;
    submitBtn.hidden = mobile && step !== sections.length - 1;
    resultActions.hidden = edit.hidden = restart.hidden = !mobile;
  }
  function goTo(index, moveFocus = true) {
    closeSelects(); step = index; resultView = previousVisible = false; render();
    form.dispatchEvent(new Event('assessment:step'));
    if (moveFocus) {
      focus(sections[step].querySelector('h2'));
      if (phone.matches) progress.scrollIntoView?.({ block: 'start', behavior: 'instant' });
    }
  }
  function validate(ids) {
    const invalid = ids.filter(id => !updateFieldError(id));
    if (!invalid.length) return true;
    const input = document.getElementById(invalid[0]);
    goTo(sections.findIndex(section => section.contains(input)), false);
    focus(input.closest('.input-shell').querySelector('.custom-select-trigger') || input);
    return false;
  }
  function advance() {
    if (submitting || window.authInvalidated) return;
    if (validate(requiredIds.filter(id => sections[step].contains(document.getElementById(id))))) goTo(Math.min(step + 1, sections.length - 1));
  }
  back.addEventListener('click', () => { if (!submitting) goTo(Math.max(0, step - 1)); });
  next.addEventListener('click', advance);
  edit.addEventListener('click', () => { if (!submitting) goTo(2); });
  restart.addEventListener('click', () => resetBtn.click());
  form.addEventListener('keydown', event => {
    if (!phone.matches || event.defaultPrevented || event.key !== 'Enter' || !event.target.matches('input, select')) return;
    event.preventDefault();
    if (step < sections.length - 1) advance(); else form.requestSubmit(submitBtn);
  });
  phone.addEventListener?.('change', () => {
    const focused = document.activeElement;
    closeSelects();
    if (phone.matches && form.contains(focused)) {
      const focusedStep = sections.findIndex(section => section.contains(focused));
      if (focusedStep >= 0) { step = focusedStep; resultView = false; }
    }
    render(); checkFormValid();
    if (focused?.closest('[hidden]')) focus(phone.matches && resultView ? resultHeading : sections[step].querySelector('h2'));
    alignResultMarker();
  });
  render();
  return {
    active: () => phone.matches,
    getStep: () => step,
    restoreStep(index) {
      const earlierIncomplete = sections.findIndex((section, sectionIndex) => sectionIndex < index
        && requiredIds.some(id => section.contains(document.getElementById(id)) && !document.getElementById(id).validity.valid));
      goTo(earlierIncomplete < 0 ? index : earlierIncomplete, false);
    },
    lastStep: () => step === sections.length - 1,
    advance,
    validate: () => validate(requiredIds),
    setBusy: busy => { back.disabled = next.disabled = edit.disabled = restart.disabled = busy; },
    revealResult() { hasResult = true; resultView = true; previousVisible = false; closeSelects(); render(); },
    failure() { previousVisible = hasResult; resultView = false; render(); },
    focusResult() {
      if (phone.matches) {
        focus(resultHeading);
        resultPanel.scrollIntoView?.({ block: 'start', behavior: 'instant' });
      }
    },
    reset() { hasResult = resultView = previousVisible = false; goTo(0, phone.matches); },
    invalidate() { hasResult = resultView = previousVisible = false; render(); }
  };
})();

const assessmentDraft = (() => {
  const store = window.AssessmentDrafts;
  const ids = ['yearLevel', 'academicTerm', 'program', 'screenTime', 'academicPhoneUse', 'socialPhoneUse', 'studyHours', 'studyDays'];
  const inputs = ids.map(id => document.getElementById(id));
  const values = () => Object.fromEntries(inputs.map(input => [input.id, input.value]));
  const edited = new Set();
  let owner = null, dirty = false, stopped = false, restoring = false, discardOnIdentify = false, timer;
  let updatedAt = 0, revision = null, observed = values();
  const cancel = () => { clearTimeout(timer); timer = undefined; };
  function flush() {
    cancel();
    if (!store || !owner || !dirty || stopped) return revision;
    const current = values(), latest = store.read(owner);
    if (latest && latest.revision !== revision && latest.updatedAt > updatedAt) { dirty = false; return revision; }
    if (!Object.values(current).some(Boolean)) { store.remove(owner, revision || undefined); dirty = false; return null; }
    const nextRevision = crypto.randomUUID();
    if (store.write(owner, { version: 1, revision: nextRevision, updatedAt, step: mobileAssessment.getStep(), values: current, pendingSubmission })) revision = nextRevision;
    dirty = false;
    return revision;
  }
  function changed(input) {
    if (restoring || stopped || observed[input.id] === input.value) return;
    observed[input.id] = input.value; edited.add(input.id);
    updatedAt = Date.now(); dirty = true; pendingSubmission = null;
    cancel(); timer = setTimeout(flush, 300);
  }
  inputs.forEach(input => {
    input.addEventListener('input', () => changed(input));
    input.addEventListener('change', () => changed(input));
    // Run after the existing numeric blur clamp.
    input.addEventListener('blur', () => queueMicrotask(() => changed(input)));
  });
  async function initialise() {
    if (!store || owner || stopped) return;
    try {
      const auth = await window.authReady;
      if (stopped || window.authInvalidated) return;
      owner = auth.authenticated ? 'user:' + auth.user.id : 'guest';
      if (discardOnIdentify) { store.remove(owner); discardOnIdentify = false; }
      const saved = store.read(owner);
      if (saved) {
        restoring = true;
        inputs.forEach(input => {
          if (edited.has(input.id)) return;
          const value = saved.values[input.id];
          input.value = input.tagName !== 'SELECT' || [...input.options].some(option => option.value === value) ? value : '';
          input.dispatchEvent(new Event('change', { bubbles: true }));
        });
        // Early edits were made without this stored revision as their base.
        revision = edited.size ? null : saved.revision;
        if (!edited.size) { updatedAt = saved.updatedAt; pendingSubmission = saved.pendingSubmission; }
        mobileAssessment.restoreStep(saved.step);
        restoring = false;
      }
      observed = values();
      checkFormValid();
      if (dirty) flush();
    } catch { /* Wait for auth:ready after account-service Retry, preserving typed answers. */ }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialise, { once: true });
  else initialise();
  window.addEventListener('auth:ready', initialise);
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
  form.addEventListener('assessment:step', () => {
    if (!store || !owner || stopped || restoring) return;
    if (dirty) { flush(); return; }
    const saved = store.read(owner);
    if (saved && saved.revision === revision) {
      const nextRevision = crypto.randomUUID();
      if (store.write(owner, { ...saved, step: mobileAssessment.getStep(), revision: nextRevision })) revision = nextRevision;
    }
  });
  window.addEventListener('storage', event => {
    if (!owner || event.key !== 'acad-perf:assessment-draft:v1:' + owner) return;
    if (event.newValue === null) { cancel(); dirty = false; revision = null; pendingSubmission = null; }
  });
  window.addEventListener('auth:cleared', event => {
    const reason = event.detail?.reason || 'identity-changed';
    if (reason !== 'signed-out') flush();
    else if (owner && owner === 'user:' + event.detail?.userId) store?.remove(owner);
    cancel(); dirty = false; stopped = true; pendingSubmission = null;
    restoring = true;
    inputs.forEach(input => { input.value = ''; input.dispatchEvent(new Event('change', { bubbles: true })); });
    observed = values(); restoring = false;
    mobileAssessment.restoreStep(0);
    checkFormValid();
  });
  return {
    values,
    prepare() { updatedAt ||= Date.now(); dirty = true; return flush(); },
    complete(submittedRevision, submittedValues) {
      if (JSON.stringify(values()) === JSON.stringify(submittedValues)) {
        cancel(); dirty = false; pendingSubmission = null;
        if (submittedRevision) store?.remove(owner, submittedRevision);
        revision = null;
      }
    },
    reset() { cancel(); dirty = false; updatedAt = 0; revision = null; edited.clear(); if (owner) store?.remove(owner); else discardOnIdentify = true; },
    observeReset() { observed = values(); }
  };
})();

function gwaToPosition(gwa) {
  const bands = [
    { lo: 1.00, hi: 1.75, start: 0 },
    { lo: 1.76, hi: 2.50, start: 25 },
    { lo: 2.51, hi: 3.00, start: 50 },
    { lo: 3.01, hi: 5.00, start: 75 }
  ];
  const b = bands.find(b => gwa <= b.hi) || bands[bands.length - 1];
  const frac = (gwa - b.lo) / (b.hi - b.lo);
  return b.start + frac * 25;
}

function renderSlidingNumber(el, value) {
  const str = value.toFixed(2);
  el.innerHTML = '';
  el.setAttribute('aria-label', 'Predicted GWA ' + str);
  if (reducedMotion()) { el.classList.remove('gwa-sliding'); el.textContent = str; return; }
  el.classList.add('gwa-sliding');
  [...str].forEach((ch, i) => {
    if (ch === '.') {
      const dot = document.createElement('span');
      dot.className = 'gwa-digit-dot';
      dot.textContent = '.';
      dot.setAttribute('aria-hidden', 'true');
      el.appendChild(dot);
      return;
    }
    const frame = document.createElement('span');
    frame.setAttribute('aria-hidden', 'true');
    frame.className = 'gwa-digit-frame';
    const col = document.createElement('span');
    col.className = 'gwa-digit-col';
    for (let d = 0; d <= 9; d++) {
      const digitEl = document.createElement('span');
      digitEl.className = 'gwa-digit';
      digitEl.textContent = d;
      col.appendChild(digitEl);
    }
    frame.appendChild(col);
    el.appendChild(frame);
    later(() => {
      col.style.transform = `translateY(-${parseInt(ch, 10)}em)`;
    }, 150 + i * 90);
  });
}

function positionMarkerTag(markerTag, scaleBarWrap, position) {
  const scaleBounds = scaleBarWrap.getBoundingClientRect();
  const tagWidth = markerTag.offsetWidth;
  const trueCenter = scaleBounds.left + scaleBounds.width * position / 100;
  const minCenter = scaleBounds.left + tagWidth / 2;
  const maxCenter = scaleBounds.right - tagWidth / 2;
  const clampedCenter = Math.min(maxCenter, Math.max(minCenter, trueCenter));

  markerTag.style.transform = `translateX(${clampedCenter - trueCenter}px)`;
}

function showResult(result) {
  mobileAssessment.revealResult();
  clearResultTimers();
  resultEmpty.classList.add('hidden');
  resultFilled.classList.remove('hidden');
  document.getElementById('result-note-wrap').classList.remove('hidden');
  resultPanel.classList.add('filled');

  resultSuggestions.replaceChildren();
  (result.suggestions || []).forEach(suggestion => {
    const item = document.createElement('li');
    item.textContent = suggestion;
    resultSuggestions.appendChild(item);
  });
  resultSuggestions.classList.toggle('hidden', resultSuggestions.children.length === 0);

  renderSlidingNumber(resultGwa, result.predicted_gwa);
  const difficulty = document.getElementById('difficulty-result');
  difficulty.hidden = result.semester_difficulty == null;
  difficulty.textContent = difficulty.hidden ? '' : `Survey average subject difficulty: ${result.semester_difficulty.toFixed(2)} / 5. This exploratory feature has not been shown to improve accuracy.`;

  const scaleVisual = document.querySelector('.gwa-scale-visual');
  const bar = document.getElementById('gwa-scale-bar');
  const scaleBarWrap = document.querySelector('.gwa-scale-bar-wrap');
  const marker = document.getElementById('gwa-marker');
  const markerTag = document.getElementById('gwa-marker-tag');

  markerTag.textContent = result.performance_category;
  resultGwa.classList.remove('gwa-text-excellent', 'gwa-text-good', 'gwa-text-satisfactory', 'gwa-text-failing');
  const categorySlug = result.performance_category.trim().toLowerCase();
  resultGwa.classList.add('gwa-text-' + categorySlug);
  markerPosition = gwaToPosition(result.predicted_gwa);
  marker.style.left = markerPosition + '%';
  markerTag.style.transform = '';
  positionMarkerTag(markerTag, scaleBarWrap, markerPosition);
  if (reducedMotion()) {
    scaleVisual.classList.add('revealed'); bar.classList.add('revealed'); marker.classList.add('visible');
    return;
  }

  marker.classList.remove('visible');
  bar.classList.remove('revealed');
  void bar.offsetHeight; // force reflow so the clip-path reset registers

  const alreadyExpanded = scaleVisual.classList.contains('revealed');

  function fillBarThenShowMarker() {
    later(() => bar.classList.add('revealed'), 16);
    later(() => marker.classList.add('visible'), 1150);
  }

  if (alreadyExpanded) {
    fillBarThenShowMarker();
  } else {
    scaleVisual.classList.add('revealed');
    later(fillBarThenShowMarker, 550);
  }
}

requiredIds.forEach(id => document.getElementById(id).addEventListener('input', () => {
  updateFieldError(id);
  checkFormValid();
}));

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (submitting || window.authInvalidated) return;

  if (mobileAssessment.active() && !mobileAssessment.lastStep()) {
    mobileAssessment.advance(); return;
  }

  if (!(mobileAssessment.active() ? mobileAssessment.validate() : requiredIds.map(updateFieldError).every(Boolean))) {
    checkFormValid();
    return;
  }

  const data = {
    yearLevel: document.getElementById('yearLevel').value,
    academicTerm: document.getElementById('academicTerm').value,
    thirdYearSemester: document.getElementById('academicTerm').value,
    program: document.getElementById('program').value,
    screenTime: Number(document.getElementById('screenTime').value),
    academicPhoneUse: Number(document.getElementById('academicPhoneUse').value),
    socialPhoneUse: Number(document.getElementById('socialPhoneUse').value),
    studyHours: Number(document.getElementById('studyHours').value),
    studyDays: Number(document.getElementById('studyDays').value),
  };
  const submittedValues = assessmentDraft.values();
  let submittedRevision;

  // Disable button and show loading state
  submitting = true;
  submitBtn.disabled = true;
  resetBtn.disabled = true;
  checkFormValid();
  form.setAttribute('aria-busy', 'true');
  submitBtn.setAttribute('aria-busy', 'true');
  assessmentMessage.hidden = true;
  const originalBtnText = submitBtn.textContent;
  submitBtn.textContent = 'Predicting...';

  try {
    const auth = await window.getFreshAuth();
    if (window.authInvalidated) return;
    data.save_to_history = auth.authenticated;
    if (auth.authenticated) {
      const signature = JSON.stringify(data);
      if (!pendingSubmission || pendingSubmission.signature !== signature) pendingSubmission = { signature, id: crypto.randomUUID() };
      data.submission_id = pendingSubmission.id;
    }
    submittedRevision = assessmentDraft.prepare();
    const response = await fetch('/predict', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...window.authHeaders(auth)
      },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Unknown error');
    }

    const result = await response.json();
    if (window.authInvalidated) return;

    showResult(result);

    let notice = document.getElementById('save-status');
    if (!notice) {
      notice = document.createElement('p');
      notice.id = 'save-status';
      notice.setAttribute('role', 'status');
      resultFilled.appendChild(notice);
    }
    notice.replaceChildren();
    if (result.saved) {
      pendingSubmission = null;
      notice.textContent = 'Saved to your history.';
    } else if (auth.authenticated) {
      notice.textContent = result.save_error || 'Your result could not be saved.';
    } else {
      notice.append('Guest result — not saved. Use your PLM school account to save future assessments. ');
      notice.appendChild(window.createMicrosoftSignIn(location.pathname.replace(/^\/html\//, '/') === '/assessment.html' ? '/assessment.html' : '/#assessment'));
    }
    if (result.saved || !auth.authenticated) assessmentDraft.complete(submittedRevision, submittedValues);

    mobileAssessment.focusResult();

  } catch (err) {
    if (!window.authInvalidated) {
      assessmentMessage.textContent = 'We could not get a prediction. ' + err.message + ' Please try again.' + (resultFilled.classList.contains('hidden') ? '' : ' The previous prediction is still shown.');
      assessmentMessage.hidden = false;
      mobileAssessment.failure();
    }
  } finally {
    // Re-enable button and reset text
    submitting = false;
    resetBtn.disabled = false;
    form.removeAttribute('aria-busy'); submitBtn.removeAttribute('aria-busy');
    submitBtn.textContent = originalBtnText;
    checkFormValid();
  }
});

resetBtn.addEventListener('click', () => {
  if (submitting) return;
  assessmentDraft.reset();
  clearResultTimers(); markerPosition = null;
  form.reset();
  assessmentDraft.observeReset();
  assessmentMessage.hidden = true;
  pendingSubmission = null;
  form.querySelectorAll('.has-error').forEach(shell => shell.classList.remove('has-error'));
  form.querySelectorAll('.field-error').forEach(error => { error.textContent = ''; });
  form.querySelectorAll('[aria-invalid]').forEach(field => field.removeAttribute('aria-invalid'));

  resultEmpty.classList.remove('hidden');
  resultFilled.classList.add('hidden');
  resultSuggestions.classList.add('hidden');
  resultSuggestions.replaceChildren();
  document.getElementById('result-note-wrap').classList.add('hidden');
  resultPanel.classList.remove('filled');

  document.querySelector('.gwa-scale-visual').classList.remove('revealed');
  document.getElementById('gwa-scale-bar').classList.remove('revealed');
  document.getElementById('gwa-marker').classList.remove('visible');

  const inviteEl = document.querySelector('#result-empty .empty-invite');
  inviteEl.textContent = 'Fill in the form to see your estimate';
  inviteEl.classList.remove('error-text');

  mobileAssessment.reset();
  checkFormValid();
});

checkFormValid();

function alignResultMarker() {
  if (markerPosition !== null) positionMarkerTag(document.getElementById('gwa-marker-tag'), document.querySelector('.gwa-scale-bar-wrap'), markerPosition);
}
if ('ResizeObserver' in window) new ResizeObserver(alignResultMarker).observe(resultPanel);
else window.addEventListener('resize', alignResultMarker);
window.addEventListener('auth:cleared', () => { clearResultTimers(); markerPosition = null; mobileAssessment.invalidate(); });

document.querySelectorAll('.input-shell').forEach(shell => {
  const input = shell.querySelector('input[type="number"]');
  if (!input) return;
  const min = parseFloat(input.min), max = parseFloat(input.max), step = parseFloat(input.step) || 1;

  function clamp() {
    let v = parseFloat(input.value);
    if (isNaN(v)) return;
    if (v > max) v = max;
    if (v < min) v = min;
    input.value = v;
  }

  shell.querySelectorAll('.steppers button').forEach(btn => {
    btn.addEventListener('click', () => {
      let v = (parseFloat(input.value) || 0) + step * parseInt(btn.dataset.dir, 10);
      input.value = Math.round(v * 100) / 100;
      clamp();
      input.dispatchEvent(new Event('input'));
    });
  });

  input.addEventListener('blur', clamp);
});
