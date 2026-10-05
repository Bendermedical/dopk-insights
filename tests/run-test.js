const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");

const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const testArg = process.argv[2] || "scorecard-test.html";
const testFile = testArg.replace(/^tests[/\\]/, "");
const tempProfile = path.join(os.tmpdir(), "edge-cdp-" + Date.now());

const server = http.createServer((req, res) => {
  const safePath = path.normalize(decodeURIComponent(req.url.split("?")[0])).replace(/^(\.\.[\/\\])+/, "");
  const filePath = path.join(__dirname, "..", safePath);
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    const ext = path.extname(filePath);
    const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" }[ext] || "text/plain";
    res.writeHead(200, { "Content-Type": mime });
    res.end(data);
  });
});

let proc = null;

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
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const serverPort = server.address().port;
  const cdpPort = 9300 + Math.floor(Math.random() * 500);
  const testUrl = `http://127.0.0.1:${serverPort}/tests/${testFile}`;

  proc = spawn(edgePath, [
    "--headless=new",
    "--disable-gpu",
    `--user-data-dir=${tempProfile}`,
    `--remote-debugging-port=${cdpPort}`,
    testUrl
  ]);

  let wsUrl = null;
  const matchStr = testFile.replace(/\.html$/, "");
  for (let i = 0; i < 40; i++) {
    try {
      await new Promise(r => setTimeout(r, 250));
      const targets = await getJSON(`http://127.0.0.1:${cdpPort}/json`);
      const page = targets.find(t => t.type === "page" && t.url.includes(matchStr));
      if (page && page.webSocketDebuggerUrl) {
        wsUrl = page.webSocketDebuggerUrl;
        console.log(`Connected to page target: ${page.url}`);
        break;
      }
    } catch (e) {}
  }

  if (!wsUrl) {
    throw new Error("Could not find CDP target for " + matchStr);
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

  if (ws.readyState !== 1) {
    await new Promise((resolve, reject) => {
      ws.addEventListener("open", resolve, { once: true });
      ws.addEventListener("error", reject, { once: true });
    });
  }

  console.log("WebSocket open! Enabling Runtime...");
  await send("Runtime.enable");
  console.log("Runtime enabled! Starting test poll...");

  // Poll for completion or timeout after 25s
  const start = Date.now();
  let done = false;
  while (Date.now() - start < 25000) {
    const res = await send("Runtime.evaluate", {
      expression: "JSON.stringify({ done: !!window.DOPK_TEST_DONE, results: (window.DOPK_TEST_RESULTS || []).length, title: document.title, errors: window.DOPK_TEST_ERRORS || [] })",
      returnByValue: true
    });
    const val = res?.result?.value;
    if (val) {
      const state = JSON.parse(val);
      if (!done && state.results > 0) {
        console.log(`[Progress] results count: ${state.results}, done: ${state.done}, errors: ${state.errors?.length || 0}`);
      }
      if (state.done) {
        done = true;
        const fullRes = await send("Runtime.evaluate", {
          expression: "JSON.stringify({ results: window.DOPK_TEST_RESULTS || [], title: document.title, errors: window.DOPK_TEST_ERRORS || [] })",
          returnByValue: true
        });
        const fullState = JSON.parse(fullRes.result.value);
        console.log("\n================ TEST SUMMARY ================");
        console.log("Document Title:", fullState.title);
        console.log(`Total tests executed: ${fullState.results.length}`);
        fullState.results.forEach(r => {
          console.log(`Test ${r.id}: ${r.pass ? "PASS" : "FAIL"} - ${r.title}${r.detail ? " (" + r.detail + ")" : ""}`);
        });
        if (fullState.errors.length) {
          console.log("\nErrors collected:", fullState.errors);
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
  if (proc) proc.kill();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000);
});
