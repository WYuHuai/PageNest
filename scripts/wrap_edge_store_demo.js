const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const output = path.join(root, "store-assets", "edge", "demo");
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === "obsidian") {
    class Empty {}
    return {Modal: Empty, Notice: Empty, Plugin: Empty, TextFileView: Empty};
  }
  return originalLoad.call(this, request, parent, isMain);
};
const {withCopyBridge} = require(path.join(root, "obsidian-plugin", "pagenest-viewer", "main.js"));
Module._load = originalLoad;

const raw = fs.readFileSync(path.join(output, "notebook.raw.html"), "utf8");
const rendered = withCopyBridge(raw, "public-release-demo-channel");
fs.writeFileSync(path.join(output, "notebook.html"), rendered, "utf8");
console.log(path.join(output, "notebook.html"));
