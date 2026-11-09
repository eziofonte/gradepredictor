const form = document.getElementById('estimator-form');
const resultEmpty = document.getElementById('result-empty');
const resultFilled = document.getElementById('result-filled');
const resultPanel = document.getElementById('result-panel');
const submitBtn = document.getElementById('submit-btn');
const resetBtn = document.getElementById('reset-btn');
const resultGwa = document.getElementById('result-gwa');

const requiredIds = ['academicTerm', 'screenTime', 'academicPhoneUse', 'socialPhoneUse', 'studyHours', 'studyDays'];

function updateFieldError(id) {
  const input = document.getElementById(id);
  const shell = input.closest('.input-shell');
  const error = document.getElementById(`${id}-error`);

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
  submitBtn.disabled = !requiredIds.every(id => document.getElementById(id).value !== '');
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
  el.classList.add('gwa-sliding');
  [...str].forEach((ch, i) => {
    if (ch === '.') {
      const dot = document.createElement('span');
      dot.className = 'gwa-digit-dot';
      dot.textContent = '.';
      el.appendChild(dot);
      return;
    }
    const frame = document.createElement('span');
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
    setTimeout(() => {
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
  resultEmpty.classList.add('hidden');
  resultFilled.classList.remove('hidden');
  document.getElementById('result-note-wrap').classList.remove('hidden');
  resultPanel.classList.add('filled');

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
  const markerPosition = gwaToPosition(result.predicted_gwa);
  marker.style.left = markerPosition + '%';
  markerTag.style.transform = '';
  positionMarkerTag(markerTag, scaleBarWrap, markerPosition);

  marker.classList.remove('visible');
  bar.classList.remove('revealed');
  void bar.offsetHeight; // force reflow so the clip-path reset registers

  const alreadyExpanded = scaleVisual.classList.contains('revealed');

  function fillBarThenShowMarker() {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => bar.classList.add('revealed'));
    });
    setTimeout(() => marker.classList.add('visible'), 1150); // matches 1.1s clip-path + buffer
  }

  if (alreadyExpanded) {
    fillBarThenShowMarker();
  } else {
    scaleVisual.classList.add('revealed');
    setTimeout(fillBarThenShowMarker, 550); // matches 0.5s max-height + buffer
  }
}

requiredIds.forEach(id => document.getElementById(id).addEventListener('input', () => {
  updateFieldError(id);
  checkFormValid();
}));

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (!requiredIds.every(updateFieldError)) {
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
  submitBtn.disabled = true;
  const originalBtnText = submitBtn.textContent;
  submitBtn.textContent = 'Estimating...';

  try {
    const response = await fetch('/predict', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Unknown error');
    }

    const result = await response.json();

    showResult(result);

    // Save entry to localStorage for offline access/backup
    const entry = {
      yearLevel: data.yearLevel,
      academic_term: data.academicTerm,
      program: data.program,
      daily_screen_time_hrs: data.screenTime,
      academic_app_usage_hrs: data.academicPhoneUse,
      social_media_hrs: data.socialPhoneUse,
      study_hours_per_day: data.studyHours,
      study_frequency_per_week: data.studyDays,
      predicted_gwa: result.predicted_gwa,
      performance_category: result.performance_category,
      created_at: new Date().toISOString().replace('T', ' ').substring(0, 19) // Format: YYYY-MM-DD HH:MM:SS
    };
    saveEntry(entry);

  } catch (err) {
    // Show error message
    const inviteEl = document.querySelector('#result-empty .empty-invite');
    inviteEl.textContent = `Error: ${err.message}`;
    inviteEl.classList.add('error-text');
    resultEmpty.classList.remove('hidden');
    resultFilled.classList.add('hidden');
    resultPanel.classList.remove('filled');
  } finally {
    // Re-enable button and reset text
    submitBtn.disabled = false;
    submitBtn.textContent = originalBtnText;
  }
});

resetBtn.addEventListener('click', () => {
  form.reset();

  resultEmpty.classList.remove('hidden');
  resultFilled.classList.add('hidden');
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
