(() => {
  const {POSITION_ATTR, markImagePosition, wait} = HermesExtractorCore;
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
  Object.assign(HermesExtractorCore, {collectCanvasImages, materializeCanvasImages});
})();