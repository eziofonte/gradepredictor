# Resume Unfinished Assessments ? Implementation Record

## Current behavior

- Silently autosave browser-local unfinished answers for 24 hours after the last
  answer edit. Restore without banners, prompts, focus changes or submission.
- Guest drafts and each signed-in account's drafts are separate. Both assessment
  URLs share the appropriate owner-scoped draft; no guest-to-account transfer.
- Reset/Start again discards a draft. Explicit sign-out deletes that account's
  draft and clears its answers in other tabs. Navigation, identity changes and
  session expiry preserve drafts under their original owner.
- Preserve zero/optional values, custom-select labels and mobile progress.
- Keep retry UUID/signature across reload after lost responses. Successful guest
  predictions and saved account predictions remove only their matching revision;
  failures and newer edits remain available.

## Implementation

Browser store: frontend/js/assessment-drafts.js. Keys use the prefix
acad-perf:assessment-draft:v1: and owner guest or user:<ID>. Envelopes contain
version, revision, last-edit time, step, eight string answers and optional retry
metadata. Validate exact keys/limits/expiry and catch storage failures.

Assessment integration: frontend/js/assessment.js. Debounce edits 300ms and flush
dirty answers before navigation. Await known identity, protect early typing,
defer Reset until the owner is known, and never overwrite a later cross-tab edit.

Authentication: frontend/js/auth.js. Explicit lifecycle reasons preserve drafts
on navigation and remove them on sign-out. Buffer account events during initial
identity lookup. BroadcastChannel/storage fallback handles cross-tab cleanup.
Refresh auth/CSRF before protected writes and reject stale identities.

Microsoft sign-in is a direct link. All authenticated sessions use the fixed
eight-hour policy; pre-existing longer sessions are capped from original issuance.
acad_perf/history/session_interface.py aligns cookie/database deadlines and uses
update-only saves for loaded authenticated SIDs to prevent logout resurrection.

## Verification

Node draft/resume/auth tests cover malformed storage, expiry boundaries, owner
isolation, pending identity races, Reset, revision-safe completion, retry IDs and
cross-tab logout. Disposable-MySQL tests cover fixed deadlines, existing long
sessions, expired/malformed sessions, failed OAuth and replay/concurrent logout.
Focused Edge checks cover both themes at 320/390/1024px and all sign-in entry
points, browser-context restore, cross-tab cleanup and a lost-response retry.

## Execution notes

The original implementation baseline was 95 UI and 66 Python tests. Work stayed
in the current feature checkout to preserve its uncommitted file relocation.
Independent review findings concerning initial-identity logout races, cross-tab
edit ordering and envelope allowlists were reproduced and fixed.

The user subsequently requested direct sign-in with the standard eight-hour
session policy. Its extra sign-in dialog, alternate login POST/preference handling,
long-duration session issuance, related styles, tests and documentation were
removed. Assessment drafts and session/draft security protections remain.

Verification after removal: 115 UI tests and 81 Python tests passed, including
actual disposable-MySQL session tests. Edge checks passed at 320/390/1024px in
both themes, including direct sign-in from all entry points, draft restoration,
cross-tab cleanup and lost-response retry. Whitespace and JS syntax checks passed.
