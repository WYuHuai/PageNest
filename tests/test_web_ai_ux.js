const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.resolve(__dirname, "../extension/popup.js"), "utf8");
const start = source.indexOf("async function preflightAiMode");
const end = source.indexOf("async function loadFolders", start);
assert.ok(start >= 0 && end > start, "AI save preflight must be implemented");

const localized = {
  aiNotConfiguredBeforeSave: "请先配置可用的 AI 接口和模型，再使用 AI 总结模式。",
};
const context = vm.createContext({
  t: key => localized[key] || key,
  api: async () => { throw new Error("default api should not run"); },
});
vm.runInContext(`${source.slice(start, end)}\nthis.preflightAiMode=preflightAiMode;`, context);

(async () => {
  const originalCalls = [];
  await context.preflightAiMode({mode: "original"}, async path => originalCalls.push(path));
  assert.deepEqual(originalCalls, [], "AI-WEB-01 original mode never checks or calls AI");

  const configuredCalls = [];
  await context.preflightAiMode({mode: "quick"}, async path => {
    configuredCalls.push(path);
    return {api_url: "https://api.example.test/v1", model_name: "vision-model"};
  });
  assert.deepEqual(configuredCalls, ["/api/ai-settings"]);

  await assert.rejects(
    context.preflightAiMode({mode: "deep"}, async () => ({api_url: "", model_name: ""})),
    /请先配置可用的 AI 接口和模型/,
  );

  assert.match(source, /aiSummaryFailedPageSaved/);
  assert.match(source, /data\.ai_status===\"complete\"/);
  assert.match(source, /await preflightAiMode\(article\);[\s\S]*await prepareCaptureForSave\(article\)/);
  console.log("web AI popup UX tests passed");
})().catch(error => { console.error(error); process.exitCode = 1; });
