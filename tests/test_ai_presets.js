const assert = require("assert");
const presets = require("../extension/core/ai-presets.js");

assert.strictEqual(presets.providers[0].id, "custom", "自己填写必须排在最前面");

const expectedUrls = {
  openai: "https://api.openai.com/v1",
  deepseek: "https://api.deepseek.com",
  dashscope: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  siliconflow: "https://api.siliconflow.cn/v1",
  zhipu: "https://open.bigmodel.cn/api/paas/v4",
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
assert(presets.findProvider("deepseek").models.includes("deepseek-chat"));
assert.deepStrictEqual(presets.findProvider("ollama").models, [], "本地模型名称不应被硬编码");

console.log("AI provider preset tests passed");
