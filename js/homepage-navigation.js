(() => {
  const page = document.querySelector('.page--home');
  const nav = document.querySelector('.topnav');
  if (!page || !nav) return;

  const root = document.documentElement;
  const sections = [...page.children].filter(element => element.matches('section[id]'));
  const links = [...nav.querySelectorAll('a[href^="#"]')];
  let headerHeight = 76;
  let scheduled = false;

  function updateActiveSection() {
    scheduled = false;
    const boundary = headerHeight + (window.innerHeight - headerHeight) * 0.25;
    let active = sections[0];
    sections.forEach(section => {
      if (section.getBoundingClientRect().top <= boundary) active = section;
    });
    links.forEach(link => {
      const current = link.getAttribute('href') === '#' + active.id;
      link.classList.toggle('active', current);
      if (current) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  }

  function scheduleUpdate() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(updateActiveSection);
  }

  function updateHeaderHeight() {
    // The mobile disclosure expands the header temporarily; retain its closed height.
    if (!nav.classList.contains('nav-open')) {
      headerHeight = Math.ceil(nav.getBoundingClientRect().height);
      root.style.setProperty('--header-height', headerHeight + 'px');
    }
    scheduleUpdate();
  }

  function alignHashTarget(behavior) {
    const target = sections.find(section => '#' + section.id === location.hash);
    if (target) target.scrollIntoView({ block: 'start', behavior });
    scheduleUpdate();
  }

  if ('ResizeObserver' in window) new ResizeObserver(updateHeaderHeight).observe(nav);
  window.addEventListener('resize', updateHeaderHeight);
  window.addEventListener('scroll', scheduleUpdate, { passive: true });
  window.addEventListener('hashchange', () => {
    alignHashTarget(window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth');
  });
  window.addEventListener('load', () => alignHashTarget('instant'));
  updateHeaderHeight();
})();
