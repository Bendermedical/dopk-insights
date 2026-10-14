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
  const reloadInto = phase => { sessionStorage.setItem(RESUME, JSON.stringify({ phase, results })); location.hash = ""; location.reload(); };
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
  }

  sessionStorage.removeItem(RESUME);
  window.DOPK_TEST_DONE = true;
  document.title = `${results.filter(r => r.pass).length}/${results.length} PASS — DOPK families`;
});
