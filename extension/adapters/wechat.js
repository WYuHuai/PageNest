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
    : sourceRoot?.closest?.("#js_content");
  if (!sourceRoot || !articleRoot || !articleRoot.contains(sourceRoot)) return;

  const getComputedStyle = context.document?.defaultView?.getComputedStyle?.bind(context.document.defaultView);
  if (!getComputedStyle) return;
  const sourceHeadings = [...sourceRoot.querySelectorAll(WECHAT_HEADING_SELECTOR)];
  const cloneHeadings = [...clone.querySelectorAll(WECHAT_HEADING_SELECTOR)];
  if (sourceHeadings.length !== cloneHeadings.length) return;

  let articleStyle;
  try {
    articleStyle = getComputedStyle(articleRoot);
  } catch (_) {
    return;
  }
  const groups = invalidHeadingGroups(sourceRoot, sourceHeadings);
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
  transformClone: normalizeOrdinaryNestedHeadings,
  validate: result => Boolean(
    result?.element
    && PageNestContentQuality.isReadableArticle(result.element.innerText || result.element.textContent),
  ),
});
