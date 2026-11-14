(() => {
  const el = id => document.getElementById(id);
  const emptyEl = el('history-empty'), content = el('history-content');
  const tbody = el('history-table-body'), cards = el('history-cards');
  const message = el('history-message'), form = el('history-filter-form');
  const prev = el('history-prev'), next = el('history-next');
  const detail = el('history-detail'), confirmation = el('history-confirm');
  const filters = { year_level: el('year-level-filter'), academic_term: el('academic-term-filter'), date_from: el('date-from'), date_to: el('date-to') };
  const phone = window.matchMedia('(max-width: 767px)');
  const limit = 10;
  let requestId = 0, controller, snapshot, pendingQuery = { filters: {}, offset: 0 };
  let loading = false, deleting = false, filtersOpen = false, detailRecord, detailTrigger, pendingDelete;
  const termNames = { '1st Sem': '1st Semester', '2nd Sem': '2nd Semester', Midyear: 'Midyear' };
  const text = value => value === null || value === undefined || value === '' ? '—' : String(value);
  const gwa = record => record.predicted_gwa === null || record.predicted_gwa === undefined || record.predicted_gwa === '' || !Number.isFinite(Number(record.predicted_gwa)) ? '—' : Number(record.predicted_gwa).toFixed(2);
  const term = value => termNames[value] || text(value);
  const hasFilters = query => Object.values(query.filters).some(Boolean);
  function node(tag, value, className) {
    const item = document.createElement(tag);
    if (value !== undefined) item.textContent = value;
    if (className) item.className = className;
    return item;
  }
  function button(label, action, className = 'btn-secondary') {
    const item = node('button', label, className);
    item.type = 'button'; item.addEventListener('click', action); return item;
  }
  function dates(record) {
    const date = new Date(record.created_at);
    if (!record.created_at || Number.isNaN(date.getTime())) return ['—', '—'];
    return [new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium' }).format(date), new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', timeStyle: 'short' }).format(date)];
  }
  function category(record) {
    const badge = node('span', text(record.performance_category), 'history-category');
    if (['Excellent', 'Good', 'Satisfactory', 'Failing'].includes(record.performance_category)) badge.classList.add('history-category--' + record.performance_category.toLowerCase());
    return badge;
  }
  function closeDetail() {
    if (detail.open) detail.close();
  }
  function clearRecords() {
    snapshot = undefined;
    detailRecord = undefined;
    pendingDelete = undefined;
    closeDetail();
    if (confirmation.open) confirmation.close();
    el('history-confirm-description').textContent = '';
    el('history-confirm-error').textContent = '';
    tbody.replaceChildren(); cards.replaceChildren();
    el('history-detail-fields').replaceChildren(); el('history-detail-result').replaceChildren(); el('history-detail-date').textContent = '';
    el('history-count').textContent = ''; el('history-page').textContent = '';
    el('history-table').hidden = cards.hidden = el('history-pagination').hidden = el('history-manage').hidden = el('history-toolbar').hidden = true;
  }
  function globalState(title, description, action) {
    content.classList.add('hidden'); emptyEl.className = 'surface history-state';
    emptyEl.removeAttribute('aria-busy');
    emptyEl.replaceChildren(node('h2', title), node('p', description, 'text-secondary'));
    if (action) emptyEl.append(action);
    emptyEl.hidden = false;
  }
  function invalidate(status) {
    window.invalidateAuth(status === 401 ? 'session-expired' : 'identity-changed');
    if (status === 401) globalState('Your session has expired', 'Sign in again to view your history.', window.createMicrosoftSignIn('/history.html'));
    else globalState('Your account changed', 'Reload to continue with your current account.', button('Reload', () => location.reload()));
  }
  function controls() {
    prev.disabled = loading || deleting || !snapshot || snapshot.query.offset === 0;
    next.disabled = loading || deleting || !snapshot?.hasMore;
    el('clear-btn').disabled = loading || deleting;
    el('history-detail-delete').disabled = loading || deleting;
    el('history-confirm-cancel').disabled = deleting;
    el('history-confirm-delete').disabled = deleting;
    confirmation.setAttribute('aria-busy', String(deleting));
    form.querySelectorAll('button, input, select').forEach(control => { control.disabled = deleting; });
    el('history-reset-applied').disabled = deleting;
    el('history-records').setAttribute('aria-busy', String(loading));
  }
  function filterDisclosure() {
    const toggle = el('history-filter-toggle');
    toggle.hidden = !phone.matches;
    form.hidden = phone.matches && !filtersOpen;
    toggle.setAttribute('aria-expanded', String(!form.hidden));
  }
  function appliedSummary(query) {
    const values = query.filters;
    const parts = [];
    if (values.year_level) parts.push(values.year_level);
    if (values.academic_term) parts.push(term(values.academic_term));
    if (values.date_from) parts.push('From ' + values.date_from);
    if (values.date_to) parts.push('To ' + values.date_to);
    el('history-applied-filters').textContent = parts.length ? 'Applied: ' + parts.join(' · ') : 'All assessments';
    el('history-reset-applied').hidden = !parts.length;
    el('history-filter-toggle').textContent = parts.length ? `Filters (${parts.length})` : 'Filters';
  }
  function detailButton(record) {
    const [date, time] = dates(record);
    const action = button('View details', () => openDetails(record, action));
    action.dataset.recordId = String(record.id);
    action.setAttribute('aria-label', `View assessment from ${date}, ${time}`);
    return action;
  }
  function renderRecords() {
    const focusedId = document.activeElement?.dataset.recordId;
    tbody.replaceChildren(); cards.replaceChildren();
    el('history-table').hidden = phone.matches || !snapshot?.records.length;
    cards.hidden = !phone.matches || !snapshot?.records.length;
    for (const record of snapshot?.records || []) {
      const [date, time] = dates(record);
      const academic = [text(record.year_level), term(record.academic_term)].join(' · ');
      if (phone.matches) {
        const card = node('article', undefined, 'surface history-card');
        const heading = node('div', undefined, 'history-card-date');
        heading.append(node('h2', date), node('span', time, 'text-secondary'));
        const result = node('div', undefined, 'history-card-result');
        const score = node('div');
        score.append(node('span', 'Predicted GWA', 'text-secondary'), node('strong', gwa(record), 'history-gwa'));
        result.append(score, category(record));
        const context = node('p', academic, 'history-card-context');
        context.append(node('span', text(record.program), 'history-subline text-secondary'));
        card.append(heading, result, context, detailButton(record)); cards.append(card);
      } else {
        const row = node('tr');
        const dateCell = node('td', date); dateCell.append(node('span', time, 'history-subline text-secondary'));
        const academicCell = node('td', academic); academicCell.append(node('span', text(record.program), 'history-subline text-secondary'));
        const scoreCell = node('td'); scoreCell.append(node('strong', gwa(record), 'history-gwa'));
        const bandCell = node('td'); bandCell.append(category(record));
        const actionCell = node('td'); actionCell.append(detailButton(record));
        row.append(dateCell, academicCell, scoreCell, bandCell, actionCell); tbody.append(row);
      }
    }
    if (focusedId) [...document.querySelectorAll('[data-record-id]')].find(item => item.dataset.recordId === focusedId)?.focus();
  }
  function renderSnapshot() {
    appliedSummary(snapshot.query);
    const filtered = hasFilters(snapshot.query), total = snapshot.total;
    el('history-count').textContent = `${total} ${filtered ? 'matching ' : 'saved '}${total === 1 ? 'assessment' : 'assessments'}`;
    el('history-toolbar').hidden = !total && !filtered;
    el('history-filter-panel').hidden = !total && !filtered;
    el('history-manage').hidden = !total && !filtered;
    el('history-pagination').hidden = !total;
    el('history-page').textContent = total ? `${snapshot.query.offset + 1}–${Math.min(snapshot.query.offset + snapshot.records.length, total)} of ${total}` : '0 results';
    const state = el('history-state');
    state.hidden = snapshot.records.length > 0;
    if (!snapshot.records.length) {
      state.replaceChildren(node('h2', filtered ? 'No assessments match these filters' : 'No assessments yet'), node('p', filtered ? 'Try a different year, term, or date range.' : 'Your signed-in assessments are saved automatically. Take an assessment to start your record.', 'text-secondary'));
      if (filtered) state.append(button('Reset filters', resetFilters));
      else { const link = node('a', 'New assessment', 'btn-primary'); link.href = '/#assessment'; state.append(link); }
    }
    renderRecords(); controls();
  }
  async function loadHistory(query = pendingQuery, successMessage = '') {
    if (window.authInvalidated) return;
    const currentRequest = ++requestId;
    pendingQuery = { filters: { ...query.filters }, offset: query.offset };
    const requested = pendingQuery;
    controller?.abort();
    const activeController = new AbortController();
    controller = activeController;
    const signal = activeController.signal;
    const timeout = setTimeout(() => activeController.abort(), 15000);
    loading = true;
    controls();
    try {
      const auth = await window.authReady;
      if (currentRequest !== requestId || window.authInvalidated) return;
      if (!auth.authenticated) {
        const guestLink = node('a', 'Take an assessment as a guest'); guestLink.href = '/?scroll=assessment';
        globalState('Nothing to see here', 'Use your PLM school account to save your assessments.', window.createMicrosoftSignIn('/history.html'));
        emptyEl.append(guestLink); return;
      }
      emptyEl.hidden = true; emptyEl.removeAttribute('aria-busy'); content.classList.remove('hidden');
      el('history-filter-panel').hidden = false;
      el('history-loading').hidden = !!snapshot;
      if (!snapshot) el('history-state').hidden = true;
      message.replaceChildren(snapshot ? 'Refreshing your history… Previously loaded results are shown below.' : '');
      message.classList.remove('history-message--error', 'sr-only');
      const params = new URLSearchParams({ limit, offset: requested.offset });
      Object.entries(requested.filters).forEach(([key, value]) => { if (value) params.set(key, value); });
      const response = await fetch('/results?' + params, { headers: { 'X-Expected-User': String(auth.user.id) }, cache: 'no-store', signal });
      const data = await response.json();
      if (currentRequest !== requestId || window.authInvalidated) return;
      if (response.status === 401 || response.status === 409) { invalidate(response.status); return; }
      if (!response.ok) throw new Error(data.error || 'Please try again.');
      if (!Array.isArray(data.results) || !Number.isInteger(data.pagination?.total) || data.pagination.total < 0) throw new Error('The server returned an incomplete history response.');
      if (!data.results.length && requested.offset > 0) {
        const last = data.pagination.total ? Math.floor((data.pagination.total - 1) / limit) * limit : 0;
        return loadHistory({ filters: requested.filters, offset: last }, successMessage);
      }
      snapshot = { records: data.results, total: data.pagination.total, hasMore: data.pagination.has_more, query: requested };
      renderSnapshot();
      message.replaceChildren(successMessage || `${data.pagination.total} ${data.pagination.total === 1 ? 'assessment' : 'assessments'} found.`);
      message.classList.toggle('sr-only', !successMessage);
    } catch (error) {
      if (currentRequest !== requestId || window.authInvalidated) return;
      if (content.classList.contains('hidden')) {
        globalState('Account unavailable', 'We could not check your account. Retry to continue.', button('Retry account', () => document.querySelector('.account-unavailable button')?.click()));
      } else {
        message.classList.remove('sr-only');
        message.classList.add('history-message--error');
        const retry = button('Retry', () => loadHistory(requested));
        const explanation = signal.aborted ? 'The request timed out. Please try again.' : error.message;
        const prefix = successMessage ? successMessage + ' ' : '';
        if (snapshot) message.replaceChildren(node('span', `${prefix}We couldn't refresh your history. Showing previously loaded results and filters. ${explanation}`), retry);
        else { el('history-state').replaceChildren(node('h2', "We couldn't load your history"), node('p', prefix + explanation, 'text-secondary'), retry); el('history-state').hidden = false; }
      }
    } finally {
      clearTimeout(timeout);
      if (currentRequest === requestId) { loading = false; el('history-loading').hidden = true; controls(); }
    }
  }
  function resetFilters() {
    Object.values(filters).forEach(field => { field.value = ''; field.removeAttribute('aria-invalid'); });
    el('history-date-error').hidden = true;
    loadHistory({ filters: {}, offset: 0 });
  }
  function openDetails(record, trigger, focusDelete = false) {
    detailRecord = record; detailTrigger = trigger;
    const [date, time] = dates(record);
    el('history-detail-date').textContent = `${date} · ${time}`;
    el('history-detail-result').replaceChildren(node('div', 'Predicted GWA', 'text-secondary'), node('strong', gwa(record), 'history-gwa'), category(record));
    const fields = el('history-detail-fields'); fields.replaceChildren();
    const unit = (value, suffix) => value === null || value === undefined || value === '' ? '—' : `${value} ${suffix}`;
    const academic = node('dl'), habits = node('dl');
    fields.append(node('h3', 'Academic details'), academic, node('h3', 'Daily habits'), habits);
    for (const [index, [label, value]] of [['Program', text(record.program)], ['Year level', text(record.year_level)], ['Academic term', term(record.academic_term)], ['Screen time', unit(record.daily_screen_time_hrs, 'hrs / day')], ['Academic app usage', unit(record.academic_app_usage_hrs, 'hrs / day')], ['Social media usage', unit(record.social_media_hrs, 'hrs / day')], ['Study hours', unit(record.study_hours_per_day, 'hrs / day')], ['Study frequency', unit(record.study_frequency_per_week, 'days / week')]].entries()) {
      const group = node('div'); group.append(node('dt', label), node('dd', value)); (index < 3 ? academic : habits).append(group);
    }
    detail.showModal();
    if (focusDelete) el('history-detail-delete').focus();
  }
  function promptDelete(id) {
    if (deleting || loading || window.authInvalidated) return;
    const record = id === null ? null : detailRecord;
    if (id !== null && !record) return;
    pendingDelete = { id, record, fromDetail: id !== null };
    el('history-confirm-title').textContent = id === null ? 'Clear all your history?' : 'Delete this assessment?';
    el('history-confirm-description').textContent = id === null
      ? 'This deletes all your assessments, including records outside the current filters.'
      : `Assessment from ${dates(record).join(', ')}, predicted GWA ${gwa(record)}.`;
    el('history-confirm-delete').textContent = id === null ? 'Delete all assessments' : 'Delete assessment';
    el('history-confirm-error').hidden = true;
    el('history-confirm-error').textContent = '';
    closeDetail();
    confirmation.showModal();
    el('history-confirm-cancel').focus();
  }
  function cancelDelete() {
    if (deleting) return;
    const previous = pendingDelete;
    pendingDelete = undefined;
    if (confirmation.open) confirmation.close();
    if (previous?.fromDetail && !window.authInvalidated) openDetails(previous.record, detailTrigger, true);
    else if (!window.authInvalidated && previous) el('clear-btn').focus();
  }
  async function removeHistory() {
    if (!pendingDelete || deleting || loading || window.authInvalidated) return;
    const { id } = pendingDelete;
    deleting = true; controls();
    el('history-confirm-delete').textContent = 'Deleting…';
    el('history-confirm-error').hidden = true;
    try {
      const auth = await window.getFreshAuth();
      if (window.authInvalidated) return;
      const response = await fetch(id === null ? '/results' : `/results/${id}`, { method: 'DELETE', headers: window.authHeaders(auth), signal: AbortSignal.timeout(15000) });
      const data = await response.json();
      if (window.authInvalidated) return;
      if (response.status === 401 || response.status === 409) { invalidate(response.status); return; }
      if (!response.ok) throw new Error(data.error || 'Could not delete history.');
      const query = snapshot?.query || { filters: {}, offset: 0 };
      pendingDelete = undefined;
      confirmation.close();
      deleting = false;
      await loadHistory({ filters: query.filters, offset: id === null ? 0 : query.offset }, id === null ? 'All assessments deleted.' : 'Assessment deleted.');
      if (!window.authInvalidated) (el('history-toolbar').hidden ? el('history-title') : el('history-count')).focus();
    } catch (error) {
      if (!window.authInvalidated) {
        el('history-confirm-error').textContent = error.name === 'TimeoutError' ? 'The request timed out. Please try again.' : 'Could not delete assessments. ' + error.message;
        el('history-confirm-error').hidden = false;
      }
    } finally {
      deleting = false; controls();
      if (pendingDelete) {
        el('history-confirm-delete').textContent = pendingDelete.id === null ? 'Delete all assessments' : 'Delete assessment';
        if (confirmation.open) el('history-confirm-delete').focus();
      }
    }
  }
  form.addEventListener('submit', event => {
    event.preventDefault();
    const dates = [filters.date_from, filters.date_to];
    dates.forEach(field => field.removeAttribute('aria-invalid'));
    const outsideRange = dates.find(field => !field.checkValidity());
    if (outsideRange) {
      el('history-date-error').hidden = false;
      el('history-date-error').textContent = 'Choose dates from September 1, 2026 through today.';
      outsideRange.setAttribute('aria-invalid', 'true');
      outsideRange.focus();
      return;
    }
    const draft = Object.fromEntries(Object.entries(filters).map(([key, field]) => [key, field.value]));
    const invalid = draft.date_from && draft.date_to && draft.date_from > draft.date_to;
    el('history-date-error').hidden = !invalid;
    if (invalid) { el('history-date-error').textContent = 'To date must be on or after From date.'; filters.date_to.setAttribute('aria-invalid', 'true'); filters.date_to.focus(); return; }
    filters.date_to.removeAttribute('aria-invalid');
    loadHistory({ filters: draft, offset: 0 });
  });
  el('history-reset').addEventListener('click', resetFilters);
  el('history-reset-applied').addEventListener('click', resetFilters);
  el('history-filter-toggle').addEventListener('click', () => { filtersOpen = !filtersOpen; filterDisclosure(); });
  prev.addEventListener('click', () => { if (snapshot && !loading) loadHistory({ filters: snapshot.query.filters, offset: Math.max(0, snapshot.query.offset - limit) }); });
  next.addEventListener('click', () => { if (snapshot && !loading) loadHistory({ filters: snapshot.query.filters, offset: snapshot.query.offset + limit }); });
  el('clear-btn').addEventListener('click', () => promptDelete(null));
  el('history-detail-close').addEventListener('click', closeDetail);
  el('history-detail-delete').addEventListener('click', () => promptDelete(detailRecord.id));
  el('history-confirm-cancel').addEventListener('click', cancelDelete);
  el('history-confirm-delete').addEventListener('click', removeHistory);
  confirmation.addEventListener('cancel', event => { event.preventDefault(); cancelDelete(); });
  detail.addEventListener('close', () => {
    if (confirmation.open || detail.open || loading || deleting || window.authInvalidated) return;
    const replacement = [...document.querySelectorAll('[data-record-id]')].find(item => item.dataset.recordId === String(detailRecord?.id));
    (detailTrigger?.isConnected ? detailTrigger : replacement)?.focus();
  });
  phone.addEventListener('change', () => {
    if (phone.matches && form.contains(document.activeElement)) el('history-filter-toggle').focus();
    filterDisclosure(); if (snapshot) renderRecords();
  });
  window.addEventListener('auth:ready', () => loadHistory());
  window.addEventListener('auth:cleared', () => { requestId++; controller?.abort(); loading = false; clearRecords(); message.replaceChildren(); content.classList.add('hidden'); });
  window.addEventListener('auth:account-changed', () => globalState('Your account changed', 'Reload to continue with your current account.', button('Reload', () => location.reload())));
  filterDisclosure();
  loadHistory();
})();
