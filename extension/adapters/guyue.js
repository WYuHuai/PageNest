(() => {
  const {findArticleBySelectors} = HermesExtractorCore;
  HermesAdapters.register({
    name: "guyue",
    detect: ({location}) => /(^|\.)guyuehome\.com$/i.test(location.hostname),
    extract: async () => findArticleBySelectors(
      ["main article", "article", ".article-content", ".post-content", ".md-content"],
      "guyue",
    ),
    validate: result => Boolean(result?.element && result.method),
  });
})();
