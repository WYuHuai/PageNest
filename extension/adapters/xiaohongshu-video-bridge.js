globalThis.PageNestXhsVideoBridge = (() => {
  async function resolveInPage(inline = false, preferredSource = "") {
    const noteId = location.pathname.match(/^\/(?:explore|discovery\/item)\/([^/?#]+)/)?.[1] || "";
    const isObject = value => value && typeof value === "object";
    const videoUrl = value => {
      if (typeof value !== "string") return "";
      try {
        const url = new URL(value, location.href);
        const host = url.hostname.toLowerCase();
        const path = url.pathname.toLowerCase();
        const trusted = host === "xhscdn.com" || host.endsWith(".xhscdn.com");
        const staticAsset = /\.(?:avif|gif|ico|jpe?g|png|svg|webp|css|js|woff2?)$/.test(path);
        const media = /^sns-video(?:-|\.)/.test(host)
          || /\.(?:mp4|m3u8)$/.test(path)
          || /\/(?:spectrum|stream|video|media)\//.test(path);
        if (url.protocol === "http:" && trusted) url.protocol = "https:";
        return url.protocol === "https:" && trusted && media && !staticAsset ? url.href : "";
      } catch {
        return "";
      }
    };
    const matchingNote = state => {
      const direct = state?.note?.noteDetailMap?.[noteId]
        || state?.noteDetailMap?.[noteId]
        || state?.note?.detailMap?.[noteId];
      if (direct) return direct.note || direct;
      const queue = [state];
      const seen = new Set();
      for (let count = 0; queue.length && count < 12000; count += 1) {
        const value = queue.shift();
        if (!isObject(value) || seen.has(value)) continue;
        seen.add(value);
        const id = value.noteId || value.note_id || value.id;
        if (String(id || "") === noteId) return value.note || value;
        for (const [key, child] of Object.entries(value)) {
          if (key === noteId && isObject(child)) return child.note || child;
          if (isObject(child)) queue.push(child);
        }
      }
      return null;
    };
    const candidates = [];
    const add = (value, score) => {
      const url = videoUrl(value);
      if (url) candidates.push({url, score});
    };
    const scan = root => {
      const queue = [{value: root, path: ""}];
      const seen = new Set();
      for (let count = 0; queue.length && count < 12000; count += 1) {
        const {value, path} = queue.shift();
        if (!isObject(value) || seen.has(value)) continue;
        seen.add(value);
        for (const [key, child] of Object.entries(value)) {
          const nextPath = `${path}.${key}`.toLowerCase();
          if (typeof child === "string") {
            const priority = /master_?url/.test(key) ? 120
              : /backup_?urls?/.test(key) ? 100
              : /video|stream|play|url/.test(key) ? 70 : 30;
            add(child, priority + (nextPath.includes("h264") ? 20 : 0));
            if (/origin_?video_?key/i.test(key) && child) {
              add(`https://sns-video-bd.xhscdn.com/${child.replace(/^\/+/, "")}`, 110);
            }
          } else if (isObject(child)) {
            queue.push({value: child, path: nextPath});
          }
        }
      }
    };
    add(preferredSource, 200);
    const states = [globalThis.__INITIAL_STATE__];
    try {
      const encoded = document.getElementById("RENDER_DATA")?.textContent;
      if (encoded) states.push(JSON.parse(decodeURIComponent(encoded)));
    } catch {}
    for (const state of states) {
      const note = matchingNote(state);
      if (note) scan(note);
    }
    for (const entry of performance?.getEntriesByType?.("resource") || []) {
      add(entry?.name, 40 + (entry?.initiatorType === "video" ? 40 : 0) + Number(entry?.startTime || 0) / 1e9);
    }
    candidates.sort((left, right) => right.score - left.score);
    const source_url = candidates[0]?.url || "";
    if (!inline || !source_url) return source_url;
    let timeout;
    try {
      const controller = new AbortController();
      timeout = setTimeout(() => controller.abort(), 45000);
      const response = await fetch(source_url, {
        credentials: "include",
        headers: {Accept: "video/*"},
        signal: controller.signal,
      });
      if (!response.ok) return {source_url, data_url: ""};
      const declared = Number(response.headers.get("content-length") || 0);
      if (declared > 80 * 1024 * 1024) return {source_url, data_url: ""};
      const blob = await response.blob();
      if (!blob.size || blob.size > 80 * 1024 * 1024) return {source_url, data_url: ""};
      let data_url = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      if (/^data:application\/(?:octet-stream|binary);/i.test(data_url)) {
        data_url = data_url.replace(/^data:[^;]+;/i, "data:video/mp4;");
      }
      return {source_url, data_url: /^data:video\//.test(data_url) ? data_url : ""};
    } catch {
      return {source_url, data_url: ""};
    } finally {
      clearTimeout(timeout);
    }
  }

  async function apply(capture, tabId, scripting = chrome.scripting, inline = true) {
    const pending = (capture?.media || []).find(item => !item.data_url);
    if (capture?.page_variant !== "xiaohongshu-note" || !pending) {
      return capture;
    }
    const [{result = ""} = {}] = await scripting.executeScript({
      target: {tabId},
      world: "MAIN",
      func: resolveInPage,
      args: [inline, pending.source_url || ""],
    });
    const source_url = typeof result === "string" ? result : result?.source_url || "";
    const data_url = typeof result === "object" ? result?.data_url || "" : "";
    if (!source_url) return capture;
    for (const item of capture.media) {
      if (item.data_url) continue;
      item.source_url = source_url;
      if (data_url) {
        item.data_url = data_url;
        item.mime_type = data_url.slice(5, data_url.indexOf(";"));
      }
    }
    return capture;
  }

  return {apply, resolveInPage};
})();
