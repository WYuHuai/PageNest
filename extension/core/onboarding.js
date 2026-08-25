(function(root) {
  "use strict";

  const COMPANION_DOWNLOAD_URL =
    "https://github.com/WYuHuai/PageNest/releases/latest/download/PageNest-Setup.exe";
  const ALLOWED_DOWNLOAD_HOST = "github.com";
  const STATES = Object.freeze({
    CONNECTED: "connected",
    MISSING: "missing",
    INCOMPATIBLE: "incompatible",
    ERROR: "error",
  });

  function assertSafeDownloadUrl(value = COMPANION_DOWNLOAD_URL) {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== ALLOWED_DOWNLOAD_HOST) {
      throw new Error("Unsafe PageNest companion download URL");
    }
    return url.href;
  }

  function classify(result, diagnostic = "") {
    if (result?.incompatible) return STATES.INCOMPATIBLE;
    if (result?.meta) return STATES.CONNECTED;
    if (diagnostic === "service-unreachable") return STATES.MISSING;
    return STATES.ERROR;
  }

  async function check(connection = root.PageNestConnection) {
    const result = await connection.connect();
    const diagnostic = result ? "" : connection.diagnostic();
    return {
      state: classify(result, diagnostic),
      result,
      diagnostic,
    };
  }

  function openInstaller(tabs = root.chrome?.tabs) {
    return tabs.create({url: assertSafeDownloadUrl()});
  }

  const api = Object.freeze({
    ALLOWED_DOWNLOAD_HOST,
    COMPANION_DOWNLOAD_URL,
    STATES,
    assertSafeDownloadUrl,
    check,
    classify,
    openInstaller,
  });
  if (typeof module === "object" && module.exports) module.exports = api;
  root.PageNestOnboarding = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
