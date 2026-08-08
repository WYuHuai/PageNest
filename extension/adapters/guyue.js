(() => {
  const {findArticleBySelectors, waitForContent} = HermesExtractorCore;
  const ARTICLE_SELECTORS = [
    "#article-detail",
    "#articleDetail",
    ".article-detail .article-content",
    ".post-detail .article-content",
    "[class*='detail-page'] [class*='content']",
    "[class*='article-detail'] [class*='content']",
    ".detail-content .markdown-body",
    ".detail-content .article-content",
    ".article-content",
    ".post-content",
    ".md-content",
    "main article",
    "article",
    "main",
  ];
  const findArticleRoot = () => ARTICLE_SELECTORS.map(selector => document.querySelector(selector)).find(Boolean) || null;
  const hasMeaningfulContent = () => {
    const root = findArticleRoot();
    const content = (root?.innerText || root?.textContent || "").replace(/\s+/g, "");
    return Boolean(root && content.length >= 80);
  };
  HermesAdapters.register({
    name: "guyue",
    allowFallback: false,
    notFoundMessage: "请打开古月居的文章详情页后再保存；首页、问答和个人页不能作为文章保存。",
    detect: ({location}) => /(^|\.)guyuehome\.com$/i.test(location.hostname),
    preparePage: async () => waitForContent(hasMeaningfulContent),
    extract: async () => findArticleBySelectors(
      ARTICLE_SELECTORS,
      "guyue",
      {minimumTextLength: 80, minimumImages: 1},
    ),
    validate: result => Boolean(result?.element && result.method),
  });
})();
