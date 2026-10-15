/* AI assistant (phase 2) acceptance tests. A scripted stand-in replaces the server function, so the full
   loop runs offline: the page sends the conversation, the stand-in answers like Claude would (tool calls,
   then text), and every outgoing message is checked for what may and may not leave the browser. */

// Must be set before the dashboard initialises (it runs on DOMContentLoaded).
window.ASSIST_SCRIPT = null;          // (messages) => response, set per test
window.ASSIST_SENT = [];              // every conversation the page sent
window.DOPK_ASSISTANT_TRANSPORT = async messages => {
  const copy = JSON.parse(JSON.stringify(messages));
  window.ASSIST_SENT.push(copy);
  await new Promise(r => setTimeout(r, 10));
  return window.ASSIST_SCRIPT(copy);
};

document.addEventListener("DOMContentLoaded", async function () {
  "use strict";
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const api = window.DOPK_TEST;
  const results = [];
  window.DOPK_TEST_RESULTS = results;
  const assert = (c, msg) => { if (!c) throw new Error(msg); };
  // visible text only: screen-reader labels ("Frage:", "Antwort:") are left out
  const text = s => { const el = $(s); if (!el) return ""; const c = el.cloneNode(true); c.querySelectorAll(".sr-only").forEach(x => x.remove()); return c.textContent.replace(/\s+/g, " ").trim(); };
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
  const REAL_NAMES = ["Alpha", "Gamma", "Beta Care", "Delta", "10001", "10002", "10003", "10004"];
  const leaks = obj => REAL_NAMES.filter(n => JSON.stringify(obj).includes(n));
  const lastUser = msgs => msgs[msgs.length - 1];
  const reply = (content, stop_reason = "end_turn") => ({ content, stop_reason, stop_details: null, model: "claude-opus-5-5" });
  const say = t => reply([{ type: "thinking", thinking: "", signature: "sig-final" }, { type: "text", text: t }]);
  const toolResults = msgs => lastUser(msgs).content.filter(b => b.type === "tool_result");
  const ask = async q => { const input = $("#ask-input"); input.value = q; $("#ask-form").requestSubmit(); await api.assistant.busy === false; for (let i = 0; i < 100 && api.assistant.busy; i++) await new Promise(r => setTimeout(r, 20)); await paint(); };
  const followUp = async q => { $("#asst-input").value = q; $("#asst-form").requestSubmit(); for (let i = 0; i < 100 && api.assistant.busy; i++) await new Promise(r => setTimeout(r, 20)); await paint(); };
  const reset = () => api.applyView({ customer: null, period: null, order: null, sc: null, btb: false, family: null, model: null, size: null, variant: null, lateMonth: null, chg: false, page: "overview" });

  Object.keys(sessionStorage).filter(k => k.startsWith("dopk.test.")).forEach(k => sessionStorage.removeItem(k));
  api.RULES.keyAccount.accounts = [{ id: "10001", label: "Alpha" }];
  api.setLang("de"); api.clearHistory();
  api.load(window.DOPK_FIXTURE_SOFORT, "DOPK_09_09.xlsx");
  await api.loadFamiliesFile(new File([window.DOPK_FAMILIES_CSV], "families-fixture.csv"));
  reset(); await paint();

  await test(1, "Assistant is available; the search field asks the assistant", async () => {
    assert(api.assistant.available && $("#ask-input").placeholder === "Frage an den Assistenten …", "Available with assistant placeholder");
    assert($("#assistant").hidden, "Panel hidden until the first question");
  });

  await test(2, "„Was ist bei Alpha überfällig?“: pseudonymised question, parallel tools run locally, answer with the real name, view opened", async () => {
    window.ASSIST_SENT = [];
    window.ASSIST_SCRIPT = msgs => {
      if (msgs.length === 1) return reply([{ type: "thinking", thinking: "", signature: "sig-1" },
        { type: "tool_use", id: "t1", name: "get_overdue", input: { filters: { customer: "Kunde A" }, group_by: "family" } },
        { type: "tool_use", id: "t2", name: "open_view", input: { page: "late", customer: "Kunde A" } }], "tool_use");
      const [r1, r2] = toolResults(msgs), od = JSON.parse(r1.content);
      return say(`Bei Kunde A sind ${od.overdue_eur} € überfällig, ${od.lines} Positionen.\n- Duracuff Pro: 2,0 T€\n- Laryvox: **1,5 T€**`);
    };
    await ask("Was ist bei Alpha überfällig?");
    const first = window.ASSIST_SENT[0][0].content[0].text;
    assert(first === "[Stand 2026-09-09 · Sprache de]\nWas ist bei Kunde A überfällig?", `Question sent: ${first}`);
    const second = window.ASSIST_SENT[1];
    assert(second.length === 3 && second[1].role === "assistant" && second[1].content[0].signature === "sig-1", "Assistant turn echoed back unchanged (thinking block kept)");
    const res = toolResults(second);
    assert(res.length === 2 && second[2].content.length === 2 && res[0].tool_use_id === "t1" && res[1].tool_use_id === "t2", "Both results in one user message");
    const od = JSON.parse(res[0].content);
    assert(od.overdue_eur === 3500 && od.lines === 2 && od.orders === 2 && od.oldest_days_late === 25, `Overdue result ${res[0].content}`);
    assert(JSON.stringify(od.groups) === JSON.stringify([{ family: "Duracuff Pro", value_eur: 2000, lines: 1, quantity: 40 }, { family: "Laryvox", value_eur: 1500, lines: 1, quantity: 50 }]), `Groups ${JSON.stringify(od.groups)}`);
    assert(od.largest_lines.every(l => !("value_eur" in l) && !("unit" in l) && !("price" in l)), "No line values or prices");
    assert(!leaks(window.ASSIST_SENT).length, `Real names left the browser: ${leaks(window.ASSIST_SENT)}`);
    assert(api.view.page === "late" && api.view.customer === "Alpha Medizintechnik GmbH", "open_view filtered the dashboard");
    assert(!$("#assistant").hidden && text("#asst-log .asst-q") === "Was ist bei Alpha überfällig?", "Panel shows the real question");
    const a = $("#asst-log .asst-a");
    assert(text("#asst-log .asst-a").includes("Bei Alpha Medizintechnik sind 3500 € überfällig") && a.querySelectorAll("li").length === 2 && a.querySelector("strong")?.textContent === "1,5 T€", `Answer ${a.innerHTML}`);
    assert(text("#asst-log .asst-view") === "Ansicht geöffnet: Überfällig · Alpha Medizintechnik", text("#asst-log .asst-view"));
    assert($("#ask-input").value === "" && $("#ask-answer").hidden, "Field cleared, no phase-1 banner");
  });

  await test(3, "Follow-up in the panel continues the same conversation", async () => {
    window.ASSIST_SENT = [];
    window.ASSIST_SCRIPT = msgs => {
      if (lastUser(msgs).content[0].type === "text") return reply([{ type: "tool_use", id: "t3", name: "get_immediate_demand", input: { filters: { customer: "Kunde A" }, group_by: "family" } }], "tool_use");
      const im = JSON.parse(toolResults(msgs)[0].content);
      return say(`Kunde A: ${im.value_eur} € Sofortbedarf, Ø ${im.avg_wait_days_value_weighted} Tage.`);
    };
    await followUp("und der Sofortbedarf?");
    const sent = window.ASSIST_SENT[0];
    assert(sent.length === 5 && sent[4].content[0].text === "[Sprache de]\nund der Sofortbedarf?", `History ${sent.length}: ${sent[4]?.content[0]?.text}`);
    const im = JSON.parse(toolResults(window.ASSIST_SENT[1])[0].content);
    assert(im.value_eur === 2500 && im.avg_wait_days_value_weighted === 84 && im.oldest_lines_first[0].order === "1003", `Immediate ${JSON.stringify(im)}`);
    assert($$("#asst-log .asst-turn").length === 2 && text("#asst-log .asst-turn:last-child .asst-a") === "Alpha Medizintechnik: 2500 € Sofortbedarf, Ø 84 Tage.", "Second answer");
    assert(api.assistant.conv.length === 8, `Conversation length ${api.assistant.conv.length}`);
  });

  await test(4, "Every tool runs locally, returns JSON aggregates and no real customer names", async () => {
    const run = (n, i) => { const out = api.runAssistantTool(n, i); JSON.stringify(out); assert(!leaks(out).length, `${n} leaks ${leaks(out)}`); return out; };
    const ov = run("get_overview", {});
    assert(ov.open_eur === 14298 && ov.immediate_demand.value_eur === 2700 && ov.largest_customers[0].customer === "Kunde A" && ov.largest_customers[0].share_pct === 76.9, `Overview ${JSON.stringify(ov).slice(0, 200)}`);
    const due = run("get_due_month", { month: "2026-10" });
    assert(due.value_eur === 6500 && due.lines === 3, `Due ${JSON.stringify(due)}`);
    const ord = run("get_order", { order: "1001" });
    assert(ord.found && ord.open_eur === 5500 && ord.delivered_pct === 76 && ord.lines.length === 2 && ord.lines.every(l => !("value_eur" in l)), `Order ${JSON.stringify(ord)}`);
    const fam = run("get_families", {});
    assert(fam.mapping_loaded && fam.families[0].family === "Laryvox" && fam.families.find(f => f.family === "BMV Cuff").phase_out_lines === 1, "Families");
    const cu = run("get_customers", {});
    assert(cu.customers.map(c => c.customer).join() === "Kunde A,Kunde B,Kunde C,Kunde D" && cu.concentration === "highly concentrated", "Customers");
    assert(run("get_changes", {}).available === false, "Changes need a second upload");
    assert(run("get_outlook", {}).immediate_demand_on_top_if_capacity_eur === 2700, "Outlook");
    const ka = run("get_key_account", {});
    assert(ka.key_accounts[0].customer === "Kunde A" && ka.key_accounts[0].immediate_demand.avg_wait_days === 84, "Key account");
    let threw = false; try { api.runAssistantTool("get_overdue", { filters: { customer: "Kunde Z" } }); } catch (e) { threw = /unknown customer/.test(e.message); }
    assert(threw, "Unknown pseudonym is an error");
    reset(); await paint();
  });

  await test(5, "A failing tool goes back as an error result; the answer still arrives", async () => {
    window.ASSIST_SENT = [];
    window.ASSIST_SCRIPT = msgs => lastUser(msgs).content[0].type === "text"
      ? reply([{ type: "tool_use", id: "t5", name: "get_overdue", input: { filters: { family: "Gibt es nicht" } } }], "tool_use")
      : say("Diese Produktfamilie gibt es in der Datei nicht.");
    await followUp("Überfällig bei Gibt es nicht?");
    const r = toolResults(window.ASSIST_SENT[1])[0];
    assert(r.is_error === true && /unknown product family/.test(r.content), `Error result ${JSON.stringify(r)}`);
    assert(text("#asst-log .asst-turn:last-child .asst-a") === "Diese Produktfamilie gibt es in der Datei nicht.", "Answer after the error");
  });

  await test(6, "Refusal, truncation, rate limit and an unreachable service leave the conversation unchanged", async () => {
    const before = api.assistant.conv.length;
    window.ASSIST_SCRIPT = () => ({ content: [], stop_reason: "refusal", stop_details: { type: "refusal", category: null }, model: "claude-opus-5-5" });
    await followUp("Frage A");
    assert(text("#asst-log .asst-turn:last-child .asst-a") === "Darauf kann ich keine Antwort geben. Bitte die Frage anders stellen." && api.assistant.conv.length === before, "Refusal");
    window.ASSIST_SCRIPT = () => reply([{ type: "tool_use", id: "t6", name: "get_overview", input: {} }], "max_tokens");
    await followUp("Frage B");
    assert(text("#asst-log .asst-turn:last-child .asst-a").startsWith("Die Antwort war zu lang") && api.assistant.conv.length === before, "Truncated tool call never runs");
    window.ASSIST_SCRIPT = () => { const e = new Error("assistant"); e.code = "rate_limited"; throw e; };
    await followUp("Frage C");
    assert(text("#asst-log .asst-turn:last-child .asst-a") === "Gerade kommen zu viele Anfragen an. Bitte gleich noch einmal versuchen." && api.assistant.conv.length === before, "Rate limit");
    window.ASSIST_SCRIPT = () => { const e = new Error("assistant"); e.code = "unavailable"; throw e; };
    await followUp("Sofortbedarf Alpha");
    const a = text("#asst-log .asst-turn:last-child .asst-a");
    assert(a.startsWith("Der KI-Assistent ist gerade nicht erreichbar. Antwort aus den festen Fragetypen: Sofortbedarf (Alpha Medizintechnik): 2,5 T€") && api.assistant.conv.length === before && $("#ask-answer").hidden, `Fallback: ${a}`);
  });

  await test(7, "Pseudonymisation of questions and answers", async () => {
    const out = api.pseudonymiseText("Wie steht es um alpha, Alpha Medizintechnik GmbH und Kunde 10003 (Gamma)?");
    assert(!leaks(out).length && out.includes("Kunde A") && out.includes("Kunde B"), out);
    assert(api.depseudonymise("Kunde A und Kunde B, Customer C") === "Alpha Medizintechnik und Gamma Sanitätshaus, Beta Care", api.depseudonymise("Kunde A und Kunde B, Customer C"));
    assert(api.pseudonymiseText("Laryvox überfällig") === "Laryvox überfällig", "Families and other words stay");
  });

  await test(8, "New conversation clears the history; Close hides the panel; English labels", async () => {
    click($("#asst-new")); await paint();
    assert(api.assistant.conv.length === 0 && !$$("#asst-log .asst-turn").length && !$("#assistant").hidden, "New conversation");
    api.setLang("en"); await paint();
    window.ASSIST_SENT = [];
    window.ASSIST_SCRIPT = () => say("Kunde A has €3.5k overdue.");
    await ask("overdue Alpha");
    assert(window.ASSIST_SENT[0][0].content[0].text === "[Stand 2026-09-09 · Sprache en]\noverdue Kunde A", window.ASSIST_SENT[0][0].content[0].text);
    assert(text("#asst-title") === "Assistant" && text("#asst-new") === "New conversation" && $("#asst-input").placeholder === "Ask a follow-up …" && text("#asst-log .asst-a") === "Alpha Medizintechnik has €3.5k overdue.", "English panel");
    api.setLang("de"); click($("#asst-close")); await paint();
    assert($("#assistant").hidden && api.assistant.conv.length === 0, "Closed");
  });

  await test(9, "Layout: no page-level horizontal scroll with the panel open; no console errors or CSP violations", async () => {
    window.ASSIST_SCRIPT = () => say("Kunde A: alles im Plan.");
    await ask("Überblick Alpha");
    assert(!$("#assistant").hidden && document.documentElement.scrollWidth <= innerWidth + 1, `Overflow ${document.documentElement.scrollWidth} > ${innerWidth}`);
    assert(window.DOPK_TEST_ERRORS.length === 0, window.DOPK_TEST_ERRORS.join("; "));
  });

  window.DOPK_TEST_DONE = true;
  document.title = `${results.filter(r => r.pass).length}/${results.length} PASS — DOPK assistant`;
});
