(() => {
  const {findArticleBySelectors} = HermesExtractorCore;
  HermesAdapters.register({
    name: "guyue",
    allowFallback: false,
    notFoundMessage: "请打开古月居的文章详情页后再保存；首页、问答和个人页不能作为文章保存。",
    detect: ({location}) => /(^|\.)guyuehome\.com$/i.test(location.hostname),
    extract: async () => findArticleBySelectors(
      [
        ".article-detail .article-content",
        ".post-detail .article-content",
        ".detail-content .markdown-body",
        ".detail-content .article-content",
        ".article-content",
        ".post-content",
        ".md-content",
        "main article",
        "article",
      ],
      "guyue",
    ),
    validate: result => Boolean(result?.element && result.method),
  });
})();
