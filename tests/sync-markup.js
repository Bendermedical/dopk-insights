/* Dev tool: copies the dashboard markup (between <!-- dashboard:start --> and <!-- dashboard:end -->)
   out of index.html into every tests/*-test.html page, so the test pages always exercise the
   current markup. Run from the repository root after changing index.html:
     node tests/sync-markup.js
   A test page that still holds the older layout (<header class="topbar"> … </footer>) is migrated. */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const START = "<!-- dashboard:start -->", END = "<!-- dashboard:end -->";
const range = (html, start, end) => {
  const a = html.indexOf(start), b = html.indexOf(end, a);
  if (a < 0 || b < 0) return null;
  return [html.lastIndexOf("\n", a) + 1, b + end.length];
};

const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
const [ia, ib] = range(index, START, END) || (() => { throw new Error("markers missing in index.html"); })();
const markup = index.slice(ia, ib);

fs.readdirSync(__dirname).filter(f => /-test\.html$/.test(f)).forEach(f => {
  const file = path.join(__dirname, f);
  const html = fs.readFileSync(file, "utf8");
  const r = range(html, START, END) || range(html, '<header class="topbar">', "</footer>");
  if (!r) throw new Error(`${f}: no dashboard markup found`);
  const next = html.slice(0, r[0]) + markup + html.slice(r[1]);
  if (next !== html) { fs.writeFileSync(file, next); console.log("updated", f); }
  else console.log("unchanged", f);
});
