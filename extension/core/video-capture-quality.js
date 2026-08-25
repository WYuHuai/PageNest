(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.PageNestVideoCaptureQuality = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const SETTING_KEY = "videoCaptureQuality";
  const DEFAULT_PROFILE = "standard";
  const PROFILES = Object.freeze({
    standard: Object.freeze({
      key: "standard",
      mimeType: "image/png",
      maxDimension: 1920,
    }),
    high: Object.freeze({
      key: "high",
      mimeType: "image/png",
      maxDimension: 3072,
    }),
  });

  function normalize(value) {
    return Object.hasOwn(PROFILES, value) ? value : DEFAULT_PROFILE;
  }

  function profile(value = DEFAULT_PROFILE) {
    return PROFILES[normalize(value)];
  }

  async function load(storage = root.chrome?.storage?.local) {
    if (!storage || typeof storage.get !== "function") return profile();
    const values = await storage.get({ [SETTING_KEY]: DEFAULT_PROFILE });
    return profile(values?.[SETTING_KEY]);
  }

  async function save(value, storage = root.chrome?.storage?.local) {
    if (!storage || typeof storage.set !== "function") {
      throw new Error("chrome.storage.local is unavailable");
    }
    const selected = normalize(value);
    await storage.set({ [SETTING_KEY]: selected });
    return profile(selected);
  }

  return Object.freeze({
    SETTING_KEY,
    DEFAULT_PROFILE,
    PROFILES,
    normalize,
    profile,
    load,
    save,
  });
});
