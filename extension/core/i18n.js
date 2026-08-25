(function(root) {
  "use strict";

  function message(key, substitutions) {
    const value = root.chrome?.i18n?.getMessage?.(key, substitutions);
    return value || key;
  }

  function localizeDocument(documentRef = root.document) {
    if (!documentRef) return;
    documentRef.documentElement.lang = root.chrome?.i18n?.getUILanguage?.() || "zh-CN";
    documentRef.querySelectorAll("[data-i18n]").forEach(node => {
      const value = message(node.dataset.i18n);
      if (value !== node.dataset.i18n) node.textContent = value;
    });
    documentRef.querySelectorAll("[data-i18n-placeholder]").forEach(node => {
      const value = message(node.dataset.i18nPlaceholder);
      if (value !== node.dataset.i18nPlaceholder) node.setAttribute("placeholder", value);
    });
    documentRef.querySelectorAll("[data-i18n-aria-label]").forEach(node => {
      const value = message(node.dataset.i18nAriaLabel);
      if (value !== node.dataset.i18nAriaLabel) node.setAttribute("aria-label", value);
    });
    documentRef.querySelectorAll("[data-i18n-title]").forEach(node => {
      const value = message(node.dataset.i18nTitle);
      if (value !== node.dataset.i18nTitle) node.setAttribute("title", value);
    });
  }

  const api = Object.freeze({message, localizeDocument});
  if (typeof module === "object" && module.exports) module.exports = api;
  root.PageNestI18n = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
