globalThis.PageNestContentQuality = (() => {
  const SCRIPT_MARKERS = [
    /!function\(\)\{var\b/,
    /Object\.defineProperty\([^)]*["']__esModule["']/,
    /\b__webpack_(?:modules|require|exports)__\b/,
    /Generator is already executing/,
    /sourceMappingURL=/,
  ];

  function looksLikeScriptBundle(text) {
    const value = String(text || "");
    if (value.length < 1200) return false;
    return SCRIPT_MARKERS.filter(marker => marker.test(value)).length >= 2;
  }

  function isReadableArticle(text) {
    const value = String(text || "").replace(/\s+/g, "").trim();
    return value.length >= 180 && !looksLikeScriptBundle(text);
  }

  return {isReadableArticle, looksLikeScriptBundle};
})();
