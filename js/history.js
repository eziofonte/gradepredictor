const emptyEl = document.getElementById('history-empty');
const contentEl = document.getElementById('history-content');
const tbody = document.getElementById('history-table-body');

async function loadHistory() {
  try {
    const response = await fetch('/results');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();

    // Clear existing rows
    tbody.innerHTML = '';

    if (data.results.length === 0) {
      emptyEl.classList.remove('hidden');
      contentEl.classList.add('hidden');
      return;
    }

    emptyEl.classList.add('hidden');
    contentEl.classList.remove('hidden');

    // Reverse to show most recent first
    const results = data.results.slice().reverse();

    results.forEach(entry => {
      const row = document.createElement('tr');

      // Format date: created_at is like "2026-09-05 14:32:00"
      const dateString = entry.created_at.replace(' ', 'T');
      const date = new Date(dateString);
      const formattedDate = date.toLocaleDateString();

      row.innerHTML = `
        <td>${formattedDate}</td>
        <td>${entry.yearLevel || '—'}</td>
        <td>${entry.program || '—'}</td>
        <td>${entry.daily_screen_time_hrs}h</td>
        <td>${entry.academic_app_usage_hrs}h</td>
        <td>${entry.social_media_hrs}h</td>
        <td>${entry.study_hours_per_day}h</td>
        <td>${entry.study_frequency_per_week}</td>
        <td>${entry.predicted_gwa.toFixed(2)}</td>
        <td>${entry.performance_category}</td>
      `;

      tbody.appendChild(row);
    });
  } catch (err) {
    // Show error in the empty state area
    emptyEl.textContent = `Error loading history: ${err.message}`;
    emptyEl.classList.remove('hidden');
    contentEl.classList.add('hidden');
  }
}

// Initial load
loadHistory();