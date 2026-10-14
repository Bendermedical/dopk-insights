/* Dev tool: copies the dashboard markup (from <header class="topbar"> to </footer>) out of
   index.html into every tests/*-test.html page, so the test pages always exercise the
   current markup. Run from the repository root after changing index.html:
     node tests/sync-markup.js */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const START = '<header class="topbar">', END = "</footer>";
const block = html => {
  const a = html.indexOf(START), b = html.indexOf(END, a);
  if (a < 0 || b < 0) throw new Error("markup block not found");
  // include the indentation before the opening tag and the closing tag itself
  const lineStart = html.lastIndexOf("\n", a) + 1;
  return [lineStart, b + END.length];
};

const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
const [ia, ib] = block(index);
const markup = index.slice(ia, ib);

fs.readdirSync(__dirname).filter(f => /-test\.html$/.test(f)).forEach(f => {
  const file = path.join(__dirname, f);
  const html = fs.readFileSync(file, "utf8");
  const [a, b] = block(html);
  const next = html.slice(0, a) + markup + html.slice(b);
  if (next !== html) { fs.writeFileSync(file, next); console.log("updated", f); }
  else console.log("unchanged", f);
});
