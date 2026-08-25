const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.resolve(__dirname, "../extension/popup.js"), "utf8");
const identifyStart = source.indexOf("async function identify()");
const identifyEnd = source.indexOf("function escapeHtml", identifyStart);
const collectStart = source.indexOf("async function collectWithServiceCapabilities");
const collectEnd = source.indexOf("async function loadFolders", collectStart);
assert.ok(identifyStart >= 0 && identifyEnd > identifyStart);
assert.ok(collectStart >= 0 && collectEnd > collectStart);

const localized = {
  serviceConnecting: "正在连接 PageNest 后台服务",
  serviceConnected: "PageNest 后台服务已连接",
  serviceDisconnected: "PageNest 后台服务未连接",
  usuallyMoments: "通常只需要片刻",
  startServiceRetry: "请启动 PageNest 后重试",
  diagnosticUnreachable: "无法连接 PageNest 后台服务",
  diagnosticInvalid: "连接配置无效",
  serviceOld: "Service 版本过旧，请升级 PageNest 本地服务",
  ready: "已就绪",
  identifyingBody: "正在识别网页正文",
  recognitionSuccess: "识别成功",
};
const t = (key, substitutions) => {
  const template = localized[key] || key;
  const values = Array.isArray(substitutions) ? substitutions : [substitutions];
  return values.reduce((value, item, index) => value.replace(`$${index + 1}`, item ?? ""), template);
};

function element() {
  const strong = {textContent: ""};
  return {
    textContent: "",
    value: "",
    className: "",
    classList: {
      add() {},
      remove() {},
      toggle(_name, enabled) { this.hidden = enabled; },
      hidden: false,
    },
    querySelector: selector => selector === "strong" ? strong : null,
    strong,
  };
}

async function serviceStateContract(connectionResult, diagnostic = "service-unreachable") {
  const elements = new Proxy({}, {get(target, key) { return target[key] ||= element(); }});
  const start = source.indexOf("async function getSettings");
  const end = source.indexOf("function captureKindForUrl", start);
  const context = vm.createContext({
    $: id => elements[id],
    t,
    PageNestConnection: {
      connect: async () => connectionResult,
      diagnostic: () => diagnostic,
      load: async () => ({}),
    },
  });
  vm.runInContext(`${source.slice(start, end)}\nthis.connectService=connectService;`, context);
  const connected = await context.connectService();
  return {connected, elements};
}

(async () => {
  const events = [];
  const elements = new Proxy({}, {get(target, key) { return target[key] ||= element(); }});
  const capture = {
    title: "Runtime contract",
    source_kind: "web",
    url: "https://example.test/article",
    extraction_method: "selector:article",
    extraction_warning: "",
    article_text: "正文",
    images: [],
    media: [],
    page_variant: "standard",
  };
  const context = vm.createContext({
    URL,
    article: undefined,
    tab: undefined,
    $: id => elements[id],
    t,
    chrome: {
      tabs: {query: async () => { events.push("active-tab"); return [{id: 7, url: capture.url}]; }},
      scripting: {executeScript: async options => {
        if (options.files) { events.push("inject-capture-runtime"); return []; }
        events.push("collect-page");
        return [{frameId: 0, result: capture}];
      }},
    },
    ensureCaptureAccess: async () => { events.push("capture-access"); return "web"; },
    selectBestCapture: captures => { events.push("select-capture"); return captures[0].result; },
    PageNestXhsVideoBridge: {
      apply: async (_capture, _tabId, _scripting, inline = true) => {
        events.push(inline ? "embed-xhs-video" : "resolve-xhs-metadata");
      },
    },
    inlineBrowserReadableImages: async () => { events.push("inline-images"); },
    inlineCommentAvatars: async () => { events.push("inline-comments"); },
    redactLocalCapture: () => { events.push("redact-local-data"); },
  });
  vm.runInContext(
    `${source.slice(identifyStart, identifyEnd)}\n${source.slice(collectStart, collectEnd)}\n`
      + "this.identify=identify;this.prepareCaptureForSave=prepareCaptureForSave;"
      + "this.collectWithServiceCapabilities=collectWithServiceCapabilities;"
      + "this.currentArticle=()=>article;",
    context,
  );

  await context.identify();
  await context.prepareCaptureForSave(context.currentArticle());
  const saved = await context.collectWithServiceCapabilities(context.currentArticle(), async url => {
    events.push(url);
    return url === "/api/meta"
      ? {supported_page_variants: ["standard"]}
      : {ok: true};
  });

  assert.deepEqual(events, [
    "active-tab",
    "capture-access",
    "inject-capture-runtime",
    "collect-page",
    "select-capture",
    "resolve-xhs-metadata",
    "embed-xhs-video",
    "inline-images",
    "inline-comments",
    "redact-local-data",
    "/api/meta",
    "/api/collect",
  ]);
  assert.equal(saved.ok, true);
  assert.equal(context.currentArticle(), capture);

  const disconnected = await serviceStateContract(null);
  assert.equal(disconnected.connected, false);
  assert.equal(disconnected.elements.serviceStatus.strong.textContent, "PageNest 后台服务未连接");
  assert.equal(disconnected.elements.reconnectService.classList.hidden, false);

  const incompatible = await serviceStateContract({
    connection: {server: "http://127.0.0.1:8765", token: "valid"},
    incompatible: true,
  });
  assert.equal(incompatible.connected, false);
  assert.match(incompatible.elements.serviceStatusDetail.textContent, /版本过旧/);

  const connected = await serviceStateContract({
    connection: {server: "http://127.0.0.1:18765", token: "rediscovered"},
    meta: {service_version: "1.9.1"},
  });
  assert.equal(connected.connected, true);
  assert.equal(connected.elements.server.value, "http://127.0.0.1:18765");
  assert.equal(connected.elements.token.value, "rediscovered");
  assert.equal(connected.elements.serviceStatus.strong.textContent, "PageNest 后台服务已连接");
  assert.equal(connected.elements.reconnectService.classList.hidden, true);
  console.log("popup capture orchestration contract passed");
})().catch(error => { console.error(error); process.exitCode = 1; });
