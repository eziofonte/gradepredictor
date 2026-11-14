const form = document.getElementById('estimator-form');
const resultEmpty = document.getElementById('result-empty');
const resultFilled = document.getElementById('result-filled');
const submitBtn = document.getElementById('submit-btn');
const requiredIds = ['yearLevel', 'program', 'screenTime', 'academicPhoneUse', 'socialPhoneUse', 'studyHours', 'studyDays'];
const fieldValue = id => document.getElementById(id).value;
const semester = document.getElementById('thirdYearSemester');

function syncSemester() {
  const thirdYear = fieldValue('yearLevel') === '3rd Year';
  document.getElementById('third-year-term-field').hidden = !thirdYear;
  semester.disabled = !thirdYear;
  semester.required = thirdYear;
  if (!thirdYear) semester.value = '';
}
document.getElementById('yearLevel').addEventListener('change', syncSemester);

function checkFormValid() {
  submitBtn.disabled = !requiredIds.every(id => fieldValue(id) !== '');
}
requiredIds.forEach(id => document.getElementById(id).addEventListener('change', checkFormValid));
document.getElementById('screenTime').addEventListener('input', checkFormValid);

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  const data = {
    yearLevel: fieldValue('yearLevel'), program: fieldValue('program'),
    screenTime: Number(fieldValue('screenTime')),
    academicPhoneUse: Number(fieldValue('academicPhoneUse')), socialPhoneUse: Number(fieldValue('socialPhoneUse')),
    studyHours: Number(fieldValue('studyHours')), studyDays: Number(fieldValue('studyDays')),
    thirdYearSemester: semester.value
  };
  submitBtn.disabled = true;
  try {
    const response = await fetch('/predict', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data)});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Prediction unavailable');
    document.getElementById('result-gwa').textContent = result.predicted_gwa.toFixed(2);
    document.getElementById('result-band').textContent = result.performance_category;
    document.getElementById('result-band').className = 'result-band band-' + result.performance_category.toLowerCase();
    const difficulty = document.getElementById('difficulty-result');
    difficulty.hidden = result.semester_difficulty == null;
    difficulty.textContent = difficulty.hidden ? '' : `Survey average subject difficulty: ${result.semester_difficulty.toFixed(2)} / 5 for ${data.program}, ${data.thirdYearSemester}. This exploratory feature has not been shown to improve accuracy.`;
    const suggestions = document.getElementById('result-suggestions');
    suggestions.replaceChildren();
    (result.suggestions || []).forEach(text => { const item = document.createElement('li'); item.textContent = text; suggestions.append(item); });
    resultEmpty.classList.add('hidden'); resultFilled.classList.remove('hidden');
    document.getElementById('result-panel').classList.add('filled');
    try { saveEntry({...data, predicted_gwa: result.predicted_gwa, performance_category: result.performance_category, created_at: new Date().toISOString()}); }
    catch { /* The result remains visible if browser storage is unavailable. */ }
  } catch (error) {
    resultEmpty.querySelector('.empty-invite').textContent = 'Could not estimate GWA: ' + error.message;
    resultEmpty.classList.remove('hidden'); resultFilled.classList.add('hidden');
  } finally { checkFormValid(); }
});

document.getElementById('reset-btn').addEventListener('click', () => {
  form.reset(); resultEmpty.classList.remove('hidden'); resultFilled.classList.add('hidden');
  syncSemester();
  document.getElementById('result-panel').classList.remove('filled');
  checkFormValid();
});
checkFormValid();
