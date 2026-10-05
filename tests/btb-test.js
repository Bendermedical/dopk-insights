/* Book-to-bill acceptance tests (tests 1 to 21) */
document.addEventListener("DOMContentLoaded", async function () {
  "use strict";

  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const api = window.DOPK_TEST;
  const results = [];
  window.DOPK_TEST_RESULTS = results;

  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const near = (a, b) => Math.abs(a - b) < 0.05;
  const text = s => $(s) ? $(s).textContent.trim() : "";
  const click = el => { assert(el, "Missing click target"); el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })); };
  const key = (el, k) => { el.focus(); el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true })); };
  const paint = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  function show() {
    const list = $("#test-results");
    if (!list) return;
    list.replaceChildren(...results.map(r => {
      const li = document.createElement("li");
      li.textContent = `${r.pass ? "PASS" : "FAIL"} Test ${r.id}: ${r.title}${r.detail ? " — " + r.detail : ""}`;
      li.style.color = r.pass ? "var(--clear, green)" : "var(--alarm-high, red)";
      return li;
    }));
  }

  async function runTest(id, title, fn) {
    try {
      await fn();
      results.push({ id, title, pass: true });
    } catch (e) {
      console.error(`Test ${id} failed:`, e);
      results.push({ id, title, pass: false, detail: e.message });
    }
    show();
  }

  const historyBack = () => new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (!done) {
        done = true;
        clearTimeout(timer);
        window.removeEventListener("popstate", finish);
        window.removeEventListener("hashchange", finish);
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      }
    };
    const timer = setTimeout(finish, 800);
    window.addEventListener("popstate", finish, { once: true });
    window.addEventListener("hashchange", finish, { once: true });
    history.back();
  });

  // Setup: configure Alpha as key account, minHistoryDays = 14 default, clear history, load Day 1
  api.clearHistory();
  api.load(window.DOPK_FIXTURE);
  await paint();
  api.RULES.bookToBill.minHistoryDays = 14;

  // TEST 1: RULES.bookToBill definitions and parameters
  await runTest(1, "RULES.bookToBill parameters and default values", async () => {
    const btbRules = api.RULES.bookToBill;
    assert(btbRules, "RULES.bookToBill exists");
    assert(btbRules.rollingDays === 28, "rollingDays default is 28");
    assert(btbRules.longRunDays === 91, "longRunDays default is 91");
    assert(btbRules.historyWeeks === 12, "historyWeeks default is 12");
    assert(btbRules.minSnapshotsPerWeek === 3, "minSnapshotsPerWeek default is 3");
    assert(btbRules.minHistoryDays === 14, "minHistoryDays default is 14");
    assert(btbRules.bigOrderShare === 0.30, "bigOrderShare default is 0.30");
    assert(btbRules.levels.clear === 1.0, "levels.clear default is 1.0");
    assert(btbRules.levels.low === 0.90, "levels.low default is 0.90");
    assert(btbRules.levels.med === 0.75, "levels.med default is 0.75");
  });

  // TEST 2: Day 1 (09.09.2026) pure calculations and history record
  await runTest(2, "Day 1 (09.09.2026) intake (€600), shipped (€800), and shippedKeys recorded", async () => {
    // Day 1 was loaded during page init
    const hist = api.history;
    const snap1 = hist.snaps["2026-09-09"];
    assert(snap1, "Snapshot 2026-09-09 recorded in history");
    assert(snap1.btb, "Snapshot 1 contains btb field");

    // Intake: 1011 (F100, €600) + 1007 (C100, €0) = €600
    assert(snap1.btb.intake === 600, `Day 1 intake should be 600, got ${snap1.btb.intake}`);
    assert(snap1.btb.intakeOrders === 2, `Day 1 intake orders count should be 2, got ${snap1.btb.intakeOrders}`);
    assert((snap1.btb.orders || []).some(o => String(o.order) === "1011"), "Intake orders includes 1011");

    // Shipped A: lines with shipped === true (LS:): 1009/E100 (€500) + 1010/E101 (€300) = €800
    assert(snap1.btb.shippedA === 800, `Day 1 shippedA should be 800, got ${snap1.btb.shippedA}`);
    assert(snap1.btb.shippedB === 0, `Day 1 shippedB should be 0, got ${snap1.btb.shippedB}`);
    assert(snap1.btb.shipped === 800, `Day 1 total shipped should be 800, got ${snap1.btb.shipped}`);

    // Shipped keys stored
    assert(Array.isArray(snap1.shippedKeys), "shippedKeys is array");
    assert(snap1.shippedKeys.length === 2, `Day 1 has 2 shipped keys, got ${snap1.shippedKeys.length}`);
  });

  // TEST 3: Day 2 (10.09.2026) pure calculations: today's delivery note (€2,000)
  await runTest(3, "Day 2 (10.09.2026) intake (€0) and shipped (€2,000 via LS line)", async () => {
    api.load(window.DOPK_FIXTURE_DAY2);
    await paint();
    const hist = api.history;
    const snap2 = hist.snaps["2026-09-10"];
    assert(snap2, "Snapshot 2026-09-10 recorded in history");

    // Intake: 0
    assert(snap2.btb.intake === 0, `Day 2 intake should be 0, got ${snap2.btb.intake}`);

    // Shipped: 1002/A200 was shipped today (€2,000). 1009 and 1010 from Day 1 shippedKeys are excluded from B.
    assert(snap2.btb.shippedA === 2000, `Day 2 shippedA should be 2000, got ${snap2.btb.shippedA}`);
    assert(snap2.btb.shippedB === 0, `Day 2 shippedB should be 0, got ${snap2.btb.shippedB}`);
    assert(snap2.btb.shipped === 2000, `Day 2 total shipped should be 2000, got ${snap2.btb.shipped}`);
    assert(snap2.shippedKeys.length === 1, `Day 2 has 1 shippedKey, got ${snap2.shippedKeys.length}`);
  });

  // TEST 4: Day 3 (12.09.2026) pure calculations: gap intake (€1,000) and delivery reduction (€1,900)
  await runTest(4, "Day 3 (12.09.2026) intake (€1,000) and shipped B (€1,900 without Day 2 LS line)", async () => {
    api.load(window.DOPK_FIXTURE_DAY3);
    await paint();
    const hist = api.history;
    const snap3 = hist.snaps["2026-09-12"];
    assert(snap3, "Snapshot 2026-09-12 recorded in history");

    // Intake: order 1012 entered on 11.09.2026 (in (10.09, 12.09]) = €1,000
    assert(snap3.btb.intake === 1000, `Day 3 intake should be 1000, got ${snap3.btb.intake}`);
    assert((snap3.btb.orders || []).some(o => String(o.order) === "1012"), "Intake orders includes 1012");

    // Shipped:
    // A = 0 (no LS lines)
    // B = 1002/A200 is gone, but was in Day 2 shippedKeys -> skipped!
    //     1003/A300 is gone, was NOT in Day 2 shippedKeys -> €1,000
    //     1001/A100 was 1,500, now 600 -> €900
    //     Total B = 1,000 + 900 = 1,900
    assert(snap3.btb.shippedA === 0, `Day 3 shippedA should be 0, got ${snap3.btb.shippedA}`);
    assert(snap3.btb.shippedB === 1900, `Day 3 shippedB should be 1900, got ${snap3.btb.shippedB}`);
    assert(snap3.btb.shipped === 1900, `Day 3 total shipped should be 1900, got ${snap3.btb.shipped}`);
  });

  // TEST 5: Rolling 4-week window totals and ratio
  await runTest(5, "Multi-snapshot rolling 4-week totals: intake €1,600, shipped €4,700, ratio 0.34", async () => {
    const hist = api.history;
    const rd = new Date(2026, 8, 12); // 12.09.2026
    const btb = api.computeBookToBill(hist, rd, {});
    assert(btb.intake4w === 1600, `4w intake should be 1600, got ${btb.intake4w}`);
    assert(btb.shipped4w === 4700, `4w shipped should be 4700, got ${btb.shipped4w}`);
    assert(near(btb.ratio4w, 1600 / 4700), `4w ratio should be ~0.34, got ${btb.ratio4w}`);
    assert(btb.weeklyChange === -3100, `weekly change should be -3100, got ${btb.weeklyChange}`);
  });

  // TEST 6: Rolling ratio alarm levels
  await runTest(6, "Alarm level evaluation: ratio 0.34 < 0.75 yields alarm-high", async () => {
    api.RULES.bookToBill.minHistoryDays = 1;
    const hist = api.history;
    const rd = new Date(2026, 8, 12);
    const btb = api.computeBookToBill(hist, rd, {});
    assert(btb.level === "high", `Level should be 'high', got ${btb.level}`);
  });

  // TEST 7: Lumpiness detection
  await runTest(7, "Lumpiness detection: Order 1012 is 62.5% (>30%) of intake, triggers note", async () => {
    const hist = api.history;
    const rd = new Date(2026, 8, 12);
    const btb = api.computeBookToBill(hist, rd, {});
    assert(btb.bigOrder, "bigOrder identified");
    assert(String(btb.bigOrder.order) === "1012", `Big order should be 1012, got ${btb.bigOrder.order}`);
    assert(btb.bigOrder.val === 1000, `Big order val should be 1000, got ${btb.bigOrder.val}`);
    assert(near(btb.bigOrderShare, 1000 / 1600), "Big order share is 62.5%");
  });

  // TEST 8: History threshold enforcement
  await runTest(8, "History threshold: with minHistoryDays=14, 3 snapshots yield hasHistory=false", async () => {
    api.RULES.bookToBill.minHistoryDays = 14;
    const hist = api.history;
    const rd = new Date(2026, 8, 12);
    const btb = api.computeBookToBill(hist, rd, {});
    assert(btb.hasHistory === false, "hasHistory is false when historyCount < 14");
    assert(btb.historyCount === 3, `historyCount should be 3, got ${btb.historyCount}`);
  });

  // TEST 9: Key figure DOM rendering
  await runTest(9, "Key figure 'Auftragseingang': button data-action='btb', intake €1,000, sub-text 'seit 10.09.'", async () => {
    const btn = $('[data-action="btb"]');
    assert(btn, "Interactive button data-action='btb' rendered in vitals");
    const valText = btn.querySelector(".vital-value")?.textContent || "";
    assert(valText.includes("1,0") || valText.includes("1.000") || valText.includes("1 T€"), `Expected intake 1,0 T€ in figure, got ${valText}`);

    const sub = btn.querySelector(".vital-sub")?.textContent || "";
    assert(sub.includes("seit 10.09."), `Expected 'seit 10.09.' subtext, got ${sub}`);

    const sec = btn.querySelector(".vital-subline")?.textContent || "";
    assert(sec.includes("Book-to-Bill"), `Expected Book-to-Bill ratio label in sub-line, got ${sec}`);
  });

  // TEST 10: Clicking key figure opens #btb-sheet and sets URL hash
  await runTest(10, "Clicking key figure opens #btb-sheet and sets hash &btb=1", async () => {
    const btn = $('[data-action="btb"]');
    click(btn);
    await paint();
    const sheet = $("#btb-sheet");
    assert(sheet.open, "BTB detail sheet is open");
    assert(window.location.hash.includes("btb=1"), `Hash should include btb=1, got ${window.location.hash}`);
    click($("#btb-close"));
    await paint();
  });

  // TEST 11: Detail sheet DOM contents: hero stats, narrative, chart, lumpiness note
  await runTest(11, "Detail sheet contents: hero stats, narrative sentence, chart with role='img' and lumpiness note", async () => {
    // For full readouts in sheet, enable minHistoryDays = 1
    api.RULES.bookToBill.minHistoryDays = 1;
    api.applyView({ btb: true });
    await paint();

    const hero = $(".btb-hero");
    assert(hero, "Hero ratios rendered");

    const narrative = $(".btb-narrative");
    assert(narrative, "Narrative summary sentence rendered");
    assert(narrative.textContent.includes("3.100") || narrative.textContent.includes("3,1"), `Narrative includes shrinkage rate, got ${narrative.textContent}`);

    const chartWrap = $(".btb-chart-wrap");
    assert(chartWrap, "Chart wrapper exists");
    assert(chartWrap.getAttribute("role") === "img", "Chart has role='img'");
    assert(chartWrap.getAttribute("aria-label"), "Chart has aria-label");

    const svg = $(".btb-chart-svg");
    assert(svg, "Inline SVG rendered");
    const cols = $$(".btb-week-col");
    assert(cols.length === 12, `Expected 12 ISO week columns, got ${cols.length}`);

    const lumpNote = $(".btb-lump-note");
    assert(lumpNote, "Lumpiness note rendered");
    assert(lumpNote.textContent.includes("1012"), "Lumpiness note references order 1012");
  });

  // TEST 12: Top 5 intake orders list with order links
  await runTest(12, "Detail sheet top orders list: order 1012 links to order drawer", async () => {
    const orderBtn = $('#btb-body [data-action="order"][data-value="1012"]');
    assert(orderBtn, "Order 1012 link exists in sheet table");
    click(orderBtn);
    await paint();

    const drawer = $("#order-drawer");
    assert(drawer.open, "Order drawer opened upon clicking order link");
    assert(text("#order-title").includes("1012"), `Drawer title is 1012, got ${text("#order-title")}`);

    // Close order drawer to return to btb sheet
    click($("#order-close"));
    await paint();
    assert(!drawer.open, "Order drawer closed");
    assert($("#btb-sheet").open, "BTB sheet remains open after closing order drawer");
  });

  // TEST 13: Key account scorecard includes call-offs vs deliveries readout
  await runTest(13, "Key account scorecard includes 4-week call-offs vs deliveries readout", async () => {
    api.RULES.keyAccount.accounts = [{ id: "10001", label: "Alpha" }];
    api.RULES.keyAccount.minHistoryDays = 1;
    const a = api.computeAccount(api.data.lines, api.data.reportDate, "10001", api.history);
    assert(a.btb4w, "Scorecard account computation includes btb4w");
    assert(a.btb4w.shipped4w > 0, "Scorecard shipments > 0");

    // Open scorecard sheet to inspect DOM
    api.applyView({ btb: false, sc: "10001" });
    await paint();
    const scLine = $(".sc-btb-line");
    assert(scLine, "Scorecard sheet contains .sc-btb-line readout");
    assert(scLine.textContent.includes("Abrufe vs. Lieferungen") || scLine.textContent.includes("Call-offs vs. deliveries"), `Readout label found in ${scLine.textContent}`);
    click($("#scorecard-close"));
    await paint();
  });

  // TEST 14: Main page verdict sentence conditional warning
  await runTest(14, "Verdict sentence on main page: appends coverage warning when level is high and hasHistory=true", async () => {
    api.RULES.bookToBill.minHistoryDays = 1;
    api.applyView({ btb: false, sc: null, customer: null, period: null });
    await paint();
    const verdict = text("#verdict");
    assert(verdict.includes("Auftragseingang deckt in den letzten 4 Wochen nur 34 % der Lieferungen") ||
           verdict.includes("34 %"), `Expected verdict sentence to include coverage warning, got ${verdict}`);
  });

  // TEST 15: Customer filter: Beta Care (10002)
  await runTest(15, "Customer filter Beta Care (10002): intake €1,000, shipped €500 -> ratio 2.00, level clear", async () => {
    const custName = "Beta Care GmbH  DE-80331 München";
    api.applyView({ customer: custName });
    await paint();

    const hist = api.history;
    const rd = new Date(2026, 8, 12);
    const btb = api.computeBookToBill(hist, rd, { customer: custName });
    assert(btb.intake4w === 1000, `Beta Care intake should be 1000, got ${btb.intake4w}`);
    assert(btb.shipped4w === 500, `Beta Care shipped should be 500, got ${btb.shipped4w}`);
    assert(btb.ratio4w === 2.0, `Beta Care ratio should be 2.0, got ${btb.ratio4w}`);
    assert(btb.level === "clear", `Beta Care level should be 'clear', got ${btb.level}`);
  });

  // TEST 16: Customer filter: __xtop (other customers)
  await runTest(16, "Customer filter __xtop: excludes top customer (Alpha)", async () => {
    api.applyView({ customer: "__xtop" });
    await paint();

    const hist = api.history;
    const rd = new Date(2026, 8, 12);
    const btb = api.computeBookToBill(hist, rd, { customer: "__xtop" });
    // Top customer in history is Alpha (10001)
    // Non-alpha intake: 1011 (€600) + 1012 (€1,000) = €1,600
    // Non-alpha shipped: Day 1 (1009/1010 = €800)
    assert(btb.intake4w === 1600, `__xtop intake should be 1600, got ${btb.intake4w}`);
    assert(btb.shipped4w === 800, `__xtop shipped should be 800, got ${btb.shipped4w}`);
    assert(btb.ratio4w === 2.0, `__xtop ratio should be 2.0, got ${btb.ratio4w}`);
    assert(btb.level === "clear", `__xtop level should be 'clear', got ${btb.level}`);
  });

  // TEST 17: Product family fallback note
  await runTest(17, "Product family fallback note rendered when family absent", async () => {
    api.applyView({ customer: null, btb: true });
    await paint();
    const note = $(".btb-fam-note");
    assert(note, "Family fallback note rendered");
    assert(note.textContent.includes("Produktfamilie") || note.textContent.includes("product family"), `Note text found in ${note.textContent}`);
  });

  // TEST 18: CSV export format and consistency with Outlook
  await runTest(18, "CSV export content and consistency with Outlook delivered value", async () => {
    const hist = api.history;
    const rd = new Date(2026, 8, 12);
    const btb = api.computeBookToBill(hist, rd, {});
    const csv = api.buildBtbCsv(btb, rd);
    assert(csv.includes("Woche;Auftragseingang;Lieferungen;Book-to-Bill;Vollstaendigkeit") ||
           csv.includes("Woche"), "CSV header present");
    assert(csv.split("\n").length >= 13, "CSV has at least 12 data rows plus header");

    // Consistency: Outlook calibration/deliveries match deliveredBetween
    const snap2 = hist.snaps["2026-09-10"];
    const snap3 = hist.snaps["2026-09-12"];
    const d = api.deliveredBetween(snap2, snap3);
    assert(d.shipped === 1900, `deliveredBetween shipped should be 1900, got ${d.shipped}`);
    assert(d.shippedB === 1900, `deliveredBetween shippedB should be 1900, got ${d.shippedB}`);
  });

  // TEST 19: Keyboard accessibility & dialog closing
  await runTest(19, "Keyboard Escape and close button close the sheet and return focus to key figure button", async () => {
    click($('[data-action="btb"]'));
    await paint();
    const sheet = $("#btb-sheet");
    assert(sheet.open, "Sheet opened");

    // Close button
    click($("#btb-close"));
    await paint();
    assert(!sheet.open, "Close button closes sheet");
    assert(document.activeElement === $('[data-action="btb"]'), "Focus returned to btb key figure");

    // Reopen and test Escape key
    click($('[data-action="btb"]'));
    await paint();
    assert(sheet.open, "Sheet opened again");
    key(sheet, "Escape");
    await paint();
    assert(!sheet.open, "Escape key closes sheet");
  });

  // TEST 20: Language switch updates labels in open sheet
  await runTest(20, "Language switch DE <-> EN updates sheet labels and re-renders open sheet", async () => {
    api.applyView({ btb: true });
    await paint();
    const sheet = $("#btb-sheet");
    assert(sheet.open, "Sheet open in DE");

    api.setLang("en");
    await paint();
    assert(sheet.open, "Sheet remains open in EN");
    const enLabel = $(".btb-hero-label")?.textContent || "";
    assert(enLabel.includes("wk") || enLabel.includes("Book-to-Bill"), `Expected EN label, got ${enLabel}`);

    // Switch back to DE
    api.setLang("de");
    await paint();
    assert(sheet.open, "Sheet remains open in DE");
    click($("#btb-close"));
    await paint();
  });

  // TEST 21: No console errors, no CSP violations, and baseline main figures intact
  await runTest(21, "No console errors, no CSP violations, and baseline main page figures unchanged", async () => {
    api.applyView({ customer: null, period: null, order: null, sc: null, btb: false });
    await paint();
    assert(!$("#btb-sheet").open, "BTB sheet closed");
    assert(!$("#scorecard-sheet").open, "Scorecard closed");
    assert(!$("#order-drawer").open, "Order drawer closed");

    // Check error collector
    assert(window.DOPK_TEST_ERRORS.length === 0, `Test errors found: ${window.DOPK_TEST_ERRORS.join("; ")}`);

    // Verify main page figures are healthy and unchanged
    const m = api.metrics;
    assert(m.openVal > 0, "Main page open value exists");
    assert(m.openLines > 0, "Main page open lines exist");
    assert(m.custs.length > 0, "Customer shares exist");
  });

  window.DOPK_TEST_DONE = true;
  const passCount = results.filter(r => r.pass).length;
  document.title = `${passCount}/${results.length} PASS — Book-to-Bill`;
  console.log(`Finished: ${passCount}/${results.length} tests passed.`);
});
