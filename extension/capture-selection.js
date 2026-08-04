globalThis.selectBestCapture = (captures, tab) => {
  const valid = captures.filter(
    item => item.result && !item.result.capture_error && item.result.article_html,
  );
  const readable = valid.filter(
    item => PageNestContentQuality.isReadableArticle(item.result.article_text),
  );
  if (!readable.length) {
    throw new Error("当前页面及其嵌入内容均未能识别");
  }

  const topEntry = valid.find(item => item.frameId === 0);
  const top = topEntry?.result;
  const topHostname = new URL(tab.url).hostname;
  const isFeishu = /(^|\.)feishu\.cn$/i.test(topHostname);
  const articleFrames = readable.filter(
    item => !["media", "navigation"].includes(item.result.frame_kind),
  );

  const score = ({result}) => (
    (result.article_text?.length || 0)
    + (result.images?.length || 0) * 1200
    + (result.headings?.length || 0) * 80
    + (result.marker_diagnostics?.markers || 0) * 1500
  );

  let chosen;
  if (
    isFeishu
    && topEntry
    && /^feishu-virtual-document:/.test(top.extraction_method || "")
  ) {
    chosen = topEntry;
  } else {
    const candidates = articleFrames.length ? articleFrames : readable;
    chosen = [...candidates].sort((left, right) => score(right) - score(left))[0];
  }

  const media = [];
  const seenMedia = new Set();
  for (const frame of valid) {
    for (const item of frame.result.media || []) {
      const key = item.page_url || item.source_url || item.data_url || item.position_id;
      if (!key || seenMedia.has(key)) continue;
      seenMedia.add(key);
      media.push({...item, order: media.length});
    }
  }

  let articleHtml = chosen.result.article_html;
  const missingSlots = media.filter(
    item => item.position_id && !articleHtml.includes(`data-hermes-media-id="${item.position_id}"`),
  );
  if (missingSlots.length) {
    const slots = missingSlots
      .map(item => `<div data-hermes-kind="offline-video" data-hermes-media-id="${item.position_id}"></div>`)
      .join("");
    articleHtml += `<section data-hermes-kind="embedded-media">${slots}</section>`;
  }

  if (chosen.frameId === 0) {
    return {
      ...chosen.result,
      article_html: articleHtml,
      media,
    };
  }

  const topTitle = top?.title && !/^(Docs|Feishu|飞书)$/i.test(top.title)
    ? top.title
    : tab.title;
  return {
    ...chosen.result,
    title: topTitle || chosen.result.title,
    author: top?.author || chosen.result.author,
    published_at: top?.published_at || chosen.result.published_at,
    site_name: top?.site_name || (isFeishu ? "飞书云文档" : topHostname),
    url: tab.url,
    canonical_url: top?.canonical_url || tab.url,
    article_html: articleHtml,
    media,
    image_placement_policy: isFeishu
      ? "strict"
      : chosen.result.image_placement_policy,
    extraction_method: `embedded-frame:${chosen.frameId}:${chosen.result.extraction_method}`,
    extraction_warning: chosen.result.extraction_warning || "",
  };
};
