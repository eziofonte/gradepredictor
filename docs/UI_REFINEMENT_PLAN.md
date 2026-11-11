# Master plan: account controls, personal history, and responsive UI

Current user priority: finish and review the desktop web view first. Mobile
corrections are deferred until desktop polish is complete. The supplied mobile
recording (`be6413dc-d622-413b-a87d-e2065881b57a.mp4`) is a reference for that
later pass; the existing mobile implementation is provisional, not approved.

Status: steps 1–5 are implemented, with step 5 focused on desktop web polish.
Step 6 desktop visual/accessibility review is still open. Step 7 mobile
corrections are deferred until that desktop review is complete. Earlier mobile
work remains provisional and requires the later correction pass.

Step 6 progress: the code/automated accessibility pass is complete. Added a skip
link and main landmark on each page, linked assessment hints/units/errors to
their inputs, and synchronized invalid states. Fixed desktop pressed-button
contrast (navy text on the updated sage: approximately 4.76:1), cream-field
focus rings (approximately 5.94:1), and the footer's placeholder logo. Theme
controls now expose switch state, respect reduced motion, and handle skipped
or failed view transitions. Failed predictions explicitly label the retained
result as previous output.

Current checks: 41 UI behavior checks and 45 backend checks pass. The ratios
above are calculated from the source colors; they do not certify every rendered
state. Browser review access was attempted again and reported that the browser
access host is unavailable. Step 6 stays open for desktop geometry/light-dark
review at 1024/1440px and 200% zoom, native dialog/keyboard and screen-reader
walkthroughs, and the real two-account privacy pilot. Step 7 then addresses the
mobile recording and real-phone validation. There are two phases left, with
the automated portion of step 6 completed.

Step 5 aligns the desktop Home content, gives assessment fields more room,
standardizes the two prediction panels and result wording, and lays out the
standalone How It Works content as numbered cards. The disconnected chatbot
was subsequently removed at the user's request. Existing phone media rules are
reserved for the later mobile correction pass.

Dropdowns support keyboard selection, Escape and type-ahead. Reset synchronizes
all three academic dropdown labels, including the optional fields. Prediction
requests show a pending state and suppress repeated submission; failures retain
the previous result with an error beside the form. Result animations respect
reduced motion and reset cleanly, and the GWA marker realigns when its panel
resizes. The model, prediction inputs, history ownership, and API are unchanged.

Step 5 validation: 36 UI behavior checks and 45 backend checks passed at the time. The
checks cover keyboard/dropdown reset on both forms, retained results after
failure and pending submission behavior. The
browser access host is unavailable and native screenshot capture failed in
earlier reviews, so rendered desktop geometry, themes, zoom and screen-reader
review remain open in step 6. Mobile fixes must wait until desktop polish is
reviewed.

Step 4 replaces browser confirmations with native themed dialogs. A single
deletion identifies the date and predicted GWA; clear-all explains that it
includes records outside the active filters and mentions backup retention.
Confirmation starts on Cancel, prevents repeat submission, keeps the dialog
open for errors and retry, and reports success only after server confirmation.
If the follow-up refresh fails, the success message stays visible beside a
warning that the displayed records are from the previous load. Cancel returns
to the detail dialog or the management control; after deletion, focus returns
to the updated history summary or heading.

The dedicated phone design adds a compact brand/header, two-column navigation
disclosure, clearer filter disclosure, compact History cards, and nearly
full-screen details with a separate confirmation layout. The account control
stays compact and the progressive header blur remains in place. Account
changes detected in another tab clear private content and offer Reload where
BroadcastChannel is available; protected requests still detect stale sessions.

Step 4 behavior checks cover confirmation scope, focus after Cancel, pending
requests, failure/retry, server-confirmed success, refresh failure, and clearing
private data on account changes. Browser screenshot capture timed out, so visual
review, native-dialog keyboard behavior, and real-phone touch checks are still
outstanding; the next phase covers the rest of the site.

Step 3 adds the History heading, privacy note, New assessment action, draft
filters with explicit Apply/Reset and date validation, matching record count,
five-column table, phone cards, applied-filter summary and 25-record pagination.
Only one record presentation is rendered at a time. Successful responses commit
records/counts/filter summaries together; failed refreshes label the retained
snapshot, and late responses cannot overwrite newer queries. Guest, loading,
empty, filtered-empty, retry, expired-session and changed-account responses have
distinct page states. The existing owner-scoped API remains unchanged.

