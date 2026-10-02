# Drill-down acceptance tests

Serve the repository through any static web server and open `/tests/drilldown-test.html`.
For example, from the repository root run `python -m http.server 8080` and open
`http://localhost:8080/tests/drilldown-test.html`.

The page loads `fixture.js` through the dashboard's normal `loadAoa → parseRows → render`
path. It prints PASS/FAIL for all 13 requested acceptance tests. Test 7 performs a real
reload; test 8 uses real browser Back navigation. Run it once at desktop width and
once with the browser's device viewport set to 390px. The fixture page uses memory
storage, preserving the browser's real dashboard history, last upload, hint and language.
It is intentionally not linked from the dashboard.

Final validation on 2 October 2026 in headless Microsoft Edge:

| Test | Behaviour | 1360px | 390px |
| --- | --- | --- | --- |
| 1 | Customer selection, breadcrumb and cross-filter context | PASS | PASS |
| 2 | Alpha plus October table and highlighted horizon | PASS | PASS |
| 3 | Late lines and period-independent shipment/intake KPIs | PASS | PASS |
| 4 | Undated key figure and 181-day order age | PASS | PASS |
| 5 | Order 1001 drawer, totals, close and returned focus | PASS | PASS |
| 6 | Inline price exception and linked order 1006 | PASS | PASS |
| 7 | Gamma umlaut hash restored after real reload | PASS | PASS |
| 8 | Browser Back returns through both filter levels | PASS | PASS |
| 9 | DE/EN formatting while retaining the view | PASS | PASS |
| 10 | CSV contains exactly the two Alpha October lines | PASS | PASS |
| 11 | Keyboard targets and drawer focus trap | PASS | PASS |
| 12 | 440px desktop drawer and full-screen mobile sheet | PASS | PASS |
| 13 | All baseline values, no runtime/CSP failures | PASS | PASS |

Additional browser automation passed real Enter/Space activation, native Escape and
focus restoration, actual CSV downloads, native XLSX file uploads, last-file reload,
invalid-customer reset while retaining a valid month, printed scope without removal
controls, table expansion capped at 50 with a complete CSV, and watch expansion
from eight lines to all affected lines.

Twenty filter renders against a 507-line dataset took 7.9–16.6ms (maximum 14.1ms
at 1360px and 16.6ms at 390px). There were no console errors, CSP violations or
external requests. Timing is machine-dependent. The test server supplied the
repository's existing Content-Security-Policy.

UX decisions: the "other customers" group always means customers outside the
unfiltered top three; selecting an individual customer outside that group reveals
their row. Desktop order tables scroll inside the drawer, while the mobile table
stacks labelled fields. Filtered revenue month-to-date shipment totals are marked
partial and use today's known customer lines because the unchanged history format
contains no customer identity. The external font import was removed to meet the
no-network requirement, using the existing local font fallbacks.
