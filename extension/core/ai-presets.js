(function(root) {
  "use strict";

  const providers = [
    {id: "custom", label: "自己填写", url: ""},
    {id: "openai", label: "OpenAI", url: "https://api.openai.com/v1"},
    {id: "deepseek", label: "DeepSeek", url: "https://api.deepseek.com"},
    {id: "dashscope", label: "阿里云百炼", url: "https://dashscope.aliyuncs.com/compatible-mode/v1"},
    {id: "siliconflow", label: "硅基流动", url: "https://api.siliconflow.cn/v1"},
    {id: "zhipu", label: "智谱 BigModel", url: "https://open.bigmodel.cn/api/paas/v4"},
    {id: "gemini", label: "Google Gemini", url: "https://generativelanguage.googleapis.com/v1beta/openai"},
    {id: "minimax", label: "MiniMax", url: "https://api.minimaxi.com/v1"},
    {id: "openrouter", label: "OpenRouter", url: "https://openrouter.ai/api/v1"},
    {id: "lmstudio", label: "LM Studio（本地）", url: "http://127.0.0.1:1234/v1"},
    {id: "ollama", label: "Ollama（本地）", url: "http://127.0.0.1:11434/v1"},
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
