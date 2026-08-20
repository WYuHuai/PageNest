const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(
  path.resolve(__dirname, "../extension/adapters/xiaohongshu.js"),
  "utf8",
);

function element(tagName) {
  return {
    tagName,
    children: [],
    attributes: {},
    appendChild(child) { this.children.push(child); return child; },
    append(...children) { this.children.push(...children); },
    setAttribute(name, value) { this.attributes[name] = value; },
  };
}

function loadVideoAdapter() {
  let registered;
  let mediaCollects = 0;
  const video = {
    currentSrc: "blob:https://www.xiaohongshu.com/video-1",
    poster: "https://sns-img-qc.xhscdn.com/poster.jpg",
    readyState: 4,
    videoWidth: 1080,
    videoHeight: 1440,
    getAttribute: name => name === "src" ? "" : null,
    querySelector: () => null,
    getBoundingClientRect: () => ({width: 540, height: 720}),
  };
  const title = {innerText: "视频笔记标题"};
  const description = {innerText: "这是一篇已经完整加载的小红书视频笔记正文。"};
  const root = {
    innerText: `${title.innerText} ${description.innerText}`,
    querySelector: selector => selector === ".note-title" ? title : selector === ".note-content" ? description : null,
    querySelectorAll: selector => selector === "video" ? [video] : [],
  };
  const shell = {
    innerText: "",
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  const document = {
    title: title.innerText,
    images: [],
    createElement: element,
    querySelector: selector => selector.startsWith("#detail-container") ? shell : selector.startsWith("#noteContainer") ? root : null,
    querySelectorAll: () => [],
  };
  const media = [{
    position_id: "hermes-xhs-video-0",
    kind: "video",
    source_url: video.currentSrc,
    page_url: "",
    poster_url: video.poster,
    data_url: "data:video/mp4;base64,AAAA",
    mime_type: "video/mp4",
    duration: 5,
    width: 1080,
    height: 1440,
    order: 0,
  }];
  const context = vm.createContext({
    URL,
    document,
    location: {
      hostname: "www.xiaohongshu.com",
      pathname: "/explore/video-note",
      href: "https://www.xiaohongshu.com/explore/video-note",
    },
    HermesExtractorCore: {
      POSITION_ATTR: "data-hermes-image-id",
      addTextElement(parent, tagName, text, kind) {
        const child = element(tagName);
        child.textContent = text;
        child.setAttribute("data-hermes-kind", kind);
        parent.appendChild(child);
      },
      markImagePosition: () => "unused-image",
      metadata: () => "",
      resolveImage: image => image.src || "",
      waitForContent: predicate => Promise.resolve(predicate() || predicate()),
    },
    HermesMedia: {
      MEDIA_ATTR: "data-hermes-media-id",
      async collectVideos(videos, prefix) {
        mediaCollects += 1;
        assert.deepEqual(Array.from(videos), [video]);
        assert.equal(prefix, "hermes-xhs-video");
        return media;
      },
    },
    HermesAdapters: {register: adapter => { registered = adapter; }},
  });
  vm.runInContext(source, context, {filename: "xiaohongshu.js"});
  return {adapter: registered, getMediaCollects: () => mediaCollects};
}

(async () => {
  const {adapter, getMediaCollects} = loadVideoAdapter();
  assert.equal(await adapter.preparePage(), true, "the loaded note must win over an earlier matching page shell");
  const result = await adapter.extract();
  assert.equal(getMediaCollects(), 1, "the adapter must collect media from the original note root");
  assert.equal(result.images.length, 0);
  assert.equal(result.media.length, 1);
  assert.equal(adapter.validate(result), true, "video-only notes must be valid captures");
  assert.match(result.method, /1-video/);
  assert.ok(
    result.element.children.some(child => child.children?.some(
      slot => slot.attributes?.["data-hermes-media-id"] === "hermes-xhs-video-0",
    )),
    "the rebuilt article must preserve a media placement slot",
  );
  console.log("xiaohongshu video adapter tests passed");
})().catch(error => { console.error(error); process.exitCode = 1; });
