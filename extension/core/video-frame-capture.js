(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.PageNestVideoFrameCapture = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const MAX_FRAME_BYTES = 10 * 1024 * 1024;
  const MAX_VIDEO_FRAME_DIMENSION = 1920;
  const DEFAULT_FRAME_MIME_TYPE = "image/png";
  const FRAME_READY_TIMEOUT_MS = 2000;
  const SIZE_REDUCTION_FACTOR = 0.85;
  const MIN_VIDEO_FRAME_DIMENSION = 480;
  const MAX_ENCODE_ATTEMPTS = 8;
  const VALID_RASTER_MIME_TYPES = Object.freeze(["image/png"]);

  class CaptureError extends Error {
    constructor(code, message) {
      super(message);
      this.name = "CaptureError";
      this.code = code;
    }
  }

  function fitFrameDimensions(sourceWidth, sourceHeight, maximumDimension) {
    const width = Number(sourceWidth);
    const height = Number(sourceHeight);
    const maximum = Number(maximumDimension);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      throw new CaptureError("video-frame-not-ready", "Video frame dimensions are unavailable");
    }
    if (!Number.isFinite(maximum) || maximum <= 0) {
      throw new CaptureError("video-frame-capture-unsupported", "Frame size policy is invalid");
    }
    const scale = Math.min(1, maximum / Math.max(width, height));
    return Object.freeze({
      width: Math.max(1, Math.round(width * scale)),
      height: Math.max(1, Math.round(height * scale)),
    });
  }

  async function captureVideoFrame(request = {}) {
    const doc = request.test_document || (typeof document !== "undefined" ? document : null);
    const pageLocation = request.test_location || (typeof location !== "undefined" ? location : null);
    const Reader = request.test_FileReader || (typeof FileReader !== "undefined" ? FileReader : null);
    const fail = (error, reason) => ({ ok: false, error, reason });
    const timeoutMs = Math.max(1, Math.min(10000, Number(request.timeout_ms) || 2000));
    const deadline = Date.now() + timeoutMs;
    let canvas = null;

    function remainingTime() {
      return Math.max(0, deadline - Date.now());
    }

    function dimensions(sourceWidth, sourceHeight, maximumDimension) {
      const width = Number(sourceWidth);
      const height = Number(sourceHeight);
      const maximum = Number(maximumDimension);
      if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        return null;
      }
      if (!Number.isFinite(maximum) || maximum <= 0) return null;
      const scale = Math.min(1, maximum / Math.max(width, height));
      return {
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale)),
      };
    }

    function waitFor(video, predicate, eventNames) {
      if (predicate()) return Promise.resolve(true);
      if (video.error) return Promise.resolve(false);
      const wait = remainingTime();
      if (!wait) return Promise.resolve(false);
      return new Promise((resolve) => {
        let settled = false;
        let timer;
        const finish = (matched) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          for (const name of eventNames) video.removeEventListener(name, check);
          resolve(matched);
        };
        const check = () => {
          if (video.error) return finish(false);
          if (predicate()) finish(true);
        };
        for (const name of eventNames) video.addEventListener(name, check, { once: false });
        timer = setTimeout(() => finish(false), wait);
      });
    }

    function waitForPresentedFrame(video) {
      const wait = remainingTime();
      if (!wait) return Promise.resolve(false);
      return new Promise((resolve) => {
        let settled = false;
        let callbackId;
        let timer;
        const finish = (presented) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (!presented && callbackId !== undefined &&
              typeof video.cancelVideoFrameCallback === "function") {
            video.cancelVideoFrameCallback(callbackId);
          }
          resolve(presented);
        };
        timer = setTimeout(() => finish(false), wait);
        try {
          callbackId = video.requestVideoFrameCallback(() => finish(true));
        } catch {
          finish(false);
        }
      });
    }

    function encodeCanvas(targetCanvas, mimeType) {
      const wait = Math.max(1, remainingTime());
      return new Promise((resolve) => {
        let settled = false;
        let timer;
        const finish = (result) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(result);
        };
        timer = setTimeout(() => finish({ error: "encode-timeout" }), wait);
        try {
          targetCanvas.toBlob(
            (blob) => finish(blob ? { blob } : { error: "encode-failed" }),
            mimeType
          );
        } catch (error) {
          finish({ error: error?.name === "SecurityError" ? "canvas-security" : "encode-failed" });
        }
      });
    }

    async function hasValidSignature(blob, mimeType) {
      if (typeof blob.slice !== "function") return false;
      try {
        const bytes = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
        return mimeType === "image/png" && bytes.length >= 8 &&
          bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
          bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
      } catch {
        return false;
      }
    }

    function readDataUrl(blob) {
      return new Promise((resolve) => {
        if (!Reader) return resolve(null);
        let settled = false;
        let timer;
        const finish = (result) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(result);
        };
        const reader = new Reader();
        reader.onloadend = () => finish(typeof reader.result === "string" ? reader.result : null);
        reader.onerror = () => finish(null);
        timer = setTimeout(() => finish(null), Math.max(1, remainingTime()));
        try {
          reader.readAsDataURL(blob);
        } catch {
          finish(null);
        }
      });
    }

    try {
      if (!doc || !pageLocation) return fail("video-frame-capture-unsupported", "missing-page-context");
      const expectedPageUrl = String(request.expected_page_url || "");
      const pageUrl = String(pageLocation.href || "");
      if (expectedPageUrl && pageUrl !== expectedPageUrl) {
        return fail("video-page-changed", "page-url-changed");
      }
      const videoIndex = Number(request.video_index);
      const videos = Array.from(doc.querySelectorAll("video"));
      if (!Number.isInteger(videoIndex) || videoIndex < 0 || videoIndex >= videos.length) {
        return fail("video-frame-capture-unsupported", "video-element-changed");
      }
      const video = videos[videoIndex];
      if (!video || video.isConnected === false) {
        return fail("video-frame-capture-unsupported", "video-element-changed");
      }
      if (video.mediaKeys) {
        return fail("video-frame-capture-unsupported", "protected-media");
      }
      if (video.error) {
        return fail("video-frame-capture-unsupported", "decode-error");
      }

      const isReady = () => Number(video.readyState) >= 2 &&
        Number(video.videoWidth) > 0 && Number(video.videoHeight) > 0;
      if (!isReady()) {
        const ready = await waitFor(
          video,
          isReady,
          ["loadeddata", "canplay", "resize", "seeked"]
        );
        if (!ready) return fail("video-frame-not-ready", "readiness-timeout");
      }
      if (video.seeking) {
        const seeked = await waitFor(video, () => !video.seeking && isReady(), ["seeked"]);
        if (!seeked) return fail("video-frame-capture-timeout", "seek-timeout");
      }

      let frameSync = "ready-state";
      if (!video.paused && !video.ended && typeof video.requestVideoFrameCallback === "function") {
        if (!await waitForPresentedFrame(video)) {
          return fail("video-frame-capture-timeout", "frame-callback-timeout");
        }
        frameSync = "video-frame-callback";
      }

      const sourceWidth = Number(video.videoWidth);
      const sourceHeight = Number(video.videoHeight);
      const output = dimensions(sourceWidth, sourceHeight, Number(request.max_dimension) || 1920);
      if (!output) return fail("video-frame-not-ready", "invalid-dimensions");
      const mimeType = String(request.mime_type || "image/png").toLowerCase();
      const maximumBytes = Math.max(1, Number(request.max_frame_bytes) || (10 * 1024 * 1024));
      if (mimeType !== "image/png") {
        return fail("video-frame-capture-unsupported", "invalid-raster");
      }

      canvas = doc.createElement("canvas");
      canvas.width = output.width;
      canvas.height = output.height;
      const context = canvas.getContext("2d", { alpha: false });
      if (!context || typeof context.drawImage !== "function") {
        return fail("video-frame-capture-unsupported", "canvas-unavailable");
      }
      try {
        context.drawImage(video, 0, 0, output.width, output.height);
      } catch (error) {
        return fail(
          "video-frame-capture-unsupported",
          error?.name === "SecurityError" ? "canvas-security" : "draw-failed"
        );
      }

      let blob = null;
      let actualMimeType = "";
      let encodeAttempts = 0;
      while (encodeAttempts < 8) {
        encodeAttempts += 1;
        const encoded = await encodeCanvas(canvas, mimeType);
        if (!encoded.blob) {
          return fail(
            encoded.error === "encode-timeout" ? "video-frame-capture-timeout" :
              "video-frame-capture-unsupported",
            encoded.error
          );
        }
        blob = encoded.blob;
        actualMimeType = String(blob.type || "").toLowerCase();
        if (actualMimeType !== "image/png" || !await hasValidSignature(blob, actualMimeType)) {
          return fail("video-frame-capture-unsupported", "invalid-raster");
        }
        if (Number(blob.size) <= maximumBytes) break;

        const currentMaximum = Math.max(canvas.width, canvas.height);
        if (encodeAttempts >= 8 || currentMaximum <= 480) {
          return fail("video-frame-too-large", "frame-size-limit");
        }
        const nextMaximum = Math.max(480, Math.floor(currentMaximum * 0.85));
        const next = dimensions(canvas.width, canvas.height, nextMaximum);
        if (!next || (next.width === canvas.width && next.height === canvas.height)) {
          return fail("video-frame-too-large", "frame-size-limit");
        }
        const nextCanvas = doc.createElement("canvas");
        nextCanvas.width = next.width;
        nextCanvas.height = next.height;
        const nextContext = nextCanvas.getContext("2d", { alpha: false });
        if (!nextContext || typeof nextContext.drawImage !== "function") {
          nextCanvas.width = 1;
          nextCanvas.height = 1;
          return fail("video-frame-capture-unsupported", "canvas-unavailable");
        }
        try {
          nextContext.drawImage(canvas, 0, 0, next.width, next.height);
        } catch (error) {
          nextCanvas.width = 1;
          nextCanvas.height = 1;
          return fail(
            "video-frame-capture-unsupported",
            error?.name === "SecurityError" ? "canvas-security" : "downscale-failed"
          );
        }
        canvas.width = 1;
        canvas.height = 1;
        canvas = nextCanvas;
      }
      if (!blob || Number(blob.size) > maximumBytes) {
        return fail("video-frame-too-large", "frame-size-limit");
      }
      const imageDataUrl = await readDataUrl(blob);
      if (!imageDataUrl || !imageDataUrl.startsWith(`data:${actualMimeType};base64,`)) {
        return fail("video-frame-capture-unsupported", "base64-encode-failed");
      }
      const currentTime = Number(video.currentTime);
      return {
        ok: true,
        current_time: Number.isFinite(currentTime) && currentTime >= 0 ? currentTime : 0,
        page_url: pageUrl,
        image_data_url: imageDataUrl,
        mime_type: actualMimeType,
        size: Number(blob.size),
        source_width: sourceWidth,
        source_height: sourceHeight,
        output_width: canvas.width,
        output_height: canvas.height,
        frame_sync: frameSync,
        encode_attempts: encodeAttempts,
      };
    } catch (error) {
      return fail(
        "video-frame-capture-unsupported",
        error?.name === "SecurityError" ? "canvas-security" : "unexpected-capture-error"
      );
    } finally {
      if (canvas) {
        canvas.width = 1;
        canvas.height = 1;
      }
    }
  }

  return Object.freeze({
    MAX_FRAME_BYTES,
    MAX_VIDEO_FRAME_DIMENSION,
    DEFAULT_FRAME_MIME_TYPE,
    FRAME_READY_TIMEOUT_MS,
    SIZE_REDUCTION_FACTOR,
    MIN_VIDEO_FRAME_DIMENSION,
    MAX_ENCODE_ATTEMPTS,
    VALID_RASTER_MIME_TYPES,
    CaptureError,
    fitFrameDimensions,
    captureVideoFrame,
  });
});
