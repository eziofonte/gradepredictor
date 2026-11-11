# Account and History UI checks

These tests execute the actual `js/auth.js` and `js/history.js` against public
HTML in jsdom. They use mocked HTTP responses and fictitious names/records; no
Microsoft sign-in or real account is needed. This is test tooling only; the app
continues to run with Flask and plain JavaScript.

Use Node 24 or a jsdom-supported Node release (20.19+ or 22.12+):

```powershell
npm.cmd ci --prefix tests/ui
npm.cmd --prefix tests/ui test
venv/Scripts/python.exe -m pytest -q
```

The suite checks loading, sign-in links, safe full-name rendering, disclosure
focus/dismissal, navigation breakpoints, retry recovery, sign-out request headers,
duplicate submission, and private-data invalidation. It does not provide a layout
engine: verify light/dark appearance, progressive header blur, narrow widths,
zoom, and touch interactions in an actual browser/device during visual QA.

History checks also cover draft/applied filters, inclusive date validation,
pagination, request races, retained snapshots on refresh failure, table/card
switching, detail input units, empty/error/session states, and recovery when
the current page disappears. Native dialog methods are mocked in jsdom; browser
focus trapping and Escape behavior must also be verified in a real browser.

Deletion checks cover confirmation details and scope, Cancel focus, pending
duplicate suppression, errors/retry, server-confirmed success, failed refresh,
and account changes while a delete is pending. Account checks also cover
cross-tab identity and sign-out notifications.

Assessment checks exercise keyboard dropdown selection and reset on both
forms, retained results after a failed request, pending submission behavior,
and reduced-motion result rendering. Desktop
appearance still needs browser review; mobile corrections follow that review.

Theme checks cover all four pages, saved preferences, switch state, blocked
local storage, reduced motion, circular reveal geometry, rapid-click protection,
scroll preservation, and skipped/failed view transitions. Assessment accessibility checks cover input
hint/unit/error descriptions and clearing invalid states on Reset.

How It Works checks cover both pages, the initial expanded item, preserved input
and performance-band content, exclusive/collapsible sections, and keyboard focus
navigation. Browser review also checks native details behavior, expansion motion,
reduced motion, responsive columns, both themes, and operation without JavaScript.
Homepage navigation review checks header offsets, direct section links, active
link tracking inside the long assessment form, and separation of the hero,
How It Works, and assessment at phone and desktop viewport heights.

Footer legal checks cover Privacy/Terms popup loading on the homepage and both
standalone legal pages, article-only rendering, unique imported heading IDs,
switching documents, focus restoration, scroll reset, request cancellation and
late responses, failure/retry recovery, and normal navigation fallbacks.
Native dialog methods are mocked in jsdom. Real-browser review must verify
focus containment, Escape dismissal, background scroll locking, long-document
scrolling, phone margins, and both themes.
