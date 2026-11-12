// Keep the loaded identity and CSRF token paired; stale tabs still fail closed.
(() => {
  window.authHeaders = auth => ({
    'X-CSRFToken': auth.csrf_token,
    'X-Expected-User': auth.authenticated ? String(auth.user.id) : 'guest'
  });

  window.createMicrosoftSignIn = (returnTo, compact = false) => {
    const link = document.createElement('a');
    link.className = 'microsoft-signin';
    link.href = '/auth/login?next=' + encodeURIComponent(returnTo);
    link.setAttribute('aria-label', 'Sign in with Microsoft');
    const logo = document.createElement('img');
    logo.src = '/assets/icons/microsoft.svg';
    logo.alt = '';
    logo.width = logo.height = 21;
    const label = document.createElement('span');
    label.className = 'microsoft-full-label';
    label.textContent = 'Sign in with Microsoft';
    link.append(logo, label);
    if (compact) {
      const short = document.createElement('span');
      short.className = 'microsoft-short-label';
      short.textContent = 'Sign in';
      short.setAttribute('aria-hidden', 'true');
      link.append(short);
    }
    link.addEventListener('click', event => {
      const path = location.pathname.replace(/^\/html\//, '/');
      const result = document.getElementById('result-filled');
      if (compact && (path === '/' || path === '/index.html') && (location.hash === '#assessment' || (result && !result.classList.contains('hidden')))) {
        link.href = '/auth/login?next=' + encodeURIComponent('/#assessment');
      }
      if (event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      if (link.getAttribute('aria-disabled') === 'true') { event.preventDefault(); return; }
      link.setAttribute('aria-disabled', 'true');
      link.setAttribute('aria-busy', 'true');
    });
    return link;
  };

  const nav = document.querySelector('.topnav');
  const actions = nav?.querySelector('.nav-actions');
  const account = document.createElement('div');
  account.className = 'account-controls account-slot';
  actions?.prepend(account);
  let closeAccount = () => {};
  let closeNavigation = () => {};
  let currentAuth;
  let fetching = false;
  let accountChannel;
  const accountEventKey = 'acad-perf:auth-event';
  const seenEvents = new Set();
  const pendingAccountEvents = [];
  try {
    if ('BroadcastChannel' in window) accountChannel = new BroadcastChannel('acad-perf-account');
  } catch { /* Account-change detection still occurs on protected requests. */ }
  function announceAccount(data) {
    const event = { ...data, eventId: crypto.randomUUID() };
    try { accountChannel?.postMessage(event); } catch { /* Use the storage fallback. */ }
    try { localStorage.setItem(accountEventKey, JSON.stringify(event)); localStorage.removeItem(accountEventKey); } catch { /* Protected requests still check ownership. */ }
  }

  async function fetchSession() {
    const response = await fetch('/auth/session', { cache: 'no-store', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('Account service is unavailable. Please try again.');
    const auth = await response.json();
    if (typeof auth.authenticated !== 'boolean' || typeof auth.csrf_token !== 'string' || !auth.csrf_token || (auth.authenticated && !auth.user?.id)) throw new Error('Account service returned an invalid response.');
    return auth;
  }
  const identity = auth => auth?.authenticated ? String(auth.user.id) : null;
  window.getFreshAuth = async () => {
    await window.authReady;
    if (window.authInvalidated) throw new Error('Your session changed. Reload the page to continue.');
    const expected = identity(currentAuth);
    const auth = await fetchSession();
    if (window.authInvalidated) throw new Error('Your session changed. Reload the page to continue.');
    if (identity(auth) !== expected) {
      window.invalidateAuth(auth.authenticated ? 'identity-changed' : 'session-expired');
      showAccountChanged();
      throw new Error('Your session changed or expired. Reload the page to continue.');
    }
    currentAuth = auth;
    window.authReady = Promise.resolve(auth);
    return auth;
  };

  if (nav && actions) {
    const links = nav.querySelector('.nav-links');
    const theme = nav.querySelector('.theme-toggle');
    const disclosure = document.createElement('div');
    disclosure.id = 'navigation-disclosure';
    disclosure.className = 'nav-disclosure';
    if (links) disclosure.append(links);
    nav.append(disclosure);
    const menu = document.createElement('button');
    menu.type = 'button';
    menu.className = 'btn-secondary nav-menu-toggle';
    menu.textContent = 'Menu';
    menu.setAttribute('aria-controls', disclosure.id);
    menu.setAttribute('aria-expanded', 'false');
    actions.append(menu);
    const narrow = window.matchMedia('(max-width: 1199px)');
    const phone = window.matchMedia('(max-width: 767px)');
    // The original disclosure remains the tablet fallback. Native dialogs provide
    // focus containment and an inert background on phones without duplicate controls.
    const drawer = document.createElement('dialog');
    const supportsDrawer = typeof drawer.showModal === 'function';
    drawer.id = 'mobile-navigation';
    drawer.className = 'mobile-nav-drawer';
    drawer.setAttribute('aria-labelledby', 'mobile-navigation-title');
    drawer.hidden = true;
    drawer.innerHTML = '<div class="mobile-nav-heading"><h2 id="mobile-navigation-title">Menu</h2><button type="button" class="btn-secondary mobile-nav-close" autofocus aria-label="Close menu">Close</button></div><div class="mobile-nav-links"></div><div class="mobile-nav-account"></div><div class="mobile-nav-theme"><span>Appearance</span></div>';
    nav.append(drawer);
    const mobileLinks = drawer.querySelector('.mobile-nav-links');
    const mobileAccount = drawer.querySelector('.mobile-nav-account');
    const mobileTheme = drawer.querySelector('.mobile-nav-theme');
    let lockedScroll;
    function unlockScroll() {
      if (!lockedScroll) return;
      document.documentElement.classList.remove('mobile-nav-locked');
      document.body.style.removeProperty('--mobile-nav-scroll-y');
      window.scrollTo({ left: lockedScroll.x, top: lockedScroll.y, behavior: 'instant' });
      lockedScroll = null;
    }
    closeNavigation = (restoreFocus = false) => {
      nav.classList.remove('nav-open');
      menu.setAttribute('aria-expanded', 'false');
      if (drawer.open) drawer.close();
      unlockScroll();
      if (restoreFocus && narrow.matches) menu.focus({ preventScroll: true });
    };
    const adaptNavigation = () => {
      const focused = document.activeElement;
      const wasInDrawer = drawer.contains(focused);
      if (narrow.matches && (disclosure.contains(focused) || wasInDrawer)) menu.focus();
      closeNavigation();
      const mobile = phone.matches && supportsDrawer;
      nav.classList.toggle('mobile-nav-enabled', mobile);
      drawer.hidden = !mobile;
      menu.setAttribute('aria-controls', mobile ? drawer.id : disclosure.id);
      // Text and icon styling on phones stays separate from the original tablet button.
      menu.classList.toggle('mobile-nav-toggle', mobile);
      if (links) (mobile ? mobileLinks : disclosure).append(links);
      if (mobile) mobileAccount.append(account);
      else actions.prepend(account);
      if (theme) (mobile ? mobileTheme : narrow.matches ? disclosure : actions).append(theme);
      if (narrow.matches) nav.append(disclosure);
      else nav.insertBefore(disclosure, actions);
      if (theme?.contains(focused)) (narrow.matches ? menu : focused).focus();
      if (!narrow.matches && (document.activeElement === menu || wasInDrawer)) links?.querySelector('a')?.focus();
      closeAccount(account.contains(document.activeElement));
    };
    menu.addEventListener('click', () => {
      const open = menu.getAttribute('aria-expanded') !== 'true';
      closeAccount();
      if (!open) { closeNavigation(true); return; }
      if (phone.matches && supportsDrawer) {
        lockedScroll = { x: window.scrollX, y: window.scrollY };
        document.body.style.setProperty('--mobile-nav-scroll-y', -lockedScroll.y + 'px');
        document.documentElement.classList.add('mobile-nav-locked');
        drawer.showModal();
      }
      nav.classList.toggle('nav-open', open);
      menu.setAttribute('aria-expanded', String(open));
    });
    drawer.querySelector('.mobile-nav-close').addEventListener('click', () => closeNavigation(true));
    drawer.addEventListener('cancel', event => { event.preventDefault(); closeNavigation(true); });
    drawer.addEventListener('close', () => {
      if (drawer.open) return; // Ignore a queued close event after a rapid reopen.
      nav.classList.remove('nav-open'); menu.setAttribute('aria-expanded', 'false'); unlockScroll();
    });
    drawer.addEventListener('keydown', event => {
      if (event.key !== 'Tab') return;
      const focusable = [...drawer.querySelectorAll('a[href], button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])')]
        .filter(element => element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden');
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    drawer.addEventListener('click', event => {
      if (event.target.closest('a')) closeNavigation(true);
      else if (event.target === drawer) {
        const box = drawer.getBoundingClientRect();
        if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) closeNavigation(true);
      }
    });
    disclosure.addEventListener('click', event => { if (event.target.closest('a')) closeNavigation(true); });
    document.addEventListener('click', event => {
      if (!nav.contains(event.target)) closeNavigation(disclosure.contains(document.activeElement));
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && nav.classList.contains('nav-open')) {
        if (drawer.open && account.querySelector('.account-trigger[aria-expanded="true"]')) return;
        closeNavigation(true); event.preventDefault();
      }
    });
    nav.addEventListener('focusout', event => { if (event.relatedTarget && !nav.contains(event.relatedTarget)) closeNavigation(); });
    narrow.addEventListener('change', adaptNavigation);
    phone.addEventListener('change', adaptNavigation);
    nav.classList.add('nav-enhanced');
    adaptNavigation();
  }

  function showLoading() {
    const loading = document.createElement('span');
    loading.className = 'account-loading';
    loading.textContent = 'Loading account…';
    loading.setAttribute('role', 'status');
    account.setAttribute('aria-busy', 'true');
    account.replaceChildren(loading);
  }

  window.invalidateAuth = (reason = 'identity-changed', userId = identity(currentAuth)) => {
    window.authInvalidated = true;
    window.dispatchEvent(new CustomEvent('auth:cleared', { detail: { reason, userId } }));
    if (reason === 'signed-out' && userId) window.AssessmentDrafts?.remove('user:' + userId);
    document.getElementById('history-table-body')?.replaceChildren();
    document.getElementById('history-content')?.classList.add('hidden');
    document.getElementById('result-filled')?.replaceChildren();
    document.getElementById('result-filled')?.classList.add('hidden');
  };

  function receiveAccount(data, receivedBeforeIdentity = false) {
    if (window.authInvalidated || !data || typeof data !== 'object') return;
    if (!['signed-out', 'identity'].includes(data.type)) return;
    if (data.type === 'signed-out' && (typeof data.id !== 'string' || !/^[1-9]\d*$/.test(data.id))) return;
    if (!currentAuth) {
      pendingAccountEvents.push(data);
      if (pendingAccountEvents.length > 128) pendingAccountEvents.shift();
      return;
    }
    if (data.eventId) {
      if (seenEvents.has(data.eventId)) return;
      seenEvents.add(data.eventId);
      if (seenEvents.size > 128) seenEvents.delete(seenEvents.values().next().value);
    }
    const currentId = currentAuth.authenticated ? String(currentAuth.user.id) : null;
    const signedOut = data.type === 'signed-out' && (data.id === currentId || receivedBeforeIdentity);
    const changed = signedOut || (data.type === 'identity' && data.id !== currentId);
    if (!changed) return;
    window.invalidateAuth(signedOut ? 'signed-out' : 'identity-changed', signedOut ? data.id : currentId);
    showAccountChanged();
  }
  if (accountChannel) accountChannel.onmessage = event => receiveAccount(event.data);
  window.addEventListener('storage', event => {
    if (event.key !== accountEventKey || !event.newValue) return;
    try { receiveAccount(JSON.parse(event.newValue)); } catch { /* Ignore malformed messages. */ }
  });
  function showAccountChanged() {
    closeAccount(); closeNavigation();
    const notice = document.createElement('div');
    notice.className = 'account-unavailable';
    const label = document.createElement('span');
    label.textContent = 'Account changed'; label.setAttribute('role', 'status');
    const reload = document.createElement('button');
    reload.type = 'button'; reload.className = 'btn-secondary'; reload.textContent = 'Reload';
    reload.addEventListener('click', () => location.reload());
    notice.append(label, reload); account.replaceChildren(notice);
    window.dispatchEvent(new Event('auth:account-changed'));
  }

  function showAccount(auth) {
    account.removeAttribute('aria-busy');
    account.replaceChildren();
    document.querySelectorAll('[data-guest-account-note]').forEach(note => { note.hidden = auth.authenticated; });
    if (!auth.authenticated) {
      const path = location.pathname.replace(/^\/html\//, '/');
      const returnTo = path === '/index.html' || path === '/' ? (location.hash === '#assessment' ? '/#assessment' : '/') : path;
      const signIn = window.createMicrosoftSignIn(returnTo, true);
      account.append(signIn);
      return;
    }
    // PLM display names are surname first. Preserve an explicit comma boundary
    // when present, including surnames made up of more than one word.
    const displayName = typeof auth.user.name === 'string' ? auth.user.name.trim().replace(/\s+/g, ' ') : '';
    const separator = displayName.includes(',') ? displayName.indexOf(',') : displayName.indexOf(' ');
    const surname = (separator < 0 ? displayName : displayName.slice(0, separator)).trim() || 'PLM student';
    const givenNames = separator < 0 ? '' : displayName.slice(separator + 1).trim();
    const profileName = givenNames ? `${surname}, ${givenNames}` : surname;
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'btn-secondary account-trigger';
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-controls', 'account-panel');
    trigger.setAttribute('aria-label', 'Account: ' + profileName);
    // Only fixed developer-authored icons are inserted as HTML.
    trigger.innerHTML = '<svg class="account-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3"/></svg>';
    const name = document.createElement('span');
    name.className = 'account-name';
    name.textContent = surname;
    const mobile = document.createElement('span');
    mobile.className = 'account-mobile-label';
    mobile.textContent = surname;
    trigger.append(name, mobile);
    trigger.insertAdjacentHTML('beforeend', '<svg class="account-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>');
    const panel = document.createElement('div');
    panel.className = 'surface account-panel';
    panel.id = 'account-panel';
    panel.hidden = true;
    const fullName = document.createElement('p');
    fullName.className = 'account-full-name';
    fullName.textContent = profileName;
    const accountLabel = document.createElement('p');
    accountLabel.className = 'text-secondary';
    accountLabel.textContent = 'PLM Account';
    const panelActions = document.createElement('div');
    panelActions.className = 'account-panel-actions';
    const logout = document.createElement('button');
    logout.type = 'button';
    logout.className = 'btn-secondary btn-danger';
    logout.textContent = 'Sign Out';
    const feedback = document.createElement('div');
    feedback.className = 'status status--error account-feedback';
    feedback.setAttribute('role', 'alert');
    feedback.hidden = true;
    panelActions.append(logout);
    panel.append(fullName, accountLabel, panelActions, feedback);
    account.append(trigger, panel);
    closeAccount = (restoreFocus = false) => {
      panel.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
      if (restoreFocus) trigger.focus();
    };
    trigger.addEventListener('click', () => {
      const open = panel.hidden;
      if (!account.closest('.mobile-nav-drawer')) closeNavigation();
      panel.style.setProperty('--account-panel-top', (trigger.getBoundingClientRect().bottom + 12) + 'px');
      panel.hidden = !open;
      trigger.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('click', event => {
      if (!panel.hidden && !account.contains(event.target)) closeAccount(panel.contains(document.activeElement));
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !panel.hidden) { closeAccount(true); event.preventDefault(); }
    });
    account.addEventListener('focusout', event => { if (event.relatedTarget && !account.contains(event.relatedTarget)) closeAccount(); });
    let signingOut = false;
    async function signOut() {
      if (signingOut) return;
      signingOut = true;
      logout.disabled = true;
      logout.textContent = 'Signing out…';
      logout.setAttribute('aria-busy', 'true');
      if (feedback.contains(document.activeElement)) trigger.focus();
      feedback.hidden = true;
      try {
        const fresh = await window.getFreshAuth();
        const response = await fetch('/auth/logout', { method: 'POST', headers: window.authHeaders(fresh), signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error(response.status === 409 || response.status === 401 ? 'Your session changed. Reload the page to continue.' : 'Could not sign out. Please try again.');
        announceAccount({ type: 'signed-out', id: String(auth.user.id) });
        window.invalidateAuth('signed-out');
        account.replaceChildren();
        location.assign('/');
      } catch (error) {
        feedback.replaceChildren(error.name === 'TimeoutError' ? 'Sign-out timed out. Please try again.' : error.message);
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.className = 'btn-secondary';
        retry.textContent = 'Retry sign out';
        retry.addEventListener('click', signOut);
        feedback.append(document.createElement('br'), retry);
        feedback.hidden = false;
      } finally {
        signingOut = false;
        logout.disabled = false;
        logout.textContent = 'Sign out';
        logout.removeAttribute('aria-busy');
      }
    }
    logout.addEventListener('click', signOut);
  }

  function loadAccount(isRetry = false) {
    if (fetching) return window.authReady;
    fetching = true;
    showLoading();
    const promise = (async () => {
      const auth = await fetchSession();
      currentAuth = auth;
      pendingAccountEvents.splice(0).forEach(data => receiveAccount(data, true));
      if (window.authInvalidated) throw new Error('Your session changed. Reload the page to continue.');
      showAccount(auth);
      announceAccount({ type: 'identity', id: auth.authenticated ? String(auth.user.id) : null });
      return auth;
    })();
    window.authReady = promise;
    promise.then(() => {
      fetching = false;
      if (isRetry) window.dispatchEvent(new Event('auth:ready'));
    }, () => {
      fetching = false;
      if (window.authInvalidated) return;
      account.removeAttribute('aria-busy');
      const unavailable = document.createElement('div');
      unavailable.className = 'account-unavailable';
      const message = document.createElement('span');
      message.textContent = 'Account unavailable';
      message.setAttribute('role', 'status');
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'btn-secondary';
      retry.textContent = 'Retry';
      retry.setAttribute('aria-label', 'Retry loading account');
      retry.addEventListener('click', () => loadAccount(true));
      unavailable.append(message, retry);
      account.replaceChildren(unavailable);
    });
    return promise;
  }
  window.addEventListener('pagehide', () => { if (currentAuth?.authenticated) window.invalidateAuth('navigation'); });
  window.addEventListener('pageshow', event => {
    document.querySelectorAll('.microsoft-signin').forEach(link => { link.removeAttribute('aria-disabled'); link.removeAttribute('aria-busy'); });
    if (event.persisted) location.reload();
  });
  loadAccount();
})();
