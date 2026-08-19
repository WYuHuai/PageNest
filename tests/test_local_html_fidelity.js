const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const fixture = fs.readFileSync(
  path.join(__dirname, "fixtures", "local-html-visual-fidelity.html"),
  "utf8",
);
assert.match(fixture, /\.timeline::before/);
assert.match(fixture, /\.timeline-item::before/);
assert.match(fixture, /\.badge::after/);
assert.match(fixture, /--accent/);

function declaration(values) {
  const names = Object.keys(values);
  return Object.assign(names, {
    length: names.length,
    getPropertyValue: name => values[name],
    getPropertyPriority: () => "",
  });
}

function styleRule(selectorText, values) {
  return {selectorText, style: declaration(values)};
}

const rules = [
  styleRule(":root", {"--accent": "#2563eb", "--surface": "#f8fafc"}),
  styleRule(".timeline", {
    position: "relative",
    display: "grid",
    gap: "16px",
    margin: "24px 0",
    padding: "8px 0 8px 28px",
  }),
  styleRule(".timeline::before", {
    content: '""', position: "absolute", left: "8px", width: "2px", background: "var(--accent)",
  }),
  styleRule(".timeline-item::before", {
    content: '""', position: "absolute", border: "2px solid var(--accent)", "border-radius": "50%",
  }),
  styleRule(".card", {
    border: "1px solid #cbd5e1", "border-radius": "14px", padding: "20px", background: "var(--surface)",
  }),
  styleRule(".badge", {
    display: "inline-flex", background: "#dbeafe", border: "1px solid var(--accent)", "border-radius": "999px",
  }),
  styleRule(".badge::after", {
    content: '""', width: "6px", height: "6px", "margin-left": "6px", "border-radius": "50%", background: "var(--accent)",
  }),
  styleRule(".local-resource", {"mask-image": 'url("file:///D:/Private/mask.svg")'}),
  styleRule(".remote-resource", {"background-image": 'url("https://example.invalid/tracker.png")'}),
  styleRule(".unsafe-rule", {width: "expression(alert(1))", behavior: "url(#default#time2)"}),
];

let adapter;
let networkCalls = 0;
const main = {
  innerText: "本地视觉测试正文。".repeat(30),
  textContent: "本地视觉测试正文。".repeat(30),
  querySelector: () => ({}),
  querySelectorAll: () => [],
};
const document = {
  title: "脱敏测试",
  body: main,
  styleSheets: [
    {cssRules: rules},
    {
      href: "file:///D:/Fixtures/linked.css",
      cssRules: [styleRule(".linked-card", {display: "grid", gap: "12px"})],
    },
    {href: "https://example.invalid/remote.css", get cssRules() { throw new Error("cross-origin"); }},
  ],
  querySelectorAll: selector => selector.includes("main") ? [main] : [],
};
const context = vm.createContext({
  document,
  location: new URL("file:///D:/Fixtures/visual.html"),
  URL,
  decodeURIComponent,
  window: {matchMedia: () => ({matches: true})},
  CSS: {supports: () => true},
  fetch: () => { networkCalls += 1; throw new Error("network access forbidden"); },
  PageNestContentQuality: {looksLikeScriptBundle: () => false},
  HermesExtractorCore: {waitForContent: predicate => Promise.resolve(predicate())},
  HermesAdapters: {register: value => { adapter = value; }},
});
vm.runInContext(
  fs.readFileSync(path.join(root, "extension", "adapters", "local-html.js"), "utf8"),
  context,
  {filename: "local-html.js"},
);

(async () => {
  const result = await adapter.extract({document, location: context.location});
  const styles = String(result.document_styles || "");
  assert.match(styles, /\.timeline::before/);
  assert.match(styles, /\.timeline-item::before/);
  assert.match(styles, /\.badge::after/);
  assert.match(styles, /\.linked-card/);
  assert.match(styles, /--accent:\s*#2563eb/);
  assert.match(styles, /border-radius:\s*14px/);
  assert.match(styles, /gap:\s*16px/);
  assert.doesNotMatch(styles, /url\s*\(/i);
  assert.doesNotMatch(styles, /file:|https?:|expression\s*\(|behavior\s*:/i);
  assert.ok(styles.length < 512_000);
  assert.equal(networkCalls, 0, "PageNest must not fetch a stylesheet while capturing Local HTML");

  main.cloneNode = () => ({
    innerText: main.innerText,
    textContent: main.textContent,
    outerHTML: '<main class="linked-card"><p>本地视觉测试正文。</p></main>',
    querySelectorAll: () => [],
  });
  Object.assign(context.HermesExtractorCore, {
    JUNK: [],
    POSITION_ATTR: "data-hermes-image-id",
    blobData: async () => {},
    clearExtractionMarkers: () => {},
    collectImages: () => [],
    inlineLocalImages: async () => ({attempted: 0, inlined: 0, failed: 0}),
    isPlaceholderSvgData: () => false,
    materializeBackgroundImages: () => {},
    metadata: () => "",
    normalizeLinks: () => {},
    resolveImage: () => "",
    unwrapHeadingLinks: () => {},
  });
  context.PageNestContentQuality.isReadableArticle = () => true;
  context.HermesAdapters.select = () => adapter;
  context.HermesMedia = {
    collect: async () => [],
    cleanClone: () => {},
    frameKind: () => "article",
  };
  context.window.top = context.window;
  document.documentElement = {lang: "zh-CN"};
  document.querySelector = () => null;
  context.getSelection = () => null;
  vm.runInContext(
    fs.readFileSync(path.join(root, "extension", "extractor.js"), "utf8"),
    context,
    {filename: "extractor.js"},
  );
  const capture = await context.collectPage();
  assert.equal(capture.source_kind, "local-html");
  assert.equal(capture.document_styles, styles, "Local HTML styles must cross the ArticleInput boundary");
  console.log("local HTML stylesheet capture contract passed");
})().catch(error => { console.error(error); process.exitCode = 1; });
