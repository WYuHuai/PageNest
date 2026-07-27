globalThis.collectPage = (() => {
  const SELECTORS = [".docx-page-block", "#content_views", ".markdown_views", "#article_content", "article", "main article", "[role='main'] article", ".post-content", ".entry-content", ".article-content", ".article-body", ".markdown-body", ".rich_media_content", ".rich_media_area_primary", "#js_content", ".content", ".post", "main"];
  const JUNK = ["nav", "footer", "aside", "form", "dialog", ".advertisement", ".ad", "[class*='comment']", "[class*='recommend']", "[class*='related']", "[class*='share']", "[class*='sidebar']", "[class*='login']", "[class*='toolbar']", "[class*='qrcode']"];
  const BACKGROUND_ATTR = "data-hermes-background-src";
  const POSITION_ATTR = "data-hermes-image-id";
  let positionSequence = 0;
  const assignedPositions = new WeakMap();
  function markImagePosition(element, preferred = "") {
    const existing = assignedPositions.get(element);
    if (existing) return existing;
    const position = preferred || `hermes-image-${++positionSequence}`;
    assignedPositions.set(element, position);
    element.setAttribute(POSITION_ATTR, position);
    return position;
  }
  function stableBlockPrefix(blockId) {
    let hash = 2166136261;
    for (const character of blockId) {
      hash ^= character.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return `hermes-feishu-${(hash >>> 0).toString(16)}`;
  }
  const textLength = element => (element?.innerText || "").replace(/\s+/g, "").length;
  function metadata(names) {
    for (const name of names) {
      const node = document.querySelector(`meta[property='${name}'],meta[name='${name}']`);
      if (node?.content) return node.content.trim();
    }
    return "";
  }
  function score(element) {
    const text = textLength(element), links = [...element.querySelectorAll("a")].reduce((n, a) => n + textLength(a), 0);
    const paragraphs = element.querySelectorAll("p").length;
    return text + paragraphs * 80 - links * 1.7;
  }
  function jsonLdObjects() {
    const values = [];
    for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const parsed = JSON.parse(script.textContent || "null");
        values.push(...(Array.isArray(parsed) ? parsed : [parsed]));
      } catch {}
    }
    return values.filter(Boolean);
  }
  function addTextElement(parent, name, text, kind = "") {
    const value = String(text || "").trim();
    if (!value) return null;
    const element = document.createElement(name);
    element.textContent = value;
    if (kind) element.setAttribute("data-hermes-kind", kind);
    parent.appendChild(element);
    return element;
  }
  function isoDurationLabel(value) {
    const match = String(value || "").match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i);
    if (!match) return String(value || "");
    const hours = Number(match[1] || 0);
    const minutes = Number(match[2] || 0);
    const seconds = Number(match[3] || 0);
    return [hours, minutes, seconds]
      .filter((_, index) => hours || index > 0)
      .map(part => String(part).padStart(2, "0"))
      .join(":");
  }
  function meaningfulNoteEntries() {
    const selectors = [
      ".note-list .note-card",
      ".note-list [class*='note-item']",
      ".video-note-sidebar-content [class*='chapter']",
      ".video-note-sidebar-content [class*='summary']",
      ".note-editor .ql-editor",
      ".note-editor [contenteditable='true']",
    ];
    const ignored = /还没有人发布笔记|快去发布一篇|暂无课程总结|^记笔记$|^课程总结/;
    const entries = [];
    const seen = new Set();
    for (const node of document.querySelectorAll(selectors.join(","))) {
      const text = (node.innerText || "").replace(/\n{3,}/g, "\n\n").trim();
      if (text.length < 8 || ignored.test(text) || seen.has(text)) continue;
      seen.add(text);
      entries.push({node, text});
    }
    return entries;
  }
  async function collectBilibiliVideo() {
    if (!/(^|\.)bilibili\.com$/.test(location.hostname) || !location.pathname.startsWith("/video/")) return null;
    const objects = jsonLdObjects();
    const video = objects.find(item => item["@type"] === "VideoObject") || {};
    const webpage = objects.find(item => item["@type"] === "WebPage") || {};
    const title = video.name || webpage.name || document.querySelector("h1.video-title")?.textContent || document.title;
    const description = video.description || webpage.description || document.querySelector("#v_desc")?.innerText || "";
    const cover = Array.isArray(video.thumbnailUrl) ? video.thumbnailUrl[0] : video.thumbnailUrl || metadata(["og:image"]);
    const author = typeof video.author === "object" ? video.author?.name || "" : video.author || "";
    const article = document.createElement("article");
    article.setAttribute("data-hermes-kind", "video-card");
    addTextElement(article, "h1", title);

    const meta = document.createElement("p");
    meta.setAttribute("data-hermes-kind", "video-meta");
    const metaParts = [
      author && `UP主：${author}`,
      video.datePublished && `发布：${String(video.datePublished).slice(0, 10)}`,
      video.duration && `时长：${isoDurationLabel(video.duration)}`,
    ].filter(Boolean);
    meta.textContent = metaParts.join(" · ");
    if (meta.textContent) article.appendChild(meta);

    const media = await HermesMedia.collect(
      document.querySelector(".bpx-player-container") || document.body,
      "hermes-bilibili-video",
    );
    if (!media.length) {
      const pageMedia = HermesMedia.pageVideo("hermes-bilibili-video-0", cover);
      if (pageMedia) media.push(pageMedia);
    }
    const images = [];
    if (cover) {
      const figure = document.createElement("figure");
      figure.setAttribute("data-hermes-kind", "video-cover");
      if (media[0]?.position_id) figure.setAttribute(HermesMedia.MEDIA_ATTR, media[0].position_id);
      const image = document.createElement("img");
      const position_id = markImagePosition(image, "hermes-bilibili-cover");
      image.src = cover;
      image.alt = `${title} 视频封面`;
      figure.appendChild(image);
      article.appendChild(figure);
      images.push({
        position_id,
        original_url: cover,
        resolved_url: cover,
        current_src: cover,
        alt: image.alt,
        caption: "",
        nearby_text: title,
        width: 1280,
        height: 720,
        order: 0,
        source_type: "img",
        content_hash: "",
        data_url: "",
      });
    }

    if (description) {
      const section = document.createElement("section");
      section.setAttribute("data-hermes-kind", "video-description");
      addTextElement(section, "h2", "视频简介");
      for (const line of String(description).split(/\n+/).map(value => value.trim()).filter(Boolean)) {
        addTextElement(section, "p", line);
      }
      article.appendChild(section);
    }

    const chapterSelectors = [
      ".video-pod__body .video-pod__item",
      ".multi-page-v1 .clickitem",
      "#multi_page .list-box li",
      ".video-sections-content-list .video-episode-card",
    ];
    const chapters = [];
    for (const node of document.querySelectorAll(chapterSelectors.join(","))) {
      const text = (node.innerText || "").replace(/\s+/g, " ").trim();
      if (text && !chapters.includes(text)) chapters.push(text);
    }
    if (chapters.length > 1) {
      const section = document.createElement("section");
      section.setAttribute("data-hermes-kind", "video-chapters");
      addTextElement(section, "h2", "视频章节");
      const list = document.createElement("ol");
      for (const chapter of chapters.slice(0, 100)) addTextElement(list, "li", chapter);
      section.appendChild(list);
      article.appendChild(section);
    }

    const noteEntries = meaningfulNoteEntries();
    if (noteEntries.length) {
      const section = document.createElement("section");
      section.setAttribute("data-hermes-kind", "video-notes");
      addTextElement(section, "h2", "B 站笔记");
      for (const [noteIndex, entry] of noteEntries.entries()) {
        const quote = document.createElement("blockquote");
        addTextElement(quote, "p", entry.text);
        for (const [imageIndex, sourceImage] of [...entry.node.querySelectorAll("img")].entries()) {
          const url = resolveImage(sourceImage, location.href);
          const rect = sourceImage.getBoundingClientRect();
          const width = Math.max(sourceImage.naturalWidth || 0, Math.round(rect.width));
          const height = Math.max(sourceImage.naturalHeight || 0, Math.round(rect.height));
          if (!url || isPlaceholderSvgData(url) || (width < 80 && height < 80)) continue;
          const image = document.createElement("img");
          const position_id = `hermes-bilibili-note-${noteIndex}-image-${imageIndex}`;
          image.setAttribute(POSITION_ATTR, position_id);
          image.src = url;
          image.alt = sourceImage.alt || `B 站笔记图片 ${noteIndex + 1}`;
          quote.appendChild(image);
          images.push({
            position_id,
            original_url: sourceImage.getAttribute("src") || "",
            resolved_url: url,
            current_src: sourceImage.currentSrc || "",
            alt: image.alt,
            caption: "",
            nearby_text: entry.text.slice(0, 500),
            width,
            height,
            order: images.length,
            source_type: url.startsWith("data:") ? "data-url" : url.startsWith("blob:") ? "blob-url" : "img",
            content_hash: "",
            data_url: url.startsWith("data:") ? url : "",
          });
        }
        section.appendChild(quote);
      }
      article.appendChild(section);
    }

    const tags = [...document.querySelectorAll(".video-tag-container a")]
      .map(node => (node.textContent || "").trim())
      .filter(Boolean);
    if (tags.length) addTextElement(article, "p", `标签：${[...new Set(tags)].join(" · ")}`, "video-tags");

    return {
      element: article,
      images,
      media,
      title,
      author,
      published_at: video.datePublished || "",
      method: `bilibili-video:${chapters.length}-chapters:${noteEntries.length}-notes`,
    };
  }
  function videoFrameData(video) {
    if (!video || video.videoWidth < 160 || video.videoHeight < 90) return "";
    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d").drawImage(video, 0, 0);
      return canvas.toDataURL("image/jpeg", 0.88);
    } catch {
      return "";
    }
  }
  async function hydratePageImages() {
    const originalY = window.scrollY;
    const maximum = Math.max(0, document.documentElement.scrollHeight - innerHeight);
    if (!maximum) return;
    let position = originalY;
    for (let pass = 0; pass < 36 && position < maximum; pass += 1) {
      position = Math.min(maximum, position + Math.max(700, Math.floor(innerHeight * 0.85)));
      window.scrollTo(0, position);
      await new Promise(resolve => setTimeout(resolve, 90));
    }
    window.scrollTo(0, originalY);
    await new Promise(resolve => setTimeout(resolve, 60));
  }
  async function collectBilibiliOpus() {
    if (!/(^|\.)bilibili\.com$/.test(location.hostname) || !location.pathname.startsWith("/opus/")) return null;
    const view = document.querySelector(".bili-opus-view");
    if (!view) return null;
    const title = document.querySelector(".opus-module-title__text")?.textContent?.trim() || document.title;
    const author = document.querySelector(".opus-module-author__name")?.textContent?.trim() || "";
    const published_at = document.querySelector(".opus-module-author__pub__text")?.textContent?.trim() || "";
    const article = document.createElement("article");
    article.setAttribute("data-hermes-kind", "opus-card");
    const images = [];
    for (let attempt = 0; attempt < 15; attempt += 1) {
      if (document.querySelector(".opus-module-top video") || HermesMedia.bilibiliVideoPage()) break;
      await wait(160);
    }
    const media = await HermesMedia.collect(
      document.querySelector(".opus-module-top") || view,
      "hermes-bilibili-opus-video",
    );

    const video = document.querySelector(".opus-module-top video");
    const posterNode = document.querySelector(".opus-module-top .bpx-player-video-poster");
    const posterMatch = posterNode
      ? getComputedStyle(posterNode).backgroundImage.match(/url\(["']?(.*?)["']?\)/)
      : null;
    const poster = video?.getAttribute("poster")
      || posterMatch?.[1]
      || metadata(["og:image"])
      || "";
    if (!media.length) {
      const pageMedia = HermesMedia.pageVideo(
        "hermes-bilibili-opus-video-0",
        poster,
      );
      if (pageMedia) media.push(pageMedia);
    }
    const frame = videoFrameData(video) || poster;
    if (frame) {
      const figure = document.createElement("figure");
      figure.setAttribute("data-hermes-kind", "opus-video");
      if (media[0]?.position_id) {
        figure.setAttribute(HermesMedia.MEDIA_ATTR, media[0].position_id);
      }
      const image = document.createElement("img");
      const position_id = "hermes-bilibili-opus-video";
      image.setAttribute(POSITION_ATTR, position_id);
      image.src = frame;
      image.alt = `${title} 视频画面`;
      figure.appendChild(image);
      article.appendChild(figure);
      images.push({
        position_id,
        original_url: "",
        resolved_url: frame,
        current_src: "",
        alt: image.alt,
        caption: "",
        nearby_text: title,
        width: video?.videoWidth || 1280,
        height: video?.videoHeight || 720,
        order: 0,
        source_type: frame.startsWith("data:") ? "data-url" : "img",
        content_hash: "",
        data_url: frame.startsWith("data:") ? frame : "",
      });
    }

    addTextElement(article, "h1", title, "opus-title");
    const authorRow = document.createElement("div");
    authorRow.setAttribute("data-hermes-kind", "opus-author");
    const sourceAvatar = document.querySelector(".opus-module-author__avatar img");
    const avatarUrl = sourceAvatar ? resolveImage(sourceAvatar, location.href) : "";
    if (avatarUrl) {
      const avatar = document.createElement("img");
      const position_id = "hermes-bilibili-opus-avatar";
      avatar.setAttribute(POSITION_ATTR, position_id);
      avatar.src = avatarUrl;
      avatar.alt = author;
      authorRow.appendChild(avatar);
      images.push({
        position_id,
        original_url: sourceAvatar.getAttribute("src") || "",
        resolved_url: avatarUrl,
        current_src: sourceAvatar.currentSrc || "",
        alt: author,
        caption: "",
        nearby_text: `${author} ${published_at}`,
        width: Math.max(sourceAvatar.naturalWidth || 96, 96),
        height: Math.max(sourceAvatar.naturalHeight || 96, 96),
        order: images.length,
        source_type: "img",
        content_hash: "",
        data_url: "",
      });
    }
    const authorText = document.createElement("div");
    addTextElement(authorText, "strong", author);
    addTextElement(authorText, "time", published_at);
    authorRow.appendChild(authorText);
    article.appendChild(authorRow);

    await hydratePageImages();
    const modules = [
      ...document.querySelectorAll(
        ".bili-opus-view > .opus-module-content,"
        + ".bili-opus-view > [class*='opus-module-pic'],"
        + ".bili-opus-view > [class*='opus-module-image']",
      ),
    ];
    for (const [moduleIndex, module] of modules.entries()) {
      const moduleImages = collectImages(module, `hermes-bilibili-opus-${moduleIndex}`);
      const clone = module.cloneNode(true);
      clone.setAttribute("data-hermes-kind", "opus-content");
      article.appendChild(clone);
      images.push(...moduleImages.map((image, index) => ({...image, order: images.length + index})));
      clearExtractionMarkers(module);
    }
    return {
      element: article,
      images,
      title,
      author,
      published_at,
      site_name: "哔哩哔哩",
      page_variant: "bilibili-opus",
      method: `bilibili-opus:${modules.length}-modules`,
    };
  }
  function findArticle() {
    for (const selector of SELECTORS) {
      const candidates = [...document.querySelectorAll(selector)].filter(x => textLength(x) > 180);
      if (candidates.length) return {element: candidates.sort((a, b) => score(b) - score(a))[0], method: `selector:${selector}`};
    }
    const candidates = [...document.querySelectorAll("main,section,div")].filter(x => textLength(x) > 500 && x.querySelectorAll("p").length >= 3);
    return candidates.length ? {element: candidates.sort((a, b) => score(b) - score(a))[0], method: "bundled-readability-heuristic"} : {element: document.body, method: "whole-page-fallback"};
  }
  function isPlaceholderSvgData(url) {
    if (!url.startsWith("data:image/svg+xml")) return false;
    try {
      const encoded = url.split(",", 2)[1] || "";
      const source = /;base64,/i.test(url)
        ? atob(encoded)
        : decodeURIComponent(encoded);
      const loadingTitle = /<title[^>]*>[^<]*(?:加载|loading)[^<]*<\/title>/i.test(source);
      const hasVisual = /<(path|rect|circle|ellipse|line|polyline|polygon|image|text|use)\b/i.test(source);
      return loadingTitle || !hasVisual;
    } catch {
      return true;
    }
  }
  function resolveImage(img, base) {
    const srcset = (img.getAttribute("srcset") || "").split(",").pop()?.trim().split(/\s+/)[0];
    const raw = img.getAttribute("data-original") || img.getAttribute("data-src") || img.getAttribute("data-lazy-src") || img.getAttribute("data-actualsrc") || srcset || img.currentSrc || img.getAttribute("src") || "";
    try { return new URL(raw, base).href; } catch { return raw; }
  }
  function externalLinkLabel(url) {
    try {
      const parsed = new URL(url);
      return parsed.hostname.toLowerCase().includes("github.com") ? "?? GitHub ???? ?" : "?????? ?";
    } catch {
      return "?????? ?";
    }
  }
  function linkValueFromNode(node) {
    const direct = ["href", "data-href", "data-url", "data-download-url"]
      .map(name => node.getAttribute?.(name) || "")
      .find(Boolean);
    if (direct) return direct;
    for (const name of ["data-report-click", "data-report-view"]) {
      const value = node.getAttribute?.(name) || "";
      if (!value) continue;
      try {
        const payload = JSON.parse(value);
        const destination = payload.dest || payload.url || payload.target || payload.extra?.dest;
        if (destination) return destination;
      } catch {
        const embedded = value.match(/https?:\/\/[^'"\\\s}]+/i)?.[0];
        if (embedded) return embedded;
      }
    }
    const onclick = node.getAttribute?.("onclick") || "";
    return onclick.match(/https?:\/\/[^'"\s)]+/i)?.[0] || "";
  }
  function resolveExternalLink(raw) {
    try {
      let resolved = new URL(raw, location.href);
      if (/^link\.csdn\.net$/i.test(resolved.hostname)) {
        const target = resolved.searchParams.get("target") || resolved.searchParams.get("url");
        if (target) resolved = new URL(target, location.href);
      }
      return /^https?:$/.test(resolved.protocol) ? resolved : null;
    } catch {
      return null;
    }
  }
  function isCodeHost(url) {
    return /(^|\.)(github\.com|gitee\.com|gitcode\.net)$/i.test(url.hostname);
  }
  function normalizeLinks(root) {
    for (const anchor of [...root.querySelectorAll("a")]) {
      const resolved = resolveExternalLink(linkValueFromNode(anchor));
      if (!resolved) continue;
      anchor.href = resolved.href;
      anchor.removeAttribute("onclick");
      if (!(anchor.innerText || anchor.textContent || "").trim()) {
        anchor.textContent = externalLinkLabel(resolved.href);
      }
    }
    const linkedNodes = root.querySelectorAll("[data-href],[data-url],[data-download-url],[data-report-click],[data-report-view],[onclick]");
    for (const node of [...linkedNodes]) {
      if (node.matches("a") || node.querySelector("a")) continue;
      const resolved = resolveExternalLink(linkValueFromNode(node));
      if (!resolved || !isCodeHost(resolved)) continue;
      const anchor = document.createElement("a");
      anchor.href = resolved.href;
      anchor.textContent = externalLinkLabel(resolved.href);
      if (node.matches("img,svg") || !(node.innerText || node.textContent || "").trim()) {
        node.replaceWith(anchor);
      } else {
        node.append(" ", anchor);
      }
    }
  }
  function collectImages(root, positionPrefix = "") {
    const images = [];
    [...root.querySelectorAll("img")].forEach((img, order) => {
      const url = resolveImage(img, location.href);
      if (!url || isPlaceholderSvgData(url)) return;
      const rect = img.getBoundingClientRect();
      const width = Math.max(img.naturalWidth || 0, Math.round(rect.width));
      const height = Math.max(img.naturalHeight || 0, Math.round(rect.height));
      if (width < 50 && height < 50) return;
      const figure = img.closest("figure");
      const position_id = markImagePosition(
        img,
        positionPrefix ? `${positionPrefix}-img-${order}` : "",
      );
      images.push({position_id, original_url: img.getAttribute("src") || "", resolved_url: url, current_src: img.currentSrc || "", alt: img.alt || "", caption: figure?.querySelector("figcaption")?.innerText?.trim() || "", nearby_text: img.closest("p,figure,section,div")?.innerText?.trim().slice(0, 500) || "", width, height, order, source_type: url.startsWith("data:") ? "data-url" : url.startsWith("blob:") ? "blob-url" : "img", content_hash: "", data_url: url.startsWith("data:") ? url : ""});
    });
    let backgroundOrder = 0;
    [...root.querySelectorAll("*")].forEach((el, index) => {
      const match = getComputedStyle(el).backgroundImage.match(/url\(["']?(.*?)["']?\)/);
      if (!match) return;
      const width = el.clientWidth, height = el.clientHeight;
      if (width < 80 && height < 80) return;
      try {
        const url = new URL(match[1], location.href).href;
        if (isPlaceholderSvgData(url)) return;
        const position_id = markImagePosition(
          el,
          positionPrefix ? `${positionPrefix}-background-${backgroundOrder++}` : "",
        );
        el.setAttribute(BACKGROUND_ATTR, url);
        images.push({position_id, original_url: match[1], resolved_url: url, current_src: "", alt: "", caption: "", nearby_text: el.innerText?.trim().slice(0, 500) || "", width, height, order: 10000 + index, source_type: "css-background", content_hash: "", data_url: ""});
      } catch {}
    });
    return images;
  }
  function canvasScrollContainer(canvas, block) {
    for (let node = canvas.parentElement; node && node !== block; node = node.parentElement) {
      if (node.clientWidth < 120 || node.clientHeight < 80) continue;
      const horizontal = node.scrollWidth > node.clientWidth + 8;
      const vertical = node.scrollHeight > node.clientHeight + 8;
      if (!horizontal && !vertical) continue;
      const style = getComputedStyle(node);
      const scrollableX = horizontal && /(auto|scroll)/.test(style.overflowX || style.overflow);
      const scrollableY = vertical && /(auto|scroll)/.test(style.overflowY || style.overflow);
      if (scrollableX || scrollableY) return node;
    }
    return null;
  }
  function trimmedCanvasResult(canvas) {
    const width = canvas.width;
    const height = canvas.height;
    if (!width || !height) return {dataUrl: canvas.toDataURL("image/png"), width, height};
    const analysisScale = Math.min(1, 1600 / width, 1600 / height);
    const analysis = document.createElement("canvas");
    analysis.width = Math.max(1, Math.round(width * analysisScale));
    analysis.height = Math.max(1, Math.round(height * analysisScale));
    const analysisContext = analysis.getContext("2d", {willReadFrequently: true});
    if (!analysisContext) return {dataUrl: canvas.toDataURL("image/png"), width, height};
    analysisContext.drawImage(canvas, 0, 0, analysis.width, analysis.height);
    const pixels = analysisContext.getImageData(0, 0, analysis.width, analysis.height).data;
    let left = analysis.width, top = analysis.height, right = -1, bottom = -1;
    for (let y = 0; y < analysis.height; y += 1) {
      for (let x = 0; x < analysis.width; x += 1) {
        const offset = (y * analysis.width + x) * 4;
        const alpha = pixels[offset + 3];
        const red = pixels[offset], green = pixels[offset + 1], blue = pixels[offset + 2];
        const minimum = Math.min(red, green, blue);
        const colorRange = Math.max(red, green, blue) - minimum;
        if (alpha < 20 || (minimum > 215 && colorRange < 35)) continue;
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
    }
    if (right < left || bottom < top) return {dataUrl: "", width: 0, height: 0};
    const padding = Math.ceil(14 * analysisScale);
    left = Math.max(0, left - padding);
    top = Math.max(0, top - padding);
    right = Math.min(analysis.width - 1, right + padding);
    bottom = Math.min(analysis.height - 1, bottom + padding);
    const sourceX = Math.floor(left / analysisScale);
    const sourceY = Math.floor(top / analysisScale);
    const sourceWidth = Math.min(width - sourceX, Math.ceil((right - left + 1) / analysisScale));
    const sourceHeight = Math.min(height - sourceY, Math.ceil((bottom - top + 1) / analysisScale));
    if (sourceWidth >= width * 0.98 && sourceHeight >= height * 0.98) {
      return {dataUrl: canvas.toDataURL("image/png"), width, height};
    }
    const trimmed = document.createElement("canvas");
    trimmed.width = sourceWidth;
    trimmed.height = sourceHeight;
    trimmed.getContext("2d").drawImage(canvas, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, sourceWidth, sourceHeight);
    return {dataUrl: trimmed.toDataURL("image/png"), width: sourceWidth, height: sourceHeight};
  }
  function visualCanvasResult(canvas) {
    const rect = canvas.getBoundingClientRect();
    const sourceWidth = canvas.width || Math.round(rect.width);
    const sourceHeight = canvas.height || Math.round(rect.height);
    if (!sourceWidth || !sourceHeight || rect.width < 1 || rect.height < 1) return trimmedCanvasResult(canvas);
    const targetHeight = Math.max(1, Math.round(rect.height * (sourceWidth / rect.width)));
    if (Math.abs(targetHeight - sourceHeight) / sourceHeight < 0.03) return trimmedCanvasResult(canvas);
    const visual = document.createElement("canvas");
    visual.width = sourceWidth;
    visual.height = targetHeight;
    const context = visual.getContext("2d");
    if (!context) return trimmedCanvasResult(canvas);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(canvas, 0, 0, sourceWidth, sourceHeight, 0, 0, sourceWidth, targetHeight);
    return trimmedCanvasResult(visual);
  }
  async function captureCanvas(canvas, block) {
    const rect = canvas.getBoundingClientRect();
    const baseWidth = canvas.width || Math.round(rect.width);
    const baseHeight = canvas.height || Math.round(rect.height);
    const container = canvasScrollContainer(canvas, block);
    if (!container) {
      return visualCanvasResult(canvas);
    }
    const viewportWidth = Math.max(1, container.clientWidth);
    const viewportHeight = Math.max(1, container.clientHeight);
    const logicalWidth = Math.max(Math.round(rect.width), container.scrollWidth);
    const logicalHeight = Math.max(Math.round(rect.height), container.scrollHeight);
    if (logicalWidth <= viewportWidth + 4 && logicalHeight <= viewportHeight + 4) {
      return visualCanvasResult(canvas);
    }
    const nativeScale = Math.max(1, baseWidth / Math.max(1, rect.width));
    const maxDimension = 16384;
    const maxPixels = 36 * 1024 * 1024;
    const dimensionScale = Math.min(nativeScale, maxDimension / logicalWidth, maxDimension / logicalHeight);
    const pixelScale = Math.min(dimensionScale, Math.sqrt(maxPixels / (logicalWidth * logicalHeight)));
    const scale = Math.max(0.5, Math.min(nativeScale, pixelScale));
    const outputWidth = Math.max(1, Math.round(logicalWidth * scale));
    const outputHeight = Math.max(1, Math.round(logicalHeight * scale));
    const stitched = document.createElement("canvas");
    stitched.width = outputWidth;
    stitched.height = outputHeight;
    const context = stitched.getContext("2d");
    if (!context) return trimmedCanvasResult(canvas);
    const originalLeft = container.scrollLeft;
    const originalTop = container.scrollTop;
    const rows = Math.ceil(logicalHeight / viewportHeight);
    const columns = Math.ceil(logicalWidth / viewportWidth);
    try {
      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          const left = Math.min(container.scrollWidth - viewportWidth, column * viewportWidth);
          const top = Math.min(container.scrollHeight - viewportHeight, row * viewportHeight);
          container.scrollLeft = Math.max(0, left);
          container.scrollTop = Math.max(0, top);
          container.dispatchEvent(new Event("scroll", {bubbles: true}));
          await wait(120);
          const current = [...block.querySelectorAll("canvas")].find(candidate => {
            const currentRect = candidate.getBoundingClientRect();
            return currentRect.width >= rect.width * 0.7 && currentRect.height >= rect.height * 0.7;
          }) || canvas;
          const currentRect = current.getBoundingClientRect();
          const sourceWidth = current.width || Math.round(currentRect.width);
          const sourceHeight = current.height || Math.round(currentRect.height);
          const visibleWidth = Math.min(viewportWidth, logicalWidth - left);
          const visibleHeight = Math.min(viewportHeight, logicalHeight - top);
          const sourceScaleX = sourceWidth / Math.max(1, currentRect.width);
          const sourceScaleY = sourceHeight / Math.max(1, currentRect.height);
          context.drawImage(
            current,
            0,
            0,
            Math.min(sourceWidth, visibleWidth * sourceScaleX),
            Math.min(sourceHeight, visibleHeight * sourceScaleY),
            Math.round(left * scale),
            Math.round(top * scale),
            Math.round(visibleWidth * scale),
            Math.round(visibleHeight * scale),
          );
        }
      }
      return trimmedCanvasResult(stitched);
    } finally {
      container.scrollLeft = originalLeft;
      container.scrollTop = originalTop;
      container.dispatchEvent(new Event("scroll", {bubbles: true}));
      await wait(80);
    }
  }
  async function collectCanvasImages(root, positionPrefix = "") {
    const images = [];
    const canvases = [...root.querySelectorAll("canvas")];
    for (const [order, canvas] of canvases.entries()) {
      const rect = canvas.getBoundingClientRect();
      const width = canvas.width || Math.round(rect.width);
      const height = canvas.height || Math.round(rect.height);
      if (width < 100 || height < 50) continue;
      try {
        const captured = await captureCanvas(canvas, root);
        if (!captured.dataUrl || captured.dataUrl === "data:,") continue;
        const position_id = markImagePosition(
          canvas,
          positionPrefix ? `${positionPrefix}-canvas-${order}` : "",
        );
        images.push({
          position_id,
          original_url: "",
          resolved_url: captured.dataUrl,
          current_src: "",
          alt: "飞书文档表格或画布",
          caption: "",
          nearby_text: canvas.closest("[data-block-id]")?.innerText?.trim().slice(0, 500) || "",
          width: captured.width,
          height: captured.height,
          order,
          source_type: "canvas",
          content_hash: "",
          data_url: captured.dataUrl,
        });
      } catch {}
    }
    return images;
  }
  function materializeCanvasImages(root, images) {
    const byPosition = new Map(images.map(image => [image.position_id, image]));
    for (const canvas of [...root.querySelectorAll(`canvas[${POSITION_ATTR}]`)]) {
      const image = byPosition.get(canvas.getAttribute(POSITION_ATTR));
      if (!image?.data_url) continue;
      const replacement = document.createElement("img");
      replacement.src = image.data_url;
      replacement.alt = image.alt;
      replacement.setAttribute(POSITION_ATTR, image.position_id);
      replacement.width = image.width;
      replacement.height = image.height;
      const nearbyText = String(image.nearby_text || "").trim();
      if (nearbyText.length >= 20 && nearbyText.split(/\n+/).filter(Boolean).length >= 2) {
        const figure = document.createElement("figure");
        figure.setAttribute("data-hermes-kind", "canvas-capture");
        figure.appendChild(replacement);
        const details = document.createElement("details");
        const summary = document.createElement("summary");
        summary.textContent = "可复制的表格文本";
        const text = document.createElement("pre");
        text.setAttribute("data-hermes-kind", "canvas-text");
        text.textContent = nearbyText;
        details.append(summary, text);
        figure.appendChild(details);
        canvas.replaceWith(figure);
      } else {
        canvas.replaceWith(replacement);
      }
    }
  }
  function elementsWithMarker(root) {
    return [root, ...root.querySelectorAll(`[${BACKGROUND_ATTR}]`)].filter(element => element.hasAttribute?.(BACKGROUND_ATTR));
  }
  function materializeBackgroundImages(root) {
    for (const element of elementsWithMarker(root)) {
      const src = element.getAttribute(BACKGROUND_ATTR);
      const position = element.getAttribute(POSITION_ATTR);
      element.removeAttribute(BACKGROUND_ATTR);
      element.removeAttribute(POSITION_ATTR);
      if (!src) continue;
      const image = document.createElement("img");
      image.src = src;
      image.alt = element.getAttribute("aria-label") || "";
      if (position) image.setAttribute(POSITION_ATTR, position);
      element.prepend(image);
    }
  }
  function ensureImageSlots(clone, images) {
    for (const image of images) {
      const marker = image.position_id
        ? [...clone.querySelectorAll(`[${POSITION_ATTR}]`)].find(
            node => node.getAttribute(POSITION_ATTR) === image.position_id,
          )
        : null;
      if (!image.position_id || marker) continue;
      const slot = document.createElement("span");
      slot.className = "hermes-media-slot";
      slot.setAttribute(POSITION_ATTR, image.position_id);
      slot.setAttribute("aria-hidden", "true");
      clone.appendChild(slot);
    }
  }
  function clearExtractionMarkers(root) {
    const marked = [
      root,
      ...root.querySelectorAll(`[${BACKGROUND_ATTR}],[${POSITION_ATTR}]`),
    ];
    for (const element of marked) {
      element.removeAttribute?.(BACKGROUND_ATTR);
      if (assignedPositions.has(element)) {
        element.removeAttribute?.(POSITION_ATTR);
        assignedPositions.delete(element);
      }
    }
  }
  const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
  function scrollContainer(root) {
    for (let node = root?.parentElement; node && node !== document.body; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 100) return node;
    }
    const documentScroller = document.scrollingElement;
    return documentScroller && documentScroller.scrollHeight > documentScroller.clientHeight + 100 ? documentScroller : null;
  }
  function topLevelFeishuBlocks(page) {
    return [...page.querySelectorAll("[data-block-id]")].filter(node => {
      if (node === page) return false;
      const ancestor = node.parentElement?.closest("[data-block-id]");
      return !ancestor || ancestor === page;
    });
  }
  async function collectFeishuDocument() {
    if (!/(^|\.)feishu\.cn$/.test(location.hostname)) return null;
    let page = document.querySelector(".docx-page-block");
    if (!page) return null;
    const scroller = scrollContainer(page);
    const originalTop = scroller?.scrollTop || 0;
    const blocks = new Map(), imageMap = new Map(), canvasImageCache = new Map();
    const snapshot = async () => {
      page = document.querySelector(".docx-page-block") || page;
      for (const node of topLevelFeishuBlocks(page)) {
        const key = node.getAttribute("data-block-id") || `${blocks.size}`;
        const blockPrefix = stableBlockPrefix(key);
        let canvasImages = canvasImageCache.get(key);
        if (canvasImages) {
          [...node.querySelectorAll("canvas")].forEach((canvas, index) => {
            if (canvasImages[index]) markImagePosition(canvas, canvasImages[index].position_id);
          });
        } else {
          canvasImages = await collectCanvasImages(node, blockPrefix);
          if (canvasImages.length) canvasImageCache.set(key, canvasImages);
        }
        const nodeImages = [
          ...collectImages(node, blockPrefix),
          ...canvasImages,
        ];
        const clone = node.cloneNode(true);
        materializeCanvasImages(clone, nodeImages);
        ensureImageSlots(clone, nodeImages);
        const quality =
          clone.querySelectorAll(`[${POSITION_ATTR}]`).length * 1000000 +
          clone.querySelectorAll("img").length * 100000 +
          textLength(clone) * 10 +
          clone.outerHTML.length;
        const previous = blocks.get(key);
        if (!previous || quality > previous.quality) {
          blocks.set(key, {clone, quality});
        }
        for (const image of nodeImages) {
          if (image.position_id) imageMap.set(image.position_id, image);
        }
        // Feishu reuses DOM nodes while virtual-scrolling. Markers must be scoped
        // to one snapshot or a later block can inherit an earlier block's ID.
        clearExtractionMarkers(node);
      }
    };
    if (scroller) {
      let position = 0;
      for (let pass = 0; pass < 80; pass += 1) {
        scroller.scrollTop = position;
        scroller.dispatchEvent(new Event("scroll", {bubbles: true}));
        await wait(140);
        await snapshot();
        const maximum = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
        if (position >= maximum) break;
        position = Math.min(maximum, position + Math.max(700, Math.floor(scroller.clientHeight * 0.8)));
      }
      scroller.scrollTop = originalTop;
      scroller.dispatchEvent(new Event("scroll", {bubbles: true}));
      await wait(80);
    } else {
      await snapshot();
    }
    if (!blocks.size) return null;
    const article = document.createElement("article");
    article.className = "hermes-feishu-document";
    for (const block of blocks.values()) article.appendChild(block.clone);
    materializeBackgroundImages(article);
    clearExtractionMarkers(page);
    const orderedImages = [...article.querySelectorAll(`[${POSITION_ATTR}]`)]
      .map(node => imageMap.get(node.getAttribute(POSITION_ATTR)))
      .filter(Boolean)
      .map((image, order) => ({...image, order}));
    return {
      element: article,
      images: orderedImages,
      page_variant: "feishu-document",
      method: `feishu-virtual-document:${blocks.size}-blocks`,
    };
  }
  async function blobData(images) {
    for (const image of images) if (image.resolved_url.startsWith("blob:")) {
      try { const blob = await fetch(image.resolved_url).then(r => r.blob()); image.data_url = await new Promise((ok, fail) => { const reader = new FileReader(); reader.onload = () => ok(reader.result); reader.onerror = fail; reader.readAsDataURL(blob); }); } catch {}
    }
  }
  return async function collectPage() {
    const specialized = await collectBilibiliOpus() || await collectBilibiliVideo();
    const dynamic = specialized || await collectFeishuDocument();
    const found = dynamic || findArticle();
    const images = dynamic?.images || collectImages(found.element);
    const media = dynamic?.media || await HermesMedia.collect(found.element);
    const clone = found.element.cloneNode(true);
    normalizeLinks(clone);
    if (!dynamic) {
      materializeBackgroundImages(clone);
      clearExtractionMarkers(found.element);
    }
    const junkSelectors = window.top === window
      ? JUNK
      : ["nav", "footer", "aside", "form", "dialog"];
    if (!dynamic) clone.querySelectorAll(junkSelectors.join(",")).forEach(x => x.remove());
    HermesMedia.cleanClone(clone);
    await blobData(images);
    clone.querySelectorAll("img").forEach(img => { const src = resolveImage(img, location.href); if (isPlaceholderSvgData(src)) { img.remove(); return; } if (src) img.setAttribute("src", src); [...img.attributes].filter(a => (a.name.startsWith("data-") && a.name !== POSITION_ATTR) || a.name === "srcset").forEach(a => img.removeAttribute(a.name)); });
    const markerIds = new Set(
      [...clone.querySelectorAll(`[${POSITION_ATTR}]`)]
        .map(node => node.getAttribute(POSITION_ATTR))
        .filter(Boolean),
    );
    const missingMarkers = images.filter(image => image.position_id && !markerIds.has(image.position_id));
    const selected = getSelection()?.toString().trim() || "";
    const canonical = document.querySelector("link[rel='canonical']")?.href || metadata(["og:url"]);
    const articleText = clone.innerText || clone.textContent || "";
    return {capture_version: 12, image_placement_policy: dynamic ? "strict" : "fallback", page_variant: dynamic?.page_variant || "standard", frame_kind: HermesMedia.frameKind(articleText, media, clone), title: dynamic?.title || metadata(["og:title", "twitter:title"]) || document.title, author: dynamic?.author || metadata(["author", "article:author", "byl"]), published_at: dynamic?.published_at || metadata(["article:published_time", "date", "datePublished"]), site_name: dynamic?.site_name || metadata(["og:site_name", "application-name"]) || location.hostname, url: location.href, canonical_url: canonical, language: document.documentElement.lang || "", selected_text: selected, user_note: "", article_html: clone.outerHTML, article_text: articleText, headings: [...clone.querySelectorAll("h1,h2,h3,h4")].map(x => x.innerText.trim()).filter(Boolean), images, media, captured_at: new Date().toISOString(), extraction_method: found.method, extraction_warning: missingMarkers.length ? `检测到 ${missingMarkers.length} 张图片的位置标记在正文清理时丢失` : found.method === "whole-page-fallback" ? "自动识别不可靠，建议选中文字后重试或仅保存原文" : "", marker_diagnostics: {images: images.length, markers: markerIds.size, missing: missingMarkers.length}};
  };
})()

