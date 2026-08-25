const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "extension/manifest.json"), "utf8"));
const zh = JSON.parse(fs.readFileSync(path.join(root, "extension/_locales/zh_CN/messages.json"), "utf8"));
const en = JSON.parse(fs.readFileSync(path.join(root, "extension/_locales/en/messages.json"), "utf8"));
const popupHtml = fs.readFileSync(path.join(root, "extension/popup.html"), "utf8");
const popupJs = fs.readFileSync(path.join(root, "extension/popup.js"), "utf8");
const i18n = require("../extension/core/i18n.js");

assert.equal(manifest.default_locale, "zh_CN");
assert.equal(manifest.name, "__MSG_extensionName__");
assert.equal(manifest.description, "__MSG_extensionDescription__");
assert.deepEqual(Object.keys(zh).sort(), Object.keys(en).sort(), "locale key sets must match");
for (const key of ["extensionName", "extensionDescription", "brandSubtitle", "tabSave", "tabSettings"]) {
  assert.ok(zh[key]?.message);
  assert.ok(en[key]?.message);
}
assert.ok(popupHtml.includes('src="core/i18n.js"'));
assert.ok(popupHtml.includes('data-i18n="brandSubtitle"'));
assert.ok(popupJs.includes("PageNestI18n.localizeDocument()"));
assert.equal(/[\u4e00-\u9fff]/u.test(popupJs), false, "popup runtime strings must come from chrome.i18n");
const referenced = new Set([
  ...[...popupHtml.matchAll(/data-i18n(?:-[a-z-]+)?="([A-Za-z0-9]+)"/g)].map(match => match[1]),
  ...[...popupJs.matchAll(/\bt\("([A-Za-z0-9]+)"/g)].map(match => match[1]),
  ...manifest.name.matchAll(/__MSG_([A-Za-z0-9]+)__/g),
  ...manifest.description.matchAll(/__MSG_([A-Za-z0-9]+)__/g),
].map(value => Array.isArray(value) ? value[1] : value));
assert.deepEqual([...referenced].filter(key => !zh[key]), [], "every referenced localization key must exist");
assert.equal(i18n.message("missing"), "missing");

console.log("extension localization contract passed");
