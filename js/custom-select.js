document.addEventListener('DOMContentLoaded', () => {
  const select = document.querySelector('select#yearLevel');
  if (!select) return;

  const wrapper = document.createElement('div');
  wrapper.className = 'custom-select-wrapper';
  select.parentNode.insertBefore(wrapper, select);
  wrapper.appendChild(select);
  select.style.display = 'none';

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'custom-select-trigger';
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.innerHTML = 'Select year level <svg width="10" height="6" viewBox="0 0 10 6" fill="none"><path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  const list = document.createElement('ul');
  list.className = 'custom-select-list';
  list.setAttribute('role', 'listbox');

  Array.from(select.options).forEach(option => {
    if (option.value === '') return;

    const item = document.createElement('li');
    item.className = 'custom-select-option';
    item.setAttribute('role', 'option');
    item.dataset.value = option.value;
    item.textContent = option.textContent;

    item.addEventListener('click', () => {
      select.value = item.dataset.value;
      trigger.firstChild.textContent = item.textContent;
      list.querySelectorAll('.custom-select-option').forEach(sibling => {
        sibling.classList.remove('selected');
        sibling.setAttribute('aria-selected', 'false');
      });
      item.classList.add('selected');
      item.setAttribute('aria-selected', 'true');
      select.dispatchEvent(new Event('change', { bubbles: true }));
      select.dispatchEvent(new Event('input', { bubbles: true }));
      wrapper.classList.remove('open');
      trigger.setAttribute('aria-expanded', 'false');
    });

    list.appendChild(item);
  });

  wrapper.appendChild(trigger);
  wrapper.appendChild(list);

  trigger.addEventListener('click', () => {
    const isOpen = wrapper.classList.toggle('open');
    trigger.setAttribute('aria-expanded', String(isOpen));
  });

  document.addEventListener('click', event => {
    if (!wrapper.contains(event.target)) {
      wrapper.classList.remove('open');
      trigger.setAttribute('aria-expanded', 'false');
    }
  });

  trigger.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      wrapper.classList.remove('open');
      trigger.setAttribute('aria-expanded', 'false');
    }
  });
});
