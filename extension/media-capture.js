globalThis.HermesMedia = (() => {
  const MEDIA_ATTR = "data-hermes-media-id";
  const MAX_INLINE_BYTES = 150 * 1024 * 1024;
  const CONTROL_ONLY = /^(?:\s|00|0\/0|00:00|\/|\d{2}:\d{2}(?:\/\d{2}:\d{2})?|进度条[，,、:]?|百分之\d+|播放|暂停|倍速|\*?全屏\*?|退出全屏|倍速播放中|(?:0\.5|0\.75|1\.0|1\.5|2\.0)倍|超清|高清|流畅|自动|已关注|关注|重播|赞|观看更多|继续观看|转载|视频详情)+$/;
  const CONTROL_SELECTORS = [
    "[class*='player-control']",
    "[class*='video-control']",
    "[class*='bpx-player-control']",
    "[class*='txp-controls']",
    "[class*='xgplayer-controls']",
    "[class*='progress-bar']",
    "[role='slider']",
  ];
  const PLAYER_SHELL_MARKERS = ["已关注", "关注", "重播", "赞", "观看更多", "继续观看", "转载", "视频详情"];

  function sourceOf(video) {
    return video.currentSrc
      || video.getAttribute("src")
      || video.querySelector("source")?.getAttribute("src")
      || "";
  }

  function findBvid(value) {
    const text = String(value || "");
    const direct = text.match(/BV[0-9A-Za-z]{10}/i);
    if (direct) return direct[0];
    try {
      return decodeURIComponent(text).match(/BV[0-9A-Za-z]{10}/i)?.[0] || "";
    } catch {
      return "";
    }
  }

  function bilibiliVideoPage() {
    if (!/(^|\.)bilibili\.com$/i.test(location.hostname)) return "";
    if (location.pathname.startsWith("/video/")) return location.href;
    const candidates = [location.href];
    for (const script of [...(document.scripts || [])]) candidates.push(script.textContent || "");
    const selectors = [
      "meta[property='og:video']",
      "meta[property='og:video:url']",
      "meta[property='og:url']",
      "a[href*='/video/']",
      "a[href*='BV']",
      "iframe[src*='bilibili']",
      "[data-bvid]",
      "[data-video-id]",
    ];
    for (const node of [...(document.querySelectorAll?.(selectors.join(",")) || [])]) {
      candidates.push(
        node.getAttribute?.("content") ||
        node.getAttribute?.("href") ||
        node.getAttribute?.("src") ||
        node.getAttribute?.("data-bvid") ||
        node.getAttribute?.("data-video-id") ||
        "",
      );
    }
    const resourceEntries = globalThis.performance?.getEntriesByType?.("resource") || [];
    for (const entry of resourceEntries) candidates.push(entry?.name || "");
    candidates.push(document.documentElement?.outerHTML || "");
    for (const candidate of candidates) {
      const bvid = findBvid(candidate);
      if (bvid) return `https://www.bilibili.com/video/${bvid}/`;
    }
    return "";
  }

  function pageVideo(position_id, poster_url = "", order = 0) {
    const page_url = bilibiliVideoPage();
    if (!page_url) return null;
    return {
      position_id,
      kind: "video",
      source_url: "",
      page_url,
      poster_url,
      data_url: "",
      mime_type: "video/mp4",
      duration: 0,
      width: 1280,
      height: 720,
      order,
    };
  }

  async function blobDataUrl(source) {
    if (!source.startsWith("blob:")) return "";
    try {
      const blob = await fetch(source).then(response => response.blob());
      if (!blob.size || blob.size > MAX_INLINE_BYTES || !blob.type.startsWith("video/")) return "";
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch {
      return "";
    }
  }

  async function collect(root, prefix = "hermes-media") {
    const media = [];
    const videos = [...root.querySelectorAll("video")];
    for (const [index, video] of videos.entries()) {
      const rect = video.getBoundingClientRect();
      if (rect.width < 120 && rect.height < 80 && video.videoWidth < 120) continue;
      const position_id = `${prefix}-${index}`;
      video.setAttribute(MEDIA_ATTR, position_id);
      const source_url = sourceOf(video);
      media.push({
        position_id,
        kind: "video",
        source_url,
        page_url: bilibiliVideoPage(),
        poster_url: video.poster || "",
        data_url: await blobDataUrl(source_url),
        mime_type: video.getAttribute("type") || "",
        duration: Number.isFinite(video.duration) ? video.duration : 0,
        width: video.videoWidth || Math.round(rect.width) || 1280,
        height: video.videoHeight || Math.round(rect.height) || 720,
        order: index,
      });
    }
    return media;
  }

  function cleanClone(root) {
    root.querySelectorAll(CONTROL_SELECTORS.join(",")).forEach(node => node.remove());
    for (const video of [...root.querySelectorAll(`video[${MEDIA_ATTR}]`)]) {
      const slot = document.createElement("div");
      slot.setAttribute(MEDIA_ATTR, video.getAttribute(MEDIA_ATTR));
      slot.setAttribute("data-hermes-kind", "offline-video");
      let shell = video;
      for (let node = video.parentElement; node && node !== root; node = node.parentElement) {
        const text = (node.innerText || node.textContent || "").replace(/\s+/g, " ").trim();
        const markerCount = PLAYER_SHELL_MARKERS.filter(marker => text.includes(marker)).length;
        const hasPlayerClass = /(?:^|[-_])(player|video)(?:[-_]|$)/i.test(String(node.className || ""));
        const containsOneVideo = node.querySelectorAll(`video[${MEDIA_ATTR}]`).length === 1;
        if (containsOneVideo && (hasPlayerClass || markerCount >= 3) && text.length < 800) shell = node;
      }
      shell.replaceWith(slot);
    }
    for (const node of [...root.querySelectorAll("span,div,p,button,a")].reverse()) {
      const text = (node.textContent || "").replace(/\s+/g, " ").trim();
      const containsContent = node.querySelector(`img,video,pre,code,table,[${MEDIA_ATTR}]`);
      if (!containsContent && text && text.length < 120 && CONTROL_ONLY.test(text)) node.remove();
    }
  }

  function frameKind(text, media, root) {
    const normalized = String(text || "").replace(/\s+/g, " ").trim();
    const links = root.querySelectorAll("a").length;
    const paragraphs = root.querySelectorAll("p").length;
    if (media.length && (normalized.length < 500 || CONTROL_ONLY.test(normalized))) return "media";
    if (links > 12 && paragraphs < 3) return "navigation";
    return "article";
  }

  return {
    MEDIA_ATTR,
    bilibiliVideoPage,
    cleanClone,
    collect,
    frameKind,
    isPlayerControlText: value => CONTROL_ONLY.test(String(value || "").replace(/\s+/g, " ").trim()),
    pageVideo,
  };
})();
