const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const extension = path.resolve(__dirname, "../extension");
const fixtures = path.resolve(__dirname, "fixtures");
const POSITION_ATTR = "data-hermes-image-id";

class Node {
  constructor(tagName, text = "", attributes = {}) {
    this.tagName = tagName.toUpperCase();
    this._text = text.trim();
    this.attributes = {...attributes};
    this.children = [];
    this._images = [];
  }
  appendChild(child) { this.children.push(child); return child; }
  append(...children) { children.forEach(child => this.appendChild(child)); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] || ""; }
  get textContent() { return [this._text, ...this.children.map(child => child.textContent)].filter(Boolean).join(" "); }
  set textContent(value) { this._text = String(value); this.children = []; }
  get innerText() { return this.textContent; }
  get className() { return this.attributes.class || ""; }
  set className(value) { this.attributes.class = value; }
  get src() { return this.attributes.src || ""; }
  set src(value) { this.attributes.src = value; }
  get alt() { return this.attributes.alt || ""; }
  set alt(value) { this.attributes.alt = value; }
  get currentSrc() { return this.src; }
  get naturalWidth() { return Number(this.attributes.width) || 800; }
  get naturalHeight() { return Number(this.attributes.height) || 600; }
  getBoundingClientRect() { return {width: this.naturalWidth, height: this.naturalHeight}; }
  cloneNode(deep) {
    const clone = new Node(this.tagName, this._text, this.attributes);
    clone._images = this._images.map(image => ({...image}));
    if (deep) clone.children = this.children.map(child => child.cloneNode(true));
    return clone;
  }
  descendants() { return this.children.flatMap(child => [child, ...child.descendants()]); }
  querySelectorAll(selector) {
    const nodes = this.descendants();
    if (selector === "img") return nodes.filter(node => node.tagName === "IMG");
    if (selector === "canvas") return nodes.filter(node => node.tagName === "CANVAS");
    if (selector === `[${POSITION_ATTR}]`) return nodes.filter(node => node.getAttribute(POSITION_ATTR));
    return [];
  }
  get outerHTML() {
    const attrs = Object.entries(this.attributes).map(([key, value]) => ` ${key}="${value}"`).join("");
    return `<${this.tagName.toLowerCase()}${attrs}>${this._text}${this.children.map(child => child.outerHTML).join("")}</${this.tagName.toLowerCase()}>`;
  }
}

function read(name) { return fs.readFileSync(path.join(fixtures, name), "utf8"); }
function match(html, pattern, fallback = "") { return html.match(pattern)?.[1]?.trim() || fallback; }
function image(url, alt = "") {
  return new Node("img", "", {src: url, alt, width: "800", height: "600"});
}
function addTextElement(parent, tag, text, kind = "") {
  const child = new Node(tag, text, kind ? {"data-hermes-kind": kind} : {});
  parent.appendChild(child);
  return child;
}
function loadAdapter(file, globals) {
  let adapter;
  const context = vm.createContext({
    URL,
    Event: class { constructor(type) { this.type = type; } },
    setTimeout,
    clearTimeout,
    innerHeight: 900,
    getComputedStyle: () => ({backgroundImage: "none"}),
    ...globals,
    HermesAdapters: {register(value) { adapter = value; }},
  });
  vm.runInContext(fs.readFileSync(path.join(extension, "adapters", file), "utf8"), context, {filename: file});
  return adapter;
}

function commonCore(extra = {}) {
  return {
    POSITION_ATTR,
    addTextElement,
    clearExtractionMarkers() {},
    collectCanvasImages: async () => [],
    collectImages: node => node._images || [],
    ensureImageSlots() {},
    isoDurationLabel: value => value === "PT5M30S" ? "5:30" : value,
    jsonLdObjects: () => [],
    markImagePosition(node, prefix) { node.setAttribute(POSITION_ATTR, prefix); return prefix; },
    materializeBackgroundImages() {},
    materializeCanvasImages() {},
    metadata: () => "",
    resolveImage: node => node.src,
    scrollContainer: () => null,
    stableBlockPrefix: key => `feishu-${key}`,
    textLength: node => node.innerText.length,
    topLevelFeishuBlocks: page => page.children,
    wait: async () => {},
    ...extra,
  };
}

