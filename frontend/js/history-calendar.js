(() => {
  const inputs = [...document.querySelectorAll('#date-from, #date-to')];
  if (!inputs.length) return;

  const date = (year, month, day) => {
    const value = new Date(0);
    value.setFullYear(year, month, day);
    value.setHours(12, 0, 0, 0);
    return value;
  };
  const iso = value => `${String(value.getFullYear()).padStart(4, '0')}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  const parse = value => { const [year, month, day] = value.split('-').map(Number); return date(year, month - 1, day); };
  const today = () => {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en', {
      timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date()).map(part => [part.type, part.value]));
    return date(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
  };
  function refreshBounds() {
    const maximum = iso(today());
    inputs.forEach(field => { field.min = '2026-09-01'; field.max = maximum; });
  }
  refreshBounds();
  inputs.forEach(field => field.addEventListener('focus', refreshBounds));
  inputs[0].form.addEventListener('submit', refreshBounds, true);
  // Native pickers receive the same limits when popovers are unavailable.
  if (!('showPopover' in HTMLElement.prototype)) return;
  const inRange = key => key >= input.min && key <= input.max;
  const clamp = key => key < input.min ? input.min : key > input.max ? input.max : key;
  const monthName = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' });
  const fullDate = new Intl.DateTimeFormat('en', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const arrow = direction => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${direction < 0 ? 'M19 12H5m6-6-6 6 6 6' : 'M5 12h14m-6-6 6 6-6 6'}"/></svg>`;
  const calendar = document.createElement('div');
  calendar.id = 'history-calendar';
  calendar.className = 'history-calendar';
  calendar.setAttribute('popover', 'auto');
  calendar.setAttribute('role', 'dialog');
  calendar.setAttribute('aria-labelledby', 'history-calendar-label history-calendar-month');
  calendar.innerHTML = `<span id="history-calendar-label" class="sr-only"></span>
    <div class="history-calendar-heading"><h2 id="history-calendar-month" aria-live="polite" aria-atomic="true"></h2>
      <div class="history-calendar-month-controls"><button type="button" data-month="-1" aria-label="Previous month">${arrow(-1)}</button><button type="button" data-month="1" aria-label="Next month">${arrow(1)}</button></div>
    </div><table role="grid" aria-labelledby="history-calendar-month"><thead><tr>${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(day => `<th scope="col" abbr="${day}">${day.slice(0, 2)}</th>`).join('')}</tr></thead><tbody></tbody></table>`;
  document.body.append(calendar);
  const grid = calendar.querySelector('tbody');
  let input, trigger, month;
  const isOpen = () => calendar.matches(':popover-open');

  function close(restoreFocus = false) {
    if (isOpen()) calendar.hidePopover();
    trigger?.setAttribute('aria-expanded', 'false');
    if (restoreFocus) trigger?.focus({ preventScroll: true });
  }

  function position() {
    if (!isOpen()) return;
    const anchor = input.getBoundingClientRect();
    if (!input.checkVisibility() || anchor.bottom < 0 || anchor.top > innerHeight) { close(); return; }
    const box = calendar.getBoundingClientRect();
    calendar.style.left = Math.max(12, Math.min(anchor.left, innerWidth - box.width - 12)) + 'px';
    const below = anchor.bottom + 8;
    const top = below + box.height <= innerHeight - 12 ? below : anchor.top - box.height - 8;
    calendar.style.top = Math.max(12, Math.min(top, innerHeight - box.height - 12)) + 'px';
  }

  function render(focusDate) {
    refreshBounds();
    const current = today();
    calendar.querySelector('h2').textContent = monthName.format(month);
    calendar.querySelector('#history-calendar-label').textContent = document.querySelector(`label[for="${input.id}"]`).textContent;
    const selected = inRange(input.value) ? input.value : '';
    const sameMonth = value => value && value.slice(0, 7) === iso(month).slice(0, 7);
    const focus = clamp(focusDate || (sameMonth(selected) ? selected : sameMonth(iso(current)) ? iso(current) : iso(month)));
    calendar.querySelector('[data-month="-1"]').disabled = iso(month).slice(0, 7) <= input.min.slice(0, 7);
    calendar.querySelector('[data-month="1"]').disabled = iso(month).slice(0, 7) >= input.max.slice(0, 7);
    const first = date(month.getFullYear(), month.getMonth(), 1 - month.getDay());
    const days = date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const weeks = Math.ceil((month.getDay() + days) / 7);
    grid.replaceChildren();
    for (let week = 0; week < weeks; week++) {
      const row = document.createElement('tr');
      for (let weekday = 0; weekday < 7; weekday++) {
        const value = date(first.getFullYear(), first.getMonth(), first.getDate() + week * 7 + weekday);
        const key = iso(value);
        const cell = document.createElement('td');
        cell.setAttribute('role', 'gridcell');
        cell.setAttribute('aria-selected', String(key === selected));
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = value.getDate();
        button.dataset.date = key;
        button.disabled = !inRange(key);
        cell.setAttribute('aria-disabled', String(button.disabled));
        button.tabIndex = key === focus ? 0 : -1;
        button.setAttribute('aria-label', fullDate.format(value));
        if (value.getMonth() !== month.getMonth()) button.className = 'history-calendar-outside';
        if (key === iso(current)) button.setAttribute('aria-current', 'date');
        cell.append(button); row.append(cell);
      }
      grid.append(row);
    }
    position();
  }

  function moveMonth(value, offset) {
    const start = date(value.getFullYear(), value.getMonth() + offset, 1);
    const last = date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
    return date(start.getFullYear(), start.getMonth(), Math.min(value.getDate(), last));
  }

  calendar.addEventListener('click', event => {
    const control = event.target.closest('button');
    if (!control || control.disabled || input.disabled) return;
    if (control.dataset.month) {
      month = moveMonth(month, Number(control.dataset.month));
      render();
    } else if (control.dataset.date) {
      if (!inRange(control.dataset.date)) return;
      input.value = control.dataset.date;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      close(true);
    }
  });
  calendar.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); close(true); return; }
    const key = event.target.dataset.date;
    if (!key) return;
    const value = parse(key);
    const offsets = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7, Home: -value.getDay(), End: 6 - value.getDay() };
    let next;
    if (event.key in offsets) next = date(value.getFullYear(), value.getMonth(), value.getDate() + offsets[event.key]);
    else if (event.key === 'PageUp' || event.key === 'PageDown') next = moveMonth(value, (event.key === 'PageUp' ? -1 : 1) * (event.shiftKey ? 12 : 1));
    else return;
    event.preventDefault();
    next = parse(clamp(iso(next)));
    month = date(next.getFullYear(), next.getMonth(), 1);
    render(iso(next));
    grid.querySelector('[tabindex="0"]').focus({ preventScroll: true });
  });
  calendar.addEventListener('focusout', event => {
    if (event.relatedTarget && !calendar.contains(event.relatedTarget) && event.relatedTarget !== trigger) close();
  });
  calendar.addEventListener('toggle', () => {
    trigger?.setAttribute('aria-expanded', String(isOpen()));
  });

  for (const field of inputs) {
    const wrapper = document.createElement('div');
    wrapper.className = 'history-date-control';
    field.before(wrapper); wrapper.append(field);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'history-calendar-toggle';
    button.setAttribute('aria-label', 'Choose ' + document.querySelector(`label[for="${field.id}"]`).textContent.toLowerCase());
    button.setAttribute('aria-haspopup', 'dialog');
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-controls', calendar.id);
    button.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/></svg>';
    wrapper.append(button);
    button.addEventListener('click', () => {
      if (field.disabled) return;
      if (isOpen() && input === field) { close(true); return; }
      close(); input = field; trigger = button;
      refreshBounds();
      const value = field.value ? parse(clamp(field.value)) : today();
      month = date(value.getFullYear(), value.getMonth(), 1);
      render();
      calendar.showPopover();
      button.setAttribute('aria-expanded', 'true');
      position();
      grid.querySelector('[tabindex="0"]').focus({ preventScroll: true });
    });
  }
  window.addEventListener('resize', position);
  window.addEventListener('scroll', position, true);
  window.addEventListener('auth:cleared', () => close());
})();
