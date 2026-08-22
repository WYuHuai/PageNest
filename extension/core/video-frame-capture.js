(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.PageNestVideoFrameCapture = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024;

  class CaptureError extends Error {
    constructor(code, message) {
      super(message);
      this.name = "CaptureError";
      this.code = code;
    }
  }

  function calculateCrop(probe, bitmapWidth, bitmapHeight) {
    const viewportWidth = Number(probe?.viewport_width);
    const viewportHeight = Number(probe?.viewport_height);
    const rect = probe?.rect;
    if (!rect || viewportWidth <= 0 || viewportHeight <= 0 || bitmapWidth <= 0 || bitmapHeight <= 0) {
      throw new CaptureError("crop-failed", "Screenshot or viewport dimensions are invalid");
    }
    const scaleX = bitmapWidth / viewportWidth;
    const scaleY = bitmapHeight / viewportHeight;
    const left = Math.max(0, Math.min(bitmapWidth, Math.floor(Number(rect.left) * scaleX)));
    const top = Math.max(0, Math.min(bitmapHeight, Math.floor(Number(rect.top) * scaleY)));
    const right = Math.max(0, Math.min(bitmapWidth, Math.ceil(Number(rect.right) * scaleX)));
    const bottom = Math.max(0, Math.min(bitmapHeight, Math.ceil(Number(rect.bottom) * scaleY)));
    if (right <= left || bottom <= top) {
      throw new CaptureError("crop-failed", "Video crop has no visible pixels");
    }
    return Object.freeze({
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
      scale_x: scaleX,
      scale_y: scaleY,
    });
  }

  function encodeBase64(bytes, btoaFn) {
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    return btoaFn(binary);
  }

  async function cropScreenshot(screenshotDataUrl, probe, options = {}) {
    const fetchFn = options.fetch || root.fetch?.bind(root);
    const imageBitmap = options.createImageBitmap || root.createImageBitmap;
    const Canvas = options.OffscreenCanvas || root.OffscreenCanvas;
    const btoaFn = options.btoa || root.btoa;
    if (!fetchFn || !imageBitmap || !Canvas || !btoaFn) {
      throw new CaptureError(
        "video-frame-not-supported",
        "This Edge worker does not provide createImageBitmap and OffscreenCanvas"
      );
    }
    let bitmap;
    try {
      const response = await fetchFn(screenshotDataUrl);
      bitmap = await imageBitmap(await response.blob());
      const crop = calculateCrop(probe, bitmap.width, bitmap.height);
      const canvas = new Canvas(crop.width, crop.height);
      const context = canvas.getContext("2d");
      if (!context) throw new CaptureError("crop-failed", "2D crop context is unavailable");
      context.drawImage(
        bitmap,
        crop.x,
        crop.y,
        crop.width,
        crop.height,
        0,
        0,
        crop.width,
        crop.height
      );
      const blob = await canvas.convertToBlob({ type: "image/png" });
      if (!blob || blob.size > MAX_SCREENSHOT_BYTES) {
        throw new CaptureError("screenshot-too-large", "Cropped screenshot exceeds 10 MiB");
      }
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const png = bytes.length >= 8 &&
        bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
        bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
      if (!png) throw new CaptureError("crop-failed", "Crop output is not a valid PNG");
      return {
        image_data_url: `data:image/png;base64,${encodeBase64(bytes, btoaFn)}`,
        mime_type: "image/png",
        size: bytes.length,
        crop,
      };
    } catch (error) {
      if (error instanceof CaptureError) throw error;
      throw new CaptureError("crop-failed", "Unable to crop the visible video frame");
    } finally {
      if (typeof bitmap?.close === "function") bitmap.close();
    }
  }

  return Object.freeze({ MAX_SCREENSHOT_BYTES, CaptureError, calculateCrop, cropScreenshot });
});
