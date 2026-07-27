const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function fakeCanvas(width = 0, height = 0, content = false, rect = null) {
  const canvas = {
    width,
    height,
    content,
    getBoundingClientRect() {
      return rect || {width: this.width, height: this.height};
    },
    toDataURL() {
      return this.content ? `data:image/png;base64,${this.width}x${this.height}` : "data:image/png;base64,blank";
    },
    getContext() {
      return {
        imageSmoothingEnabled: false,
        imageSmoothingQuality: "low",
        drawImage(source) {
          canvas.content = Boolean(source.content);
        },
        getImageData(_x, _y, imageWidth, imageHeight) {
          const pixels = new Uint8ClampedArray(imageWidth * imageHeight * 4);
          if (!canvas.content) return {data: pixels};
          for (let offset = 0; offset < pixels.length; offset += 4) {
            pixels[offset + 3] = 255;
          }
          return {data: pixels};
        },
      };
    },
  };
  return canvas;
}

const source = fs.readFileSync(path.resolve(__dirname, "../extension/extractor.js"), "utf8");
const start = source.indexOf("  function trimmedCanvasResult");
const end = source.indexOf("  async function collectCanvasImages", start);
assert.ok(start >= 0 && end > start, "canvas helper functions must be present");

const context = {
  document: {createElement: () => fakeCanvas()},
  Uint8ClampedArray,
  Math,
};
vm.runInNewContext(
  `${source.slice(start, end)}\nthis.helpers = {trimmedCanvasResult, visualCanvasResult};`,
  context,
);

const stretched = context.helpers.visualCanvasResult(
  fakeCanvas(400, 100, true, {width: 200, height: 100}),
);
assert.equal(stretched.width, 400);
assert.equal(stretched.height, 200, "canvas buffer must be resampled to its visible aspect ratio");

const blank = context.helpers.trimmedCanvasResult(fakeCanvas(600, 300, false));
assert.deepEqual({...blank}, {dataUrl: "", width: 0, height: 0});
console.log("canvas aspect and transparent-canvas tests passed");
