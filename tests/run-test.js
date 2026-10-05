const { spawn } = require("child_process");
const http = require("http");

const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const port = 9222;

const proc = spawn(edgePath, [
  "--headless=new",
  "--disable-gpu",
  `--remote-debugging-port=${port}`,
  "http://localhost:8080/tests/scorecard-test.html"
]);

function getJSON(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => resolve(JSON.parse(data)));
    }).on("error", reject);
  });
}

async function main() {
  let wsUrl = null;
  for (let i = 0; i < 40; i++) {
    try {
      await new Promise(r => setTimeout(r, 250));
      const targets = await getJSON(`http://127.0.0.1:${port}/json`);
      const page = targets.find(t => t.type === "page" && t.url.includes("scorecard-test"));
      if (page && page.webSocketDebuggerUrl) {
        wsUrl = page.webSocketDebuggerUrl;
        break;
      }
    } catch (e) {}
  }

  if (!wsUrl) {
    throw new Error("Could not find CDP target");
  }

  const ws = new WebSocket(wsUrl);
  let id = 1;
  const pending = new Map();

  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const msgId = id++;
      pending.set(msgId, { resolve, reject });
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  }

  ws.onmessage = e => {
    const data = JSON.parse(e.data);
    if (data.id && pending.has(data.id)) {
      const { resolve, reject } = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) reject(data.error);
      else resolve(data.result);
    } else if (data.method === "Runtime.consoleAPICalled") {
      const text = data.params.args.map(a => a.value ?? a.description ?? "").join(" ");
      console.log("[Browser Console]", text);
    }
  };

  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  await send("Runtime.enable");

  // Poll for completion or timeout after 25s
  const start = Date.now();
  let done = false;
  while (Date.now() - start < 25000) {
    const res = await send("Runtime.evaluate", {
      expression: "JSON.stringify({ done: !!window.DOPK_TEST_DONE, results: window.DOPK_TEST_RESULTS || [], title: document.title, errors: window.DOPK_TEST_ERRORS || [] })",
      returnByValue: true
    });
    if (res && res.result && res.result.value) {
      const state = JSON.parse(res.result.value);
      if (state.done) {
        done = true;
        console.log("\n================ TEST SUMMARY ================");
        console.log("Document Title:", state.title);
        console.log(`Total tests executed: ${state.results.length}`);
        state.results.forEach(r => {
          console.log(`Test ${r.id}: ${r.pass ? "PASS" : "FAIL"} - ${r.title}${r.detail ? " (" + r.detail + ")" : ""}`);
        });
        if (state.errors.length) {
          console.log("\nErrors collected:", state.errors);
        }
        break;
      }
    }
    await new Promise(r => setTimeout(r, 500));
  }

  if (!done) {
    console.error("Test execution timed out after 25 seconds!");
  }

  ws.close();
}

main().catch(console.error).finally(() => {
  proc.kill();
  process.exit(0);
});
