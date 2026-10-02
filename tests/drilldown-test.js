/* Run with a static server. Fixture enters loadAoa -> parseRows -> render. */
document.addEventListener("DOMContentLoaded", async function () {
  "use strict";
  const $ = s => document.querySelector(s);
  const api = window.DOPK_TEST;
  const alpha = "Alpha Medizintechnik GmbH", gamma = "Gamma Sanitätshaus";
  const saved = JSON.parse(sessionStorage.getItem("dopk.test.resume") || "null");
  let results = saved?.results || [];
  window.DOPK_TEST_RESULTS = results;
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const near = (a, b) => Math.abs(a - b) < .01;
  const m = () => api.metrics;
  const text = s => $(s).textContent;
  const customer = name => [...document.querySelectorAll('#share-list [data-action="customer"]')].find(el => el.dataset.value === name);
  const click = el => { assert(el, "Missing click target"); el.dispatchEvent(new MouseEvent("click", { bubbles: true })); };
  const reset = () => api.applyView({ customer: null, period: null, order: null });
  const key = (el, k) => { el.focus(); el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true })); };
  const paint = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  function show() {
    $("#test-results").replaceChildren(...results.map(r => { const li = document.createElement("li"); li.textContent = `${r.pass ? "PASS" : "FAIL"} ${r.id}: ${r.title}${r.detail ? " — " + r.detail : ""}`; return li; }));
  }
  async function test(id, title, check) {
    try { await check(); results.push({ id, title, pass: true }); }
    catch (e) { results.push({ id, title, pass: false, detail: e.message }); }
    show();
  }
  const historyBack = () => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Back navigation timed out")), 2000);
    window.addEventListener("popstate", () => { clearTimeout(timer); requestAnimationFrame(resolve); }, { once: true });
    history.back();
  });
  if (!saved) {
    api.setLang("en"); reset();
    await test(1, "Customer filter, breadcrumb and chart context", () => {
      click(customer(alpha));
      assert(near(m().openVal, 9500) && m().openLines === 5 && m().openOrders === 3, "Alpha backlog");
      assert(near(m().lateVal, 3500) && near(m().latePct, 3500 / 9500 * 100), "Alpha overdue");
      assert(text("#breadcrumb").includes("Alpha Medizintechnik×"), "Alpha chip");
      assert($("#share-list").children.length === 4 && customer(alpha).getAttribute("aria-pressed") === "true", "Share context/selection");
      assert($("#horizon [data-value='2026-10']").getAttribute("aria-label").includes("5,000"), "Alpha October horizon");
      assert(!$(".drill-hint"), "Hint did not dismiss");
    });
    await test(2, "Customer plus October period", () => {
      click($("#horizon [data-value='2026-10']"));
      assert(text("#late-title") === "Lines due in Oct 2026" && text("#late-days") === "Due in", "Period title/column");
      const rows = [...$("#late-body").rows];
      assert(rows.length === 2 && rows[0].cells[0].textContent === "1001" && rows[1].cells[0].textContent === "1002", "October orders");
      assert(rows[0].textContent.includes("4,000") && rows[1].textContent.includes("1,000"), "October values");
      assert($("#horizon").querySelectorAll('[data-action="period"]').length === 6 && $("#horizon [data-value='2026-10']").getAttribute("aria-pressed") === "true", "Horizon context");
    });
    await test(3, "Late drill-down retains today's shipment KPI", () => {
      reset(); click($("#horizon [data-value='late']"));
      const rows = [...$("#late-body").rows];
      assert(rows.length === 2 && rows[0].cells[0].textContent === "1002" && rows[0].cells[4].textContent === "8 d" && rows[1].cells[0].textContent === "1001" && rows[1].cells[4].textContent === "25 d", "Late sort/days");
      assert(customer(alpha).textContent.includes("100.0%"), "Late concentration");
      assert(m().shippedVal === 800 && text('#vitals [data-kind="shipped"]').includes("800"), "Shipment period isolation");
      assert(m().intakeVal === 600, "Intake period isolation");
    });
    await test(4, "Undated KPI and order age", () => {
      click($("#vitals [data-kind='undated']"));
      assert(api.view.period === "undated" && text("#late-title") === "Lines without delivery date" && text("#late-days") === "Order age", "Undated view");
      assert(text("#late-body").includes("1003") && text("#late-body").includes("181 d") && m().openVal === 1000, "Undated order/age/value");
    });
    await test(5, "Order drawer details, Escape and restored focus", () => {
      reset(); const origin = $("#late-body [data-value='1001']"); origin.focus(); click(origin);
      assert($("#order-drawer").open && $("#order-lines tbody").rows.length === 2, "Drawer lines");
      assert(text("#order-summary").includes("76%") && text("#order-summary").includes("5,500") && text("#order-summary").includes("1 late line"), "Drawer header totals");
      assert(location.hash.includes("o=1001") && document.body.style.overflow === "hidden", "Drawer URL/scroll lock");
      // Native Escape produces a cancel event; the browser harness also sends a real key.
      $("#order-drawer").dispatchEvent(new Event("cancel", { cancelable: true }));
      assert(!$("#order-drawer").open && document.activeElement === origin && document.body.style.overflow !== "hidden", "Close/focus restoration");
    });
    await test(6, "Price exception inline lines and order link", () => {
      click($("#watch [data-value='price']"));
      const detail = $("#watch-price");
      assert(!detail.hidden && detail.textContent.includes("B100") && detail.textContent.includes("Delta Klinik") && detail.textContent.includes("1.88") && detail.textContent.includes("4.00"), "Price comparison");
      assert(detail.querySelector('[data-action="order"][data-value="1006"]'), "Clickable exception order");
      click($("#watch [data-value='zero']"));
      assert($("#watch-price").hidden && !$("#watch-zero").hidden, "Only one exception expanded");
    });
    reset(); click(customer(gamma));
    sessionStorage.setItem("dopk.test.resume", JSON.stringify({ results, hash: location.hash }));
    location.reload(); return;
  }
  sessionStorage.removeItem("dopk.test.resume"); show();
  await test(7, "Umlaut URL survives real page reload and fixture loading", () => {
    assert(api.view.customer === gamma && location.hash === saved.hash && location.hash.includes("%C3%A4"), "Gamma hash reload");
    assert(m().openVal === 2510 && $("#filter").value === gamma, "Restored Gamma metrics/select");
  });
  api.setLang("en");
  await test(8, "Browser Back reverses drill-down levels", async () => {
    reset(); click(customer(alpha)); click($("#horizon [data-value='2026-10']"));
    await historyBack(); assert(api.view.customer === alpha && api.view.period === null, "First Back");
    await historyBack(); assert(api.view.customer === null && api.view.period === null, "Second Back");
  });
  await test(9, "Language changes preserve filters and localise figures", () => {
    click(customer(alpha)); api.setLang("de");
    assert(api.view.customer === alpha && text('#vitals [data-kind="open"] .vital-value') === "9,5 T€", "German backlog/view");
    click($("#horizon [data-value='2026-10']"));
    assert(text("#late-title") === "Positionen fällig im Okt 2026", "German month");
    api.setLang("en");
    assert(api.view.customer === alpha && api.view.period === "2026-10" && text("#late-title") === "Lines due in Oct 2026", "English month/view");
    assert($("#horizon [data-value='2026-10']").getAttribute("aria-label").includes("Oct 2026"), "English accessible label");
  });
  await test(10, "CSV matches customer plus period", () => {
    const result = api.buildViewCsv();
    assert(result.lines.length === 2 && result.lines[0].order === 1001 && result.lines[1].order === 1002 && result.csv.split("\r\n").length === 3, "CSV rows");
    assert(result.name.includes("2026-10") && result.name.includes("Alpha_Medizintechnik"), "CSV filename");
  });
  await test(11, "Keyboard targets and focus trap", () => {
    reset(); key($("#horizon [data-value='late']"), "Enter"); assert(api.view.period === "late", "Horizon Enter");
    key(customer(alpha), " "); assert(api.view.customer === alpha, "Customer Space");
    const origin = $("#late-body [data-value='1001']");
    assert(origin.tagName === "BUTTON" && origin.tabIndex === 0, "Native order button"); origin.focus(); origin.click();
    assert(document.activeElement === $("#order-close"), "Drawer initial focus");
    const last = $(".drawer-table"); last.focus(); key(last, "Tab");
    assert(document.activeElement === $("#order-close"), "Focus trap wraps forward");
    $("#order-close").click(); assert(!$("#order-drawer").open, "Native close button");
  });
  await test(12, "Drawer responsive size and horizontal containment", async () => {
    reset(); click($("#late-body [data-value='1001']")); await paint();
    await Promise.all($("#order-drawer").getAnimations().map(a => a.finished));
    const rect = $("#order-drawer").getBoundingClientRect();
    if (innerWidth <= 860) assert(Math.abs(rect.width - innerWidth) < 1 && rect.left === 0 && Math.abs(rect.height - innerHeight) < 1, "Full-screen sheet");
    else assert(Math.abs(rect.width - 440) < 1, "440px desktop drawer");
    assert($("#order-drawer").scrollWidth <= rect.width + 1, "Drawer horizontal overflow");
    $("#order-close").click();
    assert(document.documentElement.scrollWidth <= innerWidth, "Page horizontal overflow");
  });
  await test(13, "Baseline totals, horizon, shares and no runtime/CSP errors", () => {
    reset(); const b = m();
    assert(near(b.openVal, 12597.5) && b.openLines === 11 && b.openOrders === 9, "Open baseline");
    assert(b.lateVal === 3500 && b.late.length === 2 && near(b.latePct, 3500 / 12597.5 * 100), "Overdue baseline");
    assert(b.shippedVal === 800 && b.notes === 2 && b.onTimePct === 50, "Shipped baseline");
    assert(b.intakeVal === 600 && b.intakeOrders === 2 && b.intakeCusts === 2, "Intake baseline");
    assert(b.undatedVal === 1000 && b.undated.length === 1, "Undated baseline");
    assert(JSON.stringify(b.months.map(x => [x.val, x.n])) === JSON.stringify([[0, 1], [6500, 3], [997.5, 3], [600, 1]]), "Horizon baseline");
    assert(JSON.stringify(b.custs.map(x => x.val)) === JSON.stringify([9500, 2510, 400, 187.5]), "Shares baseline");
    assert(window.DOPK_TEST_ERRORS.length === 0, window.DOPK_TEST_ERRORS.join("; "));
  });
  window.DOPK_TEST_DONE = true;
  document.title = `${results.filter(r => r.pass).length}/${results.length} PASS — DOPK drill-down`;
});
