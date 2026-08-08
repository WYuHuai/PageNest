const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const extension = path.resolve(__dirname, "../extension");

function contentElement(text, structured = true) {
  return {
    innerText: text,
    textContent: text,
    querySelector: () => structured ? {} : null,
    querySelectorAll: () => [],
  };
}

function localDocument({title = "", candidates = [], body = null} = {}) {
  return {
    title,
    body,
    querySelectorAll: () => candidates,
  };
}

function loadLocalAdapter(document, href) {
  let adapter;
  const context = vm.createContext({
    document,
    location: new URL(href),
    URL,
    decodeURIComponent,
    PageNestContentQuality: {
      looksLikeScriptBundle: text => String(text).includes("__webpack_require__"),
    },
    HermesExtractorCore: {
      waitForContent: predicate => Promise.resolve(predicate()),
    },
    HermesAdapters: {register: value => { adapter = value; }},
  });
  vm.runInContext(
    fs.readFileSync(path.join(extension, "adapters/local-html.js"), "utf8"),
    context,
    {filename: "local-html.js"},
  );
  return adapter;
}

async function popupHelpers() {
  const source = fs.readFileSync(path.join(extension, "popup.js"), "utf8");
  const start = source.indexOf("function captureKindForUrl");
  const end = source.indexOf("function inlineImagePolicy", start);
  assert.ok(start >= 0 && end > start, "local capture access helpers must be present");
  const context = vm.createContext({URL, Promise, Error});
  vm.runInContext(
    `${source.slice(start, end)}\nthis.captureKindForUrl=captureKindForUrl;this.ensureCaptureAccess=ensureCaptureAccess;`,
    context,
  );
  return context;
}

(async () => {
  const helpers = await popupHelpers();
  assert.equal(helpers.captureKindForUrl("https://example.com/a"), "web");
  assert.equal(helpers.captureKindForUrl("file:///D:/AI/report.html"), "local-html");
  assert.equal(helpers.captureKindForUrl("file:///D:/AI/report.txt"), "");
  for (const url of ["chrome://extensions", "edge://extensions", "about:blank", "data:text/html,hello", "javascript:void(0)"]) {
    assert.equal(helpers.captureKindForUrl(url), "", `${url} must remain unsupported`);
  }

  const allowed = {isAllowedFileSchemeAccess: callback => callback(true)};
  assert.equal(await helpers.ensureCaptureAccess("file:///D:/AI/report.html", allowed), "local-html");
  const denied = {isAllowedFileSchemeAccess: callback => callback(false)};
  await assert.rejects(
    helpers.ensureCaptureAccess("file:///D:/AI/report.html", denied),
    /允许访问文件网址/,
  );

  const basicMain = contentElement("Local Test Hello PageNest.");
  const basic = loadLocalAdapter(
    localDocument({title: "Local Test", candidates: [basicMain], body: basicMain}),
    "file:///D:/AI/report.html",
  );
  const basicResult = await basic.extract({document: localDocument({candidates: [basicMain], body: basicMain})});
  assert.equal(basicResult.element, basicMain);
  assert.equal(basicResult.method, "local-html:structured-container");
  assert.equal(basic.validate(basicResult), true);

  const generatedBody = contentElement("研究报告正文。".repeat(30));
  const generatedDocument = localDocument({body: generatedBody});
  const generated = loadLocalAdapter(generatedDocument, "file:///D:/AI/generated.html");
  const generatedResult = await generated.extract({document: generatedDocument});
  assert.equal(generatedResult.element, generatedBody, "body-only generated HTML must be capturable");
  assert.equal(generatedResult.method, "local-html:body");

  const noTitleDocument = localDocument({body: generatedBody});
  const noTitle = loadLocalAdapter(
    noTitleDocument,
    "file:///D:/AI/%E7%A0%94%E7%A9%B6%E6%8A%A5%E5%91%8A%208%E6%9C%888%E6%97%A5.html",
  );
  const source = noTitle.sourceInfo({document: noTitleDocument, location: new URL("file:///D:/AI/%E7%A0%94%E7%A9%B6%E6%8A%A5%E5%91%8A%208%E6%9C%888%E6%97%A5.html")});
  assert.equal(source.title, "研究报告 8月8日");
  assert.equal(source.source_name, "研究报告 8月8日.html");
  assert.equal(source.url, "local-html:///%E7%A0%94%E7%A9%B6%E6%8A%A5%E5%91%8A%208%E6%9C%888%E6%97%A5.html");
  assert.doesNotMatch(JSON.stringify(source), /D:|file:\/\//);

  let dynamicBody = contentElement("");
  const dynamicDocument = localDocument({body: dynamicBody});
  const dynamic = loadLocalAdapter(dynamicDocument, "file:///D:/AI/dynamic.html");
  assert.equal(await dynamic.extract({document: dynamicDocument}), null);
  dynamicBody.innerText = "当前已经渲染后的动态正文。".repeat(20);
  dynamicBody.textContent = dynamicBody.innerText;
  assert.equal((await dynamic.extract({document: dynamicDocument})).element, dynamicBody);

  const blank = contentElement("", false);
  const blankDocument = localDocument({body: blank});
  const blankAdapter = loadLocalAdapter(blankDocument, "file:///D:/AI/blank.html");
  assert.equal(await blankAdapter.extract({document: blankDocument}), null);
  console.log("local HTML capture semantics passed");
})().catch(error => { console.error(error); process.exitCode = 1; });
