# Account and History UI checks

These tests execute the actual `frontend/js/auth.js` and `frontend/js/history.js` against public
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
appearance is covered by the browser comparisons below. Phone checks cover
step-local validation, retained optional answers, hidden-step errors, Enter,
pending requests, result editing and retry, Reset, and breakpoint changes.

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

## Browser layout and mobile checks

The headless suite uses the installed Microsoft Edge browser, a temporary static
server, and fictitious API responses. It never opens Microsoft sign-in or uses
the application database. Set `ACAD_BROWSER_PATH` for another installed Chromium
browser. No browser download is required.

```powershell
npm.cmd --prefix tests/ui run test:baseline
npm.cmd --prefix tests/ui run test:desktop
npm.cmd --prefix tests/ui run test:mobile
```

Baseline mode always serves application files from the immutable Git tag
`checkpoint/pre-mobile-2026-11-12`, rather than the current working tree. It
captures 116 viewport screenshots at 768, 1024, 1199, 1200, and 1440px in both
themes, including both assessment entry points, filled results, tablet navigation,
account disclosure, History/details, and legal pages. The comparison accepts at
most one unit of RGB rounding per channel; any larger pixel change fails.
Remote fonts and the Tailwind CDN are replaced with a deterministic offline
fallback, so compare using the same browser and machine.

Viewport captures avoid Edge's full-page capture resizing the layout viewport
and firing responsive listeners. Scroll-dependent navigation is allowed to
settle for two animation frames before capture. Artifacts go to
`%TEMP%\acad-perf-mobile-qa` by default; override with `ACAD_UI_ARTIFACTS`.

Mobile mode checks all six pages at 320, 360, 390, 430, and 767px in both themes
with touch/mobile emulation, plus a short landscape viewport. It exercises drawer
focus containment, Escape/backdrop dismissal, scroll restoration, signed-in and
guest controls, breakpoint cleanup, homepage anchors, both assessment flows,
result editing, History filters/details, legal dialogs, and horizontal overflow.
Screenshots of representative 390px states are saved in the `mobile` directory.

Before release, also review on physical iPhone Safari and Android Chrome with
the keyboard open, expanded/collapsed browser chrome, device safe areas, and
enlarged system text. Headless Chromium cannot verify those device behaviors.

## Assessment drafts

Run `npm.cmd --prefix tests/ui run test:resume` for focused headless Edge checks
at 320, 390 and 1024px in both themes. The runner intercepts static/API responses;
no real Microsoft account, application database or server is required. Screenshots
are saved to `%TEMP%\acad-perf-resume-qa` (override with `ACAD_UI_ARTIFACTS`).
Set `ACAD_BROWSER_PATH` to use another Chromium executable.

Checks cover both assessment URLs, zero/optional values, silent restoration,
Reset, mobile steps/select labels, guest/account separation, direct Microsoft
sign-in and return targets, restoration in a new browser context, cross-tab
sign-out from History, and retry deduplication after a lost response.

The normal Node suite covers draft expiry, malformed/blocked storage, early typing
and Reset during account lookup, revision races, submission cleanup, identity
changes and refreshed CSRF tokens. The disposable-MySQL integration suite verifies
fixed eight-hour cookie/database deadlines, earlier long-session truncation,
legacy sessions, OAuth failure, CSRF expiration and logout/replay/concurrent writes.
Database tests must pass rather than skip before claiming authentication coverage.
