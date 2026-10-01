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
and lines whose delivery date moved later.

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

## What the dashboard reads from the file

The header row must contain `Auftrag` and `Restmenge`. Used columns: Auftrag, Datum,
Name, Artikel-Nr., Bezeichnung, Auftragsmenge, Restmenge, Nettopreis, EH, Summe,
Liefertermin, Status, Quote, Bestand I. The snapshot date is taken from the title row
("Aufträge / 09.09.2026"), then from the file name.

- `Status` starting with `LS:` = delivery note created today (shipped); all others are open.
- Open value = `Summe` of non-shipped lines.
- Overdue = open lines with `Liefertermin` before the snapshot date.
- `Quote` = order-level delivered %, used for close-out candidates (≥ 75%).
