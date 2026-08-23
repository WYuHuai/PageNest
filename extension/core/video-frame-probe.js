(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.PageNestVideoFrameProbe = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function probeVisibleVideo(options = {}) {
    const doc = options.document || document;
    const view = options.window || window;
    const text = (value) => String(value || "").trim();
    const titleCandidates = [
      text(doc.querySelector?.('meta[property="og:title"]')?.content),
      text(doc.querySelector?.('meta[name="twitter:title"]')?.content),
      text(doc.querySelector?.("main h1")?.textContent),
      text(doc.querySelector?.('h1[role="heading"]')?.textContent),
      text(doc.querySelector?.("h1")?.textContent),
      text(doc.title),
    ];
    const videoTitle = titleCandidates.find(Boolean) || "视频笔记";
    const viewportWidth = Number(options.viewport_width || view.innerWidth || doc.documentElement?.clientWidth || 0);
    const viewportHeight = Number(options.viewport_height || view.innerHeight || doc.documentElement?.clientHeight || 0);
    const minimumVisibleRatio = Number(options.minimum_visible_ratio ?? 0.5);
    const styleFor = options.get_computed_style || ((element) => view.getComputedStyle(element));
    let hadPartialCandidate = false;
    const candidates = [];

    function hiddenByTree(video) {
      for (let node = video; node && node.nodeType === 1; node = node.parentElement) {
        const style = styleFor(node);
        const opacity = Number.parseFloat(style?.opacity ?? "1");
        if (
          style?.display === "none" ||
          ["hidden", "collapse"].includes(style?.visibility) ||
          (Number.isFinite(opacity) && opacity <= 0.05)
        ) return true;
      }
      return false;
    }

    for (const video of doc.querySelectorAll("video")) {
      if (video.isConnected === false || hiddenByTree(video)) continue;
      const raw = video.getBoundingClientRect();
      if (!raw || raw.width <= 1 || raw.height <= 1) continue;
      const left = Math.max(0, raw.left);
      const top = Math.max(0, raw.top);
      const right = Math.min(viewportWidth, raw.right);
      const bottom = Math.min(viewportHeight, raw.bottom);
      const width = Math.max(0, right - left);
      const height = Math.max(0, bottom - top);
      if (!width || !height) continue;
      const visibleArea = width * height;
      const visibleRatio = visibleArea / (raw.width * raw.height);
      if (visibleRatio < minimumVisibleRatio) {
        hadPartialCandidate = true;
        continue;
      }
      candidates.push({
        video,
        visibleArea,
        visibleRatio,
        playing: !video.paused && !video.ended,
        rect: { left, top, right, bottom, width, height },
        videoRect: {
          left: raw.left,
          top: raw.top,
          right: raw.right,
          bottom: raw.bottom,
          width: raw.width,
          height: raw.height,
        },
      });
    }

    if (!candidates.length) {
      return {
        ok: false,
        error: hadPartialCandidate ? "video-not-sufficiently-visible" : "no-visible-video",
      };
    }
    candidates.sort((left, right) => {
      const maximum = Math.max(left.visibleArea, right.visibleArea);
      const comparable = Math.abs(left.visibleArea - right.visibleArea) <= maximum * 0.15;
      if (comparable && left.playing !== right.playing) return left.playing ? -1 : 1;
      return right.visibleArea - left.visibleArea;
    });
    const selected = candidates[0];
    const currentTime = Number(selected.video.currentTime);
    return {
      ok: true,
      current_time: Number.isFinite(currentTime) && currentTime >= 0 ? currentTime : 0,
      rect: selected.rect,
      video_rect: selected.videoRect,
      visible_ratio: selected.visibleRatio,
      viewport_width: viewportWidth,
      viewport_height: viewportHeight,
      device_pixel_ratio: Number(view.devicePixelRatio || 1),
      page_url: String(options.page_url || view.location?.href || ""),
      page_title: text(options.page_title) || videoTitle,
    };
  }

  return Object.freeze({ probeVisibleVideo });
});
