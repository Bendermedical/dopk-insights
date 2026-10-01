/* DOPK Vitals: daily open-order dashboard.
   Everything runs in the browser. Uploaded files are never sent anywhere. */
(function () {
  "use strict";

  // ---------------------------------------------------------------- config
  const RULES = {
    overduePct: { high: 5, med: 2 },       // % of open value that is late
    undatedPct: { high: 15, med: 5 },      // % of open value without delivery date
    onTimePct:  { high: 90, med: 97 },     // % of today's shipped lines on time (below = alarm)
    priceLow: 0.6, priceHigh: 1.6,         // unit price vs article median
    closeOutQuote: 75,                     // order ≥ this % delivered = close-out candidate
    historyDays: 90,                       // snapshots kept in this browser
    outlook: {
      windows: [7, 30, 90],                // forecast windows in days forward from report date
      // Overdue catch-up weights by days late (tier 1: 1-14d, tier 2: 15-60d, tier 3: >60d)
      overdueCatchUp: {
        tier1MaxDays: 14, tier1Weight: 0.8,
        tier2MaxDays: 60, tier2Weight: 0.5,
        tier3Weight: 0.2
      },
      calibrationDays: 28,                 // rolling history window in days for realisation rate
      minHistoryDays: 14,                  // minimum history span in days required to calibrate
      rateMin: 0.5,                        // clamp minimum realisation rate
      rateMax: 1.2,                        // clamp maximum realisation rate
      monthlyTarget: null                  // optional monthly revenue target in EUR (null if not set)
    }
  };
  const COLORS = { late: "var(--alarm-high)", flow: "var(--alarm-low)", undated: "var(--alarm-med)" };
  const SHARE_COLORS = ["#1F2629", "#11879A", "#7FB9C2", "#C4CBC9"];
  const LS_HISTORY = "dopk.history.v1", LS_LAST = "dopk.last.v1";

  // ---------------------------------------------------------------- texts
  const pl = (n, one, many) => n + " " + (n === 1 ? one : many);
  const I18N = {
    de: {
      htmlTitle: "DOPK Insight: täglicher Auftragsbestand",
      tagline: "Täglicher Auftragsbestand", noFile: "Keine Datei geladen", snapshot: "Stand",
      customer: "Kunde", allCustomers: "Alle Kunden", allExcept: n => `Alle außer ${n}`,
      upload: "Tagesdatei hochladen", choose: "Datei auswählen",
      dropTitle: "Ziehen Sie den heutigen DOPK-Export hierher, um den Auftragsbestand zu lesen.",
      dropBody: "Verwenden Sie die .xlsx-Datei der offenen Aufträge aus dem ERP. Sie wird nur in diesem Browser gelesen und nie auf einen Server hochgeladen. Jede neue Tagesdatei wird mit der vorherigen verglichen, damit sichtbar wird, was sich bewegt hat.",
      keyFigures: "Kennzahlen",
      horizonTitle: "Auftragshorizont", legLate: "Überfällig", legFlow: "Geplant", legUndated: "Ohne Liefertermin",
      shareTitle: "Von wem der Bestand abhängt", shareNote: "Anteil am offenen Wert je Kunde.",
      lateTitle: "Überfällige Positionen nachfassen", exportLate: "Überfälligkeitsliste exportieren",
      thOrder: "Auftrag", thCust: "Kunde", thArt: "Artikel", thDue: "Fällig", thLate: "Verzug", thVal: "Offener Wert",
      watchTitle: "Beobachtungsliste", watchNote: "Veränderungen, Abschlusschancen und zu korrigierende Daten.",
      print: "Drucken oder als PDF speichern", clear: "Gespeicherten Verlauf löschen",
      months: ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"],
      chips: { high: "Handeln", med: "Beobachten", low: "Info", clear: "In Ordnung" },
      noChange: "unverändert",
      scopeAll: "", scopeX: n => ` ohne ${n}`, scopeOne: n => ` für ${n}`,
      h1Late: (o, s, l) => `${o} sind offen${s}, davon ${l} überfällig.`,
      h1Ok: (o, s) => `${o} sind offen${s}, nichts ist überfällig.`,
      lateAll: c => `Der gesamte überfällige Wert entfällt auf ${c}.`,
      lateShare: (p, c) => `${p} des überfälligen Werts entfallen auf ${c}.`,
      due7: v => `In den nächsten 7 Tagen werden ${v} fällig.`,
      due7none: hasLate => `In den nächsten 7 Tagen wird nichts ${hasLate ? "weiter " : ""}fällig.`,
      todayLine: (n, sv, o, iv) => `Heute: ${n ? pl(n, "Lieferschein", "Lieferscheine") + " über " + sv + " erstellt" : "keine Lieferscheine erstellt"}, ${o ? pl(o, "neuer Auftrag", "neue Aufträge") + " über " + iv + " erfasst" : "keine neuen Aufträge erfasst"}.`,
      vOpen: "Offener Bestand", vLate: "Überfällig", vShip: "Heute versandt", vIn: "Neue Aufträge heute", vUnd: "Ohne Liefertermin",
      sOpen: (l, o) => `${pl(l, "Position", "Positionen")} in ${pl(o, "Auftrag", "Aufträgen")}`,
      sLate: (p, l) => `${p} des offenen Werts, ${pl(l, "Position", "Positionen")}`,
      sShip: (n, ot) => `${pl(n, "Lieferschein", "Lieferscheine")}, ${ot == null ? "keine datierten Positionen" : ot + " termingerecht"}`,
      sIn: (o, c) => `${pl(o, "Auftrag", "Aufträge")} von ${pl(c, "Kunde", "Kunden")}`,
      sUnd: (v, l) => `${v} in ${pl(l, "Position", "Positionen")}`,
      colLate: "Überfällig", colLateFull: "Überfällig", colUnd: "o. Termin", colUndFull: "Ohne Liefertermin", today: "Heute",
      avg6: v => `6-Monats-Schnitt ${v}`, tip: (m, v, n) => `${m}: ${v} in ${pl(n, "Position", "Positionen")}`,
      chartLabel: "Offener Wert nach Liefermonat",
      dropNote: m => `Geplante Lieferungen fallen im ${m} unter die Hälfte des 6-Monats-Schnitts. Neue Abrufe rechtzeitig einplanen.`,
      noDropNote: "Geplante Lieferungen bleiben im sichtbaren Auftragsbestand über der Hälfte des 6-Monats-Schnitts.",
      others: n => `${n} weitere Kunden`, custsWith: "Kunden mit offenen Aufträgen", hhi: "HHI-Index",
      hhiHigh: "Stark konzentriert", hhiMed: "Mäßig konzentriert", hhiLow: "Diversifiziert",
      lateCount: (l, o) => `${pl(l, "überfällige Position", "überfällige Positionen")} in ${pl(o, "Auftrag", "Aufträgen")}. Die 10 größten nach Wert sind aufgeführt.`,
      noLate: "Keine Position ist überfällig.", allOnPlan: "Alle offenen Positionen liegen im Plan.", days: d => `${d} Tg.`,
      wSince: d => `Seit ${d}`,
      wSinceBody: (c, cv, p, pv) => `${pl(c, "Position hat", "Positionen haben")} den Bestand verlassen (${cv}). ${p ? pl(p, "Position erhielt", "Positionen erhielten") + " einen späteren Liefertermin (" + pv + ")." : "Kein Liefertermin wurde nach hinten verschoben."}`,
      wTrack: "Tagesvergleich", wTrackBody: "Laden Sie morgen die nächste Datei hoch, um erledigte Positionen, verschobene Termine und Trends zu sehen.",
      wShipLate: n => `${pl(n, "Position", "Positionen")} heute verspätet versandt`, wShipLateBody: v => `Sie gingen nach ihrem Liefertermin raus. Wert ${v}.`,
      wClose: (n, q) => `${pl(n, "Auftrag ist", "Aufträge sind")} zu ${q} % oder mehr geliefert`, wCloseBody: v => `Die Lieferung der restlichen ${v} würde sie abschließen.`,
      wPrice: n => `${pl(n, "Preisausreißer", "Preisausreißer")}`, wPriceBody: (a, c, u, m) => `Größte Abweichung: ${a} für ${c} mit ${u} je Einheit, üblich sind ${m}.`,
      wZero: n => `${pl(n, "Position", "Positionen")} mit Nullpreis`,
      wMis: n => `${pl(n, "Position", "Positionen")}, bei denen der Wert nicht Menge × Preis entspricht`, wMisBody: o => `Häufig eine in Tausend erfasste Menge. Aufträge: ${o}.`,
      linesRead: n => `${pl(n, "Position", "Positionen")} gelesen`,
      viewDetails: "Details anzeigen", closeDialog: "Schließen", exportCsv: "Als CSV exportieren",
      modalSearchPlaceholder: "In Tabelle suchen …",
      thDate: "Datum", thDesc: "Bezeichnung", thQty: "Menge", thRest: "Rest", thUnit: "Preis", thStatus: "Status",
      noMatches: "Keine passenden Positionen gefunden.",
      filterCount: (shown, total) => `${shown} von ${total} ${total === 1 ? "Position" : "Positionen"}`,
      totalCount: total => `${total} ${total === 1 ? "Position" : "Positionen"}`,
      modalSubOpen: (l, o, v) => `${pl(l, "Position", "Positionen")} in ${pl(o, "Auftrag", "Aufträgen")} · Gesamt ${v}`,
      modalSubLate: (l, o, v) => `${pl(l, "überfällige Position", "überfällige Positionen")} in ${pl(o, "Auftrag", "Aufträgen")} · Gesamt ${v}`,
      modalSubShip: (l, n, v) => `${pl(l, "Position", "Positionen")} in ${pl(n, "Lieferschein", "Lieferscheinen")} · Gesamt ${v}`,
      modalSubIn: (l, o, v) => `${pl(l, "neu erfasste Position", "neu erfasste Positionen")} in ${pl(o, "Auftrag", "Aufträgen")} · Gesamt ${v}`,
      modalSubUnd: (l, o, v) => `${pl(l, "Position ohne Termin", "Positionen ohne Termin")} in ${pl(o, "Auftrag", "Aufträgen")} · Gesamt ${v}`,
      csvModalHead: ["Auftrag", "Datum", "Kunde", "Artikel", "Bezeichnung", "Auftragsmenge", "Restmenge", "Nettopreis EUR", "Wert EUR", "Liefertermin", "Tage Verzug", "Status"],
      csvFilePrefixes: { open: "offener_bestand", late: "ueberfaellig", shipped: "heute_versandt", intake: "neue_auftraege", undated: "ohne_termin" },
      csvHead: ["Auftrag", "Kunde", "Artikel", "Bezeichnung", "Restmenge", "Liefertermin", "Tage Verzug", "Offener Wert EUR"], csvName: "ueberfaellig",
      errHeader: "Diese Datei hat keine Kopfzeile mit „Auftrag“ und „Restmenge“. Bitte den DOPK-Export offener Aufträge hochladen.",
      errCol: c => `Die Spalte „${c}“ fehlt.`, errNoLines: "Die Kopfzeile wurde gefunden, aber es folgen keine Auftragspositionen.",
      errRead: "Diese Datei konnte nicht als Tabelle gelesen werden. Bitte den .xlsx-Export aus dem ERP hochladen.",
      importArchive: "Archiv importieren", dismiss: "Schließen",
      importDone: (n, a, b) => `${pl(n, "Tagesdatei", "Tagesdateien")} importiert (${a} bis ${b}). Der Verlauf ist jetzt in diesem Browser verfügbar.`,
      importSkipped: list => ` Übersprungen: ${list}.`, importBusy: (i, n) => `Datei ${i} von ${n} wird gelesen …`,
      dupDate: "gleiches Datum wie eine andere Datei, neuere Datei verwendet",
      outlookTitle: "Umsatzausblick",
      outlookSubtitle: (v30, late, hasLate) => hasLate
        ? `In den nächsten 30 Tagen werden voraussichtlich ${v30} versandt, davon ${late} aus überfälligen Positionen.`
        : `In den nächsten 30 Tagen werden voraussichtlich ${v30} versandt, alle Positionen liegen im Plan.`,
      outlookSubtitleNone: "In den nächsten 30 Tagen sind keine Lieferungen geplant.",
      outlook7d: "Nächste 7 Tage",
      outlook30d: "Nächste 30 Tage",
      outlook90d: "Nächste 90 Tage",
      outlookSched: "geplant",
      outlookCatchUp: "Verzug",
      outlookPlanVal: "Plan",
      outlookExpVal: "Erwartet",
      outlookCompare: (p, e, r) => `Plan: ${p} · Erwartet: ${e} (${r})`,
      outlookMonthTitle: m => `Monatslandung ${m}`,
      outlookShippedMtd: "versandt",
      outlookStillExpected: "noch erwartet",
      outlookShippedToday: "Heute versandt",
      outlookTarget: "Ziel",
      outlookTargetInfo: (t, p) => `Ziel: ${t} (${p} erreicht)`,
      outlookBarAria: (m, l, s, e) => `Monatsergebnis ${m}: ${l}, davon ${s} versandt und ${e} noch erwartet.`,
      outlookUndatedNote: (v, n) => `Nicht enthalten: ${v} ohne Liefertermin (${pl(n, "Position", "Positionen")})`,
      outlookCalibratedNote: (r, d) => `Realisierungsquote: ${r} (Basis: letzte ${d} Tage)`,
      outlookFilterNote: "Erwartungswert nur ohne Kundenfilter verfügbar",
      outlookHistoryShortNote: d => `Erwartungswert nach ${d} Tagen Verlauf verfügbar`,
      outlookPartialNote: d => `Monatsversand unvollständig (erfasst ab ${d})`,
      outlookMismatchNote: n => `${pl(n, "Position", "Positionen")} mit Rechenabweichung enthalten (Wert verwendet)`
    },
    en: {
      htmlTitle: "DOPK Insight: daily order book",
      tagline: "Daily order book", noFile: "No file loaded", snapshot: "Snapshot",
      customer: "Customer", allCustomers: "All customers", allExcept: n => `All except ${n}`,
      upload: "Upload today's file", choose: "Choose file",
      dropTitle: "Drop today's DOPK export here to read the order book.",
      dropBody: "Use the .xlsx open-order file from the ERP. It is read in this browser only and never uploaded to a server. Each new day's file is compared with the previous one to show what moved.",
      keyFigures: "Key figures",
      horizonTitle: "Order-book horizon", legLate: "Past due", legFlow: "Scheduled", legUndated: "No delivery date",
      shareTitle: "Who the backlog depends on", shareNote: "Share of open value by customer.",
      lateTitle: "Late lines to chase", exportLate: "Export overdue list",
      thOrder: "Order", thCust: "Customer", thArt: "Article", thDue: "Due", thLate: "Late by", thVal: "Open value",
      watchTitle: "Watchlist", watchNote: "Changes, completion chances and data to correct.",
      print: "Print or save as PDF", clear: "Clear stored history",
      months: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
      chips: { high: "Act now", med: "Watch", low: "Info", clear: "Clear" },
      noChange: "no change",
      scopeAll: "", scopeX: n => ` excluding ${n}`, scopeOne: n => ` for ${n}`,
      h1Late: (o, s, l) => `${o} is open${s}, and ${l} of it is late.`,
      h1Ok: (o, s) => `${o} is open${s}, and nothing is late.`,
      lateAll: c => `All of the late value is for ${c}.`,
      lateShare: (p, c) => `${p} of the late value is for ${c}.`,
      due7: v => `${v} falls due in the next 7 days.`,
      due7none: hasLate => `Nothing ${hasLate ? "else " : ""}falls due in the next 7 days.`,
      todayLine: (n, sv, o, iv) => `Today ${n ? pl(n, "delivery note", "delivery notes") + " went out worth " + sv : "no delivery notes went out"}, and ${o ? pl(o, "new order", "new orders") + " came in worth " + iv : "no new orders came in"}.`,
      vOpen: "Open backlog", vLate: "Overdue", vShip: "Shipped today", vIn: "New orders today", vUnd: "No delivery date",
      sOpen: (l, o) => `${pl(l, "line", "lines")} in ${pl(o, "order", "orders")}`,
      sLate: (p, l) => `${p} of open, ${pl(l, "line", "lines")}`,
      sShip: (n, ot) => `${pl(n, "delivery note", "delivery notes")}, ${ot == null ? "no dated lines" : ot + " on time"}`,
      sIn: (o, c) => `${pl(o, "order", "orders")} from ${pl(c, "customer", "customers")}`,
      sUnd: (v, l) => `${v} in ${pl(l, "line", "lines")}`,
      colLate: "Late", colLateFull: "Past due", colUnd: "No date", colUndFull: "No delivery date", today: "Today",
      avg6: v => `6-month average ${v}`, tip: (m, v, n) => `${m}: ${v} in ${pl(n, "line", "lines")}`,
      chartLabel: "Open value by delivery month",
      dropNote: m => `Scheduled deliveries fall below half the 6-month average in ${m}. Plan new call-offs before then.`,
      noDropNote: "Scheduled deliveries stay above half the 6-month average across the visible order book.",
      others: n => `${n} other customers`, custsWith: "customers with open orders", hhi: "HHI index",
      hhiHigh: "Highly concentrated", hhiMed: "Moderately concentrated", hhiLow: "Diversified",
      lateCount: (l, o) => `${pl(l, "late line", "late lines")} in ${pl(o, "order", "orders")}. The 10 largest by value are shown.`,
      noLate: "No lines are past their delivery date.", allOnPlan: "Every open line is on schedule.", days: d => `${d} d`,
      wSince: d => `Since ${d}`,
      wSinceBody: (c, cv, p, pv) => `${pl(c, "line", "lines")} left the book (${cv}). ${p ? pl(p, "line", "lines") + " had the delivery date moved later (" + pv + ")." : "No delivery dates were moved later."}`,
      wTrack: "Day-over-day tracking", wTrackBody: "Upload tomorrow's file to see completed lines, rescheduled dates and trends.",
      wShipLate: n => `${pl(n, "line", "lines")} shipped late today`, wShipLateBody: v => `These went out after their delivery date. Worth ${v}.`,
      wClose: (n, q) => `${pl(n, "order is", "orders are")} ${q}% or more delivered`, wCloseBody: v => `Shipping the remaining ${v} would close them.`,
      wPrice: n => pl(n, "price outlier", "price outliers"), wPriceBody: (a, c, u, m) => `Largest gap: ${a} for ${c} at ${u} per unit, against a typical ${m}.`,
      wZero: n => `${pl(n, "line", "lines")} with zero price`,
      wMis: n => `${pl(n, "line", "lines")} where the value doesn't match quantity × price`, wMisBody: o => `Often a quantity entered in thousands. Orders: ${o}.`,
      linesRead: n => `${pl(n, "line", "lines")} read`,
      viewDetails: "View details", closeDialog: "Close", exportCsv: "Export as CSV",
      modalSearchPlaceholder: "Search table …",
      thDate: "Date", thDesc: "Description", thQty: "Qty", thRest: "Remaining", thUnit: "Price", thStatus: "Status",
      noMatches: "No matching lines found.",
      filterCount: (shown, total) => `${shown} of ${total} ${total === 1 ? "line" : "lines"}`,
      totalCount: total => `${total} ${total === 1 ? "line" : "lines"}`,
      modalSubOpen: (l, o, v) => `${pl(l, "line", "lines")} in ${pl(o, "order", "orders")} · Total ${v}`,
      modalSubLate: (l, o, v) => `${pl(l, "late line", "late lines")} in ${pl(o, "order", "orders")} · Total ${v}`,
      modalSubShip: (l, n, v) => `${pl(l, "line", "lines")} in ${pl(n, "delivery note", "delivery notes")} · Total ${v}`,
      modalSubIn: (l, o, v) => `${pl(l, "new line", "new lines")} in ${pl(o, "order", "orders")} · Total ${v}`,
      modalSubUnd: (l, o, v) => `${pl(l, "undated line", "undated lines")} in ${pl(o, "order", "orders")} · Total ${v}`,
      csvModalHead: ["Order", "Date", "Customer", "Article", "Description", "Order qty", "Remaining qty", "Unit price EUR", "Value EUR", "Due date", "Days late", "Status"],
      csvFilePrefixes: { open: "open_backlog", late: "overdue", shipped: "shipped_today", intake: "new_orders", undated: "no_delivery_date" },
      csvHead: ["Order", "Customer", "Article", "Description", "Remaining qty", "Due date", "Days late", "Open value EUR"], csvName: "overdue",
      errHeader: "This file has no header row with “Auftrag” and “Restmenge”. Upload the DOPK open-order export.",
      errCol: c => `Column “${c}” is missing.`, errNoLines: "The header row was found, but no order lines follow it.",
      errRead: "This file couldn't be read as a spreadsheet. Upload the .xlsx export from the ERP.",
      importArchive: "Import archive", dismiss: "Close",
      importDone: (n, a, b) => `${pl(n, "daily file", "daily files")} imported (${a} to ${b}). The history is now available in this browser.`,
      importSkipped: list => ` Skipped: ${list}.`, importBusy: (i, n) => `Reading file ${i} of ${n} …`,
      dupDate: "same date as another file, newer file used",
      outlookTitle: "Revenue outlook",
      outlookSubtitle: (v30, late, hasLate) => hasLate
        ? `${v30} is expected to ship in the next 30 days, of which ${late} is overdue catch-up.`
        : `${v30} is expected to ship in the next 30 days, all lines are on schedule.`,
      outlookSubtitleNone: "No shipments scheduled in the next 30 days.",
      outlook7d: "Next 7 days",
      outlook30d: "Next 30 days",
      outlook90d: "Next 90 days",
      outlookSched: "scheduled",
      outlookCatchUp: "overdue catch-up",
      outlookPlanVal: "Plan",
      outlookExpVal: "Expected",
      outlookCompare: (p, e, r) => `Plan: ${p} · Expected: ${e} (${r})`,
      outlookMonthTitle: m => `Month landing ${m}`,
      outlookShippedMtd: "shipped",
      outlookStillExpected: "still expected",
      outlookShippedToday: "Shipped today",
      outlookTarget: "Target",
      outlookTargetInfo: (t, p) => `Target: ${t} (${p} achieved)`,
      outlookBarAria: (m, l, s, e) => `Month landing ${m}: ${l}, of which ${s} shipped and ${e} still expected.`,
      outlookUndatedNote: (v, n) => `Not included: ${v} without delivery date (${pl(n, "line", "lines")})`,
      outlookCalibratedNote: (r, d) => `Realisation rate: ${r} (based on last ${d} days)`,
      outlookFilterNote: "Expected value available without customer filter only",
      outlookHistoryShortNote: d => `Expected value available after ${d} days of history`,
      outlookPartialNote: d => `Month-to-date shipments partial (tracked from ${d})`,
      outlookMismatchNote: n => `${pl(n, "line", "lines")} with calculation discrepancy included (value used)`
    }
  };

  // ------------------------------------------------------------- helpers
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const DAY = 86400000;
  // ---- language
  const LS_LANG = "dopk.lang.v1";
  let LANG = (() => { try { return localStorage.getItem(LS_LANG) || "de"; } catch (e) { return "de"; } })();
  if (!I18N[LANG]) LANG = "de";
  const T = key => I18N[LANG][key] ?? I18N.en[key] ?? key;
  const tf = (key, ...a) => { const v = T(key); return typeof v === "function" ? v(...a) : v; };
  const LOC = () => LANG === "de" ? "de-DE" : "en-GB";
  const nf = (v, d = 0) => v.toLocaleString(LOC(), { minimumFractionDigits: d, maximumFractionDigits: d });

  const eur = v => {
    const a = Math.abs(v), sign = v < 0 ? "−" : "";
    if (LANG === "de") {
      if (a >= 1e6) return sign + nf(a / 1e6, 2) + " Mio. €";
      if (a >= 1e4) return sign + nf(Math.round(a / 1e3)) + " T€";
      if (a >= 1e3) return sign + nf(a / 1e3, 1) + " T€";
      return sign + nf(Math.round(a)) + " €";
    }
    if (a >= 1e6) return sign + "€" + (a / 1e6).toFixed(2) + "M";
    if (a >= 1e4) return sign + "€" + Math.round(a / 1e3) + "k";
    if (a >= 1e3) return sign + "€" + (a / 1e3).toFixed(1) + "k";
    return sign + "€" + Math.round(a);
  };
  const eurShort = v => LANG === "de" ? eur(v).replace(" €", "").replace("T€", "T").replace(" Mio.", " Mio") : eur(v).replace("€", "");
  const eurFull = v => LANG === "de" ? nf(v) + " €" : "€" + nf(v);
  const eurUnit = v => LANG === "de" ? nf(v, 2) + " €" : "€" + v.toFixed(2);
  const pct = (v, d = 1) => (LANG === "de" ? nf(isFinite(v) ? v : 0, d) + " %" : (isFinite(v) ? v.toFixed(d) : "0") + "%");
  const fmtDate = d => d ? String(d.getDate()).padStart(2, "0") + "." + String(d.getMonth() + 1).padStart(2, "0") + "." + d.getFullYear() : "–";
  const iso = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  const monthName = (m, y, withYear) => T("months")[m] + (withYear ? " " + (withYear === "short" ? String(y).slice(2) : y) : "");
  const sum = (a, f) => a.reduce((s, x) => s + (f ? f(x) : x), 0);
  const uniq = (a, f) => new Set(a.map(f)).size;
  const median = a => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

  function parseDate(v) {
    if (v == null || v === "") return null;
    if (v instanceof Date) return new Date(v.getFullYear(), v.getMonth(), v.getDate());
    if (typeof v === "number" && v > 20000 && v < 80000) { const d = new Date(Math.round((v - 25569) * DAY)); return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); }
    const m = String(v).match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    return m ? new Date(+m[3], +m[2] - 1, +m[1]) : null;
  }
  const num = v => { if (v == null || v === "") return null; if (typeof v === "number") return v; const n = parseFloat(String(v).replace(/\./g, "").replace(",", ".")); return isNaN(n) ? null : n; };
  const cleanName = n => String(n || "").split(/\s{2,}|\s[A-Z]{2}-\d{4,5}/)[0].trim() || "Unknown";
  const shortName = n => { const s = n.replace(/\b(GmbH|mbH|& Co\.? ?KG|Co\.KG|KG|A\/S|AG|e\.V\.)\b/g, "").replace(/\s+/g, " ").trim(); if (s.length <= 28) return s; const w = s.split(" "); let out = ""; for (const x of w) { if ((out + " " + x).trim().length > 28) break; out = (out + " " + x).trim(); } return out || s.slice(0, 27) + "…"; };

  // ------------------------------------------------------------- parsing
  function parseRows(aoa, fileName) {
    const h = aoa.findIndex(r => Array.isArray(r) && r.some(c => String(c).trim() === "Auftrag") && r.some(c => String(c).trim() === "Restmenge"));
    if (h < 0) throw new Error(T("errHeader"));
    const head = aoa[h].map(c => String(c ?? "").trim());
    const col = n => head.indexOf(n);
    const C = {
      order: col("Auftrag"), date: col("Datum"), cust: col("Kunde"), name: col("Name"), art: col("Artikel-Nr."), desc: col("Bezeichnung"),
      qty: col("Auftragsmenge"), rest: col("Restmenge"), price: col("Nettopreis"), eh: col("EH"), val: col("Summe"),
      due: col("Liefertermin"), note: col("Bemerkung"), status: col("Status"), quote: col("Quote"), s1: col("Bestand I"), s2: col("Bestand II")
    };
    ["order", "rest", "val"].forEach(k => { if (C[k] < 0) throw new Error(tf("errCol", { order: "Auftrag", rest: "Restmenge", val: "Summe" }[k])); });

    let reportDate = null;
    for (let i = 0; i < h && !reportDate; i++) for (const c of aoa[i] || []) { const d = parseDate(c); if (d) { reportDate = d; break; } }

    const lines = [];
    for (let i = h + 1; i < aoa.length; i++) {
      const r = aoa[i]; if (!r) continue;
      const order = num(r[C.order]); if (!order) continue;
      const qty = num(r[C.qty]) ?? 0, rest = num(r[C.rest]) ?? 0, price = num(r[C.price]) ?? 0, eh = num(r[C.eh]) || 1;
      const status = String(r[C.status] ?? "").trim();
      const name = cleanName(r[C.name]);
      lines.push({
        order, date: parseDate(r[C.date]), custId: r[C.cust], cust: name, short: shortName(name),
        art: String(r[C.art] ?? "").trim(), desc: String(r[C.desc] ?? "").trim(),
        qty, rest, price, eh, unit: price / eh, val: num(r[C.val]) ?? 0, calc: rest * price / eh, orig: qty * price / eh,
        due: parseDate(r[C.due]), note: C.note >= 0 ? String(r[C.note] ?? "").trim() : "",
        status, shipped: /^LS/i.test(status), quote: num(r[C.quote]), stock: num(r[C.s1]), stock2: C.s2 >= 0 ? num(r[C.s2]) : null
      });
    }
    if (!lines.length) throw new Error(T("errNoLines"));
    if (!reportDate) {
      const m = String(fileName || "").match(/(\d{2})_(\d{2})/);
      const maxD = new Date(Math.max(...lines.map(l => l.date ? +l.date : 0)));
      reportDate = m ? new Date(maxD.getFullYear(), +m[2] - 1, +m[1]) : maxD;
    }
    // stable line keys for day-over-day comparison
    const seen = {};
    lines.forEach(l => { const k = l.order + "|" + l.art + "|" + l.qty; seen[k] = (seen[k] || 0) + 1; l.key = k + "|" + seen[k]; });
    return { lines, reportDate, fileName };
  }

  // ------------------------------------------------------------- metrics
  function compute(all, rd, filter) {
    let L = all;
    const custTotals = {};
    all.filter(l => !l.shipped).forEach(l => custTotals[l.cust] = (custTotals[l.cust] || 0) + l.val);
    const topCust = Object.entries(custTotals).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (filter === "__xtop") L = all.filter(l => l.cust !== topCust);
    else if (filter && filter !== "__all") L = all.filter(l => l.cust === filter);

    const open = L.filter(l => !l.shipped), shipped = L.filter(l => l.shipped);
    const openVal = sum(open, l => l.val);
    const late = open.filter(l => l.due && l.due < rd), undated = open.filter(l => !l.due);
    const lateVal = sum(late, l => l.val), undatedVal = sum(undated, l => l.val);
    const in7 = open.filter(l => l.due && l.due >= rd && l.due <= new Date(+rd + 7 * DAY));
    const shippedDated = shipped.filter(l => l.due);
    const shippedLate = shippedDated.filter(l => l.due < rd);
    const intake = L.filter(l => l.date && +l.date === +rd);

    // horizon: months from report month to last due date
    const months = [];
    const last = open.reduce((m, l) => l.due && l.due > m ? l.due : m, rd);
    for (let d = new Date(rd.getFullYear(), rd.getMonth(), 1); d <= last; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
      const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      const inM = open.filter(l => l.due && l.due >= rd && l.due >= d && l.due < next);
      months.push({ m: d.getMonth(), y: d.getFullYear(), yearTag: d.getMonth() === 0 || !months.length, val: sum(inM, l => l.val), n: inM.length });
    }
    const first6 = months.slice(0, 6), avg6 = first6.length ? sum(first6, m => m.val) / first6.length : 0;
    const dropIdx = months.findIndex((m, i) => i >= 3 && m.val < 0.5 * avg6);

    // concentration
    const byCust = {};
    open.forEach(l => { byCust[l.cust] = byCust[l.cust] || { name: l.cust, short: l.short, val: 0, lines: 0, late: 0 }; byCust[l.cust].val += l.val; byCust[l.cust].lines++; if (l.due && l.due < rd) byCust[l.cust].late += l.val; });
    const custs = Object.values(byCust).sort((a, b) => b.val - a.val);
    const hhi = openVal ? sum(custs, c => Math.pow(c.val / openVal * 100, 2)) : 0;
    const lateByCust = [...custs].sort((a, b) => b.late - a.late);

    // exceptions
    const byArt = {};
    L.forEach(l => { if (l.unit > 0) (byArt[l.art] = byArt[l.art] || []).push(l); });
    const priceFlags = [];
    Object.values(byArt).forEach(arr => {
      if (uniq(arr, l => l.cust) < 3) return;
      const med = median(arr.map(l => l.unit));
      arr.forEach(l => { const r = l.unit / med; if (r < RULES.priceLow || r > RULES.priceHigh) priceFlags.push({ l, med, r }); });
    });
    const zeroPrice = L.filter(l => l.price === 0 && l.rest > 0);
    const mismatch = L.filter(l => Math.abs(l.calc - l.val) > 0.05);
    const orders = {};
    L.forEach(l => { if (l.quote != null && !(l.order in orders)) orders[l.order] = { q: l.quote, cust: l.cust }; });
    const closeOut = Object.entries(orders).filter(([, o]) => o.q >= RULES.closeOutQuote && o.q < 100);
    const closeOutVal = sum(open.filter(l => closeOut.some(([k]) => +k === l.order)), l => l.val);

    return {
      L, open, shipped, topCust, custs, hhi, lateByCust, months, avg6, dropIdx,
      openVal, openLines: open.length, openOrders: uniq(open, l => l.order),
      late, lateVal, latePct: openVal ? lateVal / openVal * 100 : 0,
      undated, undatedVal, undatedPct: openVal ? undatedVal / openVal * 100 : 0,
      in7Val: sum(in7, l => l.val),
      shippedVal: sum(shipped, l => l.val), notes: uniq(shipped, l => l.status), shipCusts: uniq(shipped, l => l.cust),
      onTimePct: shippedDated.length ? (1 - shippedLate.length / shippedDated.length) * 100 : null, shippedLate,
      intake, intakeVal: sum(intake, l => l.orig), intakeOrders: uniq(intake, l => l.order), intakeCusts: uniq(intake, l => l.cust),
      priceFlags, zeroPrice, mismatch, closeOut, closeOutVal
    };
  }

  function computeOutlook(lines, rd, filter, history) {
    let L = lines;
    const custTotals = {};
    lines.filter(l => !l.shipped).forEach(l => custTotals[l.cust] = (custTotals[l.cust] || 0) + l.val);
    const topCust = Object.entries(custTotals).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (filter === "__xtop") L = lines.filter(l => l.cust !== topCust);
    else if (filter && filter !== "__all") L = lines.filter(l => l.cust === filter);

    const open = L.filter(l => !l.shipped);
    const shippedToday = L.filter(l => l.shipped);
    const shippedTodayVal = sum(shippedToday, l => l.val);

    // Inclusive windows measured from rd: [rd + 1, rd + W]
    const d1 = new Date(rd.getFullYear(), rd.getMonth(), rd.getDate() + 1);
    const d7 = new Date(rd.getFullYear(), rd.getMonth(), rd.getDate() + RULES.outlook.windows[0]);
    const d30 = new Date(rd.getFullYear(), rd.getMonth(), rd.getDate() + RULES.outlook.windows[1]);
    const d90 = new Date(rd.getFullYear(), rd.getMonth(), rd.getDate() + RULES.outlook.windows[2]);

    const sched7 = sum(open.filter(l => l.due && l.due >= d1 && l.due <= d7), l => l.val);
    const sched30 = sum(open.filter(l => l.due && l.due >= d1 && l.due <= d30), l => l.val);
    const sched90 = sum(open.filter(l => l.due && l.due >= d1 && l.due <= d90), l => l.val);

    // Overdue lines: open lines with due < rd
    const late = open.filter(l => l.due && l.due < rd);
    const totalLate = sum(late, l => l.val);
    const cfg = RULES.outlook.overdueCatchUp;

    let catchUp7 = 0;
    late.forEach(l => {
      const daysLate = Math.round((rd - l.due) / DAY);
      let w = cfg.tier3Weight;
      if (daysLate <= cfg.tier1MaxDays) w = cfg.tier1Weight;
      else if (daysLate <= cfg.tier2MaxDays) w = cfg.tier2Weight;
      catchUp7 += l.val * w;
    });

    // Windows are cumulative. Whatever is not caught up in 7 days rolls into 30 days.
    const catchUp30 = totalLate;
    const catchUp90 = totalLate;

    const plan7 = sched7 + catchUp7;
    const plan30 = sched30 + catchUp30;
    const plan90 = sched90 + catchUp90;

    // Undated lines
    const undated = open.filter(l => !l.due);
    const undatedVal = sum(undated, l => l.val);
    const undatedCount = undated.length;

    // Data quality
    const mismatch = L.filter(l => Math.abs(l.calc - l.val) > 0.05);
    const mismatchCount = mismatch.length;

    // Realisation rate calibration (unfiltered only, minHistoryDays)
    let calibrated = false;
    let calibRate = 1.0;
    let rawRate = null;
    let calibReason = "none";

    const snaps = history?.snaps || {};
    const snapDates = Object.keys(snaps).sort();
    const rdIso = iso(rd);

    if (filter !== "__all") {
      calibReason = "filter";
    } else if (snapDates.length < 2) {
      calibReason = "too_short";
    } else {
      const minD = new Date(snapDates[0] + "T00:00:00");
      const maxD = new Date(snapDates[snapDates.length - 1] + "T00:00:00");
      const spanDays = Math.round((maxD - minD) / DAY);
      if (spanDays < RULES.outlook.minHistoryDays) {
        calibReason = "too_short";
      } else {
        const calibStartIso = iso(new Date(+rd - RULES.outlook.calibrationDays * DAY));
        let totalDelivered = 0;
        let totalDue = 0;

        for (let i = 1; i < snapDates.length; i++) {
          const prevDate = snapDates[i - 1];
          const currDate = snapDates[i];
          if (currDate > rdIso) continue;
          if (currDate < calibStartIso) continue;

          const prevSnap = snaps[prevDate];
          const currSnap = snaps[currDate];
          const prevKeys = prevSnap?.keys || {};
          const currKeys = currSnap?.keys || {};

          for (const [k, [dueIso, prevVal]] of Object.entries(prevKeys)) {
            if (dueIso && dueIso <= currDate) {
              totalDue += prevVal;
            }
            if (!(k in currKeys)) {
              totalDelivered += prevVal;
            } else {
              const currVal = currKeys[k][1];
              if (currVal < prevVal) {
                totalDelivered += (prevVal - currVal);
              }
            }
          }
        }

        if (totalDue > 0) {
          rawRate = totalDelivered / totalDue;
          calibRate = Math.max(RULES.outlook.rateMin, Math.min(RULES.outlook.rateMax, rawRate));
          calibrated = true;
          calibReason = "ok";
        } else {
          calibReason = "too_short";
        }
      }
    }

    const expected7 = calibrated ? plan7 * calibRate : null;
    const expected30 = calibrated ? plan30 * calibRate : null;
    const expected90 = calibrated ? plan90 * calibRate : null;

    // Month landing (current calendar month of rd)
    const rdYear = rd.getFullYear(), rdMonth = rd.getMonth();
    const monthEnd = new Date(rdYear, rdMonth + 1, 0);

    let monthDeliveredPrior = 0;
    for (let i = 1; i < snapDates.length; i++) {
      const prevDate = snapDates[i - 1];
      const currDate = snapDates[i];
      if (currDate > rdIso) continue;
      const cD = new Date(currDate + "T00:00:00");
      if (cD.getFullYear() !== rdYear || cD.getMonth() !== rdMonth) continue;

      const prevSnap = snaps[prevDate];
      const currSnap = snaps[currDate];
      const prevKeys = prevSnap?.keys || {};
      const currKeys = currSnap?.keys || {};

      for (const [k, [, prevVal]] of Object.entries(prevKeys)) {
        if (!(k in currKeys)) {
          monthDeliveredPrior += prevVal;
        } else {
          const currVal = currKeys[k][1];
          if (currVal < prevVal) monthDeliveredPrior += (prevVal - currVal);
        }
      }
    }

    const shippedMonthToDate = monthDeliveredPrior + shippedTodayVal;

    let firstWorkingDay = new Date(rdYear, rdMonth, 1);
    if (firstWorkingDay.getDay() === 0) firstWorkingDay.setDate(2);
    else if (firstWorkingDay.getDay() === 6) firstWorkingDay.setDate(3);

    const monthSnaps = snapDates.filter(d => {
      const dt = new Date(d + "T00:00:00");
      return dt.getFullYear() === rdYear && dt.getMonth() === rdMonth && d <= rdIso;
    });

    let partialMonth = false;
    let partialFromDate = null;
    if (!monthSnaps.length || new Date(monthSnaps[0] + "T00:00:00") > firstWorkingDay) {
      partialMonth = true;
      partialFromDate = monthSnaps.length ? new Date(monthSnaps[0] + "T00:00:00") : rd;
    }

    const schedMonth = sum(open.filter(l => l.due && l.due >= d1 && l.due <= monthEnd), l => l.val);
    const daysRem = Math.max(0, Math.round((monthEnd - rd) / DAY));
    let catchUpMonth = 0;
    if (daysRem <= 7) {
      catchUpMonth = catchUp7 * (daysRem / 7);
    } else if (daysRem < 30) {
      catchUpMonth = catchUp7 + (totalLate - catchUp7) * ((daysRem - 7) / (30 - 7));
    } else {
      catchUpMonth = totalLate;
    }

    const stillExpectedPlan = schedMonth + catchUpMonth;
    const stillExpected = calibrated ? stillExpectedPlan * calibRate : stillExpectedPlan;
    const landing = shippedMonthToDate + stillExpected;

    const target = RULES.outlook.monthlyTarget;
    let targetLevel = "clear";
    let targetPct = null;
    if (target != null && target > 0) {
      targetPct = landing / target * 100;
      if (targetPct < 75) targetLevel = "high";
      else if (targetPct < 90) targetLevel = "med";
      else targetLevel = "clear";
    }

    return {
      d7: { sched: sched7, catchUp: catchUp7, plan: plan7, expected: expected7 },
      d30: { sched: sched30, catchUp: catchUp30, plan: plan30, expected: expected30 },
      d90: { sched: sched90, catchUp: catchUp90, plan: plan90, expected: expected90 },
      shippedTodayVal,
      undatedVal, undatedCount,
      mismatchCount,
      calibrated, calibRate, rawRate, calibReason,
      monthLanding: {
        shippedMonthToDate,
        todayShippedVal: shippedTodayVal,
        stillExpected,
        stillExpectedPlan,
        landing,
        partialMonth,
        partialFromDate,
        target,
        targetPct,
        targetLevel,
        monthName: monthName(rdMonth, rdYear, false),
        monthYear: rdYear
      }
    };
  }
  const level = (v, r, invert) => invert ? (v < r.high ? "high" : v < r.med ? "med" : "clear") : (v > r.high ? "high" : v > r.med ? "med" : v > 0 ? "low" : "clear");

  // ------------------------------------------------------------- history
  const store = {
    get(k, f) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : f; } catch (e) { return f; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  };
  function recordHistory(data, m) {
    const h = store.get(LS_HISTORY, { snaps: {} });
    const d = iso(data.reportDate);
    const keys = {};
    data.lines.forEach(l => keys[l.key] = [l.due ? iso(l.due) : null, Math.round(l.val)]);
    h.snaps[d] = { openVal: m.openVal, lateVal: m.lateVal, shippedVal: m.shippedVal, intakeVal: m.intakeVal, undatedPct: m.undatedPct, keys };
    const dates = Object.keys(h.snaps).sort();
    while (dates.length > RULES.historyDays) delete h.snaps[dates.shift()];
    while (!store.set(LS_HISTORY, h) && dates.length > 1) delete h.snaps[dates.shift()]; // storage full: drop oldest
    return h;
  }
  function previous(h, rd) {
    const d = iso(rd);
    const dates = Object.keys(h.snaps).filter(x => x < d).sort();
    return dates.length ? { date: dates[dates.length - 1], snap: h.snaps[dates[dates.length - 1]] } : null;
  }
  function compare(prev, lines) {
    if (!prev) return null;
    const now = new Set(lines.map(l => l.key));
    let completed = 0, completedVal = 0, pushed = 0, pushedVal = 0;
    Object.entries(prev.snap.keys || {}).forEach(([k, [due, val]]) => { if (!now.has(k)) { completed++; completedVal += val; } });
    lines.forEach(l => { const p = prev.snap.keys?.[l.key]; if (p && p[0] && l.due && iso(l.due) > p[0]) { pushed++; pushedVal += l.val; } });
    return { completed, completedVal, pushed, pushedVal };
  }

  // ------------------------------------------------------------- render
  let DATA = null, FILTER = "__all";

  function deltaHTML(now, before, goodWhenDown) {
    if (before == null) return "";
    const d = now - before;
    if (Math.abs(d) < 1) return `<span class="delta delta--flat">${T("noChange")}</span>`;
    const up = d > 0, bad = goodWhenDown ? up : !up;
    return `<span class="delta delta--${up ? "up" : "down"}-${bad ? "bad" : "good"}">${up ? "▲" : "▼"} ${eur(Math.abs(d))}</span>`;
  }
  function spark(h, key) {
    const pts = Object.keys(h.snaps).sort().map(d => h.snaps[d][key]);
    if (pts.length < 2) return "";
    const mx = Math.max(...pts), mn = Math.min(...pts), w = 96, ht = 22;
    const path = pts.map((v, i) => `${(i / (pts.length - 1) * w).toFixed(1)},${(ht - (mx === mn ? ht / 2 : (v - mn) / (mx - mn) * ht)).toFixed(1)}`).join(" ");
    return `<svg width="${w}" height="${ht + 2}" viewBox="0 -1 ${w} ${ht + 2}" aria-hidden="true" style="display:block;margin-top:6px"><polyline points="${path}" fill="none" stroke="var(--ink-muted)" stroke-width="1.5"/></svg>`;
  }
  const chipHTML = l => `<span class="chip chip--${l}">${T("chips")[l]}</span>`;

  function applyStatic() {
    document.documentElement.lang = LANG;
    document.title = T("htmlTitle");
    document.querySelectorAll("[data-i18n]").forEach(el => { el.textContent = T(el.dataset.i18n); });
    document.querySelectorAll("[data-i18n-placeholder]").forEach(el => el.setAttribute("placeholder", T(el.dataset.i18nPlaceholder)));
    document.querySelectorAll("[data-i18n-label]").forEach(el => el.setAttribute("aria-label", T(el.dataset.i18nLabel)));
    document.querySelectorAll(".lang-switch button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.lang === LANG)));
    if (!DATA) $("#snapshot").textContent = T("noFile");
  }

  function render() {
    applyStatic();
    const { lines, reportDate: rd } = DATA;
    const m = compute(lines, rd, FILTER);
    const unfiltered = FILTER === "__all";
    const hist = store.get(LS_HISTORY, { snaps: {} });
    const prev = unfiltered ? previous(hist, rd) : null;
    const P = prev?.snap;
    const cmp = unfiltered ? compare(prev, lines) : null;

    $("#snapshot").innerHTML = `${T("snapshot")} <strong>${fmtDate(rd)}</strong>`;
    const scope = FILTER === "__all" ? "" : FILTER === "__xtop" ? tf("scopeX", shortName(m.topCust)) : tf("scopeOne", shortName(FILTER));

    const topLate = m.lateByCust[0];
    const lateShare = m.lateVal && topLate ? topLate.late / m.lateVal * 100 : 0;
    const h1 = m.lateVal > 0 ? tf("h1Late", eur(m.openVal), scope, eur(m.lateVal)) : tf("h1Ok", eur(m.openVal), scope);
    const s = [];
    if (m.lateVal > 0 && topLate) s.push(lateShare > 99.5 ? tf("lateAll", topLate.short) : tf("lateShare", pct(lateShare, 0), topLate.short));
    s.push(m.in7Val > 0 ? tf("due7", eur(m.in7Val)) : tf("due7none", m.lateVal > 0));
    s.push(tf("todayLine", m.notes, eur(m.shippedVal), m.intakeOrders, eur(m.intakeVal)));
    $("#verdict").innerHTML = `<h1>${esc(h1)}</h1><p>${esc(s.join(" "))}</p>`;

    const lateLvl = level(m.latePct, RULES.overduePct), undLvl = level(m.undatedPct, RULES.undatedPct);
    const otLvl = m.onTimePct == null ? "low" : level(m.onTimePct, RULES.onTimePct, true);
    const vit = (lbl, lvl, value, sub, extra = "", kind = "open") =>
      `<button type="button" class="vital" data-kind="${kind}" data-level="${lvl}" aria-haspopup="dialog">` +
      `<div class="vital-head"><span class="vital-label">${lbl}</span>${chipHTML(lvl)}</div>` +
      `<span class="vital-value">${value}</span>` +
      `<div class="vital-sub">${sub}</div>` +
      `${extra}` +
      `<div class="vital-action">${T("viewDetails")} <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M12 5l7 7-7 7"/></svg></div>` +
      `</button>`;
    $("#vitals").innerHTML = [
      vit(T("vOpen"), "low", eur(m.openVal), `${tf("sOpen", m.openLines, m.openOrders)} ${deltaHTML(m.openVal, P?.openVal, false)}`, unfiltered ? spark(hist, "openVal") : "", "open"),
      vit(T("vLate"), lateLvl, eur(m.lateVal), `${tf("sLate", pct(m.latePct), m.late.length)} ${deltaHTML(m.lateVal, P?.lateVal, true)}`, "", "late"),
      vit(T("vShip"), otLvl, eur(m.shippedVal), tf("sShip", m.notes, m.onTimePct == null ? null : pct(m.onTimePct, 0)), "", "shipped"),
      vit(T("vIn"), "low", eur(m.intakeVal), tf("sIn", m.intakeOrders, m.intakeCusts), "", "intake"),
      vit(T("vUnd"), undLvl, pct(m.undatedPct, 0), tf("sUnd", eur(m.undatedVal), m.undated.length), "", "undated")
    ].join("");
    $("#vitals").querySelectorAll("button.vital").forEach(btn => {
      btn.addEventListener("click", () => openDetailModal(btn.dataset.kind));
    });

    const outlook = computeOutlook(lines, rd, FILTER, hist);
    renderOutlook(outlook, rd);

    renderHorizon(m);
    renderShare(m);
    renderLate(m, rd);
    renderWatch(m, cmp, prev);
    $("#foot-file").textContent = `${DATA.fileName || "DOPK export"} · ${tf("linesRead", lines.length)}`;
    $("#app").hidden = false; $("#empty").hidden = true;
  }

  function renderOutlook(outlook, rd) {
    const el = $("#outlook");
    if (!el) return;

    const val30 = outlook.calibrated ? outlook.d30.expected : outlook.d30.plan;
    const catchUp30 = outlook.d30.catchUp;
    let subtitle = "";
    if (val30 <= 0 && catchUp30 <= 0) {
      subtitle = T("outlookSubtitleNone");
    } else {
      subtitle = tf("outlookSubtitle", eur(val30), eur(catchUp30), catchUp30 > 0);
    }

    function readoutCard(title, data) {
      const mainVal = outlook.calibrated ? data.expected : data.plan;
      const compareHTML = outlook.calibrated
        ? `<div class="outlook-compare">${tf("outlookCompare", eur(data.plan), eur(data.expected), pct(outlook.calibRate * 100, 0))}</div>`
        : "";
      return `<div class="outlook-card">` +
        `<div class="outlook-card-head"><span class="outlook-card-label">${title}</span></div>` +
        `<span class="outlook-card-value">${eur(mainVal)}</span>` +
        `<div class="outlook-card-sub">${eur(data.sched)} ${T("outlookSched")} · ${eur(data.catchUp)} ${T("outlookCatchUp")}</div>` +
        compareHTML +
        `</div>`;
    }

    const ml = outlook.monthLanding;
    const maxVal = Math.max(1, ml.landing, ml.target || 0);
    const shippedPct = Math.min(100, Math.max(0, (ml.shippedMonthToDate / maxVal) * 100));
    const expectedPct = Math.min(100 - shippedPct, Math.max(0, (ml.stillExpected / maxVal) * 100));
    const targetLineHTML = ml.target != null && ml.target > 0
      ? `<div class="outlook-target-line" style="left:${Math.min(100, (ml.target / maxVal) * 100)}%" title="${T("outlookTarget")}: ${eur(ml.target)}"></div>`
      : "";
    const targetChipHTML = ml.target != null && ml.target > 0 ? chipHTML(ml.targetLevel) : "";
    const targetSubHTML = ml.target != null && ml.target > 0
      ? `<div class="outlook-compare">${tf("outlookTargetInfo", eur(ml.target), pct(ml.targetPct, 0))}</div>`
      : "";

    const barAria = tf("outlookBarAria", ml.monthName, eur(ml.landing), eur(ml.shippedMonthToDate), eur(ml.stillExpected));

    const monthCard = `<div class="outlook-card outlook-card--month"${ml.target != null ? ` data-level="${ml.targetLevel}"` : ""}>` +
      `<div class="outlook-card-head"><span class="outlook-card-label">${tf("outlookMonthTitle", ml.monthName)}</span>${targetChipHTML}</div>` +
      `<span class="outlook-card-value">${eur(ml.landing)}</span>` +
      `<div class="outlook-card-sub">${eur(ml.shippedMonthToDate)} ${T("outlookShippedMtd")}${ml.partialMonth ? "*" : ""} · ${eur(ml.stillExpected)} ${T("outlookStillExpected")}</div>` +
      `<div class="outlook-bar-wrap" role="img" aria-label="${esc(barAria)}">` +
        `<div class="outlook-bar-segment outlook-bar--shipped" style="width:${shippedPct}%" title="${esc(T("outlookShippedMtd"))}: ${eur(ml.shippedMonthToDate)}"></div>` +
        `<div class="outlook-bar-segment outlook-bar--expected" style="width:${expectedPct}%" title="${esc(T("outlookStillExpected"))}: ${eur(ml.stillExpected)}"></div>` +
        targetLineHTML +
      `</div>` +
      targetSubHTML +
      `</div>`;

    const notes = [];
    if (outlook.undatedCount > 0) {
      notes.push(tf("outlookUndatedNote", eur(outlook.undatedVal), outlook.undatedCount));
    }
    if (outlook.calibrated) {
      notes.push(tf("outlookCalibratedNote", pct(outlook.calibRate * 100, 0), RULES.outlook.calibrationDays));
    } else if (outlook.calibReason === "filter") {
      notes.push(T("outlookFilterNote"));
    } else if (outlook.calibReason === "too_short") {
      notes.push(tf("outlookHistoryShortNote", RULES.outlook.minHistoryDays));
    }
    if (ml.partialMonth && ml.partialFromDate) {
      notes.push(tf("outlookPartialNote", fmtDate(ml.partialFromDate)));
    }
    if (outlook.mismatchCount > 0) {
      notes.push(tf("outlookMismatchNote", outlook.mismatchCount));
    }

    const notesHTML = notes.map(n => `<span class="outlook-note-item">${esc(n)}</span>`).join("");

    el.innerHTML = `<div class="panel-head">` +
      `<div>` +
        `<h2 id="outlook-title">${T("outlookTitle")}</h2>` +
        `<p class="panel-note" id="outlook-subtitle">${esc(subtitle)}</p>` +
      `</div>` +
      `</div>` +
      `<div class="outlook-grid">` +
        readoutCard(T("outlook7d"), outlook.d7) +
        readoutCard(T("outlook30d"), outlook.d30) +
        readoutCard(T("outlook90d"), outlook.d90) +
        monthCard +
      `</div>` +
      `<div class="outlook-notes">` +
        notesHTML +
      `</div>`;
  }

  function renderHorizon(m) {
    const cols = [{ label: T("colLate"), full: T("colLateFull"), val: m.lateVal, n: m.late.length, kind: "late" },
      ...m.months.map(x => ({ label: monthName(x.m, x.y, x.yearTag ? "short" : false), full: monthName(x.m, x.y, true), val: x.val, n: x.n, kind: "flow" })),
      { label: T("colUnd"), full: T("colUndFull"), val: m.undatedVal, n: m.undated.length, kind: "undated" }];
    const W = 820, H = 280, top = 26, bottom = 34, gap = 6;
    const cw = (W - gap * (cols.length + 1)) / cols.length;
    const max = Math.max(1, ...cols.map(c => c.val));
    const y = v => top + (H - top - bottom) * (1 - v / max);
    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(T("chartLabel"))}"><defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="var(--alarm-med-tint)"/><line x1="0" y1="0" x2="0" y2="6" stroke="var(--alarm-med)" stroke-width="3"/></pattern></defs>`;
    [0.5, 1].forEach(f => { svg += `<line x1="0" x2="${W}" y1="${y(max * f)}" y2="${y(max * f)}" stroke="var(--rule-soft)"/>`; });
    if (m.avg6) svg += `<line x1="${gap + cw + gap}" x2="${W - cw - gap * 2}" y1="${y(m.avg6)}" y2="${y(m.avg6)}" stroke="var(--ink-muted)" stroke-dasharray="3 4"/><text x="${W - cw - gap * 2}" y="${y(m.avg6) - 6}" text-anchor="end" font-size="11" fill="var(--ink-muted)">${esc(tf("avg6", eur(m.avg6)))}</text>`;
    cols.forEach((c, i) => {
      const x = gap + i * (cw + gap), yy = y(c.val), fill = c.kind === "late" ? COLORS.late : c.kind === "undated" ? "url(#hatch)" : COLORS.flow;
      const dim = c.kind === "flow" && m.dropIdx >= 0 && i - 1 >= m.dropIdx;
      svg += `<g class="col" tabindex="0"><title>${esc(tf("tip", c.full, eurFull(c.val), c.n))}</title>`;
      svg += `<rect class="bar-fill" x="${x}" y="${yy}" width="${cw}" height="${Math.max(0, H - bottom - yy)}" fill="${fill}" opacity="${dim ? 0.45 : 1}"/>`;
      if (c.val > 0) svg += `<text x="${x + cw / 2}" y="${yy - 6}" text-anchor="middle" font-size="12" font-weight="700" fill="var(--ink)">${esc(eurShort(c.val))}</text>`;
      svg += `<text x="${x + cw / 2}" y="${H - bottom + 18}" text-anchor="middle" font-size="12" fill="${c.kind === "late" ? "#9E1F2D" : "var(--ink-muted)"}" font-weight="${c.kind === "flow" ? 400 : 700}">${esc(c.label)}</text></g>`;
      if (i === 0) svg += `<line x1="${x + cw + gap / 2}" x2="${x + cw + gap / 2}" y1="${top - 10}" y2="${H - bottom + 4}" stroke="var(--graphite)" stroke-width="1.5"/><text x="${x + cw + gap / 2 + 4}" y="${top - 12}" font-size="11" font-weight="700" fill="var(--ink)">${T("today")}</text>`;
    });
    svg += `<line x1="0" x2="${W}" y1="${H - bottom}" y2="${H - bottom}" stroke="var(--graphite)"/></svg>`;
    $("#horizon").innerHTML = svg;
    const drop = m.dropIdx >= 0 ? m.months[m.dropIdx] : null;
    $("#horizon-note").textContent = drop ? tf("dropNote", monthName(drop.m, drop.y, true)) : T("noDropNote");
  }

  function renderShare(m) {
    const top = m.custs.slice(0, 3), rest = m.custs.slice(3);
    const seg = top.map((c, i) => ({ name: c.name, short: c.short, val: c.val, color: SHARE_COLORS[i] }));
    if (rest.length) seg.push({ name: tf("others", rest.length), short: tf("others", rest.length), val: sum(rest, c => c.val), color: SHARE_COLORS[3] });
    const Tot = m.openVal || 1;
    $("#share-bar").innerHTML = seg.map(s => `<div style="width:${s.val / Tot * 100}%;background:${s.color}" title="${esc(s.name)}: ${pct(s.val / Tot * 100)}"></div>`).join("");
    $("#share-list").innerHTML = seg.map(s => `<li><i style="background:${s.color}"></i><span class="name" title="${esc(s.name)}">${esc(s.short)}</span><span class="pct">${pct(s.val / Tot * 100)}</span><span class="eur">${eur(s.val)}</span></li>`).join("");
    const lvl = m.hhi > 2500 ? "high" : m.hhi > 1500 ? "med" : "clear";
    const txt = m.hhi > 2500 ? T("hhiHigh") : m.hhi > 1500 ? T("hhiMed") : T("hhiLow");
    $("#share-stats").innerHTML = `<div><b>${m.custs.length}</b>${T("custsWith")}</div><div><b>${nf(Math.round(m.hhi))}</b>${T("hhi")} <span class="chip chip--${lvl}">${txt}</span></div>`;
  }

  function renderLate(m, rd) {
    const rows = [...m.late].sort((a, b) => b.val - a.val).slice(0, 10);
    $("#late-count").textContent = m.late.length ? tf("lateCount", m.late.length, uniq(m.late, l => l.order)) : T("noLate");
    $("#late-body").innerHTML = rows.length ? rows.map(l => `<tr><td>${l.order}</td><td class="clip" title="${esc(l.cust)}">${esc(l.short)}</td><td class="clip" title="${esc(l.desc)}">${esc(l.desc)}</td><td class="num">${fmtDate(l.due)}</td><td class="num late">${tf("days", Math.round((rd - l.due) / DAY))}</td><td class="num">${eurFull(l.val)}</td></tr>`).join("")
      : `<tr><td colspan="6">${T("allOnPlan")}</td></tr>`;
    $("#export-late").disabled = !m.late.length;
  }

  function renderWatch(m, cmp, prev) {
    const items = [];
    if (cmp) items.push({ lvl: cmp.pushed ? "med" : "clear", t: tf("wSince", fmtDate(new Date(prev.date + "T00:00:00"))), b: tf("wSinceBody", cmp.completed, eur(cmp.completedVal), cmp.pushed, eur(cmp.pushedVal)) });
    else items.push({ lvl: "low", t: T("wTrack"), b: T("wTrackBody") });
    if (m.shippedLate.length) items.push({ lvl: "high", t: tf("wShipLate", m.shippedLate.length), b: tf("wShipLateBody", eur(sum(m.shippedLate, l => l.val))) });
    if (m.closeOut.length) items.push({ lvl: "low", t: tf("wClose", m.closeOut.length, RULES.closeOutQuote), b: tf("wCloseBody", eur(m.closeOutVal)) });
    if (m.priceFlags.length) {
      const w = [...m.priceFlags].sort((a, b) => a.r - b.r)[0];
      items.push({ lvl: "med", t: tf("wPrice", m.priceFlags.length), b: tf("wPriceBody", w.l.art, w.l.short, eurUnit(w.l.unit), eurUnit(w.med)) });
    }
    if (m.zeroPrice.length) items.push({ lvl: "high", t: tf("wZero", m.zeroPrice.length), b: m.zeroPrice.slice(0, 2).map(l => `${l.order} ${l.short}, ${l.desc}`).join("; ") + "." });
    if (m.mismatch.length) items.push({ lvl: "med", t: tf("wMis", m.mismatch.length), b: tf("wMisBody", [...new Set(m.mismatch.map(l => l.order))].slice(0, 6).join(", ")) });
    $("#watch").innerHTML = items.map(i => `<li><div class="w-head"><span class="w-title">${esc(i.t)}</span>${chipHTML(i.lvl)}</div><div class="w-body">${esc(i.b)}</div></li>`).join("");
  }

  function fillFilter(keep) {
    const custs = {};
    DATA.lines.filter(l => !l.shipped).forEach(l => custs[l.cust] = (custs[l.cust] || 0) + l.val);
    const sorted = Object.entries(custs).sort((a, b) => b[1] - a[1]);
    const sel = $("#filter");
    sel.innerHTML = `<option value="__all">${esc(T("allCustomers"))}</option>` + (sorted.length > 1 ? `<option value="__xtop">${esc(tf("allExcept", shortName(sorted[0][0])))}</option>` : "") +
      sorted.map(([c]) => `<option value="${esc(c)}">${esc(shortName(c))}</option>`).join("");
    if (!keep) FILTER = "__all";
    sel.value = FILTER;
  }

  function setLang(l) {
    if (!I18N[l] || l === LANG) return;
    LANG = l;
    try { localStorage.setItem(LS_LANG, l); } catch (e) {}
    if (DATA) { fillFilter(true); render(); updateOpenModal(); } else applyStatic();
    const err = $("#error"); if (!err.hidden) err.hidden = true;
  }

  // -------------------------------------------------------- detail modal
  let MODAL_STATE = {
    open: false,
    kind: "open",
    lines: [],
    sortKey: "val",
    sortDir: "desc",
    query: ""
  };

  function getModalData(kind) {
    if (!DATA) return null;
    const m = compute(DATA.lines, DATA.reportDate, FILTER);
    const scope = FILTER === "__all" ? "" : FILTER === "__xtop" ? tf("scopeX", shortName(m.topCust)) : tf("scopeOne", shortName(FILTER));
    const scopeSuffix = scope ? ` (${scope.trim()})` : "";
    const map = {
      open: {
        lines: m.open,
        title: T("vOpen"),
        sub: tf("modalSubOpen", m.open.length, uniq(m.open, l => l.order), eurFull(m.openVal)) + scopeSuffix,
        defaultSort: "val",
        defaultDir: "desc"
      },
      late: {
        lines: m.late,
        title: T("vLate"),
        sub: tf("modalSubLate", m.late.length, uniq(m.late, l => l.order), eurFull(m.lateVal)) + scopeSuffix,
        defaultSort: "late",
        defaultDir: "desc"
      },
      shipped: {
        lines: m.shipped,
        title: T("vShip"),
        sub: tf("modalSubShip", m.shipped.length, uniq(m.shipped, l => l.status), eurFull(m.shippedVal)) + scopeSuffix,
        defaultSort: "val",
        defaultDir: "desc"
      },
      intake: {
        lines: m.intake,
        title: T("vIn"),
        sub: tf("modalSubIn", m.intake.length, uniq(m.intake, l => l.order), eurFull(m.intakeVal)) + scopeSuffix,
        defaultSort: "val",
        defaultDir: "desc"
      },
      undated: {
        lines: m.undated,
        title: T("vUnd"),
        sub: tf("modalSubUnd", m.undated.length, uniq(m.undated, l => l.order), eurFull(m.undatedVal)) + scopeSuffix,
        defaultSort: "val",
        defaultDir: "desc"
      }
    };
    return map[kind] || map.open;
  }

  function openDetailModal(kind) {
    const data = getModalData(kind);
    if (!data) return;
    MODAL_STATE.open = true;
    MODAL_STATE.kind = kind;
    MODAL_STATE.lines = data.lines;
    MODAL_STATE.sortKey = data.defaultSort;
    MODAL_STATE.sortDir = data.defaultDir;
    MODAL_STATE.query = "";

    $("#modal-title").textContent = data.title;
    $("#modal-subtitle").textContent = data.sub;
    const searchInput = $("#modal-search");
    if (searchInput) searchInput.value = "";

    renderModalTable();

    const dlg = $("#detail-modal");
    if (dlg && typeof dlg.showModal === "function") {
      try { dlg.showModal(); } catch (e) {}
      if (searchInput) setTimeout(() => searchInput.focus(), 50);
    }
  }

  function updateOpenModal() {
    if (!MODAL_STATE.open) return;
    const data = getModalData(MODAL_STATE.kind);
    if (!data) return;
    MODAL_STATE.lines = data.lines;
    $("#modal-title").textContent = data.title;
    $("#modal-subtitle").textContent = data.sub;
    renderModalTable();
  }

  function getFilteredSortedModalLines() {
    const q = (MODAL_STATE.query || "").trim().toLowerCase();
    const rd = DATA ? DATA.reportDate : new Date();
    let list = MODAL_STATE.lines || [];

    if (q) {
      list = list.filter(l => {
        const orderStr = String(l.order || "");
        const custStr = (l.cust || "").toLowerCase();
        const shortStr = (l.short || "").toLowerCase();
        const artStr = (l.art || "").toLowerCase();
        const descStr = (l.desc || "").toLowerCase();
        const statusStr = (l.status || "").toLowerCase();
        const dateStr = fmtDate(l.date).toLowerCase();
        const dueStr = fmtDate(l.due).toLowerCase();
        return orderStr.includes(q) || custStr.includes(q) || shortStr.includes(q) ||
               artStr.includes(q) || descStr.includes(q) || statusStr.includes(q) ||
               dateStr.includes(q) || dueStr.includes(q);
      });
    }

    const { sortKey, sortDir } = MODAL_STATE;
    const sign = sortDir === "asc" ? 1 : -1;

    return [...list].sort((a, b) => {
      let va, vb;
      switch (sortKey) {
        case "order": va = a.order; vb = b.order; break;
        case "date": va = a.date ? +a.date : 0; vb = b.date ? +b.date : 0; break;
        case "cust": return sign * (a.short || a.cust || "").localeCompare(b.short || b.cust || "", LOC());
        case "art": return sign * (a.art || "").localeCompare(b.art || "", LOC());
        case "desc": return sign * (a.desc || "").localeCompare(b.desc || "", LOC());
        case "qty": va = a.qty; vb = b.qty; break;
        case "rest": va = a.rest; vb = b.rest; break;
        case "price": va = a.unit; vb = b.unit; break;
        case "val":
          va = MODAL_STATE.kind === "intake" ? a.orig : a.val;
          vb = MODAL_STATE.kind === "intake" ? b.orig : b.val;
          break;
        case "due":
          va = a.due ? +a.due : (sortDir === "asc" ? Infinity : -Infinity);
          vb = b.due ? +b.due : (sortDir === "asc" ? Infinity : -Infinity);
          break;
        case "late":
          va = a.due && a.due < rd ? Math.round((rd - a.due) / DAY) : -1;
          vb = b.due && b.due < rd ? Math.round((rd - b.due) / DAY) : -1;
          break;
        case "status": return sign * (a.status || "").localeCompare(b.status || "", LOC());
        default:
          va = a.val; vb = b.val;
      }
      return va === vb ? 0 : (va > vb ? sign : -sign);
    });
  }

  function renderModalTable() {
    const list = getFilteredSortedModalLines();
    const rd = DATA ? DATA.reportDate : new Date();
    const total = (MODAL_STATE.lines || []).length;
    const q = (MODAL_STATE.query || "").trim();

    const countEl = $("#modal-filter-count");
    if (countEl) {
      countEl.textContent = q ? tf("filterCount", list.length, total) : tf("totalCount", total);
    }

    document.querySelectorAll(".data--modal th[data-sort]").forEach(th => {
      if (th.dataset.sort === MODAL_STATE.sortKey) {
        th.setAttribute("data-sorted", MODAL_STATE.sortDir);
        th.setAttribute("aria-sort", MODAL_STATE.sortDir === "asc" ? "ascending" : "descending");
      } else {
        th.removeAttribute("data-sorted");
        th.removeAttribute("aria-sort");
      }
    });

    const tbody = $("#modal-table-body");
    if (!tbody) return;

    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="12" class="dialog-empty">${T("noMatches")}</td></tr>`;
      return;
    }

    tbody.innerHTML = list.map(l => {
      const isLate = l.due && l.due < rd;
      const daysLate = isLate ? Math.round((rd - l.due) / DAY) : 0;
      const lateHTML = isLate
        ? `<span class="late">${tf("days", daysLate)}</span>`
        : `<span style="color:var(--ink-faint)">–</span>`;
      const val = MODAL_STATE.kind === "intake" ? l.orig : l.val;
      const chipClass = l.shipped ? "chip--clear" : isLate ? "chip--high" : "chip--low";
      const statusBadge = l.status
        ? `<span class="chip ${chipClass}">${esc(l.status)}</span>`
        : `<span style="color:var(--ink-faint)">–</span>`;

      return `<tr>` +
        `<td>${l.order}</td>` +
        `<td>${fmtDate(l.date)}</td>` +
        `<td class="clip" title="${esc(l.cust)}">${esc(l.short)}</td>` +
        `<td><code>${esc(l.art)}</code></td>` +
        `<td class="clip" title="${esc(l.desc)}">${esc(l.desc)}</td>` +
        `<td class="num">${nf(l.qty)}</td>` +
        `<td class="num">${nf(l.rest)}</td>` +
        `<td class="num">${eurUnit(l.unit)}</td>` +
        `<td class="num" style="font-weight:var(--fw-bold)">${eurFull(val)}</td>` +
        `<td class="num">${fmtDate(l.due)}</td>` +
        `<td class="num">${lateHTML}</td>` +
        `<td>${statusBadge}</td>` +
        `</tr>`;
    }).join("");
  }

  function exportModalCsv() {
    if (!DATA || !MODAL_STATE.lines.length) return;
    const rd = DATA.reportDate;
    const de = LANG === "de";
    const n2 = v => de ? (v != null ? Number(v).toFixed(2).replace(".", ",") : "") : (v != null ? Number(v).toFixed(2) : "");
    const nInt = v => de ? (v != null ? String(v).replace(".", ",") : "") : (v != null ? String(v) : "");

    const list = getFilteredSortedModalLines();
    const rows = list.map(l => {
      const isLate = l.due && l.due < rd;
      const daysLate = isLate ? Math.round((rd - l.due) / DAY) : 0;
      const val = MODAL_STATE.kind === "intake" ? l.orig : l.val;
      return [
        l.order,
        fmtDate(l.date),
        l.cust,
        l.art,
        l.desc,
        nInt(l.qty),
        nInt(l.rest),
        n2(l.unit),
        n2(val),
        fmtDate(l.due),
        daysLate ? daysLate : "",
        l.status || ""
      ];
    });

    const csv = "\ufeff" + [T("csvModalHead"), ...rows].map(r => r.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const prefixes = T("csvFilePrefixes") || {};
    const namePrefix = prefixes[MODAL_STATE.kind] || "detail";
    a.download = `${namePrefix}_${iso(rd)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
  }

  function exportLate() {
    const m = compute(DATA.lines, DATA.reportDate, FILTER);
    const de = LANG === "de";
    const n2 = v => de ? v.toFixed(2).replace(".", ",") : v.toFixed(2);
    const rows = [...m.late].sort((a, b) => b.val - a.val).map(l => [l.order, l.cust, l.art, l.desc, de ? String(l.rest).replace(".", ",") : l.rest, fmtDate(l.due), Math.round((DATA.reportDate - l.due) / DAY), n2(l.val)]);
    const csv = "\ufeff" + [T("csvHead"), ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `${T("csvName")}_${iso(DATA.reportDate)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
  }

  // ------------------------------------------------------------- loading
  function showError(msg) { const n = $("#error"); n.textContent = msg; n.hidden = false; }
  function loadAoa(aoa, fileName, remember) {
    try {
      DATA = parseRows(aoa, fileName);
      $("#error").hidden = true;
      recordHistory(DATA, compute(DATA.lines, DATA.reportDate, "__all"));
      if (remember) store.set(LS_LAST, { aoa, fileName });
      fillFilter(); render();
    } catch (e) { showError(e.message); $("#empty").hidden = false; $("#app").hidden = true; }
  }
  function fileToAoa(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = e => {
        try {
          const wb = XLSX.read(new Uint8Array(e.target.result), { type: "array" });
          resolve(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null }));
        } catch (err) { reject(new Error(T("errRead"))); }
      };
      r.onerror = () => reject(new Error(T("errRead")));
      r.readAsArrayBuffer(file);
    });
  }
  function showNotice(msg, kind) {
    const n = $("#notice");
    n.querySelector("span").textContent = msg;
    n.dataset.kind = kind || "info";
    n.hidden = !msg;
  }
  // One file: today's upload. Several files: archive import, oldest first, newest becomes current.
  async function readFiles(fileList) {
    const files = [...(fileList || [])].filter(f => /\.(xlsx|xls|csv)$/i.test(f.name));
    if (!files.length) return;
    if (files.length === 1) {
      try { loadAoa(await fileToAoa(files[0]), files[0].name, true); } catch (e) { showError(e.message); }
      return;
    }
    const ok = [], skipped = [];
    for (let i = 0; i < files.length; i++) {
      showNotice(tf("importBusy", i + 1, files.length), "info");
      try {
        const aoa = await fileToAoa(files[i]);
        const data = parseRows(aoa, files[i].name);
        ok.push({ aoa, data, name: files[i].name, mod: files[i].lastModified });
      } catch (e) { skipped.push(`${files[i].name} (${e.message})`); }
    }
    // one snapshot per report date; newest file wins
    const byDate = {};
    ok.forEach(f => { const k = iso(f.data.reportDate); if (byDate[k]) { skipped.push(`${(byDate[k].mod > f.mod ? f : byDate[k]).name} (${T("dupDate")})`); if (byDate[k].mod > f.mod) return; } byDate[k] = f; });
    const snaps = Object.keys(byDate).sort().map(k => byDate[k]);
    if (!snaps.length) { showNotice("", ""); showError(skipped.join(" ")); return; }
    snaps.forEach(f => recordHistory(f.data, compute(f.data.lines, f.data.reportDate, "__all")));
    const latest = snaps[snaps.length - 1];
    DATA = latest.data; $("#error").hidden = true;
    store.set(LS_LAST, { aoa: latest.aoa, fileName: latest.name });
    fillFilter(); render();
    showNotice(tf("importDone", snaps.length, fmtDate(snaps[0].data.reportDate), fmtDate(latest.data.reportDate)) + (skipped.length ? tf("importSkipped", skipped.join("; ")) : ""), skipped.length ? "warn" : "ok");
  }

  function init() {
    applyStatic();
    document.querySelectorAll(".lang-switch button").forEach(b => b.addEventListener("click", () => setLang(b.dataset.lang)));
    const input = $("#file");
    document.querySelectorAll("[data-upload]").forEach(b => b.addEventListener("click", () => input.click()));
    input.addEventListener("change", e => { readFiles(e.target.files); input.value = ""; });
    const archive = $("#archive");
    document.querySelectorAll("[data-archive]").forEach(b => b.addEventListener("click", () => archive.click()));
    archive.addEventListener("change", e => { readFiles(e.target.files); archive.value = ""; });
    $("#notice button").addEventListener("click", () => showNotice("", ""));
    $("#filter").addEventListener("change", e => { FILTER = e.target.value; render(); updateOpenModal(); });
    $("#export-late").addEventListener("click", exportLate);

    // Detail modal listeners
    const modal = $("#detail-modal");
    if (modal) {
      const closeBtn = $("#modal-close");
      if (closeBtn) closeBtn.addEventListener("click", () => modal.close());
      modal.addEventListener("close", () => { MODAL_STATE.open = false; });
      modal.addEventListener("click", e => {
        const rect = modal.getBoundingClientRect();
        const inDialog = (
          rect.top <= e.clientY && e.clientY <= rect.top + rect.height &&
          rect.left <= e.clientX && e.clientX <= rect.left + rect.width
        );
        if (!inDialog) modal.close();
      });
      const searchInput = $("#modal-search");
      if (searchInput) {
        searchInput.addEventListener("input", e => {
          MODAL_STATE.query = e.target.value;
          renderModalTable();
        });
      }
      const exportBtn = $("#modal-export");
      if (exportBtn) exportBtn.addEventListener("click", exportModalCsv);
      document.querySelectorAll(".data--modal th[data-sort]").forEach(th => {
        th.addEventListener("click", () => {
          const key = th.dataset.sort;
          if (MODAL_STATE.sortKey === key) {
            MODAL_STATE.sortDir = MODAL_STATE.sortDir === "asc" ? "desc" : "asc";
          } else {
            MODAL_STATE.sortKey = key;
            MODAL_STATE.sortDir = (key === "order" || key === "art" || key === "cust" || key === "desc" || key === "status") ? "asc" : "desc";
          }
          renderModalTable();
        });
      });
    }

    $("#print").addEventListener("click", () => window.print());
    $("#clear").addEventListener("click", () => { try { localStorage.removeItem(LS_HISTORY); localStorage.removeItem(LS_LAST); } catch (e) {} location.reload(); });
    let depth = 0;
    const dz = $("#empty");
    document.addEventListener("dragenter", e => { e.preventDefault(); depth++; dz.classList.add("is-over"); });
    document.addEventListener("dragleave", () => { if (--depth <= 0) { depth = 0; dz.classList.remove("is-over"); } });
    document.addEventListener("dragover", e => e.preventDefault());
    document.addEventListener("drop", e => { e.preventDefault(); depth = 0; dz.classList.remove("is-over"); readFiles(e.dataTransfer.files); });

    if (window.DOPK_PRELOAD) {
      const wb = XLSX.read(window.DOPK_PRELOAD.base64, { type: "base64" });
      loadAoa(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null }), window.DOPK_PRELOAD.fileName, false);
      return;
    }
    const last = store.get(LS_LAST, null);
    if (last) loadAoa(last.aoa, last.fileName, false);
  }
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", init) : init();
})();
