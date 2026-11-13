(() => {
  document.querySelectorAll('[data-how-it-works]').forEach(group => {
    const items = [...group.querySelectorAll('.how-works-item')];
    const triggers = items.map(item => item.querySelector('summary'));

    items.forEach(item => {
      // Also keep one item open in browsers without exclusive details groups.
      item.addEventListener('toggle', () => {
        if (item.open) items.forEach(other => { if (other !== item) other.open = false; });
      });
    });

    triggers.forEach((trigger, index) => {
      trigger.addEventListener('keydown', event => {
        let next;
        if (event.key === 'ArrowDown') next = (index + 1) % triggers.length;
        else if (event.key === 'ArrowUp') next = (index - 1 + triggers.length) % triggers.length;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = triggers.length - 1;
        else return;
        event.preventDefault();
        triggers[next].focus();
      });
    });
  });
})();
