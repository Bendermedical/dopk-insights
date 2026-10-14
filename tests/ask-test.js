/* Search field (phase 1) acceptance tests. Questions go through the real form; the fixture with
   Sofortbedarf (09.09.2026) and the mapping fixture are loaded through the normal paths. */
document.addEventListener("DOMContentLoaded", async function () {
  "use strict";
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const api = window.DOPK_TEST;
  const results = [];
  window.DOPK_TEST_RESULTS = results;
  const assert = (c, msg) => { if (!c) throw new Error(msg); };
  const text = s => ($(s)?.textContent || "").replace(/\s+/g, " ").trim();
  const paint = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const click = el => { assert(el, "Missing click target"); el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })); };
  function show() {
    $("#test-results").replaceChildren(...results.map(r => { const li = document.createElement("li"); li.textContent = `${r.pass ? "PASS" : "FAIL"} ${r.id}: ${r.title}${r.detail ? " — " + r.detail : ""}`; return li; }));
  }
  async function test(id, title, fn) {
    try { await fn(); results.push({ id, title, pass: true }); }
    catch (e) { console.error(`Test ${id} failed:`, e); results.push({ id, title, pass: false, detail: e.message }); }
    show();
  }
  // Type the question into the real field and submit the form, as a person would.
  const ask = async q => { const input = $("#ask-input"); input.value = q; $("#ask-form").requestSubmit(); await paint(); return text("#ask-answer .ask-text"); };
  const reset = () => api.applyView({ customer: null, period: null, order: null, sc: null, btb: false, family: null, model: null, size: null, variant: null, lateMonth: null, chg: false });
  const expectAnswer = (got, want) => assert(got === want, `Answer\n  got:  ${got}\n  want: ${want}`);

  Object.keys(sessionStorage).filter(k => k.startsWith("dopk.test.")).forEach(k => sessionStorage.removeItem(k));
  api.RULES.keyAccount.accounts = [{ id: "10001", label: "Alpha" }];
  api.setLang("de"); api.clearHistory();
  api.load(window.DOPK_FIXTURE_SOFORT, "DOPK_09_09.xlsx");
  await api.loadFamiliesFile(new File([window.DOPK_FAMILIES_CSV], "families-fixture.csv"));
  reset(); await paint();

  await test(1, "„überfällig Laryvox“ opens the late lines of Laryvox and answers with value, lines, oldest delay and largest item", async () => {
    const got = await ask("überfällig Laryvox");
    assert(api.view.period === "late" && api.view.family === "Laryvox" && !$("#ask-answer").hidden, `View ${JSON.stringify(api.view)}`);
    expectAnswer(got, "Überfällig (Laryvox): 1,5 T€ in 1 Position aus 1 Auftrag, ältester Verzug 25 Tage. Größter Posten: Auftrag 1001 (Alpha Medizintechnik), 1,5 T€.");
    assert($("#ask-answer").dataset.kind === "info", "Answer uses the information banner");
  });

  await test(2, "Follow-up „und Duracuff Pro?“ keeps the question type", async () => {
    const got = await ask("und Duracuff Pro?");
    assert(api.view.period === "late" && api.view.family === "Duracuff Pro", `View ${JSON.stringify(api.view)}`);
    expectAnswer(got, "Überfällig (Duracuff Pro): 2,0 T€ in 1 Position aus 1 Auftrag, ältester Verzug 8 Tage. Größter Posten: Auftrag 1002 (Alpha Medizintechnik), 2,0 T€.");
  });

  await test(3, "„Sofortbedarf Alpha“ filters the customer and answers with quantity, waiting days and oldest order", async () => {
    const got = await ask("Sofortbedarf Alpha");
    assert(api.view.period === "undated" && api.view.customer === "Alpha Medizintechnik GmbH" && api.view.family === null, `View ${JSON.stringify(api.view)}`);
    expectAnswer(got, "Sofortbedarf (Alpha Medizintechnik): 2,5 T€ in 2 Positionen (550 Stk), Ø 84 Tage Wartezeit, ältester Auftrag vom 12.03.2026.");
  });

  await test(4, "„Sofortbedarf nach Kunde“ groups the Sofortbedarf view by customer", async () => {
    const got = await ask("Sofortbedarf nach Kunde");
    assert(api.view.period === "undated" && api.view.customer === null && text("#late-title") === "Sofortbedarf nach Kunde", `Title ${text("#late-title")}`);
    expectAnswer(got, "Sofortbedarf: 2,7 T€ in 3 Positionen (560 Stk), Ø 79 Tage Wartezeit, ältester Auftrag vom 12.03.2026.");
  });

  await test(5, "„überfällig nach Monat“ opens the overdue matrix", async () => {
    const got = await ask("überfällig nach Monat");
    assert(api.view.period === "late" && !$("#late-matrix").hidden, "Matrix shown");
    expectAnswer(got, "Überfällig: 3,5 T€ in 2 Positionen aus 2 Aufträgen, ältester Verzug 25 Tage. Größter Posten: Auftrag 1002 (Alpha Medizintechnik), 2,0 T€.");
    click($('#late-tools [data-action="late-tab"][data-value="list"]')); await paint();
  });

  await test(6, "„fällig im Oktober“ opens October 2026", async () => {
    const got = await ask("fällig im Oktober");
    assert(api.view.period === "2026-10", `Period ${api.view.period}`);
    expectAnswer(got, "Fällig im Okt 2026: 6,5 T€ in 3 Positionen.");
  });

  await test(7, "„Auftrag 1001“ opens the order drawer; the answer stays after closing it", async () => {
    const got = await ask("Auftrag 1001");
    assert($("#order-drawer").open && api.view.order === "1001", "Drawer open");
    expectAnswer(got, "Auftrag 1001 (Alpha Medizintechnik): 5,5 T€ offen in 2 Positionen, davon 1 überfällig, 76 % geliefert.");
    api.applyView({ order: null }); await paint();
    assert(!$("#order-drawer").open && !$("#ask-answer").hidden, "Answer still shown after the drawer closed");
  });

  await test(8, "„größte Produktfamilie“ opens the families tab", async () => {
    const got = await ask("größte Produktfamilie");
    assert(!$("#share-fam").hidden, "Families tab shown");
    expectAnswer(got, "Größte Produktfamilie: Laryvox mit 7,6 T€ (53 % des offenen Werts), davon 20 % überfällig.");
  });

  await test(9, "„PDT“ sets the PDT filter", async () => {
    const got = await ask("PDT");
    assert(api.view.variant === "pdt", "PDT filter");
    expectAnswer(got, "Offener Bestand (PDT): 1,0 T€ in 1 Position aus 1 Auftrag, davon 0 € überfällig und 0 € Sofortbedarf.");
  });

  await test(10, "Spelling without umlauts and in capitals works: „UEBERFAELLIG laryvox“", async () => {
    await ask("UEBERFAELLIG laryvox");
    assert(api.view.period === "late" && api.view.family === "Laryvox", `View ${JSON.stringify(api.view)}`);
  });

  await test(11, "An unknown question offers example questions built from the file; clicking one asks it", async () => {
    reset(); await paint();
    const before = JSON.stringify(api.view);
    const got = await ask("Wie wird das Wetter morgen?");
    assert(got === "Diese Frage kann ich nicht beantworten. Versuchen Sie zum Beispiel:" && JSON.stringify(api.view) === before, "Unknown: no view change");
    const examples = $$("#ask-answer [data-action='ask']").map(b => b.dataset.value);
    assert(examples.includes("überfällig Duracuff Pro") && examples.includes("Sofortbedarf Alpha") && examples.includes("Auftrag 1002") && examples.includes("fällig im Okt"), `Examples ${examples}`);
    click($$("#ask-answer [data-action='ask']").find(b => b.dataset.value === "fällig im Okt")); await paint();
    assert(api.view.period === "2026-10" && $("#ask-input").value === "fällig im Okt", "Example asked");
  });

  await test(12, "Changing the view by hand closes the answer", async () => {
    await ask("Sofortbedarf Alpha");
    assert(!$("#ask-answer").hidden, "Answer shown");
    api.applyView({ customer: null }); await paint();
    assert($("#ask-answer").hidden && !api.askState, "Answer closed after a manual filter change");
    click($("#notice [data-action='dismiss-notice']")); await paint();
    assert($("#notice").hidden && ["#ask-answer", "#notice"].every(s => getComputedStyle($(s)).display === "none"), "Hidden banners are really invisible");
  });

  await test(13, "Switching DE → EN re-words the open answer; English questions work", async () => {
    await ask("Sofortbedarf Alpha");
    api.setLang("en"); await paint();
    expectAnswer(text("#ask-answer .ask-text"), "Immediate demand (Alpha Medizintechnik): €2.5k in 2 lines (550 pcs), waiting 84 days on average, oldest order from 12/03/2026.");
    const got = await ask("overdue by month");
    assert(api.view.period === "late" && !$("#late-matrix").hidden, "English matrix question");
    assert(got.startsWith("Overdue: €3.5k in 2 lines from 2 orders"), got);
    click($('#late-tools [data-action="late-tab"][data-value="list"]'));
    api.setLang("de"); await paint();
  });

  await test(14, "Help, outlook, scorecard and phase-out questions", async () => {
    let got = await ask("Hilfe");
    assert(got.startsWith("Fragen Sie nach Überfälligem") && $$("#ask-answer [data-action='ask']").length >= 4, "Help");
    got = await ask("Umsatz");
    assert(got.startsWith("Nächste 30 Tage: voraussichtlich") && got.includes("Monatslandung Sep:"), got);
    got = await ask("Scorecard");
    assert($("#scorecard-sheet").open && got === "Scorecard Alpha: 11 T€ offen, davon 3,5 T€ überfällig.", got);
    api.applyView({ sc: null }); await paint();
    got = await ask("Auslauf");
    expectAnswer(got, "1 offene Position auf Auslauf-/Raus-Artikeln (1,5 T€).");
    assert(!$("#watch-phaseout").hidden, "Watchlist item expanded");
  });

  await test(15, "„was ist neu“ and „Book-to-Bill“ after three uploads", async () => {
    api.clearHistory();
    for (const [rows, name] of [[window.DOPK_FIXTURE, "DOPK_09_09.xlsx"], [window.DOPK_FIXTURE_DAY2, "DOPK_10_09.xlsx"], [window.DOPK_FIXTURE_DAY3, "DOPK_12_09.xlsx"]]) { api.load(rows, name); await paint(); }
    reset(); await paint();
    let got = await ask("was ist neu");
    assert($("#changes-sheet").open, "Changes sheet open");
    expectAnswer(got, "Seit 10.09.2026: 0 neu überfällig (0 €), 1 neuer Auftrag (1,0 T€), 0 Termine nach hinten verschoben, 0 mit neuem Sofortbedarf, 1,9 T€ geliefert.");
    api.applyView({ chg: false }); await paint();
    got = await ask("Book-to-Bill");
    assert($("#btb-sheet").open && got.startsWith("Auftragseingang seit 10.09.2026: 1,0 T€."), got);
    api.applyView({ btb: false }); await paint();
  });

  await test(16, "Keyboard: Enter asks, Escape clears the field and the answer", async () => {
    reset(); await paint();
    const input = $("#ask-input");
    input.focus(); input.value = "Sofortbedarf";
    $("#ask-form").requestSubmit(); await paint();
    assert(!$("#ask-answer").hidden && api.view.period === "undated", "Submitted");
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })); await paint();
    assert(input.value === "" && $("#ask-answer").hidden, "Escape cleared");
    assert($("#ask-form").getAttribute("role") === "search" && $("label[for='ask-input']"), "Labelled search landmark");
  });

  await test(17, "No page-level horizontal scroll with an answer open; no console errors or CSP violations", async () => {
    await ask("überfällig Laryvox");
    assert(document.documentElement.scrollWidth <= innerWidth + 1, `Page scrolls: ${document.documentElement.scrollWidth} > ${innerWidth}`);
    assert(window.DOPK_TEST_ERRORS.length === 0, window.DOPK_TEST_ERRORS.join("; "));
  });

  window.DOPK_TEST_DONE = true;
  document.title = `${results.filter(r => r.pass).length}/${results.length} PASS — DOPK search field`;
});
