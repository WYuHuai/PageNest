const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

class FakeFileReader {
  readAsDataURL(blob) {
    this.result = blob.dataUrl;
    queueMicrotask(() => this.onload());
  }
}

function node(attributes = {}) {
  return {
    attributes: {...attributes},
    getAttribute(name) { return this.attributes[name] || ""; },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    removeAttribute(name) { delete this.attributes[name]; },
  };
}

(async () => {
  const imageNode = node({
    "data-hermes-image-id": "image-1",
    src: "file:///D:/AI/images/figure.png",
    srcset: "file:///D:/AI/images/figure.png 1x",
  });
  const failedNode = node({
    "data-hermes-image-id": "image-2",
    src: "file:///D:/AI/images/missing.png",
  });
  failedNode.naturalWidth = 128;
  failedNode.naturalHeight = 128;
  const localLink = node({href: "file:///D:/AI/appendix.html"});
  const anchorLink = node({href: "#section-2"});
  const remoteLink = node({href: "https://example.com/reference"});
  const invalidLink = node({href: "http://["});
  const root = {
    querySelectorAll(selector) {
      if (selector === "[data-hermes-image-id]") return [imageNode, failedNode];
      if (selector === "a[href]") return [localLink, anchorLink, remoteLink, invalidLink];
      if (selector === "[src],[poster]") return [imageNode, failedNode];
      return [];
    },
  };
  const requested = [];
  const context = vm.createContext({
    document: {
      createElement: name => {
        assert.equal(name, "canvas");
        return {
          width: 0,
          height: 0,
          getContext: () => ({drawImage() {}}),
          toDataURL: () => "data:image/png;base64,Y2FudmFz",
        };
      },
    },
    PageNestContentQuality: {},
    URL,
    FileReader: FakeFileReader,
    AbortController,
    setTimeout,
    clearTimeout,
    queueMicrotask,
    fetch: async url => {
      requested.push(url);
      if (url.endsWith("missing.png") || url.endsWith("not-rendered.png")) {
        throw new Error("unreadable local image");
      }
      return {
        ok: true,
        blob: async () => ({
          size: 128,
          type: "image/png",
          dataUrl: "data:image/png;base64,ZmFrZQ==",
        }),
      };
    },
  });
  vm.runInContext(
    fs.readFileSync(path.resolve(__dirname, "../extension/core/extractor-core.js"), "utf8"),
    context,
  );

  const images = [
    {position_id: "image-1", original_url: "./images/figure.png", resolved_url: "file:///D:/AI/images/figure.png", current_src: "file:///D:/AI/images/figure.png", data_url: "", source_type: "img"},
    {position_id: "image-2", original_url: "./images/missing.png", resolved_url: "file:///D:/AI/images/missing.png", current_src: "", data_url: "", source_type: "img"},
    {position_id: "image-3", original_url: "data:image/png;base64,AAAA", resolved_url: "data:image/png;base64,AAAA", current_src: "", data_url: "data:image/png;base64,AAAA", source_type: "data-url"},
    {position_id: "image-4", original_url: "https://example.com/remote.png", resolved_url: "https://example.com/remote.png", current_src: "", data_url: "", source_type: "img"},
    {position_id: "image-5", original_url: "./images/not-rendered.png", resolved_url: "file:///D:/AI/images/not-rendered.png", current_src: "", data_url: "", source_type: "img"},
  ];
  const stats = await context.HermesExtractorCore.inlineLocalImages(images, root);
  assert.deepEqual(Array.from(requested), [
    "file:///D:/AI/images/figure.png",
    "file:///D:/AI/images/missing.png",
    "file:///D:/AI/images/not-rendered.png",
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(stats)), {attempted: 3, inlined: 2, failed: 1});

  context.HermesExtractorCore.redactLocalResources(root, images, []);
  assert.equal(imageNode.getAttribute("src"), "data:image/png;base64,ZmFrZQ==");
  assert.equal(imageNode.getAttribute("srcset"), "");
  assert.equal(failedNode.getAttribute("src"), "data:image/png;base64,Y2FudmFz");
  assert.equal(localLink.getAttribute("href"), "");
  assert.equal(anchorLink.getAttribute("href"), "#section-2");
  assert.equal(remoteLink.getAttribute("href"), "https://example.com/reference");
  assert.equal(invalidLink.getAttribute("href"), "");
  assert.equal(images[0].resolved_url, "");
  assert.equal(images[1].resolved_url, "");
  assert.equal(images[2].data_url, "data:image/png;base64,AAAA");
  assert.equal(images[3].resolved_url, "https://example.com/remote.png");
  assert.match(images[4].resolved_url, /^local-resource-unavailable:\/\/image\//);
  assert.doesNotMatch(JSON.stringify({images, imageNode, failedNode, localLink}), /D:|file:\/\//);
  console.log("local HTML resource privacy passed");
})().catch(error => { console.error(error); process.exitCode = 1; });