async function bilibiliVideoContract() {
  const html = read("bilibili-video.html");
  const jsonLd = JSON.parse(match(html, /<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/i));
  const title = match(html, /<h1[^>]*video-title[^>]*>([^<]+)/i);
  const description = match(html, /<div[^>]*id="v_desc"[^>]*>([\s\S]*?)<\/div>/i).replace(/<br\s*\/?\s*>/gi, "\n");
  const chapters = [...html.matchAll(/video-pod__item[^>]*>([^<]+)/gi)].map(item => new Node("li", item[1]));
  const tags = [...html.matchAll(/<a>([^<]+)<\/a>/gi)].map(item => new Node("a", item[1]));
  const player = new Node("div");
  const document = {
    title,
    body: new Node("body"),
    createElement: tag => new Node(tag),
    querySelector: selector => ({
      "h1.video-title": new Node("h1", title),
      "#v_desc": new Node("div", description),
      ".bpx-player-container": player,
    })[selector] || null,
    querySelectorAll: selector => selector.includes("video-pod__item") ? chapters : selector === ".video-tag-container a" ? tags : [],
  };
  const mediaUrl = match(html, /<video[^>]*data-source="([^"]+)/i);
  const adapter = loadAdapter("bilibili.js", {
    document,
    location: {hostname: "www.bilibili.com", pathname: "/video/BVTEST", href: "https://www.bilibili.com/video/BVTEST"},
    window: {scrollY: 0, scrollTo() {}},
    HermesExtractorCore: commonCore({jsonLdObjects: () => [jsonLd]}),
    HermesMedia: {
      MEDIA_ATTR: "data-hermes-media-id",
      collect: async () => [{position_id: "video-1", kind: "video", source_url: mediaUrl}],
      pageVideo: () => null,
    },
  });
  assert.equal(adapter.detect({location: {hostname: "www.bilibili.com", pathname: "/video/BVTEST"}}), true);
  const result = await adapter.extract();
  assert.equal(result.title, "机器人视觉入门");
  assert.equal(result.author, "测试作者");
  assert.match(result.element.innerText, /第一段简介.*第二段简介/);
  assert.equal(result.images[0].resolved_url, "https://static.example.test/bili-cover.jpg");
  assert.deepEqual(result.media.map(item => [item.kind, item.source_url]), [["video", mediaUrl]]);
  assert.equal(result.method, "bilibili-video:2-chapters:0-notes");
  assert.equal(adapter.validate(result), true);
}

async function bilibiliOpusContract() {
  const html = read("bilibili-opus.html");
  const title = match(html, /opus-module-title__text[^>]*>([^<]+)/i);
  const author = match(html, /opus-module-author__name[^>]*>([^<]+)/i);
  const published = match(html, /opus-module-author__pub__text[^>]*>([^<]+)/i);
  const avatar = image(match(html, /opus-module-author__avatar[^>]*src="([^"]+)/i), author);
  const poster = match(html, /<video[^>]*poster="([^"]+)/i);
  const mediaUrl = match(html, /<video[^>]*data-source="([^"]+)/i);
  const view = new Node("main");
  const content = new Node("section", match(html, /opus-module-content[^>]*><p>([^<]+)/i));
  const pictureUrl = match(html, /opus-module-pic[^>]*><img[^>]*src="([^"]+)/i);
  const picture = image(pictureUrl, "机械臂示意图");
  picture.setAttribute(POSITION_ATTR, "opus-image-1");
  const pictureModule = new Node("section");
  pictureModule.appendChild(picture);
  pictureModule._images = [{position_id: "opus-image-1", resolved_url: pictureUrl, alt: picture.alt}];
  const document = {
    title,
    documentElement: {scrollHeight: 900},
    createElement: tag => new Node(tag),
    querySelector: selector => ({
      ".bili-opus-view": view,
      ".opus-module-title__text": new Node("h1", title),
      ".opus-module-author__name": new Node("span", author),
      ".opus-module-author__pub__text": new Node("time", published),
      ".opus-module-author__avatar img": avatar,
      ".opus-module-top": new Node("section"),
      ".opus-module-top video": null,
      ".opus-module-top .bpx-player-video-poster": null,
    })[selector] ?? null,
    querySelectorAll: selector => selector.includes("opus-module-content") ? [content, pictureModule] : [],
  };
  const adapter = loadAdapter("bilibili.js", {
    document,
    location: {hostname: "www.bilibili.com", pathname: "/opus/123", href: "https://www.bilibili.com/opus/123"},
    window: {scrollY: 0, scrollTo() {}},
    HermesExtractorCore: commonCore({metadata: () => poster}),
    HermesMedia: {
      MEDIA_ATTR: "data-hermes-media-id",
      collect: async () => [{position_id: "opus-video", kind: "video", source_url: mediaUrl}],
      pageVideo: () => null,
      bilibiliVideoPage: () => true,
    },
  });
  const result = await adapter.extract();
  assert.equal(result.page_variant, "bilibili-opus");
  assert.equal(result.title, title);
  assert.equal(result.author, author);
  assert.match(result.element.innerText, /机械臂实验记录.*实验正文第一段/);
  assert.ok(result.images.some(item => item.resolved_url === pictureUrl));
  assert.equal(result.media[0].source_url, mediaUrl);
  assert.equal(result.method, "bilibili-opus:2-modules");
  assert.equal(adapter.validate(result), true);
}

