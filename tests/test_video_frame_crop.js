const assert = require("node:assert/strict");
const {
  MAX_SCREENSHOT_BYTES,
  calculateCrop,
  cropScreenshot,
} = require("../extension/core/video-frame-capture.js");

function crop(viewportWidth, viewportHeight, bitmapWidth, bitmapHeight, rect) {
  return calculateCrop(
    { viewport_width: viewportWidth, viewport_height: viewportHeight, rect },
    bitmapWidth,
    bitmapHeight
  );
}

assert.deepEqual(crop(1000, 800, 1000, 800, { left: 100, top: 50, right: 700, bottom: 450 }), {
  x: 100, y: 50, width: 600, height: 400, scale_x: 1, scale_y: 1,
});
assert.deepEqual(crop(1000, 800, 1250, 1000, { left: 100, top: 50, right: 700, bottom: 450 }), {
  x: 125, y: 62, width: 750, height: 501, scale_x: 1.25, scale_y: 1.25,
});
assert.deepEqual(crop(1000, 800, 2000, 1600, { left: 100, top: 50, right: 700, bottom: 450 }), {
  x: 200, y: 100, width: 1200, height: 800, scale_x: 2, scale_y: 2,
});

const zoomed = crop(997, 703, 1246, 879, { left: 10.2, top: 20.4, right: 900.7, bottom: 650.1 });
assert.equal(zoomed.scale_x, 1246 / 997);
assert.equal(zoomed.scale_y, 879 / 703);
assert.ok(zoomed.width > 0 && zoomed.height > 0);

assert.deepEqual(crop(1000, 800, 1000, 800, { left: -100, top: -50, right: 400, bottom: 300 }), {
  x: 0, y: 0, width: 400, height: 300, scale_x: 1, scale_y: 1,
});
assert.deepEqual(crop(1000, 800, 1000, 800, { left: 900, top: 700, right: 1200, bottom: 1000 }), {
  x: 900, y: 700, width: 100, height: 100, scale_x: 1, scale_y: 1,
});
assert.throws(
  () => crop(1000, 800, 1000, 800, { left: -100, top: 0, right: 0, bottom: 100 }),
  (error) => error.code === "crop-failed"
);

const pngBytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
let drawArguments;
let closed = false;
class Canvas {
  constructor(width, height) { this.width = width; this.height = height; }
  getContext() {
    return { drawImage: (...args) => { drawArguments = args; } };
  }
  async convertToBlob() { return new Blob([pngBytes], { type: "image/png" }); }
}
const options = {
  fetch: async () => ({ blob: async () => new Blob(["screenshot"]) }),
  createImageBitmap: async () => ({ width: 2000, height: 1600, close: () => { closed = true; } }),
  OffscreenCanvas: Canvas,
  btoa: (binary) => Buffer.from(binary, "binary").toString("base64"),
};

(async () => {
  const result = await cropScreenshot(
    "data:image/png;base64,AAAA",
    {
      viewport_width: 1000,
      viewport_height: 800,
      rect: { left: 100, top: 50, right: 700, bottom: 450 },
    },
    options
  );
  assert.equal(result.mime_type, "image/png");
  assert.ok(result.image_data_url.startsWith("data:image/png;base64,iVBORw0KGgo"));
  assert.ok(result.size < MAX_SCREENSHOT_BYTES);
  assert.equal(drawArguments.length, 9);
  assert.equal(closed, true);

  class OversizedCanvas extends Canvas {
    async convertToBlob() {
      return { size: MAX_SCREENSHOT_BYTES + 1 };
    }
  }
  await assert.rejects(
    () => cropScreenshot("data:image/png;base64,AAAA", {
      viewport_width: 1000,
      viewport_height: 800,
      rect: { left: 0, top: 0, right: 500, bottom: 400 },
    }, { ...options, OffscreenCanvas: OversizedCanvas }),
    (error) => error.code === "screenshot-too-large"
  );
  await assert.rejects(
    () => cropScreenshot("data:image/png;base64,AAAA", {
      viewport_width: 1000,
      viewport_height: 800,
      rect: { left: 0, top: 0, right: 500, bottom: 400 },
    }, { fetch: options.fetch }),
    (error) => error.code === "video-frame-not-supported"
  );
  console.log("video frame crop tests passed");
})().catch((error) => { console.error(error); process.exitCode = 1; });
