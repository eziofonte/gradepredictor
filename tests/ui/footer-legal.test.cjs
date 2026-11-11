const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'js/footer-legal.js'), 'utf8');
const html = page => fs.readFileSync(path.join(root, 'html', page + '.html'), 'utf8');
const reply = (page, ok = true) => ({ ok, text: async () => html(page) });
const tick = () => new Promise(resolve => setImmediate(resolve));

function setup(t, { page = 'index', directory = '/', fetch, supported = true } = {}) {
  const dom = new JSDOM(html(page), {
    url: `https://example.test${directory}${page}.html`,
    runScripts: 'outside-only', virtualConsole: new VirtualConsole()
  });
  t.after(() => dom.window.close());
  const w = dom.window, d = w.document;
  if (supported) {
    // jsdom has no modal top layer. Browser QA covers native focus containment/Escape.
    w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
    w.HTMLDialogElement.prototype.close = function () {
      this.removeAttribute('open');
      this.dispatchEvent(new w.Event('close'));
    };
  }
  const calls = [];
  w.fetch = (url, options) => {
    calls.push({ url, options });
    return fetch ? fetch(url, options) : Promise.resolve(reply(new URL(url).pathname.includes('privacy') ? 'privacy' : 'terms'));
  };
  w.eval(source);
  const click = link => {
    const event = new w.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    link.dispatchEvent(event);
    return event;
  };
  return { w, d, calls, click, dialog: d.querySelector('.legal-dialog'),
    privacy: d.querySelector('.footer-legal a[href="privacy.html"]'),
    terms: d.querySelector('.footer-legal a[href="terms.html"]') };
}

for (const page of ['index', 'privacy', 'terms']) {
  test(`${page}: footer opens the full draft article without duplicating page chrome or IDs`, async t => {
    const { d, click, privacy, terms, dialog } = setup(t, { page });
    for (const [link, title] of [[privacy, 'Privacy notice'], [terms, 'Terms of use']]) {
      assert.equal(click(link).defaultPrevented, true);
      assert.equal(dialog.open, true);
      assert.equal(dialog.querySelector('[aria-busy]').getAttribute('aria-busy'), 'true');
      await tick();
      const content = dialog.querySelector('.legal-dialog-content');
      assert.equal(dialog.querySelector('#legal-dialog-label').textContent, title);
      assert.equal(content.querySelector('h1').textContent, title);
      assert.match(content.textContent, /Draft for review/);
      assert.match(content.textContent, /\[Operator legal name\]/);
      assert.equal(content.querySelector('footer, nav, main, script'), null);
      const ids = [...d.querySelectorAll('[id]')].map(node => node.id);
      assert.equal(new Set(ids).size, ids.length);
      for (const labelled of content.querySelectorAll('[aria-labelledby]')) {
        assert.ok(d.getElementById(labelled.getAttribute('aria-labelledby')));
      }
      dialog.querySelector('button').click();
      assert.equal(dialog.open, false);
      assert.equal(d.activeElement, link);
    }
  });
}

test('switching documents resets scrolling and preserves the original footer focus target', async t => {
  const { d, click, terms, dialog, calls } = setup(t);
  click(terms); await tick();
  const content = dialog.querySelector('.legal-dialog-content');
  content.scrollTop = 400;
  const privacyLink = content.querySelector('a[href="https://example.test/privacy.html"]');
  privacyLink.focus();
  click(privacyLink);
  assert.equal(content.scrollTop, 0);
  assert.equal(d.activeElement, dialog.querySelector('button'));
  await tick();
  assert.equal(content.querySelector('h1').textContent, 'Privacy notice');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.signal.aborted, true);
  dialog.close();
  assert.equal(d.activeElement, terms);
});

for (const failure of ['network', 'http', 'invalid-html']) {
  test(`${failure}: load failure offers a working standalone link and retry`, async t => {
    let attempts = 0;
    const { click, privacy, dialog, calls } = setup(t, { fetch: async () => {
      if (++attempts > 1) return reply('privacy');
      if (failure === 'network') throw new Error('Offline');
      return failure === 'http' ? reply('privacy', false) : { ok: true, text: async () => '<html>Not a legal document</html>' };
    } });
    click(privacy); await tick();
    assert.match(dialog.querySelector('[role="alert"]').textContent, /couldn’t load/);
    assert.equal(dialog.querySelector('[aria-busy]'), null);
    const fallback = dialog.querySelector('[data-legal-standalone]');
    assert.equal(fallback.href, 'https://example.test/privacy.html');
    assert.equal(click(fallback).defaultPrevented, false);
    assert.equal(calls.length, 1);
    dialog.querySelector('.legal-dialog-error-actions button').click(); await tick();
    assert.equal(dialog.querySelector('.legal-dialog-content h1').textContent, 'Privacy notice');
    assert.equal(calls.length, 2);
  });
}

test('closing during loading cancels the request and ignores a late response after reopening', async t => {
  const pending = [];
  const { click, privacy, terms, dialog, calls, d } = setup(t, {
    fetch: () => new Promise(resolve => pending.push(resolve))
  });
  privacy.focus(); click(privacy);
  dialog.close();
  assert.equal(calls[0].options.signal.aborted, true);
  assert.equal(d.activeElement, privacy);
  assert.equal(dialog.querySelector('[aria-busy]'), null);
  click(terms);
  pending[1](reply('terms')); await tick();
  pending[0](reply('privacy')); await tick();
  assert.equal(dialog.querySelector('.legal-dialog-content h1').textContent, 'Terms of use');
  assert.equal(dialog.open, true);
});

test('modified clicks, external article links, and unsupported dialogs retain normal navigation', async t => {
  const { w, click, privacy, dialog, calls } = setup(t);
  const modified = new w.MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true });
  privacy.dispatchEvent(modified);
  assert.equal(modified.defaultPrevented, false);
  assert.equal(dialog.open, false);
  click(privacy); await tick();
  const external = dialog.querySelector('a[href^="https://privacy.gov.ph/"]');
  assert.equal(click(external).defaultPrevented, false);
  assert.equal(calls.length, 1);
  const unsupported = setup(t, { supported: false });
  assert.equal(unsupported.dialog, null);
  assert.equal(unsupported.click(unsupported.privacy).defaultPrevented, false);
  assert.equal(unsupported.calls.length, 0);
});

test('HTML-directory routes resolve documents and their internal links correctly', async t => {
  const { click, privacy, dialog, calls } = setup(t, { directory: '/html/' });
  click(privacy); await tick();
  assert.equal(calls[0].url, 'https://example.test/html/privacy.html');
  assert.equal(dialog.querySelector('a[href$="hiw.html"]').href, 'https://example.test/html/hiw.html');
});
