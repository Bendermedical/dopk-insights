const { spawn, spawnSync } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");

const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const testArg = process.argv[2] || "scorecard-test.html";
const testFile = testArg.replace(/^tests[/\\]/, "");
const tempProfile = path.join(os.tmpdir(), "edge-cdp-" + Date.now());
// Optional viewport width, e.g. `node tests/run-test.js drilldown-test.html 390`
const width = parseInt(process.argv[3], 10) || 1360;
const timeoutMs = parseInt(process.env.TEST_TIMEOUT_MS, 10) || 60000;
// Serve the production security headers so CSP violations show up in tests.
const siteHeaders = {};
try {
  let inBlock = false;
  fs.readFileSync(path.join(__dirname, "..", "_headers"), "utf8").split(/\r?\n/).forEach(line => {
    if (/^\S/.test(line)) { inBlock = line.trim() === "/*"; return; }
    const m = inBlock && line.match(/^\s+([\w-]+):\s*(.+)$/);
    if (m) siteHeaders[m[1]] = m[2].trim();
  });
} catch (e) {}
let failed = 0;

const server = http.createServer((req, res) => {
  const safePath = path.normalize(decodeURIComponent(req.url.split("?")[0])).replace(/^(\.\.[\/\\])+/, "");
  const filePath = path.join(__dirname, "..", safePath);
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    const ext = path.extname(filePath);
    const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".csv": "text/csv; charset=utf-8" }[ext] || "text/plain";
    res.writeHead(200, { ...siteHeaders, "Content-Type": mime });
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
    `--window-size=${width},900`,
    // keep requestAnimationFrame and timers running even if Edge considers the tab hidden
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    `--user-data-dir=${tempProfile}`,
    `--remote-debugging-port=${cdpPort}`,
    testUrl
  ]);

  let wsUrl = null;
  const matchStr = testFile.replace(/\.html$/, "");
  for (let i = 0; i < 120; i++) {
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
  try { await send("Page.bringToFront"); } catch (e) {}
  console.log("Runtime enabled! Starting test poll...");

  // Poll for completion or timeout
  const start = Date.now();
  let done = false;
  while (Date.now() - start < timeoutMs) {
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
        const fails = fullState.results.filter(r => !r.pass).length;
        failed = fails + (fullState.errors.length ? 1 : 0);
        console.log(`Viewport width: ${width}px · ${fullState.results.length - fails}/${fullState.results.length} PASS`);
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
    try {
      const diag = await send("Runtime.evaluate", { expression: "JSON.stringify({ ready: document.readyState, hidden: document.hidden, results: (window.DOPK_TEST_RESULTS || []).length, errors: window.DOPK_TEST_ERRORS || [] })", returnByValue: true });
      console.error("Page state at timeout:", diag?.result?.value);
    } catch (e) {}
    console.error(`Test execution timed out after ${timeoutMs / 1000} seconds!`);
    failed = failed || 1;
  }

  ws.close();
}

// Edge starts many child processes; end the whole tree and remove the throwaway profile.
// The launcher process hands over to children and exits, so match this run's unique profile folder instead.
function stopEdge() {
  if (proc && proc.pid) {
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/pid", String(proc.pid), "/T", "/F"], { stdio: "ignore" });
      const tag = path.basename(tempProfile);
      const ps = `Get-CimInstance Win32_Process -Filter "Name = 'msedge.exe'" | Where-Object { $_.CommandLine -like '*${tag}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;
      for (let i = 0; i < 3; i++) spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", ps], { stdio: "ignore" });
    } else proc.kill("SIGKILL");
  }
  for (let i = 0; i < 5; i++) {
    try { fs.rmSync(tempProfile, { recursive: true, force: true }); break; } catch (e) { spawnSync(process.execPath, ["-e", "setTimeout(()=>{},300)"]); }
  }
}

main().catch(e => { console.error(e); failed = failed || 1; }).finally(() => {
  stopEdge();
  const code = failed ? 1 : 0;
  server.close(() => process.exit(code));
  setTimeout(() => process.exit(code), 1000);
});
