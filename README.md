# DOPK Vitals: daily order-book dashboard

A one-page CEO dashboard for the daily DOPK open-order export (`DOPK_dd_mm.xlsx`).
It is a static site: HTML, CSS and JavaScript only, no server and no build step.

## Your data stays on your computer

The site contains **no order data**. Each day you upload the Excel file in the browser;
it is read locally with SheetJS and never sent anywhere (the security policy blocks
all outgoing requests). The last file and up to 90 days of summary history are kept in
that browser's local storage so the dashboard can show day-over-day changes.
Use "Clear stored history" in the footer to remove them.

`.gitignore` excludes `.xlsx/.xls/.csv` so an export can't be committed by accident.

## Language

The dashboard opens in **German** by default. Switch to English with the **DE | EN** control in the top bar;
the choice is remembered in that browser. Numbers, dates, month names and the CSV export
follow the selected language (German export uses decimal commas). All texts are in the `I18N`
block at the top of `assets/app.js`.

## Snapshot archive on SharePoint

The daily Excel files are the permanent snapshot history. Netlify only hosts the page;
it never stores data.

1. Create a folder in the team SharePoint library, e.g. `Controlling/DOPK-Archiv/2026/`.
2. In SharePoint click **Sync** (or **Add shortcut to My files**) so the folder appears in
   File Explorer / Finder through OneDrive.
3. Save each day's export there. Recommended name: `DOPK_YYYY-MM-DD.xlsx`
   (the dashboard reads the date from the title row, so the name is for people and sorting).
4. Never edit archived files. One file per day; if a day is re-exported, overwrite it.

**Daily:** click **Upload today's file** and pick the newest file from the synced folder.

**New device, new colleague or cleared browser:** click **Import archive**, open the synced
folder and select all files (Ctrl+A / Cmd+A). The dashboard reads them oldest to newest,
rebuilds the trend and day-over-day comparison, and shows the newest file. Files that
aren't DOPK exports are skipped and listed. Duplicate dates keep the newer file.
The browser keeps the last 90 snapshots.

## Daily use

1. Open the site.
2. Click **Upload today's file** (or drag the file onto the page).
3. Read the verdict, check the vitals, chase the late lines, and export the overdue list if needed.

From the second day on you will see ▲▼ changes, a backlog trend line, completed lines,
and lines whose delivery date moved later. Click the "Seit …" item in the watchlist to open
**Neu seit letztem Stand** (see below).

## Ask the dashboard (search field)

Type a question into the field under the top bar and press Enter. The dashboard opens the matching
view and answers in one sentence with its own figures, for example:

| Question | Opens | Answer (shortened) |
| --- | --- | --- |
| überfällig Laryvox | overdue lines of the family | "Überfällig (Laryvox): 1,5 T€ in 1 Position …, ältester Verzug 25 Tage." |
| und Duracuff Pro? | same question for another family | follow-ups start with "und" / "and" |
| Sofortbedarf Fahl / Sofortbedarf nach Kunde | Sofortbedarf view | value, quantity, average waiting days, oldest order |
| überfällig nach Monat | overdue matrix | overdue value, lines, oldest delay |
| fällig im Oktober | that delivery month | value and lines due |
| Auftrag 1001 | order drawer | open value, lines, overdue, delivered % |
| größte Produktfamilie / größter Kunde | families or customers tab | share of the open value |
| was ist neu · Book-to-Bill · Scorecard · Umsatz · Auslauf · PDT · Hilfe | changes sheet, book-to-bill, scorecard, outlook, watchlist, PDT filter, examples | |

It recognises customer names, product families, models, sizes ("A1-XX Gr. 01"), PDT, month names and
order or customer numbers, in German or English, with or without umlauts. Questions it doesn't
understand get example questions taken from the loaded file. The answer closes when you change the
view yourself. It is a fixed set of question types (no AI) and nothing leaves the browser.

## Sofortbedarf (lines without a delivery date)

A line without a delivery date is **not missing data**. It means: produce and deliver as soon as
material and staff are available. It is the most urgent part of the order book, so the dashboard
calls it **Sofortbedarf** ("ohne Liefertermin – schnellstmöglich"; English: immediate demand).

- **Key figure:** open value, number of lines, open quantity, the average waiting time since the
  order date (weighted by value) and the oldest waiting time. It alarms on waiting time:
  watch above 30 days, act now above 60 days (`RULES.immediate.waitDays`). There is no longer an
  alarm on its share of the backlog (`RULES.undatedPct` stays only for stored history).
- **Horizon:** the "Sofort" bar sits directly after "Überfällig".
- **Click the key figure:** Sofortbedarf by product family or by customer (value, quantity, lines,
  orders, oldest order, average waiting time). A family continues into models, sizes and order
  lines, oldest order first.
- **Produktionsprioritätsliste:** the export button in that view writes `sofortbedarf_YYYY-MM-DD.csv`
  (oldest order first, with product family, model and size).
- **Revenue outlook:** Sofortbedarf is not part of Plan or Expected; it is shown as
  "bis zu X zusätzlich bei verfügbarer Kapazität".
- Totals such as the open backlog still include Sofortbedarf.

## Product families (mapping file)

Product families come from an official mapping file maintained by sales/controlling. There is no
guessing from article descriptions.

**File format.** Semicolon-separated CSV, UTF-8 (with or without BOM); comma-separated CSV and
Excel (`.xlsx`) also work. Header row:

```
Artikel-Nr.;Produktfamilie;Modell;Bezeichnung;Groesse;Variante;Hauptgruppe;Gruppe;Untergruppe;Status;Nachfolger;Quelle
```

