(() => {  const {
    POSITION_ATTR,
    addTextElement,
    clearExtractionMarkers,
    collectCanvasImages,
    collectImages,
    ensureImageSlots,
    isoDurationLabel,
    jsonLdObjects,
    markImagePosition,
    materializeBackgroundImages,
    materializeCanvasImages,
    metadata,
    scrollContainer,
    stableBlockPrefix,
    textLength,
    topLevelFeishuBlocks,
    wait,
  } = HermesExtractorCore;
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
  HermesAdapters.register({
    name: "bilibili",
    specialized: true,
    detect: ({location}) => /(^|\.)bilibili\.com$/.test(location.hostname)
      && (location.pathname.startsWith("/video/") || location.pathname.startsWith("/opus/")),
    extract: async () => await collectBilibiliOpus() || await collectBilibiliVideo(),
    validate: result => !result || Boolean(result.element && result.method),
  });
})();