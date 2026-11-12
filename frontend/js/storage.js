const STORAGE_KEY = 'academicPerformanceEntries';

// BANDS array updated to use CSS variables for consistent color system
// Note: Actual colors are defined in style.css using these CSS variables
// The color values here are CSS variable names (as strings) that would need to be used in var() context
const BANDS = [
  { label: 'Excellent', min: 1.00, max: 1.75, color: '--sage' },
  { label: 'Good', min: 1.76, max: 2.50, color: '--sage-dark' },
  { label: 'Satisfactory', min: 2.51, max: 3.00, color: '--gold' },
  { label: 'Failing', min: 3.01, max: 5.00, color: '--muted' },
];

function getEntries() {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : [];
}

function saveEntry(entry) {
  const entries = getEntries();
  entries.push(entry);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function clearEntries() {
  localStorage.removeItem(STORAGE_KEY);
}

function getBand(gwa) {
  return BANDS.find(b => gwa >= b.min && gwa <= b.max) || BANDS[3];
}

// PLACEHOLDER formula only — replace once the real Decision Tree
// model is connected via the Flask backend.
function estimateGWA({ screenTime, studyDuringPhone, studyHours, studyDays }) {
  let base = 2.75;
  base -= studyHours * 0.12;
  base -= studyDays * 0.03;
  base += screenTime * 0.05;
  base += studyDuringPhone * 0.08;
  const gwa = Math.min(5, Math.max(1, base));
  return Math.round(gwa * 100) / 100;
}
