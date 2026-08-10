(function(root) {
  "use strict";

  const providers = [
    {id: "custom", label: "自己填写", url: "", models: []},
    {id: "openai", label: "OpenAI", url: "https://api.openai.com/v1", models: ["gpt-5.2", "gpt-5-mini"]},
    {id: "deepseek", label: "DeepSeek", url: "https://api.deepseek.com", models: ["deepseek-chat", "deepseek-reasoner"]},
    {id: "dashscope", label: "阿里云百炼", url: "https://dashscope.aliyuncs.com/compatible-mode/v1", models: ["qwen-plus", "qwen-turbo"]},
    {id: "siliconflow", label: "硅基流动", url: "https://api.siliconflow.cn/v1", models: ["Pro/deepseek-ai/DeepSeek-R1", "Qwen/Qwen2.5-72B-Instruct"]},
    {id: "zhipu", label: "智谱 BigModel", url: "https://open.bigmodel.cn/api/paas/v4", models: ["glm-5.2", "glm-4.5"]},
    {id: "lmstudio", label: "LM Studio（本地）", url: "http://127.0.0.1:1234/v1", models: []},
    {id: "ollama", label: "Ollama（本地）", url: "http://127.0.0.1:11434/v1", models: []},
  ];

  function normalizeUrl(value) {
    return String(value || "").trim().replace(/\/+$/, "").replace("localhost", "127.0.0.1");
  }

  function findProvider(id) {
    return providers.find(provider => provider.id === id) || providers[0];
  }

  function findProviderByUrl(url) {
    const normalized = normalizeUrl(url);
    return providers.find(provider => provider.url && normalizeUrl(provider.url) === normalized) || providers[0];
  }

  const api = Object.freeze({providers, findProvider, findProviderByUrl});
  if (typeof module === "object" && module.exports) module.exports = api;
  root.PageNestAiPresets = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
