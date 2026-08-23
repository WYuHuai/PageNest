(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.PageNestVideoNotebookSession = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const STORAGE_KEY = "activeVideoNotebookSession";
  const TRACKING_QUERY = /^(?:utm_.+|spm|from|xsec_.+|vd_source|spm_id_from|from_spmid)$/i;

  class SessionError extends Error {
    constructor(code, message) {
      super(message);
      this.name = "SessionError";
      this.code = code;
    }
  }

  function normalizeRelativePath(value) {
    const path = String(value || "").trim();
    const parts = path.split("/");
    if (
      !path ||
      path.startsWith("/") ||
      path.startsWith("\\") ||
      /^[a-z]:/i.test(path) ||
      path.includes("\\") ||
      parts.some((part) => !part || part === "." || part === "..") ||
      !path.toLowerCase().endsWith(".pagenest")
    ) {
      throw new SessionError(
        "invalid-notebook-session",
        "Notebook session requires a Vault-relative .pagenest path"
      );
    }
    return path;
  }

  function normalizeSourceUrl(value) {
    let url;
    try {
      url = new URL(String(value || "").trim());
    } catch {
      throw new SessionError("invalid-notebook-session", "Notebook source URL is invalid");
    }
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new SessionError("invalid-notebook-session", "Notebook source must use HTTP or HTTPS");
    }
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING_QUERY.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.toString();
  }

  function validateSession(value) {
    const notebookId = String(value?.notebook_id || "").trim();
    if (!notebookId || notebookId.length > 64) {
      throw new SessionError("invalid-notebook-session", "Notebook ID is invalid");
    }
    return Object.freeze({
      notebook_id: notebookId,
      relative_path: normalizeRelativePath(value?.relative_path),
      source_url: normalizeSourceUrl(value?.source_url),
      source_title: String(value?.source_title || "").trim().slice(0, 2000),
    });
  }

  function storageArea(options = {}) {
    const storage = options.storage || globalThis.chrome?.storage?.session;
    if (!storage) {
      throw new SessionError("session-storage-unavailable", "chrome.storage.session is unavailable");
    }
    return storage;
  }

  async function setSession(value, options = {}) {
    const session = validateSession(value);
    await storageArea(options).set({ [STORAGE_KEY]: session });
    return session;
  }

  async function getSession(options = {}) {
    const stored = await storageArea(options).get(STORAGE_KEY);
    if (!stored?.[STORAGE_KEY]) return null;
    try {
      return validateSession(stored[STORAGE_KEY]);
    } catch {
      await storageArea(options).remove(STORAGE_KEY);
      return null;
    }
  }

  async function clearSession(options = {}) {
    await storageArea(options).remove(STORAGE_KEY);
    return null;
  }

  function sourcesMatch(first, second) {
    try {
      return normalizeSourceUrl(first) === normalizeSourceUrl(second);
    } catch {
      return false;
    }
  }

  return Object.freeze({
    STORAGE_KEY,
    SessionError,
    validateSession,
    setSession,
    getSession,
    clearSession,
    sourcesMatch,
  });
});
