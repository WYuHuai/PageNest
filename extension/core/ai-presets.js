(function(root) {
  "use strict";

  const providers = [
    {id: "custom", labelKey: "providerCustom", label: "Custom", url: ""},
    {id: "openai", labelKey: "providerOpenai", label: "OpenAI", url: "https://api.openai.com/v1"},
    {id: "deepseek", labelKey: "providerDeepseek", label: "DeepSeek", url: "https://api.deepseek.com"},
    {id: "dashscope", labelKey: "providerDashscope", label: "Alibaba Cloud Model Studio", url: "https://dashscope.aliyuncs.com/compatible-mode/v1"},
    {id: "siliconflow", labelKey: "providerSiliconflow", label: "SiliconFlow", url: "https://api.siliconflow.cn/v1"},
    {id: "zhipu", labelKey: "providerZhipu", label: "Zhipu BigModel", url: "https://open.bigmodel.cn/api/paas/v4"},
    {id: "gemini", labelKey: "providerGemini", label: "Google Gemini", url: "https://generativelanguage.googleapis.com/v1beta/openai"},
    {id: "minimax", labelKey: "providerMinimax", label: "MiniMax", url: "https://api.minimaxi.com/v1"},
    {id: "openrouter", labelKey: "providerOpenrouter", label: "OpenRouter", url: "https://openrouter.ai/api/v1"},
    {id: "lmstudio", labelKey: "providerLmstudio", label: "LM Studio (local)", url: "http://127.0.0.1:1234/v1"},
    {id: "ollama", labelKey: "providerOllama", label: "Ollama (local)", url: "http://127.0.0.1:11434/v1"},
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
