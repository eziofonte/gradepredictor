// Color mapping for performance bands - using CSS classes instead of hardcoded colors
// The actual colors are defined in style.css using CSS variables
const BAND_CLASSES = {
  "Excellent": "band-excellent",
  "Good": "band-good",
  "Satisfactory": "band-satisfactory",
  "Failing": "band-failing"
};

const form = document.getElementById('estimator-form');
const resultEmpty = document.getElementById('result-empty');
const resultFilled = document.getElementById('result-filled');
const resultPanel = document.getElementById('result-panel');
const submitBtn = document.getElementById('submit-btn');
const resetBtn = document.getElementById('reset-btn');
const resultGwa = document.getElementById('result-gwa');
const resultBand = document.getElementById('result-band');

const requiredIds = ['screenTime', 'academicPhoneUse', 'socialPhoneUse', 'studyHours', 'studyDays'];

function checkFormValid() {
  submitBtn.disabled = !requiredIds.every(id => document.getElementById(id).value !== '');
}
requiredIds.forEach(id => document.getElementById(id).addEventListener('input', checkFormValid));

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const data = {
    yearLevel: document.getElementById('yearLevel').value,
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

    // Update UI with prediction results
    resultGwa.textContent = result.predicted_gwa.toFixed(2);
    // resultGwa color is handled by CSS (var(--gold))
    
    // Update result band with appropriate class instead of inline background
    resultBand.textContent = result.performance_category;
    resultBand.className = ''; // Clear existing classes
    resultBand.classList.add(BAND_CLASSES[result.performance_category]);

    resultEmpty.classList.add('hidden');
    resultFilled.classList.remove('hidden');
    resultPanel.classList.add('filled');

    // Save entry to localStorage for offline access/backup
    const entry = {
      yearLevel: data.yearLevel,
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
  resultPanel.classList.remove('filled');
  const inviteEl = document.querySelector('#result-empty .empty-invite');
  inviteEl.textContent = 'Fill in the form to see your estimate';
  inviteEl.classList.remove('error-text');
  checkFormValid();
});

checkFormValid();
