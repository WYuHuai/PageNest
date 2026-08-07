(() => {
  const {findArticleBySelectors} = HermesExtractorCore;
  HermesAdapters.register({
    name: "xiaohongshu",
    detect: ({location}) => /(^|\.)xiaohongshu\.com$/i.test(location.hostname),
    extract: async () => findArticleBySelectors(
      ["#detail-container", "#noteContainer", ".note-container", ".note-content"],
      "xiaohongshu",
      {minimumTextLength: 40, minimumImages: 1},
    ),
    validate: result => Boolean(result?.element && result.method),
  });
})();
