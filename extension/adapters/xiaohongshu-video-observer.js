globalThis.PageNestXhsVideoObserver ||= (() => {
  const sources = new Map();
  const MAX_SOURCES = 30;

  function normalize(value) {
    try {
      const url = new URL(String(value || ""), location.href);
      const host = url.hostname.toLowerCase();
      const path = url.pathname.toLowerCase();
      const trusted = host === "xhscdn.com" || host.endsWith(".xhscdn.com");
      const staticAsset = /\.(?:avif|gif|ico|jpe?g|png|svg|webp|css|js|woff2?)$/.test(path);
      const media = /(?:^|\.)(?:sns-)?(?:video|vod)(?:-|\.)/.test(host)
        || /\.(?:mp4|m3u8)$/.test(path)
        || /\/(?:spectrum|stream|video|media|vod)\//.test(path);
      if (!trusted || staticAsset || !media) return "";
      if (url.protocol === "http:") url.protocol = "https:";
      return url.protocol === "https:" ? url.href : "";
    } catch {
      return "";
    }
  }

  function record(entry) {
    const url = normalize(entry?.name || entry);
    if (!url) return;
    sources.delete(url);
    sources.set(url, {
      url,
      startTime: Number(entry?.startTime || performance.now?.() || 0),
      initiatorType: entry?.initiatorType || "",
    });
    while (sources.size > MAX_SOURCES) sources.delete(sources.keys().next().value);
  }

  for (const entry of performance.getEntriesByType?.("resource") || []) record(entry);
  try {
    new PerformanceObserver(list => list.getEntries().forEach(record)).observe({type: "resource", buffered: true});
  } catch {}

  return {
    recent() {
      return [...sources.values()]
        .sort((left, right) => right.startTime - left.startTime)
        .map(item => item.url);
    },
  };
})();
