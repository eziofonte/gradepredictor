# Mobile layout and verification

The mobile experience applies below 768px. At 768px and above, the original
tablet disclosure, desktop navigation, full assessment form, and prediction
layout are retained. The restore point is commit `612292a`, annotated tag
`checkpoint/pre-mobile-2026-11-12`, on `feature/progressive-blur-header`.

Phone navigation uses a compact header and a modal drawer containing the
existing page links, account controls, and theme switch. It contains focus,
closes with Escape, Close, or the backdrop, and restores the reading position.
Browsers without native dialogs retain the original disclosure.

Both assessment entry points use the same three steps: Student, Cellphone
Usage, and Study Habits. Back preserves answers; Next validates the current
step. Submission reveals and focuses any invalid earlier field. Successful
predictions have Edit answers and Start again actions. Reset clears the whole
assessment. Failed predictions retain earlier results. Resizing preserves
answers and restores the appropriate presentation. No persistent drafts or
backend/API changes were added.

Phone spacing, safe-area support, numeric keyboard hints, touch targets,
History dialogs, legal pages, and hero readability are adjusted in the final
phone-only section of `frontend/css/style.css`. CDN cache versions are updated on all pages.

## Automated verification

- 80 UI behavior tests, including phone navigation and both assessment flows.
- 45 Python tests covering the existing backend behavior.
- Headless mobile/touch browser checks at 320, 360, 390, 430, and 767px in both
  themes, plus a short phone landscape viewport.
- 116 tablet/desktop screenshot comparisons at 768, 1024, 1199, 1200, and
  1440px, in both themes, against application files read directly from the
  checkpoint tag. Only one unit of per-channel color rounding is allowed.

See [the UI test instructions](../tests/ui/README.md) for commands and browser
setup. Use the same machine, browser, and execution permissions for baseline
and comparison captures: Windows font rasterization can differ across user
contexts. The browser checks use fictitious account/history/prediction data
and deterministic offline fonts. Screenshots are written to
`%TEMP%\acad-perf-mobile-qa`, outside the application source.

## Physical device release checks

These remain manual; headless Chromium does not establish physical-device
acceptance. Check iPhone Safari and Android Chrome with the keyboard open,
browser bars expanded and collapsed, device safe areas, and enlarged system
text. Verify the drawer, dropdowns, every assessment step, results, History
filters/details, and legal-dialog scrolling. Confirm that input focus and
Back/Next do not obscure the active field or action buttons.
