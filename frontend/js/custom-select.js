function initializeCustomSelect(select) {
  const wrapper = document.createElement('div');
  wrapper.className = 'custom-select-wrapper';
  select.parentNode.insertBefore(wrapper, select);
  wrapper.appendChild(select);
  select.style.display = 'none';

  const trigger = document.createElement('button');
  trigger.type = 'button'; trigger.className = 'custom-select-trigger';
  trigger.id = select.id + '-control';
  trigger.setAttribute('role', 'combobox');
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-controls', select.id + '-options');
  if (select.required) trigger.setAttribute('aria-required', 'true');
  const label = document.querySelector(`label[for="${select.id}"]`);
  if (label) {
    label.id ||= select.id + '-label';
    label.htmlFor = trigger.id;
    trigger.setAttribute('aria-labelledby', label.id + ' ' + select.id + '-value');
  }
  if (select.getAttribute('aria-describedby')) trigger.setAttribute('aria-describedby', select.getAttribute('aria-describedby'));
  const value = document.createElement('span'); value.id = select.id + '-value';
  trigger.append(value);
  trigger.insertAdjacentHTML('beforeend', '<svg width="10" height="6" viewBox="0 0 10 6" fill="none" aria-hidden="true"><path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>');

  const list = document.createElement('ul');
  list.id = select.id + '-options'; list.className = 'custom-select-list';
  list.setAttribute('role', 'listbox'); list.hidden = true;
  if (label) list.setAttribute('aria-labelledby', label.id);
  const options = [...select.options].filter(option => option.value !== '' && !option.disabled);
  let active = -1, search = '', lastKey = 0;
  const items = options.map((option, index) => {
    const item = document.createElement('li');
    item.id = select.id + '-option-' + index;
    item.className = 'custom-select-option'; item.setAttribute('role', 'option');
    item.dataset.value = option.value; item.textContent = option.textContent;
    // Keep focus on the combobox until the option's click has selected it.
    item.addEventListener('mousedown', event => event.preventDefault());
    item.addEventListener('click', () => choose(index));
    list.append(item); return item;
  });
  function highlight(index) {
    active = index;
    items.forEach((item, i) => item.classList.toggle('active', i === index));
    if (items[index]) {
      trigger.setAttribute('aria-activedescendant', items[index].id);
      items[index].scrollIntoView?.({ block: 'nearest' });
    }
  }
  function setOpen(open) {
    wrapper.classList.toggle('open', open); list.hidden = !open;
    trigger.setAttribute('aria-expanded', String(open));
    if (open) {
      document.querySelectorAll('.custom-select-wrapper').forEach(other => { if (other !== wrapper) other.dispatchEvent(new Event('select:close')); });
      highlight(Math.max(0, options.findIndex(option => option.value === select.value)));
    } else trigger.removeAttribute('aria-activedescendant');
  }
  function sync() {
    value.textContent = select.options[select.selectedIndex]?.textContent || select.options[0]?.textContent || 'Select';
    items.forEach((item, i) => {
      const selected = options[i].value === select.value;
      item.classList.toggle('selected', selected); item.setAttribute('aria-selected', String(selected));
    });
  }
  function choose(index) {
    if (!options[index]) return;
    select.value = options[index].value;
    sync(); setOpen(false); trigger.focus();
    select.dispatchEvent(new Event('change', { bubbles: true }));
    select.dispatchEvent(new Event('input', { bubbles: true }));
  }
  wrapper.append(trigger, list);
  sync();
  trigger.addEventListener('click', () => setOpen(list.hidden));
  trigger.addEventListener('keydown', event => {
    const open = !list.hidden;
    if (event.key === 'Escape' || event.key === 'Tab') {
      if (open && event.key === 'Escape') event.preventDefault();
      setOpen(false); return;
    }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      if (!items.length) return;
      const previous = active;
      if (!open) setOpen(true);
      if (event.key === 'Home') highlight(0);
      else if (event.key === 'End') highlight(items.length - 1);
      else if (open) highlight((previous + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length);
      else if (event.key === 'ArrowUp' && !select.value) highlight(items.length - 1);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault(); if (open) choose(active); else setOpen(true); return;
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const now = Date.now(); search = now - lastKey > 700 ? event.key : search + event.key; lastKey = now;
      const index = options.findIndex(option => option.textContent.toLowerCase().startsWith(search.toLowerCase()));
      if (index !== -1) { event.preventDefault(); if (!open) setOpen(true); highlight(index); }
    }
  });
  wrapper.addEventListener('select:close', () => setOpen(false));
  wrapper.addEventListener('focusout', event => { if (event.relatedTarget && !wrapper.contains(event.relatedTarget)) setOpen(false); });
  document.addEventListener('click', event => { if (!wrapper.contains(event.target)) setOpen(false); });
  select.addEventListener('change', sync);
  select.addEventListener('invalid', event => { event.preventDefault(); trigger.focus(); select.dispatchEvent(new Event('input', { bubbles: true })); });
  select.form?.addEventListener('reset', () => queueMicrotask(() => { sync(); setOpen(false); trigger.removeAttribute('aria-invalid'); }));
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.select-shell > select').forEach(initializeCustomSelect);
});
