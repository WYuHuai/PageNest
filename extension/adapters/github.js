HermesAdapters.register({
  name: "github",
  detect: ({location}) => location.hostname === "github.com",
  allowFallback: true,
  extract: async () => HermesExtractorCore.findArticleBySelectors(
    ["article.markdown-body", "#readme .markdown-body", ".repository-content .markdown-body"],
    "github-readme",
    {minimumTextLength: 80, minimumImages: 1},
  ),
  transformClone: clone => {
    clone.querySelectorAll(".anchor,.octicon-link,[aria-label='Permalink']").forEach(node => node.remove());
    clone.querySelectorAll("h1 a,h2 a,h3 a,h4 a,h5 a,h6 a").forEach(anchor => {
      anchor.replaceWith(...anchor.childNodes);
    });
  },
  validate: result => Boolean(result?.element),
});