async function feishuContract() {
  const html = read("feishu-document.html");
  const blocks = [...html.matchAll(/<(h1|p|blockquote|pre|figure)\s+([^>]*data-block-id="([^"]+)"[^>]*)>([\s\S]*?)<\/\1>/gi)].map(matchValue => {
    const [, tag, attrs, id, body] = matchValue;
    const kind = match(attrs, /data-hermes-kind="([^"]+)/i);
    const text = body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const block = new Node(tag, text, {"data-block-id": id, "data-hermes-kind": kind});
    const imageUrl = match(body, /<img[^>]*src="([^"]+)/i);
    const canvasUrl = match(body, /<canvas[^>]*data-image="([^"]+)/i);
    if (imageUrl) block._fixtureImage = imageUrl;
    if (canvasUrl) block._canvasImage = canvasUrl;
    return block;
  });
  const page = new Node("main");
  blocks.forEach(block => page.appendChild(block));
  const core = commonCore({
    collectImages(block, prefix) {
      if (!block._fixtureImage) return [];
      const position = `${prefix}-image-0`;
      const marker = image(block._fixtureImage, "结构图");
      marker.setAttribute(POSITION_ATTR, position);
      block.appendChild(marker);
      return [{position_id: position, resolved_url: block._fixtureImage, alt: "结构图"}];
    },
    async collectCanvasImages(block, prefix) {
      if (!block._canvasImage) return [];
      const position = `${prefix}-canvas-0`;
      const marker = image(block._canvasImage, "Canvas 图像");
      marker.setAttribute(POSITION_ATTR, position);
      block.appendChild(marker);
      return [{position_id: position, resolved_url: block._canvasImage, data_url: block._canvasImage, alt: "Canvas 图像"}];
    },
  });
  const document = {
    createElement: tag => new Node(tag),
    querySelector: selector => selector === ".docx-page-block" ? page : null,
  };
  const adapter = loadAdapter("feishu.js", {
    document,
    location: {hostname: "docs.feishu.cn", pathname: "/docx/test"},
    HermesExtractorCore: core,
  });
  assert.equal(adapter.detect({location: {hostname: "docs.feishu.cn"}}), true);
  const result = await adapter.extract();
  assert.equal(result.page_variant, "feishu-document");
  assert.equal(result.method, "feishu-virtual-document:6-blocks");
  assert.match(result.element.innerText, /虚拟文档标题.*第一段正文.*重要提示.*print\('PageNest'\)/);
  assert.deepEqual(Array.from(result.images, item => item.position_id), ["feishu-image-image-0", "feishu-canvas-canvas-0"]);
  assert.match(result.element.outerHTML, /data-hermes-kind="(?:heading|callout|code)"/);
  assert.equal(adapter.validate(result), true);
}

async function guyueContract(file, selector, expectedTitle, expectedImage) {
  const html = read(file);
  const bodyMatch = selector === "#article-detail"
    ? match(html, /<article[^>]*id="article-detail"[^>]*>([\s\S]*?)<\/article>/i)
    : match(html, /<div[^>]*class="html"[^>]*>([\s\S]*?)<\/div>/i);
  const text = bodyMatch.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const root = new Node("article", text);
  const imageUrl = match(bodyMatch, /<img[^>]*src="([^"]+)/i);
  const document = {querySelector: value => value === selector ? root : null};
  const core = commonCore({
    waitForContent: async predicate => Boolean(predicate()),
    findArticleBySelectors: (selectors, name) => {
      assert.ok(selectors.includes(selector));
      return {element: root, images: [{resolved_url: imageUrl}], method: `${name}:${selector}`, title: expectedTitle};
    },
  });
  const adapter = loadAdapter("guyue.js", {
    document,
    location: {hostname: "www.guyuehome.com", pathname: "/post/test"},
    HermesExtractorCore: core,
  });
  assert.equal(adapter.detect({location: {hostname: "www.guyuehome.com"}}), true);
  assert.equal(await adapter.preparePage(), true);
  const result = await adapter.extract();
  assert.match(result.element.innerText, new RegExp(expectedTitle));
  assert.equal(result.images[0].resolved_url, expectedImage);
  assert.equal(result.method, `guyue:${selector}`);
  assert.equal(adapter.validate(result), true);
}

(async () => {
  await bilibiliVideoContract();
  await feishuContract();
  await guyueContract("guyue-current.html", "#article-detail", "移动机器人路径规划", "https://static.example.test/path-plan.png");
  await guyueContract("guyue-legacy.html", ".detail-fuwenben .html", "旧版机器人控制文章", "https://static.example.test/legacy-control.png");
  await bilibiliOpusContract();
  console.log("adapter fixture contracts passed");
})().catch(error => { console.error(error); process.exitCode = 1; });
