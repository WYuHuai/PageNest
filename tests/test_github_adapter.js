const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

let registered;
const context = vm.createContext({
  HermesAdapters: {register: adapter => { registered = adapter; }},
  HermesExtractorCore: {},
});
context.globalThis = context;
vm.runInContext(
  fs.readFileSync(path.resolve(__dirname, "../extension/adapters/github.js"), "utf8"),
  context,
);

assert.equal(registered.detect({location: {hostname: "github.com"}}), true);
assert.equal(registered.detect({location: {hostname: "gist.github.com"}}), false);

const removed = [];
const unwrapped = [];
registered.transformClone({
  querySelectorAll(selector) {
    if (selector.includes("Permalink")) return [{remove: () => removed.push(selector)}];
    return [{childNodes: ["heading"], replaceWith: (...nodes) => unwrapped.push(nodes)}];
  },
});
assert.equal(removed.length, 1);
assert.deepEqual(unwrapped, [["heading"]]);

const coreSource = fs.readFileSync(
  path.resolve(__dirname, "../extension/core/extractor-core.js"),
  "utf8",
);
assert.ok(coreSource.indexOf('getAttribute("data-canonical-src")') < coreSource.indexOf('img.currentSrc'));
console.log("github adapter cleanup and image source tests passed");
