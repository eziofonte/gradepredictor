const emptyEl = document.getElementById('history-empty');
const contentEl = document.getElementById('history-content');
const tbody = document.getElementById('history-table-body');

function loadHistory() {
  const entries = getEntries().slice().reverse();
  tbody.replaceChildren();
  emptyEl.classList.toggle('hidden', entries.length > 0);
  contentEl.classList.toggle('hidden', entries.length === 0);
  entries.forEach(entry => {
    const row = document.createElement('tr');
    const values = [new Date(entry.created_at).toLocaleDateString(), entry.yearLevel || '—', entry.program || '—',
      (entry.screenTime ?? entry.daily_screen_time_hrs ?? '—') + 'h', Number(entry.predicted_gwa).toFixed(2), entry.performance_category];
    values.forEach(value => { const cell = document.createElement('td'); cell.textContent = value; row.append(cell); });
    tbody.append(row);
  });
}
document.getElementById('clear-btn').addEventListener('click', () => { clearEntries(); loadHistory(); });
loadHistory();
