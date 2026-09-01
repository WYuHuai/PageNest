const WECHAT_HEADING_SELECTOR = "h1,h2,h3,h4,h5,h6";

function numericFontWeight(value) {
  if (value === "normal") return 400;
  if (value === "bold") return 700;
  const weight = Number.parseInt(value, 10);
  return Number.isFinite(weight) ? weight : NaN;
}

function headingAncestor(node, boundary) {
  for (let parent = node.parentElement; parent && parent !== boundary; parent = parent.parentElement) {
    if (/^H[1-6]$/.test(parent.tagName)) return parent;
  }
  return null;
}

function invalidHeadingGroups(root, headings) {
  const nested = new Set();
  for (const heading of headings) {
    for (let ancestor = headingAncestor(heading, root); ancestor; ancestor = headingAncestor(ancestor, root)) {
      nested.add(heading);
      nested.add(ancestor);
    }
  }
  const groups = [];
  for (const heading of headings) {
    if (!nested.has(heading) || headingAncestor(heading, root)) continue;
    groups.push(headings.filter(candidate => nested.has(candidate) && heading.contains(candidate)));
  }
  return groups;
}

function ordinaryHeadingGroup(group, articleStyle, getComputedStyle) {
  const articleSize = Number.parseFloat(articleStyle.fontSize);
  const articleWeight = numericFontWeight(articleStyle.fontWeight);
  if (!(articleSize > 0) || !Number.isFinite(articleWeight)) return false;
  return group.every(heading => {
    const style = getComputedStyle(heading);
    const fontSize = Number.parseFloat(style?.fontSize);
    const fontWeight = numericFontWeight(style?.fontWeight);
    return fontSize > 0
      && fontSize <= articleSize
      && Number.isFinite(fontWeight)
      && fontWeight <= articleWeight;
  });
}

function replaceHeadingWithDiv(heading) {
  const replacement = heading.ownerDocument.createElement("div");
  for (const attribute of heading.attributes) {
    replacement.setAttribute(attribute.name, attribute.value);
  }
  for (const child of [...heading.childNodes]) replacement.appendChild(child);
  heading.replaceWith(replacement);
}

function normalizeOrdinaryNestedHeadings(clone, context) {
  if (String(context.location?.hostname || "").toLowerCase() !== "mp.weixin.qq.com") return;
  const sourceRoot = context.sourceElement;
  const articleRoot = sourceRoot?.matches?.("#js_content")
    ? sourceRoot
    : sourceRoot?.querySelector?.("#js_content");
  const cloneRoot = clone?.matches?.("#js_content")
    ? clone
    : clone?.querySelector?.("#js_content");
  if (!sourceRoot || !articleRoot || !cloneRoot) return;

  const getComputedStyle = context.document?.defaultView?.getComputedStyle?.bind(context.document.defaultView);
  if (!getComputedStyle) return;
  const sourceHeadings = [...articleRoot.querySelectorAll(WECHAT_HEADING_SELECTOR)];
  const cloneHeadings = [...cloneRoot.querySelectorAll(WECHAT_HEADING_SELECTOR)];
  if (sourceHeadings.length !== cloneHeadings.length) return;

  let articleStyle;
  try {
    articleStyle = getComputedStyle(articleRoot);
  } catch (_) {
    return;
  }
  const groups = invalidHeadingGroups(articleRoot, sourceHeadings);
  const normalize = new Set();
  for (const group of groups) {
    try {
      if (ordinaryHeadingGroup(group, articleStyle, getComputedStyle)) {
        group.forEach(heading => normalize.add(sourceHeadings.indexOf(heading)));
      }
    } catch (_) {
      // Computed style is the safety signal. Preserve the chain when it is unavailable.
    }
  }
  [...normalize]
    .sort((left, right) => right - left)
    .forEach(index => replaceHeadingWithDiv(cloneHeadings[index]));
}

const WECHAT_NON_ARTICLE_SELECTORS = [
  "#js_pc_qr_code",
  "#js_tags",
  ".rich_media_tool",
  ".rich_media_extra",
  ".qr_code_pc",
  ".reward_area",
  ".comment_area",
  "[class*='share']",
  "[class*='recommend']",
  "[class*='advertisement']",
];

function textOf(root, selector) {
  return String(root?.querySelector?.(selector)?.textContent || "").trim();
}

function transformWechatArticle(clone, context) {
  normalizeOrdinaryNestedHeadings(clone, context);
  for (const selector of WECHAT_NON_ARTICLE_SELECTORS) {
    clone.querySelectorAll?.(selector).forEach(element => element.remove());
  }
}

HermesAdapters.register({
  name: "wechat",
  specialized: true,
  detect: ({location}) => String(location.hostname || "").toLowerCase() === "mp.weixin.qq.com",
  extract: async ({document}) => {
    const content = document.querySelector("#js_content") || document.querySelector(".rich_media_content");
    if (!PageNestContentQuality.isReadableArticle(content?.innerText || content?.textContent)) return null;
    const element = content.closest?.(".rich_media_area_primary")
      || document.querySelector(".rich_media_area_primary")
      || content;
    return {
      element,
      title: textOf(element, "#activity-name"),
      author: textOf(element, "#js_name") || textOf(element, ".rich_media_meta_text"),
      published_at: textOf(element, "#publish_time"),
      site_name: "微信公众号",
      page_variant: "wechat-article",
      images: HermesExtractorCore.collectImages(element, "", {minimumImageSize: 12}),
      method: "wechat:article-root",
    };
  },
  transformClone: transformWechatArticle,
  validate: result => Boolean(
    result?.element
    && PageNestContentQuality.isReadableArticle(
      result.element.querySelector?.("#js_content")?.innerText
      || result.element.innerText
      || result.element.textContent,
    ),
  ),
});
