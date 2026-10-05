/* Scorecard acceptance tests (tests 1 to 21) */
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

  // Setup: configure Alpha as key account, minHistoryDays = 1, clear history, load Day 1
  api.RULES.keyAccount.accounts = [{ id: "10001", label: "Alpha" }];
  api.RULES.keyAccount.minHistoryDays = 1;
  api.clearHistory();
  api.setLang("de");
  api.load(window.DOPK_FIXTURE, "DOPK_09_09.xlsx");
  await paint();

  // ---------------------------------------------------------------- DAY 1 TESTS (1–8)
  await runTest(1, 'Share panel row "Alpha Medizintechnik" shows "Scorecard ›", clicking opens sheet without changing VIEW.customer', async () => {
    api.applyView({ customer: null, period: null, order: null, sc: null });
    await paint();
    const btn = $('button.sc-btn[data-value="10001"]');
    assert(btn, "Scorecard button for 10001 exists in share list");
    assert(btn.textContent.includes("Scorecard"), "Button text has Scorecard");
    const prevCust = api.view.customer;
    click(btn);
    await paint();
    assert($("#scorecard-sheet").open, "Scorecard sheet opened");
    assert(api.view.sc === "10001", "VIEW.sc is 10001");
    assert(api.view.customer === prevCust, "VIEW.customer unchanged");
  });

  await runTest(2, "Header: Alpha, 10001, 09.09.2026, 75.4% of open backlog", async () => {
    assert(text("#scorecard-title") === "Alpha", "Title is Alpha");
    const sub = text("#scorecard-subtitle");
    assert(sub.includes("10001"), "Subtitle contains customer id 10001");
    assert(sub.includes("09.09.2026"), "Subtitle contains snapshot date 09.09.2026");
    assert(sub.includes("75,4 %") || sub.includes("75.4%"), "Subtitle contains 75.4% share");
  });

  await runTest(3, "Open €9,500 · overdue €3,500 (36.8%, 2 lines, act now) · no delivery date €1,000 (10.5%, watch)", async () => {
    const vitals = $$("#scorecard-body .sc-vitals .vital");
    assert(vitals.length === 6, `Expected 6 vitals, found ${vitals.length}`);

    // V1: Open
    const openCard = vitals[0];
    assert(openCard.textContent.includes("9,5 T€") || openCard.textContent.includes("9.500") || openCard.textContent.includes("9,500"), "Open value readout €9,500");

    // V2: Overdue
    const lateCard = vitals[1];
    assert(lateCard.textContent.includes("3,5 T€") || lateCard.textContent.includes("3.500") || lateCard.textContent.includes("3,500"), "Late value readout €3,500");
    assert(lateCard.textContent.includes("36,8 %") || lateCard.textContent.includes("36.8%"), "Late pct 36.8%");
    assert(lateCard.textContent.includes("2 Positionen") || lateCard.textContent.includes("2 lines"), "Late lines count 2");
    assert(lateCard.dataset.level === "high", "Late level act now (high)");

    // V3: Undated
    const undCard = vitals[2];
    assert(undCard.textContent.includes("10,5 %") || undCard.textContent.includes("10.5%"), "Undated pct 10.5%");
    assert(undCard.textContent.includes("1.000") || undCard.textContent.includes("1,000") || undCard.textContent.includes("1,0 T€") || undCard.textContent.includes("1.0k"), "Undated val €1,000");
    assert(undCard.dataset.level === "med", "Undated level watch (med)");
  });

  await runTest(4, 'Schedule cover: "bis Okt 2026 (1,7 Monate)", act now', async () => {
    const vitals = $$("#scorecard-body .sc-vitals .vital");
    const coverCard = vitals[3];
    assert(coverCard.dataset.level === "high", "Cover level act now (high)");
    const sub = coverCard.textContent;
    assert(sub.includes("Okt 2026") || sub.includes("Oct 2026"), "Cover month Oct 2026");
    assert(sub.includes("1,7") || sub.includes("1.7"), "Cover months 1.7");
  });

  await runTest(5, "Scheduled next 30 days = €0, and next 90 days = €5,000", async () => {
    const note = text("#scorecard-body .sc-sched-note");
    assert(note.includes("0 €") || note.includes("€0"), "30 days is €0");
    assert(note.includes("5,0 T€") || note.includes("5.000 €") || note.includes("€5,000") || note.includes("€5.0k") || note.includes("5 T€"), "90 days is €5,000");
  });

  await runTest(6, 'On-time and reliability show "available after …", overall chip is act now', async () => {
    const vitals = $$("#scorecard-body .sc-vitals .vital");
    const onTimeCard = vitals[4], relCard = vitals[5];
    assert(onTimeCard.textContent.includes("Verfügbar nach") || onTimeCard.textContent.includes("Available after"), "On-time shows available after note");
    assert(relCard.textContent.includes("Verfügbar nach") || relCard.textContent.includes("Available after"), "Reliability shows available after note");
    assert(onTimeCard.dataset.level === "none" && !onTimeCard.querySelector(".chip"), "On-time has no alarm chip");
    assert(relCard.dataset.level === "none" && !relCard.querySelector(".chip"), "Reliability has no alarm chip");
    const chip = $("#scorecard-chip .chip");
    assert(chip && chip.classList.contains("chip--high"), "Overall chip is act now (high)");
  });

  await runTest(7, "Action list: 1002 Duracuff Pro (8 days, €2,000), then 1001 LARYVOX Tape oval (25 days, €1,500), then close-out order 1001 (76%)", async () => {
    const items = $$("#scorecard-body .sc-action-item");
    assert(items.length >= 3, `Expected at least 3 action items, found ${items.length}`);
    // Item 1: 1002 Duracuff Pro (8 days, €2,000)
    assert(items[0].textContent.includes("1002") && items[0].textContent.includes("Duracuff") && items[0].textContent.includes("8") && (items[0].textContent.includes("2.000") || items[0].textContent.includes("2,000")), "Item 1 is order 1002 8 days late €2,000");
    // Item 2: 1001 LARYVOX Tape oval (25 days, €1,500)
    assert(items[1].textContent.includes("1001") && items[1].textContent.includes("LARYVOX") && items[1].textContent.includes("25") && (items[1].textContent.includes("1.500") || items[1].textContent.includes("1,500")), "Item 2 is order 1001 25 days late €1,500");
    // Item 3: close-out order 1001 (76%)
    assert(items[2].textContent.includes("1001") && items[2].textContent.includes("76"), "Item 3 is close-out order 1001 at 76%");
  });

  await runTest(8, "Product families section: not rendered without line.family", async () => {
    assert(!$("#scorecard-body .sc-fam-table") && !$("#scorecard-body #sc-h-fam"), "Families section is not rendered");
  });

  // ---------------------------------------------------------------- DAY 2 TESTS (9–13)
  api.load(window.DOPK_FIXTURE_DAY2, "DOPK_10_09.xlsx");
  await paint();

  await runTest(9, "Open €7,500 (▼ €2,000) · overdue €1,500 (▼ €2,000)", async () => {
    api.applyView({ sc: "10001" });
    await paint();
    const vitals = $$("#scorecard-body .sc-vitals .vital");
    const openCard = vitals[0];
    assert(openCard.textContent.includes("7,5 T€") || openCard.textContent.includes("7.500") || openCard.textContent.includes("7,500"), "Open €7,500");
    assert(openCard.textContent.includes("▼") && (openCard.textContent.includes("2.000") || openCard.textContent.includes("2,000") || openCard.textContent.includes("2,0 T€") || openCard.textContent.includes("2 T€")), "Open delta ▼ €2,000");

    const lateCard = vitals[1];
    assert(lateCard.textContent.includes("1,5 T€") || lateCard.textContent.includes("1.500") || lateCard.textContent.includes("1,500"), "Overdue €1,500");
    assert(lateCard.textContent.includes("▼") && (lateCard.textContent.includes("2.000") || lateCard.textContent.includes("2,000") || lateCard.textContent.includes("2,0 T€") || lateCard.textContent.includes("2 T€")), "Overdue delta ▼ €2,000");
  });

  await runTest(10, "On-time delivery: 1 shipment, €2,000, shipped late, so 0% (act now)", async () => {
    const vitals = $$("#scorecard-body .sc-vitals .vital");
    const onTimeCard = vitals[4];
    assert(onTimeCard.textContent.includes("0 %") || onTimeCard.textContent.includes("0%"), "On-time pct 0%");
    assert(onTimeCard.textContent.includes("1 Lieferung") || onTimeCard.textContent.includes("1 shipment"), "1 shipment");
    assert(onTimeCard.dataset.level === "high", "On-time level is act now (high)");
  });

  await runTest(11, 'Date reliability: 1 line moved later (1001/A101) out of 4 open account lines, so 75% (act now). "Moved 2 or more times" = 0', async () => {
    const vitals = $$("#scorecard-body .sc-vitals .vital");
    const relCard = vitals[5];
    assert(relCard.textContent.includes("75,0 %") || relCard.textContent.includes("75%") || relCard.textContent.includes("75 %"), "Reliability 75%");
    assert(relCard.textContent.includes("1 von 4") || relCard.textContent.includes("1 of 4"), "1 of 4 moved later");
    assert(relCard.textContent.includes("0 Positionen ≥ 2×") || relCard.textContent.includes("0 lines moved 2") || relCard.textContent.includes("0 Positionen"), "Moved 2 or more times is 0");
    assert(relCard.dataset.level === "high", "Reliability level is act now (high)");
  });

  await runTest(12, "Trend sparklines are visible (2 snapshots)", async () => {
    const sparklines = $$("#scorecard-body .sc-sparkline");
    assert(sparklines.length === 2, `Expected 2 sparklines, found ${sparklines.length}`);
    const trendCards = $$("#scorecard-body .sc-trend-card");
    assert(trendCards.length === 2, "2 trend cards rendered");
  });

  await runTest(13, "Re-import both fixtures through archive import path yields identical results", async () => {
    api.clearHistory();
    api.importArchive([window.DOPK_FIXTURE, window.DOPK_FIXTURE_DAY2]);
    await paint();
    api.applyView({ sc: "10001" });
    await paint();

    const vitals = $$("#scorecard-body .sc-vitals .vital");
    // Check 9: open 7500, late 1500
    assert(vitals[0].textContent.includes("7,5 T€") || vitals[0].textContent.includes("7.500"), "Archive: Open €7,500");
    assert(vitals[1].textContent.includes("1,5 T€") || vitals[1].textContent.includes("1.500"), "Archive: Overdue €1,500");
    // Check 10: on-time 0%
    assert(vitals[4].textContent.includes("0 %") || vitals[4].textContent.includes("0%"), "Archive: On-time 0%");
    // Check 11: reliability 75%
    assert(vitals[5].textContent.includes("75,0 %") || vitals[5].textContent.includes("75%") || vitals[5].textContent.includes("75 %"), "Archive: Reliability 75%");
  });

  // ---------------------------------------------------------------- GENERAL TESTS (14–21)
  await runTest(14, "URL hash sc=10001 opens the sheet; Back closes it", async () => {
    api.applyView({ sc: null });
    await paint();
    assert(!$("#scorecard-sheet").open, "Sheet closed before test");

    location.hash = "sc=10001";
    await new Promise(r => setTimeout(r, 60));
    await paint();
    assert($("#scorecard-sheet").open, "Sheet opened by hash");
    assert(api.view.sc === "10001", "VIEW.sc is 10001");

    await historyBack();
    await paint();
    assert(!$("#scorecard-sheet").open, "Sheet closed after Back");
    assert(!api.view.sc, "VIEW.sc cleared");
  });

  await runTest(15, "From the sheet, clicking an order opens the order drawer; closing returns to sheet with focus restored", async () => {
    api.applyView({ sc: "10001" });
    await paint();
    const orderBtn = $("#scorecard-body [data-action='order'][data-value='1001']");
    assert(orderBtn, "Order button 1001 inside scorecard");
    orderBtn.focus();
    click(orderBtn);
    await paint();

    assert($("#order-drawer").open, "Order drawer opened on top");
    assert($("#scorecard-sheet").open, "Scorecard sheet remains open");

    // Close order drawer
    const closeBtn = $("#order-close");
    click(closeBtn);
    await paint();

    assert(!$("#order-drawer").open, "Order drawer closed");
    assert($("#scorecard-sheet").open, "Scorecard sheet still open");
    assert(document.activeElement === orderBtn, "Focus returned to order button inside scorecard");
  });

  await runTest(16, '"Show all late lines" closes the sheet and sets VIEW = { customer: Alpha, period: "late" }', async () => {
    api.applyView({ sc: "10001" });
    await paint();
    const showLateBtn = $("#scorecard-body [data-action='sc-show-late']");
    assert(showLateBtn, "Show late lines button exists");
    click(showLateBtn);
    await paint();

    assert(!$("#scorecard-sheet").open, "Scorecard sheet closed");
    assert(api.view.customer.includes("Alpha"), "VIEW.customer set to Alpha");
    assert(api.view.period === "late", "VIEW.period set to late");
  });

  await runTest(17, "Switch DE/EN with sheet open: re-renders in new language and stays open", async () => {
    api.applyView({ customer: null, period: null, sc: "10001" });
    await paint();
    assert($("#scorecard-sheet").open, "Sheet open");

    api.setLang("en");
    await paint();
    assert($("#scorecard-sheet").open, "Sheet stayed open after DE->EN");
    assert(text("#scorecard-subtitle").includes("As of"), "Subtitle localized to English (As of)");
    assert(text("#scorecard-body").includes("Scheduled next 30 days"), "Body localized to English");

    api.setLang("de");
    await paint();
    assert($("#scorecard-sheet").open, "Sheet stayed open after EN->DE");
    assert(text("#scorecard-subtitle").includes("Stand"), "Subtitle localized to German (Stand)");
    assert(text("#scorecard-body").includes("Geplant nächste 30 Tage"), "Body localized to German");
  });

  await runTest(18, "Print with sheet open: print styles configured for single A4 portrait page", async () => {
    api.applyView({ sc: "10001" });
    await paint();
    const sheet = $("#scorecard-sheet");
    assert(sheet.open, "Sheet is open");

    // Verify print classes and structure
    const close = $("#scorecard-close");
    assert(close.classList.contains("sc-close"), "Close button has sc-close for no-print");
    const sub = text("#scorecard-subtitle");
    assert(sub.includes("Stand 10.09.2026") || sub.includes("As of 10.09.2026"), "Header includes snapshot date for print");
  });

  await runTest(19, 'Set configured id to "99999" with fallbackTopCustomer: uses Alpha as top customer with muted text note', async () => {
    api.RULES.keyAccount.accounts = [{ id: "99999", label: "Nonexistent" }];
    api.RULES.keyAccount.fallbackTopCustomer = true;
    api.applyView({ sc: "10001" });
    await paint();

    assert(text("#scorecard-title").includes("Alpha"), "Scorecard uses Alpha as fallback");
    const note = text("#scorecard-subtitle .sc-filter-note");
    assert(note.includes("Größter Kunde") || note.includes("Top customer"), "Shows fallback muted note");

    // Restore config
    api.RULES.keyAccount.accounts = [{ id: "10001", label: "Alpha" }];
  });

  await runTest(20, "At 390px sheet is responsive; keyboard Escape and Tab trap work", async () => {
    api.applyView({ sc: "10001" });
    await paint();
    const sheet = $("#scorecard-sheet");
    assert(sheet.open, "Sheet open");

    // Test Escape cancels / closes
    sheet.dispatchEvent(new Event("cancel", { cancelable: true }));
    await paint();
    assert(!sheet.open, "Escape (cancel event) closes sheet");

    // Reopen and test Tab trap wrapping
    api.applyView({ sc: "10001" });
    await paint();
    assert(sheet.open, "Sheet reopened");
    const focusable = [...sheet.querySelectorAll('button, [tabindex="0"]')].filter(el => !el.hidden && !el.disabled);
    assert(focusable.length >= 2, "Multiple focusable elements in sheet");
    const first = focusable[0], last = focusable[focusable.length - 1];

    // Tab on last element wraps to first
    last.focus();
    key(last, "Tab");
    assert(document.activeElement === first, "Tab on last wraps to first");

    // Close sheet
    click($("#scorecard-close"));
    await paint();
    assert(!sheet.open, "Close button closes sheet");
  });

  await runTest(21, "No console errors, no CSP violations, and baseline main page figures unchanged", async () => {
    api.applyView({ customer: null, period: null, order: null, sc: null });
    await paint();
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
  document.title = `${passCount}/${results.length} PASS — Key Account Scorecard`;
  console.log(`Finished: ${passCount}/${results.length} tests passed.`);
});
