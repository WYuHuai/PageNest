async function buildCapture(adapter, context) {
  const core = HermesExtractorCore;
  let extracted = await adapter.extract(context);
  if (extracted && !adapter.validate(extracted, context)) extracted = null;
  const dynamic = adapter.specialized ? extracted : null;
  const found = extracted || core.findArticle();
  context.sourceElement = found.element;

  const images = dynamic?.images || core.collectImages(found.element);
  const media = dynamic?.media || await HermesMedia.collect(found.element);
  const clone = found.element.cloneNode(true);
  core.normalizeLinks(clone);
  if (!dynamic) core.materializeBackgroundImages(clone);
  const junk = window.top === window ? core.JUNK : ["nav", "footer", "aside", "form", "dialog"];
  if (!dynamic) clone.querySelectorAll(junk.join(",")).forEach(element => element.remove());
  HermesMedia.cleanClone(clone);
  await core.blobData(images);
  clone.querySelectorAll("img").forEach(image => {
    const source = core.resolveImage(image, location.href);
    if (core.isPlaceholderSvgData(source)) {
      image.remove();
      return;
    }
    if (source) image.setAttribute("src", source);
    [...image.attributes]
      .filter(attribute => (attribute.name.startsWith("data-") && attribute.name !== core.POSITION_ATTR) || attribute.name === "srcset")
      .forEach(attribute => image.removeAttribute(attribute.name));
  });

  const markerIds = new Set(
    [...clone.querySelectorAll(`[${core.POSITION_ATTR}]`)]
      .map(node => node.getAttribute(core.POSITION_ATTR))
      .filter(Boolean),
  );
  const missingMarkers = images.filter(image => image.position_id && !markerIds.has(image.position_id));
  const articleText = clone.innerText || clone.textContent || "";
  if (!PageNestContentQuality.isReadableArticle(articleText)) {
    throw new Error("未找到可靠的网页正文：页面返回了脚本内容或正文尚未加载，请刷新网页后重试");
  }
  return {
    capture_version: 12,
    image_placement_policy: dynamic ? "strict" : "fallback",
    page_variant: dynamic?.page_variant || "standard",
    frame_kind: HermesMedia.frameKind(articleText, media, clone),
    title: dynamic?.title || core.metadata(["og:title", "twitter:title"]) || document.title,
    author: dynamic?.author || core.metadata(["author", "article:author", "byl"]),
    published_at: dynamic?.published_at || core.metadata(["article:published_time", "date", "datePublished"]),
    site_name: dynamic?.site_name || core.metadata(["og:site_name", "application-name"]) || location.hostname,
    url: location.href,
    canonical_url: document.querySelector("link[rel='canonical']")?.href || core.metadata(["og:url"]),
    language: document.documentElement.lang || "",
    selected_text: getSelection()?.toString().trim() || "",
    user_note: "",
    article_html: clone.outerHTML,
    article_text: articleText,
    headings: [...clone.querySelectorAll("h1,h2,h3,h4")].map(node => node.innerText.trim()).filter(Boolean),
    images,
    media,
    captured_at: new Date().toISOString(),
    extraction_method: found.method,
    extraction_warning: missingMarkers.length
      ? `检测到 ${missingMarkers.length} 张图片的位置标记在正文清理时丢失`
      : found.method === "whole-page-fallback"
        ? "自动识别不可靠，建议选中文字后重试或仅保存原文"
        : "",
    marker_diagnostics: {images: images.length, markers: markerIds.size, missing: missingMarkers.length},
  };
}


globalThis.collectPage = async function collectPage() {
  const context = {document, location, sourceElement: null};
  const adapter = HermesAdapters.select(context);
  if (!adapter) throw new Error("没有可用的网页提取适配器");
  await adapter.preparePage(context);
  try {
    return await buildCapture(adapter, context);
  } finally {
    if (context.sourceElement) HermesExtractorCore.clearExtractionMarkers(context.sourceElement);
    adapter.cleanup(context);
  }
};
