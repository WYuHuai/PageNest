(() => {
  const {POSITION_ATTR, addTextElement, markImagePosition, metadata, resolveImage, waitForContent} = HermesExtractorCore;

  const text = node => (node?.innerText || node?.textContent || "").replace(/\s+/g, " ").trim();
  const first = (root, selectors) => selectors.map(selector => root.querySelector(selector)).find(Boolean) || null;
  const noteImage = image => {
    const hint = [image.className, image.alt, image.getAttribute("src")].join(" ").toLowerCase();
    return !/(emoji|emote|sticker|avatar|author|profile|icon|logo)/.test(hint);
  };
  const isDetailPage = () => /^\/(?:explore|discovery\/item)\//.test(location.pathname);

  function imageNodes(root) {
    const isNoteImage = image => {
      if (!noteImage(image)) return false;
      const url = resolveImage(image, location.href);
      try {
        return /(^|\.)(xhscdn\.com|xiaohongshu\.com)$/i.test(new URL(url, location.href).hostname);
      } catch {
        return false;
      }
    };
    const inRoot = (root ? [...root.querySelectorAll("img")] : []).filter(isNoteImage);
    return inRoot.length ? inRoot : [...document.images].filter(isNoteImage);
  }

  function appendGallery(article, root, title) {
    const sourceImages = imageNodes(root);
    if (!sourceImages.length) return [];
    const gallery = document.createElement("section");
    gallery.setAttribute("data-hermes-kind", "xhs-gallery");
    gallery.setAttribute("data-hermes-gallery", "");
    gallery.setAttribute("data-hermes-gallery-index", "0");
    const images = [];
    for (const [index, source] of sourceImages.entries()) {
      const url = resolveImage(source, location.href);
      if (!url) continue;
      const slide = document.createElement("figure");
      slide.setAttribute("data-hermes-kind", "xhs-slide");
      const image = document.createElement("img");
      const position_id = markImagePosition(image, `hermes-xhs-image-${index}`);
      image.src = url;
      image.alt = source.alt || `${title} 图片 ${index + 1}`;
      slide.appendChild(image);
      gallery.appendChild(slide);
      images.push({position_id, original_url: source.getAttribute("src") || "", resolved_url: url, current_src: source.currentSrc || "", alt: image.alt, caption: "", nearby_text: title, width: source.naturalWidth || 0, height: source.naturalHeight || 0, order: images.length, source_type: url.startsWith("data:") ? "data-url" : url.startsWith("blob:") ? "blob-url" : "img", content_hash: "", data_url: url.startsWith("data:") ? url : ""});
    }
    if (!images.length) return images;
    if (images.length > 1) {
      const controls = document.createElement("p");
      controls.setAttribute("data-hermes-kind", "xhs-gallery-controls");
      const previous = document.createElement("a");
      previous.href = "#";
      previous.setAttribute("data-hermes-gallery-prev", "");
      previous.textContent = "‹ 上一张";
      const counter = document.createElement("span");
      counter.setAttribute("data-hermes-kind", "xhs-gallery-count");
      const next = document.createElement("a");
      next.href = "#";
      next.setAttribute("data-hermes-gallery-next", "");
      next.textContent = "下一张 ›";
      controls.append(previous, counter, next);
      gallery.appendChild(controls);
    }
    article.appendChild(gallery);
    return images;
  }

  function appendComments(article) {
    const nodes = [...document.querySelectorAll("#comment-container .comment-item, #comments .comment-item, .comment-container .comment-item, [class*='comment-list'] [class*='comment-item']")];
    const comments = [...new Set(nodes.map(text).filter(value => value.length >= 2 && value.length <= 1600))].slice(0, 80);
    if (!comments.length) return;
    const section = document.createElement("section");
    section.setAttribute("data-hermes-kind", "xhs-comments");
    addTextElement(section, "h2", "评论");
    for (const comment of comments) addTextElement(section, "p", comment, "xhs-comment");
    article.appendChild(section);
  }

  function extractNote() {
    if (!isDetailPage()) return null;
    const root = first(document, ["#detail-container", "#noteContainer", ".note-container", "[class*='note-detail']"]) || document.querySelector("main");
    const title = text(first(root || document, ["#detail-title", ".note-title", "[data-testid='note-title']"])) || metadata(["og:title", "twitter:title"]) || document.title;
    const description = text(first(root || document, ["#detail-desc", ".note-content", ".note-desc", "[data-testid='note-content']"])) || metadata(["og:description", "description"]);
    if (!title) return null;
    const article = document.createElement("article");
    article.setAttribute("data-hermes-kind", "xhs-note");
    addTextElement(article, "h1", title, "xhs-title");
    const author = text(first(root || document, [".author-wrapper .username", ".author-container .name", ".user-info .name", ".author-name"]));
    if (author) addTextElement(article, "p", author, "xhs-author");
    const images = appendGallery(article, root, title);
    if (!images.length) return null;
    if (description) addTextElement(article, "p", description, "xhs-description");
    appendComments(article);
    return {element: article, images, media: [], title, author, page_variant: "xiaohongshu-note", method: `xiaohongshu:note:${images.length}-images`};
  }

  HermesAdapters.register({
    name: "xiaohongshu",
    specialized: true,
    allowFallback: false,
    notFoundMessage: "请打开一篇小红书笔记详情页后再保存；首页、草稿箱和个人中心不会被当成笔记保存。",
    detect: ({location}) => /(^|\.)xiaohongshu\.com$/i.test(location.hostname),
    preparePage: async () => waitForContent(() => document.images.length > 0 || document.querySelector("meta[property='og:title']")),
    extract: async () => extractNote(),
    validate: result => Boolean(result?.element && result.images?.length),
    isContentAcceptable: (value, {images}) => value.replace(/\s+/g, "").length >= 4 && images.length > 0,
  });
})();
