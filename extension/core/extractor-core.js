globalThis.HermesExtractorCore = (() => {
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
  function findArticle() {
    for (const selector of SELECTORS) {
      const candidates = [...document.querySelectorAll(selector)].filter(
        element => PageNestContentQuality.isReadableArticle(element.innerText || element.textContent),
      );
      if (candidates.length) return {element: candidates.sort((a, b) => score(b) - score(a))[0], method: `selector:${selector}`};
    }
    const candidates = [...document.querySelectorAll("main,section,div")].filter(
      element => textLength(element) > 500
        && element.querySelectorAll("p").length >= 3
        && PageNestContentQuality.isReadableArticle(element.innerText || element.textContent),
    );
    return candidates.length ? {element: candidates.sort((a, b) => score(b) - score(a))[0], method: "bundled-readability-heuristic"} : {element: document.body, method: "whole-page-fallback"};
  }
  function findArticleBySelectors(selectors, methodPrefix, {minimumTextLength = 180, minimumImages = 0} = {}) {
    for (const selector of selectors) {
      const candidates = [...document.querySelectorAll(selector)].filter(element => {
        const text = element.innerText || element.textContent || "";
        const hasEnoughText = textLength(element) >= minimumTextLength && !PageNestContentQuality.looksLikeScriptBundle(text);
        return hasEnoughText || (minimumImages > 0 && element.querySelectorAll("img").length >= minimumImages);
      });
      if (candidates.length) {
        return {element: candidates.sort((a, b) => score(b) - score(a))[0], method: `${methodPrefix}:${selector}`};
      }
    }
    return null;
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
    const raw = img.getAttribute("data-original") || img.getAttribute("data-origin") || img.getAttribute("data-src") || img.getAttribute("data-lazy-src") || img.getAttribute("data-actualsrc") || img.getAttribute("data-image-src") || img.getAttribute("data-zoom-image") || srcset || img.currentSrc || img.getAttribute("src") || "";
    try { return new URL(raw, base).href; } catch { return raw; }
  }
  function externalLinkLabel(url) {
    try {
      const parsed = new URL(url);
      return parsed.hostname.toLowerCase() === "github.com" ? "打开 GitHub 链接 ↗" : "打开代码仓库 ↗";
    } catch {
      return "打开代码仓库 ↗";
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
      const hasText = (anchor.innerText || anchor.textContent || "").trim();
      const hasVisualContent = anchor.querySelector("img,picture,video,svg");
      if (!hasText && !hasVisualContent && isCodeHost(resolved)) {
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
  function unwrapHeadingLinks(root) {
    for (const heading of root.querySelectorAll("h1,h2,h3,h4,h5,h6")) {
      for (const anchor of heading.querySelectorAll("a")) {
        anchor.replaceWith(...anchor.childNodes);
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
      if (width > 0 && height > 0 && width < 50 && height < 50) return;
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
  async function waitForContent(predicate, timeout = 8000, interval = 200) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (predicate()) return true;
      await wait(interval);
    }
    return Boolean(predicate());
  }
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
  async function blobData(images) {
    for (const image of images) if (image.resolved_url.startsWith("blob:")) {
      try { const blob = await fetch(image.resolved_url).then(r => r.blob()); image.data_url = await new Promise((ok, fail) => { const reader = new FileReader(); reader.onload = () => ok(reader.result); reader.onerror = fail; reader.readAsDataURL(blob); }); } catch {}
    }
  }
  function fileUrl(value) {
    try { return new URL(value).protocol === "file:"; } catch { return false; }
  }
  function blobDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
  function dataUrlSize(value) {
    const encoded = String(value || "").split(",", 2)[1] || "";
    return Math.ceil(encoded.length * 3 / 4);
  }
  function canvasImageDataUrl(element) {
    const width = element?.naturalWidth || 0;
    const height = element?.naturalHeight || 0;
    if (!width || !height) return "";
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d").drawImage(element, 0, 0, width, height);
    return canvas.toDataURL("image/png");
  }
  async function inlineLocalImages(images, root = null, policy = {}) {
    const limits = {
      maxImages: 40,
      maxTotalBytes: 80 * 1024 * 1024,
      maxSingleImageBytes: 25 * 1024 * 1024,
      ...policy,
    };
    const queue = images.filter(image => fileUrl(image.resolved_url || image.current_src || ""))
      .slice(0, limits.maxImages);
    const marked = new Map(
      root
        ? [...root.querySelectorAll(`[${POSITION_ATTR}]`)].map(
            node => [node.getAttribute(POSITION_ATTR), node],
          )
        : [],
    );
    let cursor = 0;
    let totalBytes = 0;
    let inlined = 0;
    const worker = async () => {
      while (cursor < queue.length) {
        const image = queue[cursor++];
        const source = image.resolved_url || image.current_src;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        let dataUrl = "";
        let size = 0;
        try {
          const response = await fetch(source, {signal: controller.signal});
          if (response.ok || response.status === 0) {
            const blob = await response.blob();
            if (blob.size && blob.size <= limits.maxSingleImageBytes && blob.type.startsWith("image/")) {
              dataUrl = await blobDataUrl(blob);
              size = blob.size;
            }
          }
        } catch {}
        if (!dataUrl) {
          try {
            dataUrl = canvasImageDataUrl(marked.get(image.position_id));
            size = dataUrlSize(dataUrl);
          } catch {}
        }
        if (
          dataUrl
          && size > 0
          && size <= limits.maxSingleImageBytes
          && totalBytes + size <= limits.maxTotalBytes
        ) {
          totalBytes += size;
          image.data_url = dataUrl;
          inlined += 1;
        }
        clearTimeout(timeout);
      }
    };
    await Promise.all(Array.from({length: Math.min(4, queue.length)}, worker));
    return {attempted: queue.length, inlined, failed: queue.length - inlined};
  }
  function redactLocalResources(root, images, media) {
    const marked = new Map(
      [...root.querySelectorAll(`[${POSITION_ATTR}]`)]
        .map(node => [node.getAttribute(POSITION_ATTR), node]),
    );
    images.forEach((image, index) => {
      const local = [image.original_url, image.resolved_url, image.current_src].some(fileUrl);
      if (!local) return;
      const node = marked.get(image.position_id);
      if (image.data_url) node?.setAttribute("src", image.data_url);
      else node?.removeAttribute("src");
      for (const attribute of ["srcset", "data-src", "data-original", "data-lazy-src", "data-actualsrc"]) {
        node?.removeAttribute(attribute);
      }
      image.original_url = "";
      image.current_src = "";
      image.resolved_url = image.data_url
        ? ""
        : `local-resource-unavailable://image/${encodeURIComponent(image.position_id || String(index + 1))}`;
      image.source_type = image.data_url ? "local-file" : "local-file-unavailable";
    });
    for (const anchor of root.querySelectorAll("a[href]")) {
      const href = anchor.getAttribute("href");
      let safe = href.startsWith("#");
      try {
        safe ||= /^https?:$/i.test(new URL(href, "file:///").protocol);
      } catch {}
      if (!safe) {
        anchor.removeAttribute("href");
      }
    }
    for (const element of root.querySelectorAll("[src],[poster]")) {
      for (const attribute of ["src", "poster"]) {
        if (fileUrl(element.getAttribute(attribute))) element.removeAttribute(attribute);
      }
    }
    media.forEach((item, index) => {
      if (![item.source_url, item.page_url, item.poster_url].some(fileUrl)) return;
      item.source_url = item.data_url
        ? ""
        : `local-resource-unavailable://media/${encodeURIComponent(item.position_id || String(index + 1))}`;
      item.page_url = "";
      item.poster_url = "";
    });
  }
  return {
    JUNK,
    POSITION_ATTR,
    addTextElement,
    blobData,
    clearExtractionMarkers,
    collectImages,
    ensureImageSlots,
    findArticle,
    findArticleBySelectors,
    isoDurationLabel,
    inlineLocalImages,
    isPlaceholderSvgData,
    jsonLdObjects,
    markImagePosition,
    materializeBackgroundImages,
    metadata,
    normalizeLinks,
    resolveImage,
    redactLocalResources,
    scrollContainer,
    stableBlockPrefix,
    textLength,
    topLevelFeishuBlocks,
    unwrapHeadingLinks,
    wait,
    waitForContent,
  };
})();
