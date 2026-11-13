document.addEventListener('DOMContentLoaded', () => {
  const inputs = document.querySelectorAll('#estimator-form input[type="number"]');

  inputs.forEach(input => {
    const wrapper = document.createElement('div');
    wrapper.className = 'number-field';
    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);

    const stepperUp = document.createElement('button');
    stepperUp.type = 'button';
    stepperUp.className = 'stepper-up';
    stepperUp.innerHTML = '<svg width="10" height="6" viewBox="0 0 10 6" fill="none"><path d="M1 5l4-4 4 4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    stepperUp.setAttribute('aria-label', 'Increase value');

    const stepperDown = document.createElement('button');
    stepperDown.type = 'button';
    stepperDown.className = 'stepper-down';
    stepperDown.innerHTML = '<svg width="10" height="6" viewBox="0 0 10 6" fill="none"><path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    stepperDown.setAttribute('aria-label', 'Decrease value');

    wrapper.appendChild(stepperUp);
    wrapper.appendChild(stepperDown);

    const adjustValue = direction => {
      const step = Number(input.getAttribute('step')) || 1;
      const currentValue = Number(input.value) || 0;
      let nextValue = currentValue + direction * step;
      const min = Number(input.getAttribute('min'));
      const max = Number(input.getAttribute('max'));

      if (Number.isFinite(min)) nextValue = Math.max(nextValue, min);
      if (Number.isFinite(max)) nextValue = Math.min(nextValue, max);

      input.value = nextValue;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };

    stepperUp.addEventListener('mousedown', e => e.preventDefault());
    stepperDown.addEventListener('mousedown', e => e.preventDefault());

    stepperUp.addEventListener('click', () => adjustValue(1));
    stepperDown.addEventListener('click', () => adjustValue(-1));
  });
});
