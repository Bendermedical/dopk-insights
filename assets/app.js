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
    historyDays: 90                        // snapshots kept in this browser
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
      csvHead: ["Auftrag", "Kunde", "Artikel", "Bezeichnung", "Restmenge", "Liefertermin", "Tage Verzug", "Offener Wert EUR"], csvName: "ueberfaellig",
      errHeader: "Diese Datei hat keine Kopfzeile mit „Auftrag“ und „Restmenge“. Bitte den DOPK-Export offener Aufträge hochladen.",
      errCol: c => `Die Spalte „${c}“ fehlt.`, errNoLines: "Die Kopfzeile wurde gefunden, aber es folgen keine Auftragspositionen.",
      errRead: "Diese Datei konnte nicht als Tabelle gelesen werden. Bitte den .xlsx-Export aus dem ERP hochladen.",
      importArchive: "Archiv importieren", dismiss: "Schließen",
      importDone: (n, a, b) => `${pl(n, "Tagesdatei", "Tagesdateien")} importiert (${a} bis ${b}). Der Verlauf ist jetzt in diesem Browser verfügbar.`,
      importSkipped: list => ` Übersprungen: ${list}.`, importBusy: (i, n) => `Datei ${i} von ${n} wird gelesen …`,
      dupDate: "gleiches Datum wie eine andere Datei, neuere Datei verwendet"
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
      csvHead: ["Order", "Customer", "Article", "Description", "Remaining qty", "Due date", "Days late", "Open value EUR"], csvName: "overdue",
      errHeader: "This file has no header row with “Auftrag” and “Restmenge”. Upload the DOPK open-order export.",
      errCol: c => `Column “${c}” is missing.`, errNoLines: "The header row was found, but no order lines follow it.",
      errRead: "This file couldn't be read as a spreadsheet. Upload the .xlsx export from the ERP.",
      importArchive: "Import archive", dismiss: "Close",
      importDone: (n, a, b) => `${pl(n, "daily file", "daily files")} imported (${a} to ${b}). The history is now available in this browser.`,
      importSkipped: list => ` Skipped: ${list}.`, importBusy: (i, n) => `Reading file ${i} of ${n} …`,
      dupDate: "same date as another file, newer file used"
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
      intakeVal: sum(intake, l => l.orig), intakeOrders: uniq(intake, l => l.order), intakeCusts: uniq(intake, l => l.cust),
      priceFlags, zeroPrice, mismatch, closeOut, closeOutVal
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
    const vit = (lbl, lvl, value, sub, extra = "") => `<div class="vital" data-level="${lvl}"><div class="vital-head"><span class="vital-label">${lbl}</span>${chipHTML(lvl)}</div><span class="vital-value">${value}</span><div class="vital-sub">${sub}</div>${extra}</div>`;
    $("#vitals").innerHTML = [
      vit(T("vOpen"), "low", eur(m.openVal), `${tf("sOpen", m.openLines, m.openOrders)} ${deltaHTML(m.openVal, P?.openVal, false)}`, unfiltered ? spark(hist, "openVal") : ""),
      vit(T("vLate"), lateLvl, eur(m.lateVal), `${tf("sLate", pct(m.latePct), m.late.length)} ${deltaHTML(m.lateVal, P?.lateVal, true)}`),
      vit(T("vShip"), otLvl, eur(m.shippedVal), tf("sShip", m.notes, m.onTimePct == null ? null : pct(m.onTimePct, 0))),
      vit(T("vIn"), "low", eur(m.intakeVal), tf("sIn", m.intakeOrders, m.intakeCusts)),
      vit(T("vUnd"), undLvl, pct(m.undatedPct, 0), tf("sUnd", eur(m.undatedVal), m.undated.length))
    ].join("");

    renderHorizon(m);
    renderShare(m);
    renderLate(m, rd);
    renderWatch(m, cmp, prev);
    $("#foot-file").textContent = `${DATA.fileName || "DOPK export"} · ${tf("linesRead", lines.length)}`;
    $("#app").hidden = false; $("#empty").hidden = true;
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
    if (DATA) { fillFilter(true); render(); } else applyStatic();
    const err = $("#error"); if (!err.hidden) err.hidden = true;
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
    $("#filter").addEventListener("change", e => { FILTER = e.target.value; render(); });
    $("#export-late").addEventListener("click", exportLate);
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