A basic native View details dialog was included in step 3 so every original
input remained accessible when reducing the table to five columns. Step 4
refined details/deletion feedback and introduced the designated mobile design. History
styles use the established `style.css` route; the updated History page requests
fresh CSS and JS asset URLs without requiring a server restart.

Step 3 validation: 45 backend tests and 22 UI behavior checks pass, including
draft/applied filter separation, date validation, pagination, out-of-order
requests, retained snapshots after failures, phone presentation switching,
detail units/missing values, expired/changed sessions, and last-valid-page
recovery. Geometry, touch, browser zoom, real authentication across two accounts,
and real-phone appearance are still outstanding validation tasks.

Step 2 adds the official Microsoft logo/button, compact account disclosure with
full display name, My history and Sign out, loading and retry states, and a
responsive Menu disclosure containing navigation and the theme switch. The
header retains its transparent canvas and fading progressive blur; an opaque
fill must not be introduced over that effect. Guest assessment and History
copy explains PLM account saving. Authentication endpoints, identity/CSRF
pairing, and prediction calculations are unchanged. Private records and pending
History responses are invalidated after confirmed sign-out or page departure.

Step 2 validation: 45 pytest checks and 11 DOM behavior tests pass. Tests cover
all public pages, logo/CSS routes, guest return paths, loading, long names rendered
as text, account retry recovery, keyboard dismissal/focus, mobile theme placement,
duplicate sign-out suppression, failure/retry, and late History responses after
clearing private content. These DOM tests do not verify rendered geometry,
color contrast, or the actual progressive blur. See `tests/ui/README.md` to rerun.

