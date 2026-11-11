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
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const later = (action, delay) => resultTimers.push(setTimeout(action, delay));
function clearResultTimers() { resultTimers.forEach(clearTimeout); resultTimers = []; }

const requiredIds = ['academicTerm', 'screenTime', 'academicPhoneUse', 'socialPhoneUse', 'studyHours', 'studyDays'];

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
  submitBtn.disabled = submitting || !requiredIds.every(id => document.getElementById(id).value !== '');
}

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

let pendingSubmission = null;
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (submitting || window.authInvalidated) return;

  if (!requiredIds.map(updateFieldError).every(Boolean)) {
    checkFormValid();
    return;
  }

  const data = {
    yearLevel: document.getElementById('yearLevel').value,
    academicTerm: document.getElementById('academicTerm').value,
    program: document.getElementById('program').value,
    screenTime: Number(document.getElementById('screenTime').value),
    academicPhoneUse: Number(document.getElementById('academicPhoneUse').value),
    socialPhoneUse: Number(document.getElementById('socialPhoneUse').value),
    studyHours: Number(document.getElementById('studyHours').value),
    studyDays: Number(document.getElementById('studyDays').value),
  };

  // Disable button and show loading state
  submitting = true;
  submitBtn.disabled = true;
  resetBtn.disabled = true;
  form.setAttribute('aria-busy', 'true');
  submitBtn.setAttribute('aria-busy', 'true');
  assessmentMessage.hidden = true;
  const originalBtnText = submitBtn.textContent;
  submitBtn.textContent = 'Predicting...';

  try {
    const auth = await window.authReady;
    if (window.authInvalidated) return;
    data.save_to_history = auth.authenticated;
    if (auth.authenticated) {
      const signature = JSON.stringify(data);
      if (!pendingSubmission || pendingSubmission.signature !== signature) pendingSubmission = { signature, id: crypto.randomUUID() };
      data.submission_id = pendingSubmission.id;
    }
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

  } catch (err) {
    if (!window.authInvalidated) {
      assessmentMessage.textContent = 'We could not get a prediction. ' + err.message + ' Please try again.' + (resultFilled.classList.contains('hidden') ? '' : ' The previous prediction is still shown.');
      assessmentMessage.hidden = false;
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
  clearResultTimers(); markerPosition = null;
  form.reset();
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

  checkFormValid();
});

checkFormValid();

function alignResultMarker() {
  if (markerPosition !== null) positionMarkerTag(document.getElementById('gwa-marker-tag'), document.querySelector('.gwa-scale-bar-wrap'), markerPosition);
}
if ('ResizeObserver' in window) new ResizeObserver(alignResultMarker).observe(resultPanel);
else window.addEventListener('resize', alignResultMarker);
window.addEventListener('auth:cleared', () => { clearResultTimers(); markerPosition = null; });

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
