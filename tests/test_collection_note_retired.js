const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const popupHtml = fs.readFileSync(path.join(root, "extension/popup.html"), "utf8");
const popupJs = fs.readFileSync(path.join(root, "extension/popup.js"), "utf8");
const extractorJs = fs.readFileSync(path.join(root, "extension/extractor.js"), "utf8");
const organizer = fs.readFileSync(path.join(root, "local-server/collector/organizers.py"), "utf8");
const rendering = fs.readFileSync(path.join(root, "local-server/collector/rendering.py"), "utf8");
const zh = JSON.parse(fs.readFileSync(path.join(root, "extension/_locales/zh_CN/messages.json"), "utf8"));
const en = JSON.parse(fs.readFileSync(path.join(root, "extension/_locales/en/messages.json"), "utf8"));

assert.doesNotMatch(popupHtml, /id="note"|collectionNote|notePlaceholder/, "NOTE-01");
assert.doesNotMatch(popupJs, /\$\("note"\)|\.user_note\s*=/, "NOTE-02 popup payload");
assert.doesNotMatch(extractorJs, /user_note\s*:/, "NOTE-02 capture payload");
assert.doesNotMatch(organizer, /"user_note"\s*:/, "NOTE-02 organizer prompt");
assert.doesNotMatch(rendering, /data-pagenest-role="note"|收藏备注|未填写收藏备注/, "NOTE-03");
for (const key of ["collectionNote", "optional", "notePlaceholder"]) {
  assert.equal(zh[key], undefined);
  assert.equal(en[key], undefined);
}

console.log("collection note retirement tests passed");
