// Keep the ordinary footer links usable when JavaScript or native dialogs are unavailable.
(() => {
  if (!document.querySelector('.footer-legal') ||
      typeof HTMLDialogElement === 'undefined' ||
      typeof HTMLDialogElement.prototype.showModal !== 'function') return;

  const documents = new Map(['privacy', 'terms'].map(name => {
    const url = new URL(`${name}.html`, document.baseURI);
    return [url.pathname, { url, title: name === 'privacy' ? 'Privacy notice' : 'Terms of use' }];
  }));
  const dialog = document.createElement('dialog');
  dialog.className = 'legal-dialog';
  dialog.setAttribute('aria-labelledby', 'legal-dialog-label');
  dialog.innerHTML = `
    <div class="legal-dialog-header">
      <h2 id="legal-dialog-label"></h2>
      <button type="button" class="btn-secondary legal-dialog-close" autofocus>Close</button>
    </div>
    <div class="legal-page legal-dialog-content" tabindex="0"></div>`;
  document.body.append(dialog);
  const title = dialog.querySelector('h2');
  const close = dialog.querySelector('button');
  const content = dialog.querySelector('.legal-dialog-content');
  let opener;
  let pending;

  function prepareArticle(article, url) {
    // Prefix imported IDs so a popup on a standalone legal page has no duplicate IDs.
    const ids = new Map();
    for (const element of article.querySelectorAll('[id]')) {
      ids.set(element.id, `legal-dialog-${element.id}`);
      element.id = ids.get(element.id);
    }
    for (const element of [article, ...article.querySelectorAll('[aria-labelledby], [aria-describedby]')]) {
      for (const attribute of ['aria-labelledby', 'aria-describedby']) {
        if (!element.hasAttribute(attribute)) continue;
        element.setAttribute(attribute, element.getAttribute(attribute).split(/\s+/)
          .map(id => ids.get(id) || id).join(' '));
      }
    }
    for (const link of article.querySelectorAll('a[href]')) {
      const href = link.getAttribute('href');
      link.setAttribute('href', href.startsWith('#') && ids.has(href.slice(1))
        ? `#${ids.get(href.slice(1))}` : new URL(href, url).href);
    }
    return article;
  }

  async function loadDocument(selected) {
    pending?.abort();
    const request = new AbortController();
    pending = request;
    title.textContent = selected.title;
    const loading = document.createElement('p');
    loading.className = 'text-secondary';
    loading.setAttribute('role', 'status');
    loading.textContent = `Loading ${selected.title.toLowerCase()}…`;
    content.replaceChildren(loading);
    content.setAttribute('aria-busy', 'true');
    content.scrollTop = 0;
    try {
      const response = await fetch(selected.url.href, { signal: request.signal });
      if (!response.ok) throw new Error('Document unavailable');
      const parsed = new DOMParser().parseFromString(await response.text(), 'text/html');
      const article = parsed.querySelector('main article');
      if (!article) throw new Error('Document content missing');
      if (pending !== request || request.signal.aborted || !dialog.open) return;
      content.replaceChildren(document.importNode(prepareArticle(article, selected.url), true));
      content.scrollTop = 0;
    } catch {
      if (pending !== request || request.signal.aborted || !dialog.open) return;
      const message = document.createElement('p');
      message.setAttribute('role', 'alert');
      message.textContent = `We couldn’t load the ${selected.title.toLowerCase()}. Try again or open the full page.`;
      const actions = document.createElement('div');
      actions.className = 'legal-dialog-error-actions';
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'btn-secondary';
      retry.textContent = 'Retry';
      retry.addEventListener('click', () => {
        close.focus({ preventScroll: true });
        loadDocument(selected);
      });
      const fallback = document.createElement('a');
      fallback.href = selected.url.href;
      fallback.dataset.legalStandalone = '';
      fallback.textContent = 'Open full page';
      actions.append(retry, fallback);
      content.replaceChildren(message, actions);
    } finally {
      if (pending === request) content.removeAttribute('aria-busy');
    }
  }

  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.ctrlKey ||
        event.metaKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest?.('.footer-legal a, .legal-dialog-content a');
    if (!link || link.hasAttribute('data-legal-standalone') ||
        link.hasAttribute('download') || (link.target && link.target !== '_self')) return;
    const url = new URL(link.href);
    const selected = url.origin === location.origin && !url.hash && documents.get(url.pathname);
    if (!selected) return;
    if (!dialog.open) {
      opener = link;
      try { dialog.showModal(); } catch { return; }
    }
    event.preventDefault();
    // The clicked article link may be removed while switching documents.
    close.focus({ preventScroll: true });
    loadDocument(selected);
  });

  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    // A delayed close event must not cancel a newly reopened popup.
    if (dialog.open) return;
    pending?.abort();
    pending = undefined;
    content.removeAttribute('aria-busy');
    content.replaceChildren();
    if (opener?.isConnected) opener.focus({ preventScroll: true });
  });
})();
