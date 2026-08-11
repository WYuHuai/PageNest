const assert = require("assert");
const fs = require("fs");
const path = require("path");
const presets = require("../extension/core/ai-presets.js");

assert.strictEqual(presets.providers[0].id, "custom", "自己填写必须排在最前面");

const expectedUrls = {
  openai: "https://api.openai.com/v1",
  deepseek: "https://api.deepseek.com",
  dashscope: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  siliconflow: "https://api.siliconflow.cn/v1",
  zhipu: "https://open.bigmodel.cn/api/paas/v4",
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai",
  minimax: "https://api.minimaxi.com/v1",
  openrouter: "https://openrouter.ai/api/v1",
  lmstudio: "http://127.0.0.1:1234/v1",
  ollama: "http://127.0.0.1:11434/v1",
};

for (const [id, url] of Object.entries(expectedUrls)) {
  assert.strictEqual(presets.findProvider(id).url, url, `${id} URL 应保持准确`);
  assert.strictEqual(presets.findProviderByUrl(`${url}/`).id, id, `${id} URL 应忽略尾部斜杠`);
}

assert.strictEqual(
  presets.findProviderByUrl("http://localhost:1234/v1").id,
  "lmstudio",
  "localhost 与 127.0.0.1 应识别为同一本地接口"
);
assert.strictEqual(presets.findProviderByUrl("https://example.com/v1").id, "custom");
assert(
  presets.providers.every(provider => !("models" in provider)),
  "平台模型会变化，不应维护不完整的硬编码快捷清单"
);

const popupHtml = fs.readFileSync(path.resolve(__dirname, "../extension/popup.html"), "utf8");
const popupJs = fs.readFileSync(path.resolve(__dirname, "../extension/popup.js"), "utf8");
assert(popupHtml.indexOf('id="aiUrl"') < popupHtml.indexOf('id="aiProviderPreset"'));
assert(popupHtml.includes('id="aiModel"'));
assert(!popupHtml.includes('id="aiModelPreset"'));
assert(!popupHtml.includes('id="refreshAiModels"'));
assert(!popupJs.includes('api("/api/ai-models"'));
assert(popupJs.includes("savedAiKeyCanBeReused"));

console.log("AI provider preset tests passed");
