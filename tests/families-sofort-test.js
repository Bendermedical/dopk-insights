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

    await test(6, "Unassigned export on day 1 lists E101 (HME Filter, 1 line, €300, 30)", async () => {
      const u = api.buildUnassignedCsv();
      assert(u.name === "nicht_zugeordnet_2026-09-09.csv", `File name ${u.name}`);
      const rows = u.csv.replace(/^﻿/, "").split("\r\n");
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
