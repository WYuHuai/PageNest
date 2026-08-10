(function(root) {
  "use strict";

  const providers = [
    {id: "custom", label: "自己填写", url: "", models: []},
    {id: "openai", label: "OpenAI", url: "https://api.openai.com/v1", models: ["gpt-5.2", "gpt-5-mini"]},
    {id: "deepseek", label: "DeepSeek", url: "https://api.deepseek.com", models: ["deepseek-v4-flash", "deepseek-v4-pro"]},
    {id: "dashscope", label: "阿里云百炼", url: "https://dashscope.aliyuncs.com/compatible-mode/v1", models: ["qwen3.7-max", "qwen3.7-plus", "qwen3.6-plus", "qwen3.6-flash", "qwen-plus"]},
    {id: "siliconflow", label: "硅基流动", url: "https://api.siliconflow.cn/v1", models: []},
    {id: "zhipu", label: "智谱 BigModel", url: "https://open.bigmodel.cn/api/paas/v4", models: ["glm-5.2", "glm-5.1", "glm-5-turbo", "glm-5", "glm-4.7", "glm-4.7-flash", "glm-4.7-flashx", "glm-4.6", "glm-4.5-air", "glm-4.5-airx", "glm-4.5-flash"]},
    {id: "gemini", label: "Google Gemini", url: "https://generativelanguage.googleapis.com/v1beta/openai", models: ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite"]},
    {id: "minimax", label: "MiniMax", url: "https://api.minimaxi.com/v1", models: ["MiniMax-M2.7", "MiniMax-M2.7-highspeed", "MiniMax-M2.5", "MiniMax-M2.5-highspeed", "MiniMax-M2.1", "MiniMax-M2.1-highspeed", "MiniMax-M2"]},
    {id: "openrouter", label: "OpenRouter", url: "https://openrouter.ai/api/v1", models: []},
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
