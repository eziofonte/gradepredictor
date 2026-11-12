const form = document.getElementById('estimator-form');
const resultPanel = document.getElementById('result-panel');
const resultEmpty = document.getElementById('result-empty');
const resultFilled = document.getElementById('result-filled');
const submitBtn = document.getElementById('submit-btn');
const resetBtn = document.getElementById('reset-btn');

const requiredFields = ['screenTime', 'studyDuringPhone', 'studyHours', 'studyDays'];

function checkFormValid() {
  const allFilled = requiredFields.every(id => document.getElementById(id).value !== '');
  submitBtn.disabled = !allFilled;
}

requiredFields.forEach(id => {
  document.getElementById(id).addEventListener('input', checkFormValid);
});

form.addEventListener('submit', (e) => {
  e.preventDefault();
  // No backend connected yet — this just demonstrates the UI transition.
  resultEmpty.classList.add('hidden');
  resultFilled.classList.remove('hidden');
  resultPanel.classList.add('filled');
});

resetBtn.addEventListener('click', () => {
  form.reset();
  resultEmpty.classList.remove('hidden');
  resultFilled.classList.add('hidden');
  resultPanel.classList.remove('filled');
  checkFormValid();
});

checkFormValid();