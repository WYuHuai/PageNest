const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const zh = JSON.parse(fs.readFileSync(path.join(root, "extension/_locales/zh_CN/messages.json"), "utf8"));
const en = JSON.parse(fs.readFileSync(path.join(root, "extension/_locales/en/messages.json"), "utf8"));
const html = fs.readFileSync(path.join(root, "extension/popup.html"), "utf8");

assert.equal(zh.modeWebHelp.message, "最快 · 仅保存原文、图片和排版，不调用 AI", "MODE-01 web");
assert.equal(zh.modeTextHelp.message, "较慢 · 完整保存网页，并调用 AI 阅读正文生成总结", "MODE-01 text");
assert.equal(zh.modeVisionHelp.message, "最慢 · 完整保存网页，并调用 AI 阅读正文和图片；图片越多通常耗时越长", "MODE-01 vision");

assert.equal(en.modeWebHelp.message, "Fastest · Saves the original text, images, and layout without AI", "MODE-02 web");
assert.equal(en.modeTextHelp.message, "Slower · Saves the complete webpage and asks AI to summarize the text", "MODE-02 text");
assert.equal(en.modeVisionHelp.message, "Slowest · Saves the complete webpage and asks AI to read the text and images; more images usually take longer", "MODE-02 vision");

assert.deepEqual(Object.keys(zh).sort(), Object.keys(en).sort(), "MODE-03 locale key sets");
assert.doesNotMatch(zh.modeWebHelp.message + zh.modeTextHelp.message + zh.modeVisionHelp.message, /\d+\s*秒/);
assert.match(html, /最快 · 仅保存原文、图片和排版，不调用 AI/);

console.log("save mode duration copy tests passed");