Only `Artikel-Nr.` and `Produktfamilie` are required. English headers `Article`, `Family`, `Model`,
`Size`, `Variant` work too. Article numbers must match the DOPK export exactly (trimmed,
case-sensitive). Nothing adds or strips prefixes, so if Fahl and BMV numbers differ, list both
numbers in the file. `Status` values `Auslauf` and `Raus` flag articles being phased out
(`Nachfolger` is shown as the successor).

**Load it.** Click **Produktfamilien zuordnen** in the footer and pick the file. The banner confirms
for example "3.062 Artikel aus produktfamilien_mapping.csv geladen · 44 Familien". The mapping is
kept in this browser (`dopk.families.v1`) and applies to every file you load. The footer shows
"Zuordnung: <Datei> · <n> Artikel · <Datum>" with **Entfernen** to remove it. If the browser
storage is full, a notice says so and the mapping works until the page is closed.

**Keep it complete.** Articles that are not in the file are counted as "Sonstige". Click
**Nicht zugeordnete exportieren** (footer, or the note shown when Sonstige holds more than 15 % of
the open value) to get `nicht_zugeordnet_YYYY-MM-DD.csv`: every article number in the current DOPK
file that the mapping doesn't know, with description, number of lines, value and remaining
quantity, largest value first. Add those rows to the mapping file and load it again.

**Where families appear.**
- Customer share panel: switch **Kunden | Produktfamilien**. The families tab shows value,
  overdue / scheduled / Sofortbedarf, open quantity (in order units) and overdue share.
- Click a family to filter the whole dashboard (`#f=`); the lower-left panel then drills down
  family → model → size → order lines. Back steps up one level.
- **Alle | PDT | ohne PDT** appears in the families tab when the mapping has PDT variants.
- The order drawer shows family · model · size under each line; CSV exports gain the columns
  Produktfamilie, Modell, Größe.

## Overdue by month

In the late-lines panel switch **Liste | Nach Monat**. The matrix shows overdue value (or quantity
with **€ | Stk**) by due month and product family. Click a cell, a month or a family to list the
matching late lines. The note below says how much of the overdue value is less than 30 days late.

## Neu seit letztem Stand (changes since the previous upload)

The sheet compares today's file with the previous stored day: newly late lines, new orders,
delivery dates moved later, new Sofortbedarf and deliveries, each with count, value and quantity.
Order numbers open the order drawer and the sheet exports as CSV. Open it from the watchlist
"Seit …" item, the view **Neu seit letztem Stand**, or the link `#chg=1`. It is available from the
second upload on.

## Saved views

The **Ansicht** select in the top bar holds built-in views (Gesamtüberblick, Überfällig nach Monat,
Sofortbedarf, Produktfamilien, Key Account überfällig, Neu seit letztem Stand) and your own.
**Aktuelle Ansicht speichern …** stores the current filters and panel tabs under a name.
**Als Standard festlegen** makes the selected (or current) view the one shown after every file load,
unless the address already names a view (a shared link with `#…` wins). Views are stored in this
browser (`dopk.views.v1`, `dopk.defaultview.v1`).

## Host it temporarily

### Netlify (fastest, about 1 minute)
1. Go to https://app.netlify.com/drop
2. Drag this whole folder onto the page. You get a live URL immediately.
3. Optional: Site settings → Access control → set a password (paid plans), or delete the
   site when you're done.

`netlify.toml` sets no-index and security headers automatically.

### GitHub Pages
1. Create a **private** or public repository and push this folder to the `main` branch.
2. Repository → Settings → Pages → Source: **GitHub Actions**.
3. The included workflow (`.github/workflows/pages.yml`) deploys on every push.
   The URL appears in the Actions run and under Settings → Pages.

Note: GitHub Pages sites are public even from a private repo (unless you're on
Enterprise). That's fine here because no data is in the repo.

### Run locally
Open `index.html` directly in a browser, or run `python3 -m http.server` in this folder
and open http://localhost:8000.

## Files

| Path | Purpose |
|---|---|
| `index.html` | The dashboard |
| `design-system.html` | Living design system: principles, colour, type, thresholds, components |
| `tokens.json` | Design tokens in W3C format (import into Figma Tokens Studio, Style Dictionary, etc.) |
| `assets/tokens.css` | Tokens as CSS custom properties |
| `assets/components.css` | Component styles |
| `assets/app.js` | Parsing, KPIs, charts, history. Thresholds are in the `RULES` block at the top |
| `assets/vendor/xlsx.full.min.js` | SheetJS 0.18.5 (Apache-2.0), bundled so no CDN is needed |
| `tests/` | Synthetic fixtures and acceptance test pages (not linked from the dashboard), see `tests/README.md` |

## What the dashboard reads from the file

The header row must contain `Auftrag` and `Restmenge`. Used columns: Auftrag, Datum,
Name, Artikel-Nr., Bezeichnung, Auftragsmenge, Restmenge, Nettopreis, EH, Summe,
Liefertermin, Status, Quote, Bestand I. The snapshot date is taken from the title row
("Aufträge / 09.09.2026"), then from the file name.

- `Status` starting with `LS:` = delivery note created today (shipped); all others are open.
- Open value = `Summe` of non-shipped lines.
- Overdue = open lines with `Liefertermin` before the snapshot date.
- Sofortbedarf = open lines without `Liefertermin`; waiting time counts from `Datum` (order date).
- `Quote` = order-level delivered %, used for close-out candidates (≥ 75%).
