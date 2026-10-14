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
  }

  sessionStorage.removeItem(RESUME);
  window.DOPK_TEST_DONE = true;
  document.title = `${results.filter(r => r.pass).length}/${results.length} PASS — DOPK families`;
});
