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

