/* Sidebar layout acceptance tests: navigation, pages, status figures, filter bar, "Heute zu tun",
   URL compatibility, phone bottom bar. Fixture with Sofortbedarf (09.09.2026) plus the mapping fixture.
   The page reloads itself once to check that an old link (#p=undated) opens the Sofortbedarf page. */
document.addEventListener("DOMContentLoaded", async function () {
  "use strict";
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const api = window.DOPK_TEST;
  const RESUME = "dopk.layout.resume";
  const saved = JSON.parse(sessionStorage.getItem(RESUME) || "null");
  const results = saved?.results || [];
  window.DOPK_TEST_RESULTS = results;
  const assert = (c, msg) => { if (!c) throw new Error(msg); };
  const text = s => ($(s)?.textContent || "").replace(/\s+/g, " ").trim();
  const paint = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const click = el => { assert(el, "Missing click target"); el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })); };
  const shown = s => { const el = $(s); return !!el && getComputedStyle(el).display !== "none"; };
  const nav = v => $(`#sb-nav [data-action="nav"][data-value="${v}"]`);
  const go = async v => { click(nav(v)); await paint(); };
  const phone = innerWidth <= 860;
  function show() {
    $("#test-results").replaceChildren(...results.map(r => { const li = document.createElement("li"); li.textContent = `${r.pass ? "PASS" : "FAIL"} ${r.id}: ${r.title}${r.detail ? " — " + r.detail : ""}`; return li; }));
  }
  async function test(id, title, fn) {
    try { await fn(); results.push({ id, title, pass: true }); }
    catch (e) { console.error(`Test ${id} failed:`, e); results.push({ id, title, pass: false, detail: e.message }); }
    show();
  }
  const reset = () => api.applyView({ customer: null, period: null, order: null, sc: null, btb: false, family: null, model: null, size: null, variant: null, lateMonth: null, chg: false, page: "overview" });
  const historyBack = () => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Back navigation timed out")), 3000);
    window.addEventListener("popstate", () => { clearTimeout(timer); requestAnimationFrame(() => requestAnimationFrame(resolve)); }, { once: true });
    history.back();
  });
  async function setup() {
    api.RULES.keyAccount.accounts = [{ id: "10001", label: "Alpha" }];
    api.setLang("de");
    api.load(window.DOPK_FIXTURE_SOFORT, "DOPK_09_09.xlsx");
    if (!api.families) await api.loadFamiliesFile(new File([window.DOPK_FAMILIES_CSV], "families-fixture.csv"));
    await paint();
  }

  if (!saved) {
    Object.keys(sessionStorage).filter(k => k.startsWith("dopk.test.")).forEach(k => sessionStorage.removeItem(k));
    api.clearHistory(); await setup(); reset(); await paint();

    await test(1, "Sidebar: groups, labels, status dots and figures; Überblick is the active page", async () => {
      const items = $$("#sb-nav .nav-item").map(b => [b.dataset.value, b.querySelector(".nav-label").textContent, b.querySelector(".nav-badge")?.textContent || "", [...b.querySelector(".nav-dot").classList].find(c => c.startsWith("nav-dot--")).slice(9)]);
      const want = [["overview", "Überblick", "", "high"], ["late", "Überfällig", "3,5 T€", "high"], ["imm", "Sofortbedarf", "2,7 T€", "high"], ["changes", "Neu seit letztem Stand", "", "none"],
        ["fam", "Produktfamilien", "6", "clear"], ["cust", "Kunden", "77 %", "high"], ["horizon", "Auftragshorizont", "", "med"], ["outlook", "Umsatzausblick", "3,9 T€", "low"],
        ["btb", "Auftragseingang", "600 €", "none"], ["sc:10001", "Alpha", "11 T€", "high"]];
      assert(JSON.stringify(items) === JSON.stringify(want), `Items ${JSON.stringify(items)}`);
      assert($$("#sb-nav .nav-group-label").map(e => e.textContent).join() === "Handeln,Bestand,Entwicklung,Key Account", "Group labels");
      assert(nav("overview").getAttribute("aria-current") === "page" && $("#app").dataset.page === "overview", "Overview active");
      assert(shown("#verdict") && shown("#vitals") && shown("#todo") && shown("#horizon-panel") && shown("#share-panel") && shown("#watch-panel"), "Overview sections shown");
      assert(!shown("#late-panel") && !shown("#outlook") && !shown("#page-head"), "Other sections hidden on the overview");
    });

    await test(2, "„Heute zu tun“: five largest problems across overdue, Sofortbedarf and phase-out", async () => {
      const rows = $$("#todo-list li").map(li => [li.querySelector("[data-action='order']").textContent, li.querySelector(".todo-why").textContent, li.querySelector(".todo-val").textContent]);
      const want = [["1002", "8 Tage überfällig", "2.000 €"], ["1001", "25 Tage überfällig", "1.500 €"], ["1008", "Auslauf → 303028-XX", "1.500 €"], ["1013", "Sofort · wartet 20 Tage", "1.500 €"], ["1003", "Sofort · wartet 181 Tage", "1.000 €"]];
      assert(JSON.stringify(rows) === JSON.stringify(want), `Rows ${JSON.stringify(rows)}`);
      click($("#todo-list [data-action='order'][data-value='1008']")); await paint();
      assert($("#order-drawer").open && api.view.order === "1008", "Order opens the drawer");
      api.applyView({ order: null }); await paint();
    });

    await test(3, "Überfällig and Sofortbedarf pages: page head, URL as before (#p=late, #p=undated)", async () => {
      await go("late");
      assert($("#app").dataset.page === "late" && location.hash === "#p=late" && nav("late").getAttribute("aria-current") === "page", `Late page ${location.hash}`);
      assert(text("#page-head h1") === "3,5 T€ überfällig" && $("#page-head .chip--high") && shown("#late-panel") && !shown("#verdict"), "Late page head and panel");
      await go("imm");
      assert($("#app").dataset.page === "imm" && location.hash === "#p=undated", `Imm page ${location.hash}`);
      assert(text("#page-head h1") === "2,7 T€ Sofortbedarf" && text("#late-title") === "Sofortbedarf nach Produktfamilie", "Imm page head and grouped view");
    });

    await test(4, "Produktfamilien page: families tab, drill-down appears once a family is chosen", async () => {
      await go("fam");
      assert($("#app").dataset.page === "fam" && location.hash === "#pg=fam" && shown("#share-fam") && !shown("#late-panel"), `Fam page ${location.hash}`);
      assert(text("#page-head h1") === "Produktfamilien" && !shown("#watch-panel"), "Fam page head");
      click($("#fam-list li[data-value='Laryvox']")); await paint();
      assert(api.view.family === "Laryvox" && api.view.page === "fam" && shown("#late-panel") && text("#late-title") === "Modelle in Laryvox", "Drill-down on the families page");
      await historyBack();
      assert(api.view.family === null && api.view.page === "fam", "Back removes the family, stays on the page");
    });

    await test(5, "A family picked in the overview's families tab opens the families page", async () => {
      reset(); click($('#share-tabs [data-action="share-tab"][data-value="fam"]')); await paint();
      assert(api.view.page === "overview" && shown("#share-fam"), "Tab switch stays on the overview");
      click($("#fam-list li[data-value='Duracuff Pro']")); await paint();
      assert(api.view.page === "fam" && api.view.family === "Duracuff Pro", `View ${JSON.stringify(api.view)}`);
      click($('#share-tabs [data-action="share-tab"][data-value="cust"]')); await paint();
      assert(api.view.page === "cust" && shown("#share-cust"), "Tab switch on the families page goes to Kunden");
    });

    await test(6, "Kunden, Auftragshorizont and Umsatzausblick pages; a month bar keeps the horizon page", async () => {
      reset(); await go("cust");
      assert(location.hash === "#pg=cust" && shown("#share-cust") && text("#page-head h1") === "Kunden" && text("#page-head p").startsWith("4 Kunden mit offenen Aufträgen · HHI"), text("#page-head p"));
      await go("horizon");
      assert(location.hash === "#pg=horizon" && shown("#horizon-panel") && !shown("#todo") && shown("#late-panel"), `Horizon ${location.hash}`);
      click($("#horizon [data-value='2026-10']")); await paint();
      assert(api.view.page === "horizon" && api.view.period === "2026-10" && location.hash === "#p=2026-10" && text("#late-title") === "Positionen fällig im Okt 2026", `Month ${location.hash}`);
      await go("outlook");
      assert(location.hash === "#pg=outlook" && shown("#outlook") && !shown("#horizon-panel") && text("#page-head h1") === "Umsatzausblick", "Outlook page");
      assert(api.view.period === null, "Leaving the horizon page drops the month");
    });

    await test(7, "Browser Back walks back through the pages", async () => {
      reset(); await paint();
      await go("late"); await go("fam"); await go("outlook");
      await historyBack(); assert(api.view.page === "fam", `After 1 Back: ${api.view.page}`);
      await historyBack(); assert(api.view.page === "late", `After 2 Back: ${api.view.page}`);
      await historyBack(); assert(api.view.page === "overview", `After 3 Back: ${api.view.page}`);
    });

    await test(8, "Changes, order intake and the key account open their overlays without leaving the page", async () => {
      reset(); await go("late");
      await go("btb");
      assert($("#btb-sheet").open && api.view.page === "late", "Book-to-bill sheet over the late page");
      api.applyView({ btb: false }); await paint();
      await go("sc:10001");
      assert($("#scorecard-sheet").open && api.view.sc === "10001" && api.view.page === "late", "Scorecard");
      api.applyView({ sc: null }); await paint();
      await go("changes");
      assert($("#changes-sheet").open && api.view.page === "late", "Changes sheet");
      api.applyView({ chg: false }); await paint();
    });

    await test(9, "Filter bar: family select and PDT apply on every page; the sidebar figures follow them", async () => {
      reset(); await go("late");
      const sel = $("#family-filter");
      assert(!sel.hidden && [...sel.options].map(o => o.value).slice(0, 3).join() === ",Laryvox,Duracuff Pro", `Options ${[...sel.options].map(o => o.value)}`);
      sel.value = "Duracuff Pro"; sel.dispatchEvent(new Event("change", { bubbles: true })); await paint();
      assert(api.view.family === "Duracuff Pro" && api.view.page === "late" && text("#page-head h1") === "2,0 T€ überfällig", `Late for the family: ${text("#page-head h1")}`);
      assert(nav("late").querySelector(".nav-badge").textContent === "2,0 T€", "Sidebar figure follows the filter");
      sel.value = ""; sel.dispatchEvent(new Event("change", { bubbles: true })); await paint();
      click($("#topbar-pdt [data-action='variant'][data-value='pdt']")); await paint();
      assert(api.view.variant === "pdt" && api.view.page === "late", "PDT in the filter bar");
      reset(); await paint();
    });

    await test(10, "Saved views and questions land on the right page", async () => {
      const sel = $("#view-select");
      sel.value = "b:families"; sel.dispatchEvent(new Event("change", { bubbles: true })); await paint();
      assert(api.view.page === "fam", `Built-in view: ${api.view.page}`);
      sel.value = "b:late-month"; sel.dispatchEvent(new Event("change", { bubbles: true })); await paint();
      assert(api.view.page === "late" && !$("#late-matrix").hidden, "Late by month");
      api.ask("Sofortbedarf Alpha"); await paint();
      assert(api.view.page === "imm" && api.view.customer === "Alpha Medizintechnik GmbH", "Question to the Sofortbedarf page");
      api.ask("größte Produktfamilie"); await paint();
      assert(api.view.page === "fam", `Families question: ${api.view.page}`);
      click($('#late-tools [data-action="late-tab"][data-value="list"]'));
      reset(); await paint();
    });

    await test(11, "English labels", async () => {
      api.setLang("en"); await paint();
      assert(nav("overview").textContent.includes("Overview") && $$("#sb-nav .nav-group-label").map(e => e.textContent).join() === "Act,Backlog,Trend,Key account", "English sidebar");
      assert(text(".filter-label") === "Filters for all pages", "English filter bar");
      await go("late"); assert(text("#page-head h1") === "€3.5k overdue", text("#page-head h1"));
      api.setLang("de"); reset(); await paint();
    });

    await test(12, phone ? "Phone: bottom bar with four pages and „Mehr“" : "Desktop: sticky sidebar, no bottom bar", async () => {
      if (phone) {
        assert(shown("#mobile-nav") && !shown("#sb-nav"), "Bottom bar shown, sidebar list folded");
        assert($$("#mobile-nav .mob-item").map(b => b.dataset.value).join() === "overview,late,imm,fam,more", "Bottom bar items");
        click($("#mobile-nav [data-value='imm']")); await paint();
        assert(api.view.page === "imm" && $("#mobile-nav [data-value='imm']").getAttribute("aria-current") === "page", "Bottom bar navigates");
        click($("#mobile-nav [data-value='more']")); await paint();
        assert(shown("#sb-nav") && $("#mobile-nav [data-value='more']").getAttribute("aria-expanded") === "true", "Mehr opens the full list");
        click($("#sb-nav [data-value='outlook']")); await paint();
        assert(api.view.page === "outlook" && !shown("#sb-nav"), "Choosing a page folds the list again");
      } else {
        assert(!shown("#mobile-nav") && getComputedStyle($("#sidebar")).position === "sticky", "Sticky sidebar");
      }
      reset(); await paint();
      assert(document.documentElement.scrollWidth <= innerWidth + 1, `Page scrolls horizontally: ${document.documentElement.scrollWidth} > ${innerWidth}`);
      assert($$("#sb-nav .nav-item, #mobile-nav .mob-item").every(b => b.tagName === "BUTTON"), "Every navigation target is a button");
    });

    // ---------------------------------------------------------------- Überfällig nach Produktfamilie
    const famRows = () => $$("#late-fam .late-fam-row").map(b => [b.dataset.value, b.querySelector(".lf-val").textContent, b.querySelector(".lf-lines").textContent, b.querySelector(".lf-days").textContent]);
    const lateOrders = () => [...$("#late-body").rows].map(r => r.cells[0].textContent.trim());

    await test(15, "Überfällig page: families compared at a glance, largest overdue first; not on other pages", async () => {
      reset(); await paint();
      assert(!shown("#late-fam"), "Strip hidden on the overview");
      await go("late");
      assert(shown("#late-fam") && text("#late-fam h2") === "Überfällig nach Produktfamilie", "Strip with title");
      assert(JSON.stringify(famRows()) === JSON.stringify([["Duracuff Pro", "2.000 €", "1 Position", "8 Tage"], ["Laryvox", "1.500 €", "1 Position", "25 Tage"]]), `Rows ${JSON.stringify(famRows())}`);
      const bars = $$("#late-fam .lf-bar i").map(i => i.style.width);
      assert(bars.join() === "100%,75%", `Bars ${bars}`);
      assert(!$("#late-fam [data-action='late-family'][data-value='']"), "No „Alle anzeigen“ without a selection");
    });

    await test(16, "One family at a time: select Laryvox, switch to Duracuff Pro, clear; everything stays in sync", async () => {
      click($("#late-fam [data-value='Laryvox']")); await paint();
      assert(api.view.family === "Laryvox" && api.view.page === "late" && location.hash.includes("f=Laryvox"), `View ${JSON.stringify(api.view)}`);
      assert(lateOrders().join() === "1001" && text("#page-head h1") === "1,5 T€ überfällig", `List ${lateOrders()} · ${text("#page-head h1")}`);
      assert($("#late-fam [data-value='Laryvox']").getAttribute("aria-pressed") === "true" && $("#late-fam [data-value='Duracuff Pro']").classList.contains("is-dim"), "Selected and dimmed rows");
      assert(famRows().length === 2, "Strip keeps every family visible while one is selected");
      assert($("#family-filter").value === "Laryvox" && nav("late").querySelector(".nav-badge").textContent === "1,5 T€" && text("#breadcrumb").includes("Laryvox"), "Filter bar, sidebar and breadcrumb follow");
      click($("#late-fam [data-value='Duracuff Pro']")); await paint();
      assert(api.view.family === "Duracuff Pro" && lateOrders().join() === "1002", "Switched to Duracuff Pro");
      click($("#late-fam [data-value='Duracuff Pro']")); await paint();
      assert(api.view.family === null && lateOrders().join() === "1002,1001", "Clicking the selected family again clears it");
      click($("#late-fam [data-value='Laryvox']")); await paint();
      click($("#late-fam [data-action='late-family'][data-value='']")); await paint();
      assert(api.view.family === null && api.view.page === "late", "„Alle anzeigen“ clears the family");
      await historyBack();
      assert(api.view.family === "Laryvox", "Back returns to the selected family");
      reset(); await paint();
    });

    await test(17, "Top rows plus „N weitere“; a selected family outside the top stays visible", async () => {
      api.RULES.families.lateStripRows = 1;
      await go("late");
      assert(famRows().length === 1 && text("#late-fam [data-action='late-fam-more']") === "1 weitere", `Top 1: ${JSON.stringify(famRows())}`);
      api.applyView({ family: "Laryvox" }); await paint();
      assert(famRows().map(r => r[0]).join() === "Duracuff Pro,Laryvox", "Selected family shown beyond the top");
      api.applyView({ family: null }); await paint();
      click($("#late-fam [data-action='late-fam-more']")); await paint();
      assert(famRows().length === 2 && !$("#late-fam [data-action='late-fam-more']"), "Expanded");
      api.RULES.families.lateStripRows = 6; reset(); await paint();
    });

    await test(18, "Overview hint on the overdue key figure: family name only, hidden when filtered by family", async () => {
      reset(); await paint();
      const tile = () => $("#vitals [data-kind='late']");
      assert(text("#vitals [data-kind='late'] .vital-hint") === "größter Anteil: Duracuff Pro", `Hint ${text("#vitals [data-kind='late'] .vital-hint")}`);
      assert(!/€/.test(tile().querySelector(".vital-hint").textContent), "No amount in the hint");
      api.applyView({ family: "Laryvox" }); await paint();
      assert(!tile().querySelector(".vital-hint"), "No hint while a family is filtered");
      reset(); await paint();
    });

    await test(19, "English labels; keyboard; without a mapping the strip explains how to get it", async () => {
      api.setLang("en"); await go("late");
      assert(text("#late-fam h2") === "Overdue by product family" && famRows()[0][2] === "1 line" && famRows()[0][3] === "8 days", JSON.stringify(famRows()));
      assert($$("#late-fam .late-fam-row").every(b => b.tagName === "BUTTON"), "Rows are buttons");
      api.setLang("de"); reset(); await paint();
      assert(text("#vitals [data-kind='late'] .vital-hint") === "größter Anteil: Duracuff Pro", "German hint back");
      api.setFamilies(null); await go("late");
      assert(text("#late-fam .late-fam-nomap").startsWith("Produktfamilien zuordnen, um Überfälliges nach Familie zu sehen.") && $("#late-fam [data-action='families-load']"), "No-mapping line");
      reset(); await paint();
      assert(!$("#vitals [data-kind='late'] .vital-hint"), "No overview hint without a mapping");
      assert(document.documentElement.scrollWidth <= innerWidth + 1, "No page-level horizontal scroll");
    });

    sessionStorage.setItem(RESUME, JSON.stringify({ results }));
    location.hash = "p=undated"; location.reload(); return;
  }

  sessionStorage.removeItem(RESUME); show();
  await test(13, "An old link #p=undated opens the Sofortbedarf page after a real reload", async () => {
    assert(api.view.period === "undated" && api.view.page === "imm" && $("#app").dataset.page === "imm" && location.hash === "#p=undated", `View ${JSON.stringify(api.view)} ${location.hash}`);
  });
  await test(14, "No console errors and no CSP violations", async () => {
    assert(window.DOPK_TEST_ERRORS.length === 0, window.DOPK_TEST_ERRORS.join("; "));
  });

  window.DOPK_TEST_DONE = true;
  document.title = `${results.filter(r => r.pass).length}/${results.length} PASS — DOPK layout`;
});
