HermesAdapters.register({
  name: "wechat",
  detect: ({location}) => /(^|\.)(weixin\.qq\.com|wechat\.com)$/.test(location.hostname),
  extract: async ({document}) => {
    for (const selector of ["#js_content", ".rich_media_content", ".rich_media_area_primary"]) {
      const element = document.querySelector(selector);
      if (PageNestContentQuality.isReadableArticle(element?.innerText || element?.textContent)) {
        return {element, method: `wechat:${selector}`};
      }
    }
    return null;
  },
  validate: result => Boolean(
    result?.element
    && PageNestContentQuality.isReadableArticle(result.element.innerText || result.element.textContent),
  ),
});