The unmodified logo in `assets/icons/microsoft.svg` was downloaded from
[Microsoft's official branding assets](https://learn.microsoft.com/en-us/entra/identity-platform/media/howto-add-branding-in-apps/ms-symbollockup_mssymbol_19.svg).
The button follows the full/short labels and light/dark treatments in
[Microsoft's branding guidance](https://learn.microsoft.com/en-us/entra/identity-platform/howto-add-branding-in-apps).

Account sizing correction: account/navigation rules now ship in the existing
`style.css`, with a refreshed stylesheet URL on all four public pages. The
separate account CSS route returned 404 on an already-running server, leaving
icons unbounded and both desktop/mobile labels visible. Using the established
asset route avoids requiring a server restart. The control now uses an 18px
user icon, 12px chevron, 184px maximum width, and a 264px anchored panel. The
header's progressive blur remains intact.

Step 1 adds shared spacing, surface, focus, button, feedback, and reduced-motion
styles in `style.css`. All four public pages use the same brand and supported
navigation destinations, with current-page/location semantics. Navigation wraps
at smaller widths; step 2 adds the compact disclosure and account behavior.

Open [the static foundation preview](UI_FOUNDATION_PREVIEW.html) directly in a
browser to review desktop and phone record examples, long-name layout, both
themes, and shared feedback styles. All sample records/names are fictitious;
sample actions are inactive. The preview is local documentation, not a public
Flask route. It does not implement the live History redesign.

Step 1 validation: all 44 existing pytest checks passed; markup checks verified
four navigation links, one current-page/location marker, unique IDs, and local
asset references on each public page. The preview opened successfully in Brave
and its accessibility tree exposed the expected table, card, and feedback
examples. Screenshot capture repeatedly timed out, so visual layout, viewport,
and light/dark appearance verification remain outstanding.

## 1. Objective and current findings

Make sign-in recognizable, make saved assessments easy to scan, and make the
entire student experience usable on phones, tablets, and desktops. Preserve the
current navy, cream, sage, and gold identity, prediction behavior, and private
history rules.

Source review found:

- Account controls are injected as a name plus a separate Sign out button, or a
  plain text Microsoft link. Loading and error states lack deliberate styling.
- Navigation uses equal-width regions, 100px horizontal padding, and 50px gaps,
  which leaves insufficient space for long names and small screens.
- History has 12 columns inside a 960px page. Its important results compete with
  every input value, and phones must scroll sideways.
- Filters exist, but lack explicit Apply and Reset controls and date validation.
- Deletion uses browser confirmation dialogs; empty and failure states are text
  messages. Loading copy contains an accidental question mark.
- Navigation branding differs between pages: Predictor versus Estimator.

Use “Academic Performance Predictor” consistently in navigation, matching the
current home page. Keep the formal project name in the home page heading.

## 2. Visual foundation

- Retain Inter and the existing theme switch. Use 32–36px page titles on desktop,
  26–28px on phones, 16px body and input text, and 13–14px secondary labels.
- Dark mode: navy canvas (#16232F), raised navy panels (#1F3245), warm light text.
  Light mode: cream canvas (#F4F1E8), white panels, dark navy text.
- Sage marks primary actions, selection, and keyboard focus. Gold remains tied
  to prediction results. Reserve a restrained, contrast-tested red for errors
  and destructive actions. Do not recolor the Microsoft logo.
- Use an 8px spacing rhythm, 12–16px panel radii, thin borders, and little shadow.
  A history-specific container can reach 1120px; phone gutters are 16px.
- Keep primary buttons visually stronger than secondary links. Every interactive
  control has hover, focus, pressed, disabled, and pending states.
- Aim for 44px minimum touch targets, readable text in both themes, and visible
  keyboard focus. Do not use color as the only category or status indicator.

## 3. Shared sign-in and account control

### Guest

- Place an official Microsoft logo and “Sign in with Microsoft” in a bordered,
  theme-appropriate button at the right side of the desktop navigation.
- Retain Microsoft's logo proportions, spacing, and approved button treatment.
  On narrow headers use its allowed shorter “Sign in” label with the logo;
  the accessible name remains “Sign in with Microsoft”.
- Explain “Use your PLM school account to save your assessments” in the History
  guest card and assessment area, where there is room for useful context.
- Clicking opens Microsoft in the same tab. Reserve control width while account
  status loads and suppress repeated clicks once navigation starts. Restore the
  control if a browser back-navigation restores the page.
- Keep guest assessment access clear. Signing in after a guest result returns
  to the assessment form; only future submissions are saved.

### Signed in

- Replace the name and separate logout button with one compact account control:
  user icon, truncated display name on desktop, and chevron. Phones use icon plus
  “Account”. Do not infer a first name from Microsoft's surname-first display.
- Open a small anchored account panel containing the full wrapping display name,
  “PLM account”, “My history”, and “Sign out”. Use a generic user icon; profile
  photos and extra Microsoft permissions are unnecessary.
- Use the existing user name and ID response. An email display is not required
  for this refinement and must not be fabricated or treated as ownership.
- Sign out shows progress, disables repetition, and clears personal content on
  success. Failure stays visible beside the control with a retry action.
- Close the account panel on Escape, outside click, or selection. Preserve a
  sensible Tab order and return focus to its trigger when appropriate.
- Authentication lookup failure shows “Account unavailable” with Retry, rather
  than presenting the user as definitely signed out.

Microsoft reference: https://learn.microsoft.com/en-us/entra/identity-platform/howto-add-branding-in-apps

## 4. History page composition

Order the page as follows:

1. Shared navigation, with History visibly active and `aria-current="page"`.
2. Title: “Your assessment history”. Supporting copy: “Review the estimates
   saved to your PLM account.” Primary action: “New assessment”.
3. A compact privacy note: “Only you can access your saved assessments.”
4. Filter panel.
5. Result count and fixed “Newest first” label.
6. Records table on wide screens or record cards on narrow screens.
7. Pagination.
8. A quiet, separated “Manage history” area with “Clear all history”.

Use the count as the summary. Do not add charts, rankings, best-result badges,
or claims of academic improvement: saved estimates may be repeated experiments.
Always label the number “Predicted GWA”, not an actual achieved grade.

### Filters

- Year level: All year levels, 1st through 4th Year.
- Academic term: All terms, 1st Semester, 2nd Semester, Midyear. Map labels to the
  API's existing `1st Sem`, `2nd Sem`, and `Midyear` values.
- From date and To date, using native date controls with persistent labels.
- “Apply filters” and “Reset” actions. Changes are drafts until Apply; Reset
  clears drafts and applied values and fetches the first unfiltered page.
- Reject From after To with an inline message and focus on the invalid field.
- Dates are inclusive Manila dates; add “Dates shown in Philippine time”.
- Display applied filters as a short text summary. Count and record list always
  describe the same applied query. New filters reset pagination to page one.
- On phones collapse the filter form behind “Filters” with an active-count
  indicator; keep applied-filter text and Reset accessible when collapsed.

### Desktop records

Reduce the table to five columns:

| Column | Contents |
| --- | --- |
| Date | Readable date, with Manila time on a second line |
| Academic details | Year and semester together; program underneath |
| Predicted GWA | Two decimal places, visually emphasized |
| Category | Text badge matching the existing result categories |
| Action | View details |

Use generous row spacing, aligned numeric text, gentle row hover, and real table
headers. View details is an explicit keyboard-accessible control; do not make
the entire row the only way to open a record.

### Record details

Open a modal dialog on desktop and a nearly full-screen dialog on phones. Show:

- Title, assessment date and time, and an obvious Close control.
- Predicted GWA and its category.
- Program, year level, and academic term.
- Screen time per day, academic app usage per day, social media usage per day,
  study hours per day, and study days per week, with units.
- A small note: “This is a saved estimate, not an official grade.”
- Close and a lower-emphasis destructive “Delete assessment” action.

Use the record fields already returned by `/results`; no new details endpoint
or reassessment is needed. Show an em dash for missing information, not zero.
Keep input groups stacked on narrow screens and use two columns where they fit.

### Pagination

Keep 25 records per page and the existing server ordering. Show “1–25 of 68”
with Previous and Next controls. Disable unavailable directions. Preserve
filters across pages, and move to the last valid page if deletion empties the
current page. Announce refreshed counts without an unexpected focus jump.

## 5. Empty, loading, and failure states

| Situation | Interface and next action |
| --- | --- |
| Guest opens History | Centered history icon, “Your history, wherever you sign in”, explanation that saving begins with the next signed-in submission, full Microsoft button, and “Take an assessment as a guest” link |
| Initial loading | A few neutral skeleton rows/cards, “Loading your history…”, and an accessible busy state |
| First visit with no records | “No assessments yet”, explanation of automatic saving, and New assessment; hide unnecessary table/pagination/destructive controls |
| Filters match nothing | Keep filters, show “No assessments match these filters” and Reset filters |
| Initial request fails | “We couldn't load your history” and Retry; never use the empty-history illustration |
| Refresh fails after records loaded | Clearly label retained content as previously loaded; keep the old count/filter summary together and offer Retry |
| Session expires | Clear private content and show “Your session has expired. Sign in again to view your history” |
| Another tab changes account | Clear private content and show “Your account changed. Reload to continue” with Reload |
| Delete/save request fails | An explicit persistent message near the action; retain the record or result and allow a deliberate retry |

Use text rendering for all user and record values. Request races must not let
old responses overwrite new filters or re-show data after an account change.

## 6. Deletion and feedback

- Replace browser `confirm()` with a themed accessible confirmation dialog.
- Single record: “Delete this assessment?” Include date and predicted GWA;
  provide Cancel and Delete assessment. Default focus to Cancel.
- All records: “Clear all your history?” Explain explicitly that every personal
  record will be deleted, including records outside the current filters. Use
  Cancel and “Delete all assessments”. Show an all-history count only when
  obtained from the unfiltered owner-scoped summary, never a filtered count.
- Do not nest modal dialogs: transition the detail dialog into confirmation or
  close it before opening confirmation, with a defined focus return on cancel.
- Disable repeated submission during deletion. Update the list only after the
  server confirms success. Do not offer Undo without actual restoration support.
- Confirm success in a visible status region. Announce it accessibly. Keep
  errors persistent until dismissed or resolved.
- In the management area/confirmation explain: “Deleted assessments may remain
  in backups for up to 30 days.” Do not make this the page's visual focus.

Modal interaction reference: https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/

## 7. Responsive behavior across the system

Timing update from the user: complete desktop polish and its review before
returning to mobile. Use the supplied recording during the deferred step 7.
Earlier phone work provides a starting point; it is not approved mobile polish.
The later pass must cover the compact header, spacing and type hierarchy, record
cards, filter disclosure, detail/confirmation layouts, and comfortable touch
actions, followed by Home, How It Works, assessment forms, and results.
Preserve the compact account control and progressive header blur.

Responsive layout is required for every new component from the beginning.
After account/history implementation, do a dedicated pass over Home, How It
Works, both assessment forms, result panels, and navigation.

| Layout | Expected behavior |
| --- | --- |
| Wide, roughly 1200px and above | Brand, navigation, and account/theme controls share a row; history filters fit a row and records use the compact table |
| Medium, roughly 768–1199px | Collapse navigation before controls collide, use two-column filters, and retain a table only while it remains comfortably readable |
| Narrow, below roughly 768px | Compact header with brand, account/sign-in, and menu controls; navigation and theme control in the disclosure; single-column forms and history cards |

Breakpoints are starting points and should be adjusted to actual content fit,
especially long account names. Do not simply shrink the desktop UI.

Each phone record card shows date/time, prominent predicted GWA plus category,
year/term/program, and View details. It uses the same record data and actions as
the desktop table. Render one accessible presentation at a time, with no duplicate
IDs or hidden focusable controls.

Keep full Microsoft text in the guest-history panel. Dialogs respect the phone
viewport and safe areas and scroll internally when necessary. Avoid sticky
controls that cover content when the keyboard opens.

Check 360px, 390px, 768px, 1024px, and 1440px widths, portrait and landscape,
200% browser zoom, long names/programs, and real-phone date inputs. There must
be no page-wide horizontal scrolling or clipped navigation. Respect reduced
motion preferences and avoid hover-only actions.

## 8. Implementation order and file organization

1. Visual foundation: align navigation wording, establish reusable state styles,
   lay out shared controls, and prepare desktop/phone static examples with
   clearly fictitious records for review.
2. Account controls: guest Microsoft button, account disclosure, loading/error
   states, and responsive navigation; verify all public pages.
3. History overview: heading, filters, table/cards, counts, pagination, and
   guest/loading/empty/error states using the existing API contract.
4. Details, deletion, and designated mobile design: accessible record and
   confirmation dialogs, focus behavior, result refresh, success/failure feedback,
   and a dedicated phone layout for the header, account, History cards, filters,
   and dialogs, as requested by the user.
5. Desktop web polish first: Home, both assessment forms, prediction results,
   How It Works, and theme controls. Correct desktop spacing,
   alignment, readable result states, and keyboard interactions.
6. Desktop validation: light/dark themes, keyboard and screen-reader checks,
   desktop zoom, delayed/failed requests, account switching, and targeted
   regression tests. Finish desktop review before mobile corrections.
7. Deferred mobile correction pass: use the supplied recording and a real phone
   to refine the existing phone layout, portrait/landscape behavior, navigation,
   forms, History, dialogs, and touch interactions.

Keep JS behavior in the existing `js/auth.js` and `js/history.js`. Shared spacing
and navigation belong in `style.css`; put substantial account/history-specific
styling in `css/account.css` and `css/history.css` if separation improves clarity.
If new CSS files are added, expose only those public assets through an explicit
Flask route and add the stylesheet links. Place the official logo in
`assets/icons/`. Preserve current uncommitted work.

Avoid a framework migration or a rebuild of the prediction calculation. Keep
charts, exports, record editing, account settings, and administrator tools out
of this refinement. The intermittent callback failure remains a separately
tracked issue: better UI can provide recovery but does not prove its cause fixed.

## 9. Acceptance criteria

- Microsoft sign-in is recognizable and visually consistent on every page.
- Full display names remain available without widening the header.
- Users can identify date, academic context, predicted GWA, and category at a
  glance and inspect every original input from View details.
- Filters/counts/pagination remain consistent through updates and deletion.
- All-history deletion clearly describes its scope, including hidden records.
- Empty, filtered-empty, guest, expired, changed-account, and failure states are
  distinguishable and contain an appropriate next action.
- Keyboard users can open/close menus and dialogs, cancel destructive actions,
  and return to a meaningful focus location.
- Phone use needs no sideways page scrolling and no hover to discover controls.
- The original guest, saving, ownership, CSRF, retry, and privacy rules continue
  to pass their relevant checks; the real two-account pilot remains outstanding.
