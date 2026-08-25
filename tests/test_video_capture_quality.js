const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const modulePath = require.resolve("../extension/core/video-capture-quality.js");
const quality = require(modulePath);
const { fitFrameDimensions } = require("../extension/core/video-frame-capture.js");

function memoryStorage(initial = {}) {
  const values = { ...initial };
  return {
    values,
    async get(defaults) { return { ...defaults, ...values }; },
    async set(update) { Object.assign(values, update); },
  };
}

(async () => {
  const empty = memoryStorage();
  assert.equal((await quality.load(empty)).key, "standard", "QUALITY-01");
  assert.equal(quality.profile("standard").maxDimension, 1920, "QUALITY-02");
  assert.equal(quality.profile("high").maxDimension, 3072, "QUALITY-03");
  assert.deepEqual(
    fitFrameDimensions(1280, 720, quality.profile("high").maxDimension),
    { width: 1280, height: 720 },
    "QUALITY-04"
  );
  assert.equal(quality.profile("standard").mimeType, "image/png", "QUALITY-05");
  assert.equal(quality.profile("high").mimeType, "image/png", "QUALITY-06");

  await quality.save("high", empty);
  delete require.cache[modulePath];
  const restartedWorkerQuality = require(modulePath);
  assert.equal((await restartedWorkerQuality.load(empty)).key, "high", "QUALITY-07");
  assert.equal(empty.values.videoCaptureQuality, "high");

  const invalid = memoryStorage({ videoCaptureQuality: "ultra" });
  assert.equal((await restartedWorkerQuality.load(invalid)).key, "standard", "QUALITY-08");

  const root = path.resolve(__dirname, "..");
  const popup = fs.readFileSync(path.join(root, "extension", "popup.html"), "utf8");
  const background = fs.readFileSync(path.join(root, "extension", "background.js"), "utf8");
  assert.match(popup, /id="videoCaptureQuality"/);
  assert.match(popup, /value="standard"/);
  assert.match(popup, /value="high"/);
  assert.match(popup, /最长边 1920/);
  assert.match(popup, /不会放大源视频/);
  assert.match(background, /core\/video-capture-quality\.js/);

  console.log("video capture quality profile tests passed");
})().catch((error) => { console.error(error); process.exitCode = 1; });
