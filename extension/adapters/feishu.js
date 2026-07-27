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
  HermesAdapters.register({
    name: "feishu",
    specialized: true,
    detect: ({location}) => /(^|\.)feishu\.cn$/.test(location.hostname),
    extract: collectFeishuDocument,
    validate: result => !result || Boolean(result.element && result.method),
  });
})();