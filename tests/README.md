# Acceptance tests

All test pages run the real dashboard (`assets/app.js`) on synthetic fixtures. They use memory
storage (plus `sessionStorage` keys starting with `dopk.test.` for reload checks), so your real
history, mapping, views and language are never touched. The pages are not linked from the dashboard.

| Page | Covers |
| --- | --- |
| `drilldown-test.html` | Drill-down, breadcrumb, URL hash, order drawer, CSV (13 tests) |
| `scorecard-test.html` | Key account scorecard (21 tests) |
| `btb-test.html` | Book-to-bill and order intake (21 tests) |
| `ask-test.html` | Search field: question types, follow-ups, examples, DE/EN, keyboard (17 tests) |
| `families-sofort-test.html` | Product families mapping, families tab, model/size drill-down, PDT, Sofortbedarf, overdue matrix, changes sheet, saved views, DE/EN, layout, CSP (tests 1–25; reloads itself three times) |

Fixtures: `fixture.js` (09.09.2026), `fixture-day2.js` (10.09.), `fixture-day3.js` (12.09.),
`fixture-day4.js` (16.10.), `fixture-sofort.js` (day 1 plus two Sofortbedarf lines) and
`families-fixture.csv` (the mapping; `families-fixture.js` holds the same text because the CSP
blocks `fetch()` on test pages).

## Run headlessly (Windows, Microsoft Edge, no npm packages)

From the repository root:

```
node tests/run-test.js families-sofort-test.html
node tests/run-test.js families-sofort-test.html 390
```

The second argument is the viewport width (default 1360). The runner serves the repository with
the security headers from `_headers`, so CSP violations fail the tests, prints PASS/FAIL per test
and exits with code 1 if anything fails. `TEST_TIMEOUT_MS` changes the 60-second timeout.

## Test pages copy the dashboard markup

Each test page contains a copy of the markup in `index.html`. After changing `index.html`, run

```
node tests/sync-markup.js
```

## Deliberate expectation changes (Sofortbedarf, October 2026)

- `drilldown-test.js` test 4: the key figure shows the Sofortbedarf value with waiting days
  instead of the undated %, and the period view groups by product family instead of listing lines.
- `scorecard-test.js` test 3: the scorecard readout shows Sofortbedarf value, quantity and
  waiting days (act now at 181 days) instead of 10.5 % with a "watch" alarm.

# Drill-down acceptance tests (October 2026 notes)

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
| 12 | Drill-down modal responsive size and horizontal containment | PASS | PASS |
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
