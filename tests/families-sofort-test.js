/* Product families, Sofortbedarf, overdue by month, changes sheet and saved views (tests 1 to 25).
   Fixtures enter through the normal loading path (DOPK_TEST.load) and once through archive import;
   the mapping fixture enters through loadFamiliesFile, the same function the footer file picker uses.
   The page reloads itself twice to check persistence; progress is kept in sessionStorage. */
document.addEventListener("DOMContentLoaded", async function () {
  "use strict";
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const api = window.DOPK_TEST;
  const RESUME = "dopk.fs.resume";
  const saved = JSON.parse(sessionStorage.getItem(RESUME) || "null");
  const results = saved?.results || [];
  window.DOPK_TEST_RESULTS = results;

  const assert = (c, msg) => { if (!c) throw new Error(msg); };
  const near = (a, b, eps = 0.01) => Math.abs(a - b) < eps;
  const text = s => ($(s)?.textContent || "").replace(/\s+/g, " ").trim();
  const click = el => { assert(el, "Missing click target"); el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })); };
  const key = (el, k) => { assert(el, "Missing key target"); el.focus(); el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true })); };
  const paint = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const byValue = (sel, v) => $$(sel).find(el => el.dataset.value === v);
  function show() {
    $("#test-results").replaceChildren(...results.map(r => {
      const li = document.createElement("li");
      li.textContent = `${r.pass ? "PASS" : "FAIL"} ${r.id}: ${r.title}${r.detail ? " — " + r.detail : ""}`;
      return li;
    }));
  }
  async function test(id, title, fn) {
    try { await fn(); results.push({ id, title, pass: true }); }
    catch (e) { console.error(`Test ${id} failed:`, e); results.push({ id, title, pass: false, detail: e.message }); }
    show();
  }
  const reloadInto = (phase, hash = "") => { sessionStorage.setItem(RESUME, JSON.stringify({ phase, results })); location.hash = hash; location.reload(); };
  const chooseView = async value => { const sel = $("#view-select"); sel.value = value; sel.dispatchEvent(new Event("change", { bubbles: true })); await paint(); };
  const noPageOverflow = where => assert(document.documentElement.scrollWidth <= innerWidth + 1, `Page scrolls horizontally (${where}): ${document.documentElement.scrollWidth} > ${innerWidth}`);
  const reset = () => api.applyView({ customer: null, period: null, order: null, sc: null, btb: false, family: null, model: null, size: null, variant: null, lateMonth: null, chg: false });
  const loadMapping = async () => { await api.loadFamiliesFile(new File([window.DOPK_FAMILIES_CSV], "families-fixture.csv", { type: "text/csv" })); await paint(); };
  const loadDay = async (rows, name) => { api.load(rows, name); await paint(); };
  const historyBack = () => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Back navigation timed out")), 2000);
    window.addEventListener("popstate", () => { clearTimeout(timer); requestAnimationFrame(() => requestAnimationFrame(resolve)); }, { once: true });
    history.back();
  });
  const crumbs = () => $$("#breadcrumb .crumb").map(c => c.firstChild.textContent);
  const bodyRows = () => [...$("#late-body").rows].map(r => [...r.cells].map(c => c.textContent.trim()));

  api.RULES.keyAccount.accounts = [{ id: "10001", label: "Alpha" }];
  const phase = saved?.phase || "start";
  show();

  if (phase === "start") {
    Object.keys(sessionStorage).filter(k => k.startsWith("dopk.test.")).forEach(k => sessionStorage.removeItem(k));
    api.setLang("de"); api.clearHistory(); await loadDay(window.DOPK_FIXTURE, "DOPK_09_09.xlsx");

    await test(1, "Mapping banner: 12 articles, 7 families", async () => {
      await loadMapping();
      const banner = text("#notice span");
      assert(!$("#notice").hidden && banner.includes("12 Artikel aus families-fixture.csv geladen") && banner.includes("7 Familien"), `Banner: ${banner}`);
      assert(!banner.includes("übersprungen"), "No skipped rows");
      assert(text("#foot-families").includes("Zuordnung: families-fixture.csv · 12 Artikel"), "Footer status line");
      assert(api.data.lines.find(l => l.art === "A100").family === "Laryvox" && api.data.lines.find(l => l.art === "E101").family === "__other", "Lines assigned once on load");
    });

    await test(2, "Families tab: values, quantities, overdue, total €12,597.50, no Sonstige, no warning", async () => {
      api.setLang("en"); reset();
      click(byValue('#share-tabs [data-action="share-tab"]', "fam")); await paint();
      assert(!$("#share-fam").hidden && $("#share-cust").hidden && text("#share-title") === "Where the backlog sits", "Families tab active");
      const rows = $$("#fam-list li");
      const got = rows.map(li => [li.dataset.value, li.querySelector(".eur").textContent, li.querySelector(".qty").textContent, li.querySelector(".fam-late").textContent]);
      const want = [["Laryvox", "€6,100", "260 pcs", "25% overdue"], ["Duracuff Pro", "€3,000", "50 pcs", "67% overdue"], ["BMV Cuff", "€1,500", "1.5 pcs", "–"],
        ["Humidotrach", "€1,000", "500 pcs", "–"], ["BMV Kompressen", "€998", "300 pcs", "–"], ["BMV Sonstiges", "€0", "5 pcs", "–"]];
      assert(JSON.stringify(got) === JSON.stringify(want), `Rows ${JSON.stringify(got)}`);
      assert(near(api.metrics.openVal, 12597.5), "Total €12,597.50");
      assert(rows[3].querySelector(".seg-imm").style.width !== "0%", "Humidotrach bar is Sofortbedarf (hatched)");
      assert(rows[0].querySelector(".seg-late").style.width !== "0%" && rows[0].querySelector(".seg-flow").style.width !== "0%", "Laryvox bar overdue + scheduled");
      assert(!$("#fam-list li[data-value='__other']") && !$("#share-fam .fam-warn"), "No Sonstige row, no unassigned warning");
      assert(text("#share-fam .fam-qty-note") === "Quantities in order units", "Quantity note");
      assert(JSON.parse(sessionStorage.getItem("dopk.test.dopk.sharetab.v1")) === "fam", "Tab choice stored in dopk.sharetab.v1");
      api.setLang("de");
      assert(text("#share-title") === "Wo der Bestand liegt" && $("#fam-list li .qty").textContent === "260 Stk", "German tab and quantity");
      assert(text("#share-fam .fam-qty-note") === "Mengen in Auftragseinheiten", "German quantity note");
    });

    await test(3, "Drill-down Laryvox → A1-XX → Gr. 01 → line 1001/A100, breadcrumb and Back", async () => {
      reset(); await paint();
      click(byValue("#fam-list li", "Laryvox")); await paint();
      assert(api.view.family === "Laryvox" && location.hash.includes("f=Laryvox"), "VIEW.family and hash f=");
      assert(text("#late-title") === "Modelle in Laryvox", `Title ${text("#late-title")}`);
      let rows = bodyRows();
      assert(rows.length === 2 && rows[0][0] === "A1-XX" && rows[0][2] === "5.500 €" && rows[0][3] === "250 Stk" && rows[1][0] === "F1-XX" && rows[1][2] === "600 €" && rows[1][3] === "10 Stk", `Models ${JSON.stringify(rows)}`);
      assert(rows[0][1] === "LARYVOX Tape", `Model description from the mapping: ${rows[0][1]}`);
      assert(byValue("#fam-list li", "Laryvox").getAttribute("aria-pressed") === "true" && $$("#fam-list li").length === 6, "Families tab ignores the family filter");
      key(byValue('#late-body [data-action="model"]', "A1-XX"), "Enter"); await paint();
      assert(api.view.model === "A1-XX" && location.hash.includes("m=A1-XX"), "VIEW.model and hash m=");
      rows = bodyRows();
      assert(rows.length === 2 && rows[0][0] === "Gr. 01" && rows[0][1] === "1.500 €" && rows[0][2] === "50 Stk" && rows[0][3] === "50 Stk" && rows[1][0] === "Gr. 02" && rows[1][1] === "4.000 €" && rows[1][2] === "200 Stk" && rows[1][3] === "0 Stk", `Sizes ${JSON.stringify(rows)}`);
      assert(document.activeElement === byValue('#late-body [data-action="size"]', "01"), "Keyboard focus continues in the size rows");
      key(byValue('#late-body [data-action="size"]', "01"), " "); await paint();
      assert(api.view.size === "01" && location.hash.includes("s=01"), "VIEW.size and hash s=");
      rows = bodyRows();
      assert(rows.length === 1 && rows[0][0] === "1001" && rows[0][2] === "A100", `Lines ${JSON.stringify(rows)}`);
      assert(JSON.stringify(crumbs()) === JSON.stringify(["Laryvox", "A1-XX", "Gr. 01"]), `Breadcrumb ${crumbs()}`);
      assert(near(api.metrics.openVal, 1500), "Other views honour the size filter");
      await historyBack(); assert(api.view.size === null && api.view.model === "A1-XX", "Back to sizes");
      await historyBack(); assert(api.view.model === null && api.view.family === "Laryvox", "Back to models");
      await historyBack(); assert(api.view.family === null, "Back to all families");
    });

    await test(4, "Phase-out chip on BMV Cuff 303011-XX and watchlist item", async () => {
      reset(); click(byValue("#fam-list li", "BMV Cuff")); await paint();
      const row = byValue('#late-body [data-action="model"]', "303011-XX");
      assert(row && row.querySelector(".chip.chip--med")?.textContent === "Auslauf → 303028-XX", `Chip ${row?.textContent}`);
      reset(); await paint();
      const item = byValue('#watch [data-action="watch"]', "phaseout");
      assert(item && item.textContent.includes("1 offene Position auf Auslauf-/Raus-Artikeln (1,5 T€)") && item.querySelector(".chip--med"), `Watch ${item?.textContent}`);
      click(item); await paint();
      assert(!$("#watch-phaseout").hidden && $('#watch-phaseout [data-action="order"][data-value="1008"]'), "Expandable to the lines");
    });

    await test(5, "PDT toggle: PDT €1,000 · 1 line · 10 pcs; ohne PDT €11,597.50", async () => {
      reset(); await paint();
      const pdt = byValue('#share-fam [data-action="variant"]', "pdt");
      assert(pdt && byValue('#share-fam [data-action="variant"]', "nopdt"), "PDT toggle visible");
      click(pdt); await paint();
      const m = api.metrics;
      assert(api.view.variant === "pdt" && location.hash.includes("v=pdt") && near(m.openVal, 1000) && m.openLines === 1 && m.open[0].art === "A201" && m.open[0].rest === 10, "PDT scope");
      assert(crumbs().includes("PDT"), "PDT in the breadcrumb");
      click(byValue('#share-fam [data-action="variant"]', "nopdt")); await paint();
      assert(api.view.variant === "nopdt" && near(api.metrics.openVal, 11597.5), `ohne PDT ${api.metrics.openVal}`);
      click(byValue('#share-fam [data-action="variant"]', "")); await paint();
      assert(api.view.variant === null, "All");
    });

    await test(6, "Unassigned export on day 1 lists E101 (HME Filter, 1 line, €300, 30)", async () => {
      const u = api.buildUnassignedCsv();
      assert(u.name === "nicht_zugeordnet_2026-09-09.csv", `File name ${u.name}`);
      const rows = u.csv.replace(/^\ufeff/, "").split("\r\n");
      assert(rows[0] === '"Artikel-Nr.";"Bezeichnung";"Zeilen";"Offener Wert (EUR)";"Restmenge"', `Header ${rows[0]}`);
      assert(rows.length === 2 && rows[1] === '"E101";"HME Filter";"1";"300,00";"30"', `Rows ${rows.slice(1).join(" | ")}`);
      assert(u.csv.charCodeAt(0) === 0xfeff, "UTF-8 BOM");
    });

    await test("7a", "Remove the mapping: every line is Sonstige", async () => {
      reset(); click($('[data-action="families-remove"]')); await paint();
      assert(api.families === null && api.data.lines.every(l => l.family === "__other"), "All lines Sonstige");
      assert($("#foot-families").hidden, "Footer status hidden");
      assert(text("#share-fam .fam-empty").startsWith("Noch keine Produktfamilien zugeordnet. Zuordnungsdatei laden") && $('#share-fam .fam-empty [data-action="families-load"]'), "Empty-state line with load button");
      assert(text("#share-fam .fam-warn").startsWith("100 % des Werts keiner Familie zugeordnet"), `Warning: ${text("#share-fam .fam-warn")}`);
    });
    reloadInto("removed"); return;
  }

  if (phase === "removed") {
    await test("7b", "Removal persists after a real reload", async () => {
      assert(api.families === null && api.data.lines.every(l => l.family === "__other"), "Still removed after reload");
    });
    await loadMapping();
    reloadInto("reloaded"); return;
  }

  if (phase === "reloaded") {
    await test("7c", "Loaded mapping persists after a real reload", async () => {
      assert(api.families && Object.keys(api.families.rows).length === 12, "Mapping restored");
      assert(api.data.lines.find(l => l.art === "D100").model === "303011-XX", "Lines assigned after reload");
    });

    // ---------------------------------------------------------------- Sofortbedarf (fixture-sofort, mapping loaded)
    api.setLang("en"); reset();
    const plan = () => { const o = api.computeOutlook(api.data.lines, api.data.reportDate, "__all", { snaps: {} }); return [o.d7.plan, o.d30.plan, o.d90.plan]; };
    const planDay1 = plan();
    await loadDay(window.DOPK_FIXTURE_SOFORT, "DOPK_09_09.xlsx"); reset(); await paint();

    await test(8, "Key figure: €2,700 · 3 lines · 560 pcs · avg 79 days (78.7) · oldest 181 days · act now", async () => {
      const kf = $("#vitals [data-kind='undated']"), imm = api.metrics.immediate;
      assert(near(imm.val, 2700) && imm.n === 3 && imm.qty === 560 && near(imm.waitAvg, 78.74) && imm.waitMax === 181, `Stats ${JSON.stringify({ v: imm.val, n: imm.n, q: imm.qty, a: imm.waitAvg, o: imm.waitMax })}`);
      assert(kf.querySelector(".vital-value").textContent === "€2.7k" && kf.textContent.includes("3 lines · 560 pcs · avg 79 days · oldest 181 days"), `Key figure ${kf.textContent}`);
      assert(kf.dataset.level === "high" && kf.querySelector(".chip--high"), "Act now");
      assert(kf.textContent.includes("no delivery date – as soon as possible"), "Subtitle");
    });

    await test(9, "Sofortbedarf by family and by customer", async () => {
      click($("#vitals [data-kind='undated']")); await paint();
      assert(api.view.period === "undated" && text("#late-title") === "Immediate demand by product family", "Title");
      let rows = bodyRows().map(r => [r[0], r[1], r[2], r[5]]);
      assert(JSON.stringify(rows) === JSON.stringify([["Laryvox", "€1,500", "50 pcs", "20/08/2026"], ["Humidotrach", "€1,000", "500 pcs", "12/03/2026"], ["Other", "€200", "10 pcs", "01/09/2026"]]), `Families ${JSON.stringify(rows)}`);
      click(byValue('#late-tools [data-action="und-group"]', "cust")); await paint();
      assert(text("#late-title") === "Immediate demand by customer", "Customer title");
      rows = bodyRows().map(r => [r[0], r[1]]);
      assert(JSON.stringify(rows) === JSON.stringify([["Alpha Medizintechnik", "€2,500"], ["Gamma Sanitätshaus", "€200"]]), `Customers ${JSON.stringify(rows)}`);
      click(byValue('#late-tools [data-action="und-group"]', "fam")); await paint();
    });

    await test(10, "Laryvox → A1-XX → Gr. 03 → line 1013; FIFO export 1003, 1013, 1014", async () => {
      click(byValue('#late-body [data-action="family"]', "Laryvox")); await paint();
      assert(api.view.period === "undated" && api.view.family === "Laryvox", "Family within Sofortbedarf");
      click(byValue('#late-body [data-action="model"]', "A1-XX")); await paint();
      assert(bodyRows().length === 1 && bodyRows()[0][0] === "Size 03", `Sizes ${JSON.stringify(bodyRows())}`);
      click(byValue('#late-body [data-action="size"]', "03")); await paint();
      const rows = bodyRows();
      assert(rows.length === 1 && rows[0][0] === "1013" && rows[0][5] === "ASAP", `Lines ${JSON.stringify(rows)}`);
      assert(text("#export-late") === "Production priority list", "Export button label");
      api.applyView({ family: null, model: null, size: null }); await paint();
      const x = api.buildImmediateCsv(), csv = x.csv.replace(/^\ufeff/, "").split("\r\n");
      assert(x.name === "immediate-demand_2026-09-09.csv", `Name ${x.name}`);
      assert(csv[0] === '"Order";"Customer";"Article";"Description";"Product family";"Model";"Size";"Remaining qty";"Order date";"Days waiting";"Open value EUR"', `Head ${csv[0]}`);
      assert(csv.length === 4 && csv[1].startsWith('"1003"') && csv[2].startsWith('"1013"') && csv[3].startsWith('"1014"'), `FIFO ${csv.slice(1).map(r => r.slice(0, 6))}`);
      assert(csv[2].includes('"Laryvox";"A1-XX";"03"') && csv[1].includes('"181"') && csv[3].includes('"Other";"";""'), `Family columns ${csv[2]}`);
      api.setLang("de");
      assert(api.buildImmediateCsv().name === "sofortbedarf_2026-09-09.csv", "German file name");
      api.setLang("en");
    });

    await test(11, "Open backlog €14,297.50 incl. Sofortbedarf; horizon Late €3,500, then Sofort €2,700, then months", async () => {
      reset(); await paint();
      assert(near(api.metrics.openVal, 14297.5), `Open ${api.metrics.openVal}`);
      const cols = $$("#horizon [data-action='period']");
      assert(cols[0].dataset.value === "late" && cols[0].getAttribute("aria-label").includes("€3,500"), "Late first");
      assert(cols[1].dataset.value === "undated" && cols[1].getAttribute("aria-label").startsWith("Immediate demand: €2,700"), `Sofort second ${cols[1].getAttribute("aria-label")}`);
      assert(cols[1].textContent.includes("ASAP") && /^\d{4}-\d{2}$/.test(cols[2].dataset.value), "Months follow");
      assert(cols[1].querySelector(".bar-fill").getAttribute("fill") === "url(#hatch)", "Hatched style kept");
    });

    await test(12, "Outlook line \"bis zu 2,7 T€ zusätzlich bei verfügbarer Kapazität\"; plan unchanged vs day 1", async () => {
      api.setLang("de"); await paint();
      assert(text("#outlook .outlook-imm") === "Sofortbedarf: bis zu 2,7 T€ zusätzlich bei verfügbarer Kapazität", `Line ${text("#outlook .outlook-imm")}`);
      assert(text("#outlook .outlook-card--month").includes("ohne Sofortbedarf"), "Month landing note");
      assert(JSON.stringify(plan()) === JSON.stringify(planDay1), `Plan ${plan()} vs ${planDay1}`);
    });

    await test(13, "Scorecard Alpha: Sofortbedarf €2,500, Ø 84 days, act now; no undated-% alarm; verdict 79 Tage", async () => {
      api.applyView({ sc: "10001" }); await paint();
      const card = $$("#scorecard-body .sc-vitals .vital")[2];
      assert(card.textContent.includes("Sofortbedarf") && card.textContent.includes("2,5 T€") && card.textContent.includes("Ø 84 Tage") && card.dataset.level === "high", `Card ${card.textContent}`);
      assert(!card.textContent.includes("%"), "No percentage on the scorecard readout");
      api.applyView({ sc: null }); await paint();
      assert(!$("#vitals [data-kind='undated']").textContent.includes("%"), "No percentage on the key figure");
      assert(text("#verdict").includes("2,7 T€ Sofortbedarf warten im Schnitt 79 Tage auf Fertigung."), `Verdict ${text("#verdict")}`);
    });

    // ---------------------------------------------------------------- Overdue by month and family
    const matrix = () => $$("#late-matrix table tr").map(r => [...r.cells].map(c => c.textContent.trim()));
    api.setLang("en"); api.clearHistory(); await loadDay(window.DOPK_FIXTURE, "DOPK_09_09.xlsx"); reset(); await paint();

    await test(14, "Day 1 matrix (€ and pcs)", async () => {
      click(byValue('#late-tools [data-action="late-tab"]', "month")); await paint();
      assert(!$("#late-matrix").hidden && $("#late-table").hidden, "Matrix shown, list hidden until a selection");
      assert(JSON.parse(sessionStorage.getItem("dopk.test.dopk.latetab.v1")) === "month", "Choice stored in dopk.latetab.v1");
      const want = [["Due in", "Laryvox", "Duracuff Pro", "Total"], ["Aug 2026", "€1,500", "–", "€1,500"], ["Sep 2026", "–", "€2,000", "€2,000"], ["Total", "€1,500", "€2,000", "€3,500"]];
      assert(JSON.stringify(matrix()) === JSON.stringify(want), `Matrix ${JSON.stringify(matrix())}`);
      click(byValue('#late-matrix [data-action="matrix-unit"]', "qty")); await paint();
      const q = matrix();
      assert(q[1][1] === "50" && q[2][2] === "40" && q[1][2] === "–", `Pieces ${JSON.stringify(q)}`);
      click(byValue('#late-matrix [data-action="matrix-unit"]', "eur")); await paint();
      assert(text("#late-matrix .matrix-note") === "100% of the overdue value is less than 30 days late", `Note ${text("#late-matrix .matrix-note")}`);
      assert(getComputedStyle($("#late-matrix th")).position === "sticky", "Sticky first column");
    });

    await test(15, "Day 4 matrix after days 1–4; Oct × BMV Cuff lists only 1008", async () => {
      api.clearHistory();
      for (const [rows, name] of [[window.DOPK_FIXTURE, "DOPK_09_09.xlsx"], [window.DOPK_FIXTURE_DAY2, "DOPK_10_09.xlsx"], [window.DOPK_FIXTURE_DAY3, "DOPK_12_09.xlsx"], [window.DOPK_FIXTURE_DAY4, "DOPK_16_10.xlsx"]]) await loadDay(rows, name);
      reset(); await paint();
      const want = [["Due in", "Laryvox", "BMV Cuff", "Total"], ["Aug 2026", "€600", "–", "€600"], ["Oct 2026", "€1,000", "€1,500", "€2,500"], ["Total", "€1,600", "€1,500", "€3,100"]];
      assert(JSON.stringify(matrix()) === JSON.stringify(want), `Matrix ${JSON.stringify(matrix())}`);
      assert(text("#late-matrix .matrix-note") === "81% of the overdue value is less than 30 days late", `Note ${text("#late-matrix .matrix-note")}`);
      click(byValue('#late-matrix [data-action="matrix-cell"]', "2026-10|BMV Cuff")); await paint();
      assert(api.view.period === "late" && api.view.family === "BMV Cuff" && api.view.lateMonth === "2026-10" && location.hash.includes("lm=2026-10"), "Cell sets period, family and month");
      assert(!$("#late-table").hidden && bodyRows().length === 1 && bodyRows()[0][0] === "1008", `Lines ${JSON.stringify(bodyRows())}`);
      assert(JSON.stringify(matrix()) === JSON.stringify(want), "Matrix keeps all columns while filtered");
      click(byValue('#late-matrix [data-action="matrix-month"]', "2026-10")); await paint();
      assert(api.view.lateMonth === "2026-10" && api.view.family === null && bodyRows().map(r => r[0]).join() === "1008,1012", `Row header: month only ${bodyRows().map(r => r[0])}`);
      click(byValue('#late-matrix thead [data-action="matrix-family"]', "Laryvox")); await paint();
      assert(api.view.family === "Laryvox" && api.view.lateMonth === null && bodyRows().map(r => r[0]).join() === "1012,1001", `Column header: family only ${bodyRows().map(r => r[0])}`);
      assert(crumbs().join() === "Laryvox,Overdue", `Breadcrumb ${crumbs()}`);
      click(byValue('#late-tools [data-action="late-tab"]', "list")); reset(); await paint();
    });

    // ---------------------------------------------------------------- Changes since the previous upload
    const cat = (ch, k) => ch.cats.find(c => c.key === k);
    const counts = ch => ch.cats.map(c => `${c.key}:${c.n}`).join(" ");
    api.clearHistory(); await loadDay(window.DOPK_FIXTURE, "DOPK_09_09.xlsx");
    await test("16a", "Without a previous snapshot: \"Verfügbar ab dem zweiten Upload\"", async () => {
      api.setLang("de"); api.applyView({ chg: true }); await paint();
      assert($("#changes-sheet").open && text("#changes-body") === "Verfügbar ab dem zweiten Upload" && location.hash.includes("chg=1"), `Sheet ${text("#changes-body")}`);
      api.applyView({ chg: false }); await paint();
      assert(!$("#changes-sheet").open, "Closed");
    });
    await loadDay(window.DOPK_FIXTURE_DAY2, "DOPK_10_09.xlsx");

    await test(16, "Day 2 vs day 1: moved later 1 (1001/A101 €4,000), delivered €2,000 (1002/A200), all others 0", async () => {
      const ch = api.computeChanges();
      assert(cat(ch, "moved").n === 1 && cat(ch, "moved").items[0].order === 1001 && cat(ch, "moved").items[0].art === "A101" && near(cat(ch, "moved").val, 4000), `Moved ${JSON.stringify(cat(ch, "moved").items.map(i => [i.order, i.art, i.val]))}`);
      assert(cat(ch, "delivered").n === 1 && near(cat(ch, "delivered").val, 2000) && cat(ch, "delivered").items[0].art === "A200" && cat(ch, "delivered").qty === 40, "Delivered");
      assert(counts(ch) === "newLate:0 intake:0 moved:1 newImm:0 delivered:1", counts(ch));
    });
    await loadDay(window.DOPK_FIXTURE_DAY3, "DOPK_12_09.xlsx");

    await test(17, "Day 3 vs day 2: new order 1012 (€1,000, 10 pcs); delivered €1,900; sheet \"seit 10.09.2026\"", async () => {
      const ch = api.computeChanges();
      const nw = cat(ch, "intake"), del = cat(ch, "delivered");
      assert(nw.n === 1 && nw.items[0].order === 1012 && near(nw.val, 1000) && nw.qty === 10, `New orders ${JSON.stringify(nw.items.map(i => [i.order, i.val, i.qty]))}`);
      assert(near(del.val, 1900) && del.items.map(i => `${i.order}:${i.val}:${i.qty}`).sort().join() === "1001:900:30,1003:1000:500", `Delivered ${del.items.map(i => `${i.order}:${i.val}:${i.qty}`)}`);
      assert(counts(ch) === "newLate:0 intake:1 moved:0 newImm:0 delivered:2", counts(ch));
      reset(); await paint();
      const entry = $('#watch [data-action="changes"]');
      assert(entry && entry.textContent.includes("Seit 10.09.2026"), "Watchlist entry point");
      click(entry); await paint();
      assert($("#changes-sheet").open && text("#changes-title") === "Änderungen seit 10.09.2026", `Title ${text("#changes-title")}`);
      const sections = $$("#changes-sheet details");
      assert(sections.length === 5 && sections.filter(d => d.open).map(d => d.dataset.cat).join() === "intake,delivered", `Collapsed when empty: ${sections.filter(d => d.open).map(d => d.dataset.cat)}`);
      assert(text('#changes-sheet details[data-cat="intake"] summary').includes("1 Position · 1.000 € · 10 Stk"), text('#changes-sheet details[data-cat="intake"] summary'));
      const order = $('#changes-sheet [data-action="order"][data-value="1012"]');
      click(order); await paint();
      assert($("#order-drawer").open && api.view.order === "1012", "Order number opens the drawer");
      api.applyView({ order: null }); await paint();
      assert($("#changes-sheet").open, "Sheet stays open behind the drawer");
      const csv = api.buildChangesCsv();
      assert(csv.name === "aenderungen_2026-09-12.csv" && csv.csv.split("\r\n").length === 4, `CSV ${csv.name} ${csv.csv.split("\r\n").length}`);
      api.applyView({ chg: false }); await paint();
    });
    await loadDay(window.DOPK_FIXTURE_DAY4, "DOPK_16_10.xlsx");

    await test(18, "Day 4 vs day 3: newly late 2 (1008 €1,500; 1012 €1,000); \"seit 12.09.2026\"; same through archive import", async () => {
      const ch = api.computeChanges(), nl = cat(ch, "newLate");
      assert(nl.n === 2 && nl.items.map(i => `${i.order}:${i.val}`).join() === "1008:1500,1012:1000", `Newly late ${nl.items.map(i => `${i.order}:${i.val}`)}`);
      api.applyView({ chg: true }); await paint();
      assert(text("#changes-title") === "Änderungen seit 12.09.2026", text("#changes-title"));
      api.applyView({ chg: false }); await paint();
      api.clearHistory();
      api.importArchive([window.DOPK_FIXTURE, window.DOPK_FIXTURE_DAY2, window.DOPK_FIXTURE_DAY3, window.DOPK_FIXTURE_DAY4]); await paint();
      const ch2 = api.computeChanges();
      assert(counts(ch2) === counts(ch) && near(cat(ch2, "newLate").val, 2500), `Archive import ${counts(ch2)} vs ${counts(ch)}`);
      api.setLang("en"); api.applyView({ chg: true }); await paint();
      assert(text("#changes-title") === "Changes since 12/09/2026" && text('#changes-sheet details[data-cat="newLate"] summary').startsWith("Newly late"), "English sheet");
      api.applyView({ chg: false }); await paint();
    });

    // ---------------------------------------------------------------- Saved views
    await test(19, "Built-in views: Produktfamilien opens the families tab; Überfällig nach Monat opens late + by month", async () => {
      api.setLang("de"); reset(); await paint();
      const names = [...$("#view-select").options].map(o => o.textContent);
      assert(["Gesamtüberblick", "Überfällig nach Monat", "Sofortbedarf", "Produktfamilien", "Key Account überfällig (Alpha)", "Neu seit letztem Stand", "Aktuelle Ansicht speichern …", "Als Standard festlegen"].every(n => names.includes(n)), `Options ${names}`);
      await chooseView("b:families");
      assert(!$("#share-fam").hidden && api.toggles.share === "fam" && $("#view-select").value === "b:families", "Families tab");
      await chooseView("b:late-month");
      assert(api.view.period === "late" && api.toggles.late === "month" && !$("#late-matrix").hidden, "Late by month");
      await chooseView("b:ka-late");
      assert(api.view.customer === "Alpha Medizintechnik GmbH" && api.view.period === "late", `Key account late ${api.view.customer}`);
      await chooseView("b:immediate");
      assert(api.view.period === "undated" && api.view.customer === null, "Sofortbedarf");
      await chooseView("b:changes");
      assert($("#changes-sheet").open && api.view.chg, "Neu seit letztem Stand opens the changes sheet");
      api.applyView({ chg: false }); await chooseView("b:overview");
      assert(api.view.period === null && api.toggles.share === "cust" && api.toggles.late === "list", "Overview");
      api.applyView({ period: "late" }); await paint();
      assert($("#view-select").value === "", "Select falls back to the placeholder once the view changes");
    });

    await test("20a", "Save \"Laryvox Größen\" at Laryvox › A1-XX through the inline dialog", async () => {
      reset(); click(byValue('#share-tabs [data-action="share-tab"]', "fam")); await paint();
      click(byValue("#fam-list li", "Laryvox")); await paint();
      click(byValue('#late-body [data-action="model"]', "A1-XX")); await paint();
      await chooseView("a:save");
      assert($("#view-dialog").open && document.activeElement === $("#view-name"), "Inline dialog, no window.prompt");
      $("#view-name").value = "Laryvox Größen"; $("#view-form").requestSubmit(); await paint();
      assert(!$("#view-dialog").open && text("#notice span") === "Ansicht „Laryvox Größen“ gespeichert.", `Notice ${text("#notice span")}`);
      const views = JSON.parse(sessionStorage.getItem("dopk.test.dopk.views.v1"));
      assert(views.length === 1 && views[0].state.family === "Laryvox" && views[0].state.model === "A1-XX" && views[0].state.toggles.share === "fam", "Stored in dopk.views.v1");
      reset(); click(byValue('#share-tabs [data-action="share-tab"]', "cust")); await paint();
    });
    reloadInto("views"); return;
  }

  if (phase === "views") {
    await test("20b", "After a reload the saved view restores family and model; \"Als Standard festlegen\" applies after the next load", async () => {
      api.setLang("de");
      assert(api.view.family === null && api.toggles.share === "cust", "Starts on the plain view");
      const opt = [...$("#view-select").options].find(o => o.textContent === "Laryvox Größen");
      assert(opt, "Saved view listed after reload");
      await chooseView(opt.value);
      assert(api.view.family === "Laryvox" && api.view.model === "A1-XX" && api.toggles.share === "fam" && text("#late-title") === "Größen von A1-XX", "Family and model restored");
      await chooseView("a:default");
      assert(JSON.parse(sessionStorage.getItem("dopk.test.dopk.defaultview.v1")).id === opt.value && text("#notice span").startsWith("„Laryvox Größen“ ist jetzt die Standardansicht"), "Default stored");
      assert([...$("#view-select").options].some(o => o.textContent === "Laryvox Größen (Standard)"), "Marked as default");
      reset(); history.replaceState(null, "", location.pathname); await paint();
      await loadDay(window.DOPK_FIXTURE, "DOPK_09_09.xlsx");
      assert(api.view.family === "Laryvox" && api.view.model === "A1-XX", "Default applied after the next file load");
      api.applyView({ family: null, model: null, period: "late" }); await paint();
      await loadDay(window.DOPK_FIXTURE, "DOPK_09_09.xlsx");
      assert(api.view.period === "late" && api.view.family === null, "Not applied when the URL hash names a view");
    });
    reloadInto("default"); return;
  }

  if (phase === "default") {
    await test("20c", "Default view applies on page load without a view in the hash", async () => {
      assert(api.view.family === "Laryvox" && api.view.model === "A1-XX", `View ${JSON.stringify(api.view)}`);
    });
    reloadInto("hashed", "p=late"); return;
  }

  if (phase === "hashed") {
    await test("20d", "A view in the URL hash wins over the default view", async () => {
      assert(api.view.period === "late" && api.view.family === null, `View ${JSON.stringify(api.view)}`);
    });
    api.setLang("de");

    // ---------------------------------------------------------------- Regression
    await test(23, "Every text exists in German and English; tab, matrix and sheets switch language", async () => {
      const k = api.i18nKeys(), de = new Set(k.de), en = new Set(k.en);
      const missing = [...k.de.filter(x => !en.has(x)).map(x => "en:" + x), ...k.en.filter(x => !de.has(x)).map(x => "de:" + x)];
      assert(!missing.length, `Missing ${missing}`);
      reset(); click(byValue('#share-tabs [data-action="share-tab"]', "fam")); click(byValue('#late-tools [data-action="late-tab"]', "month")); await paint();
      assert(text("#share-title") === "Wo der Bestand liegt" && text("#late-matrix thead th") === "Fällig im", "German");
      api.setLang("en"); await paint();
      assert(text("#share-title") === "Where the backlog sits" && text("#late-matrix thead th") === "Due in" && byValue('#share-tabs [data-action="share-tab"]', "fam").textContent === "Product families", "English");
      assert([...$("#view-select").options].some(o => o.textContent === "Overdue by month"), "View select in English");
      api.applyView({ chg: true }); await paint();
      assert(text("#changes-title").startsWith("Changes since"), "Changes sheet in English");
      api.applyView({ chg: false }); api.setLang("de"); await paint();
    });

    await test(24, "No page-level horizontal scroll; keyboard reaches tabs, PDT toggle, rows, matrix cells, view select and sheets", async () => {
      reset(); await paint(); noPageOverflow("overview");
      click(byValue("#fam-list li", "Laryvox")); await paint(); noPageOverflow("models");
      reset(); click(byValue('#late-tools [data-action="late-tab"]', "month")); await paint(); noPageOverflow("matrix");
      const scroller = $("#late-matrix .matrix-scroll");
      assert(scroller.tabIndex === 0 && getComputedStyle(scroller).overflowX === "auto", "Matrix scrolls in its own focusable container");
      api.applyView({ period: "undated" }); await paint(); noPageOverflow("Sofortbedarf");
      api.applyView({ chg: true }); await paint(); noPageOverflow("changes sheet");
      $("#changes-sheet").dispatchEvent(new Event("cancel", { cancelable: true })); await paint();
      assert(!$("#changes-sheet").open && !api.view.chg, "Escape closes the changes sheet");
      reset(); await paint();
      const reachable = ['#share-tabs [data-action="share-tab"]', '#share-fam [data-action="variant"]', "#fam-list li", '#late-tools [data-action="late-tab"]', "#view-select"];
      reachable.forEach(s => { const el = $(s); assert(el && (el.tagName === "BUTTON" || el.tagName === "SELECT" || el.tabIndex === 0), `Not keyboard reachable: ${s}`); });
      key(byValue('#share-fam [data-action="variant"]', "pdt"), "Enter");
      byValue('#share-fam [data-action="variant"]', "pdt").click(); await paint();
      assert(api.view.variant === "pdt", "PDT toggle by keyboard (native button)");
      reset(); click(byValue('#late-tools [data-action="late-tab"]', "month")); await paint();
      const cell = $('#late-matrix [data-action="matrix-cell"]');
      assert(cell.tagName === "BUTTON", "Matrix cells are buttons");
      cell.click(); await paint();
      assert(api.view.period === "late" && api.view.lateMonth, "Matrix cell activates");
      click(byValue('#late-tools [data-action="late-tab"]', "list")); reset(); await paint();
    });

    await test(25, "No console errors and no CSP violations (served with the _headers policy)", async () => {
      assert(window.DOPK_TEST_ERRORS.length === 0, window.DOPK_TEST_ERRORS.join("; "));
    });
  }

  sessionStorage.removeItem(RESUME);
  window.DOPK_TEST_DONE = true;
  document.title = `${results.filter(r => r.pass).length}/${results.length} PASS — DOPK families`;
});
