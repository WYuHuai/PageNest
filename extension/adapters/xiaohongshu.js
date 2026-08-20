(() => {
  const {POSITION_ATTR, addTextElement, markImagePosition, metadata, resolveImage, waitForContent} = HermesExtractorCore;

  const text = node => (node?.innerText || node?.textContent || "").replace(/\s+/g, " ").trim();
  const first = (root, selectors) => selectors.map(selector => root.querySelector(selector)).find(Boolean) || null;
  const noteImage = image => {
    const hint = [image.className, image.alt, image.getAttribute("src")].join(" ").toLowerCase();
    return !/(emoji|emote|sticker|avatar|author|profile|icon|logo)/.test(hint);
  };
  const isDetailPage = () => /^\/(?:explore|discovery\/item)\//.test(location.pathname);
  const NOTE_ROOT_SELECTORS = ["#detail-container", "#noteContainer", ".note-container", "[class*='note-detail']"];
  const NOTE_MEDIA_SELECTORS = [".note-slider", "[class*='note-slider']", "[class*='image-list']", "[class*='carousel']"];

  function videoSource(video) {
    const source = video?.currentSrc
      || video?.getAttribute?.("src")
      || video?.querySelector?.("source")?.getAttribute?.("src")
      || "";
    if (source && !source.startsWith("blob:")) return source;
    return globalThis.PageNestXhsVideoObserver?.recent?.()[0] || source;
  }

  function videoNodes(root) {
    return [...(root?.querySelectorAll?.("video") || [])].filter(video => {
      const rect = video.getBoundingClientRect?.() || {width: 0, height: 0};
      const hasPlayerSize = (video.videoWidth || rect.width) >= 120 && (video.videoHeight || rect.height) >= 80;
      return hasPlayerSize && Boolean(videoSource(video) || video.readyState >= 2);
    });
  }

  function noteRoot() {
    const candidates = NOTE_ROOT_SELECTORS.map(selector => document.querySelector(selector)).filter(Boolean);
    const main = document.querySelector("main");
    if (main) candidates.push(main);
    return [...new Set(candidates)].sort((left, right) => {
      const score = root => {
        const bodyLength = Math.min(text(root).length, 1000);
        const title = first(root, ["#detail-title", ".note-title", "[data-testid='note-title']"]);
        const description = first(root, ["#detail-desc", ".note-content", ".note-desc", "[data-testid='note-content']"]);
        return bodyLength
          + (title ? 2000 : 0)
          + (description ? 2000 : 0)
          + (root.querySelectorAll?.("video").length || 0) * 4000
          + (root.querySelectorAll?.("img").length || 0) * 100;
      };
      return score(right) - score(left);
    })[0] || null;
  }

  function carouselIndex(image, fallback) {
    const slide = image.closest?.("[data-swiper-slide-index],[data-slide-index],[data-index],[aria-label]");
    if (!slide) return fallback;
    const raw = [
      slide.getAttribute("data-swiper-slide-index"),
      slide.getAttribute("data-slide-index"),
      slide.getAttribute("data-index"),
    ].find(value => value != null && value !== "");
    if (raw != null && Number.isFinite(Number(raw))) return Number(raw);
    const ariaIndex = slide.getAttribute("aria-label")?.match(/^\s*(\d+)\s*\//)?.[1];
    return ariaIndex ? Number(ariaIndex) - 1 : fallback;
  }

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
    const mediaRoot = root ? first(root, NOTE_MEDIA_SELECTORS) : null;
    const candidates = mediaRoot
      ? [...mediaRoot.querySelectorAll("img")]
      : (root ? [...root.querySelectorAll("img")] : [...document.images]);
    const ordered = candidates.map((image, domIndex) => ({image, domIndex, slideIndex: carouselIndex(image, domIndex)})).filter(({image}) => {
      if (!isNoteImage(image) || image.closest?.("[class*='comment'],.author-wrapper,.user-info")) return false;
      const url = resolveImage(image, location.href);
      return Boolean(url);
    }).sort((left, right) => left.slideIndex - right.slideIndex || left.domIndex - right.domIndex);
    const seen = new Set();
    return ordered.filter(({image}) => {
      const url = resolveImage(image, location.href);
      if (seen.has(url)) return false;
      seen.add(url);
      return true;
    }).map(item => item.image);
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
      previous.setAttribute("aria-label", "上一张");
      previous.textContent = "‹";
      const counter = document.createElement("span");
      counter.setAttribute("data-hermes-kind", "xhs-gallery-count");
      const next = document.createElement("a");
      next.href = "#";
      next.setAttribute("data-hermes-gallery-next", "");
      next.setAttribute("aria-label", "下一张");
      next.textContent = "›";
      controls.append(previous, counter, next);
      gallery.appendChild(controls);
    }
    article.appendChild(gallery);
    return images;
  }

  function appendMediaSlots(article, media) {
    if (!media.length) return;
    const section = document.createElement("section");
    section.setAttribute("data-hermes-kind", "xhs-video");
    for (const item of media) {
      if (!item.position_id) continue;
      const slot = document.createElement("div");
      slot.setAttribute(HermesMedia.MEDIA_ATTR, item.position_id);
      slot.setAttribute("data-hermes-kind", "offline-video");
      section.appendChild(slot);
    }
    if (section.children?.length) article.appendChild(section);
  }

  function commentText(node) {
    const clone = node?.cloneNode?.(true) || node;
    if (clone?.querySelectorAll && document.createTextNode) {
      clone.querySelectorAll("img").forEach(image => {
        const label = image.alt || image.title || "";
        image.replaceWith(document.createTextNode(label));
      });
    }
    return (clone?.innerText || clone?.textContent || "").replace(/\r\n?/g, "\n").trim();
  }

  function parseComment(node) {
    const root = node.querySelector(":scope > .comment-inner-container") || node;
    const value = selector => commentText(root.querySelector(selector));
    const avatar = root.querySelector(".avatar img");
    const location = value(".info .location");
    const rawTime = value(".info .date");
    return {
      author: value(".author-wrapper .name"),
      avatar_url: avatar?.currentSrc || avatar?.src || avatar?.getAttribute("src") || "",
      avatar_data_url: "",
      content: value(".content"),
      time: location && rawTime.endsWith(location) ? rawTime.slice(0, -location.length).trim() : rawTime,
      location,
      is_author: /作者/.test(value(".author-wrapper .tag")),
      replies: [],
    };
  }

  function collectComments() {
    const nodes = [...document.querySelectorAll("#noteContainer .comment-item, .note-container .comment-item, #comment-container .comment-item, #comments .comment-item, .comment-container .comment-item, [class*='comment-list'] [class*='comment-item']")];
    const comments = [];
    const seen = new Set();
    for (const node of nodes) {
      if (node.classList?.contains("comment-item-sub") || typeof node.querySelector !== "function") continue;
      const comment = parseComment(node);
      if (!comment.content) continue;
      const key = `${comment.author}\n${comment.content}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const group = node.closest?.(".parent-comment");
      const replies = group?.querySelectorAll?.(":scope > .reply-container .comment-item-sub") || [];
      const remaining = Math.max(0, 80 - comments.reduce((count, item) => count + 1 + item.replies.length, 0) - 1);
      comment.replies = [...replies].slice(0, remaining).map(parseComment).filter(reply => reply.content);
      comments.push(comment);
      if (comments.reduce((count, item) => count + 1 + item.replies.length, 0) >= 80) break;
    }
    return comments;
  }

  function readinessSignature() {
    if (!isDetailPage()) return false;
    const root = noteRoot();
    const body = text(root);
    if (!root || body.length < 20) return "";
    const images = imageNodes(root);
    const videos = videoNodes(root);
    if (!images.length && !videos.length) return "";
    const title = text(first(root, ["#detail-title", ".note-title", "[data-testid='note-title']"]));
    const description = text(first(root, ["#detail-desc", ".note-content", ".note-desc", "[data-testid='note-content']"]));
    const coreText = description || title || body.slice(0, 240);
    const videoState = videos.map(video => `${videoSource(video)}|${video.poster || ""}|${video.videoWidth || 0}x${video.videoHeight || 0}`);
    return `${title}\n${coreText}\n${images.map(image => resolveImage(image, location.href)).join("\n")}\n${videoState.join("\n")}`;
  }

  async function preparePage() {
    let previous = "";
    return waitForContent(() => {
      const current = readinessSignature();
      const stable = Boolean(current && current === previous);
      previous = current;
      return stable;
    });
  }

  async function extractNote() {
    if (!isDetailPage()) return null;
    const root = noteRoot();
    const title = text(first(root || document, ["#detail-title", ".note-title", "[data-testid='note-title']"])) || metadata(["og:title", "twitter:title"]) || document.title;
    const description = text(first(root || document, ["#detail-desc", ".note-content", ".note-desc", "[data-testid='note-content']"])) || metadata(["og:description", "description"]);
    if (!title) return null;
    const article = document.createElement("article");
    article.setAttribute("data-hermes-kind", "xhs-note");
    addTextElement(article, "h1", title, "xhs-title");
    const author = text(first(root || document, [".author-wrapper .username", ".author-container .name", ".user-info .name", ".author-name"]));
    if (author) addTextElement(article, "p", author, "xhs-author");
    const images = appendGallery(article, root, title);
    const media = root ? await HermesMedia.collectVideos(videoNodes(root), "hermes-xhs-video", videoSource) : [];
    if (!images.length && !media.length) return null;
    appendMediaSlots(article, media);
    if (description) addTextElement(article, "p", description, "xhs-description");
    const comments = collectComments();
    return {element: article, images, media, comments, title, author, page_variant: "xiaohongshu-note", method: `xiaohongshu:note:${images.length}-images:${media.length}-videos`};
  }

  HermesAdapters.register({
    name: "xiaohongshu",
    specialized: true,
    allowFallback: false,
    notFoundMessage: "请打开一篇小红书笔记详情页后再保存；首页、草稿箱和个人中心不会被当成笔记保存。",
    detect: ({location}) => /(^|\.)xiaohongshu\.com$/i.test(location.hostname),
    preparePage,
    extract: async () => extractNote(),
    validate: result => Boolean(result?.element && (result.images?.length || result.media?.length)),
    isContentAcceptable: (value, {images, media = []}) => value.replace(/\s+/g, "").length >= 4 && images.length + media.length > 0,
  });
})();
