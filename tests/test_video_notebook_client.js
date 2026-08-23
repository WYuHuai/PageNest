const assert = require("node:assert/strict");
const client = require("../extension/core/notebook-client.js");

(async () => {
  const storage = { name: "existing-local-storage" };
  const requests = [];
  let connectOptions;
  const request = async (url, options) => {
    requests.push({ url, options });
    return { ok: true, status: 200, json: async () => ({ entry_count: 1 }) };
  };
  const connectionApi = {
    async connect(options) {
      connectOptions = options;
      return {
        connection: { server: "http://127.0.0.1:8765", token: "private-token" },
        meta: { capabilities: [client.CAPABILITY] },
      };
    },
  };
  const connected = await client.connect({ connectionApi, request, storage });
  assert.equal(connectOptions.storage, storage);
  assert.equal(connectOptions.request, request);
  const result = await client.appendEntry(
    connected,
    { notebook_id: "id/with space", relative_path: "Video Notebooks/N.pagenest" },
    { video_timestamp_seconds: 12.5, image_data_url: "data:image/png;base64,iVBORw0KGgo=" }
  );
  assert.equal(result.entry_count, 1);
  assert.match(requests[0].url, /\/api\/notebooks\/id%2Fwith%20space\/entries$/);
  assert.equal(requests[0].options.headers.Authorization, "Bearer private-token");
  const payload = JSON.parse(requests[0].options.body);
  assert.deepEqual(payload, {
    relative_path: "Video Notebooks/N.pagenest",
    video_timestamp_seconds: 12.5,
    image_data_url: "data:image/png;base64,iVBORw0KGgo=",
  });
  assert.equal(payload.token, undefined);
  assert.ok(!requests[0].options.body.includes("private-token"));

  const created = await client.createNotebook(connected, {
    title: "<主标题>",
    source_url: "https://example.test/watch?v=2",
    source_title: "<主标题>",
    initial_entry: {
      video_timestamp_seconds: 20,
      image_data_url: "data:image/png;base64,iVBORw0KGgo=",
    },
  });
  assert.equal(created.entry_count, 1);
  assert.match(requests[1].url, /\/api\/notebooks$/);
  assert.equal(requests[1].options.headers.Authorization, "Bearer private-token");
  assert.deepEqual(JSON.parse(requests[1].options.body), {
    title: "<主标题>",
    source_url: "https://example.test/watch?v=2",
    source_title: "<主标题>",
    initial_entry: {
      video_timestamp_seconds: 20,
      image_data_url: "data:image/png;base64,iVBORw0KGgo=",
    },
  });

  const renamed = await client.renameNotebook(
    connected,
    { notebook_id: "id/with space", relative_path: "Video Notebooks/N.pagenest" },
    "新标题"
  );
  assert.equal(renamed.entry_count, 1);
  assert.match(requests[2].url, /\/api\/notebooks\/id%2Fwith%20space\/rename$/);
  assert.deepEqual(JSON.parse(requests[2].options.body), {
    relative_path: "Video Notebooks/N.pagenest",
    title: "新标题",
  });
  assert.ok(!requests[2].options.body.includes("private-token"));

  const analyzed = await client.analyzeEntry(
    connected,
    { notebook_id: "id/with space", relative_path: "Video Notebooks/N.pagenest" },
    "entry/with space"
  );
  assert.equal(analyzed.entry_count, 1);
  assert.match(
    requests[3].url,
    /\/api\/notebooks\/id%2Fwith%20space\/entries\/entry%2Fwith%20space\/analyze$/
  );
  assert.deepEqual(JSON.parse(requests[3].options.body), {
    relative_path: "Video Notebooks/N.pagenest",
  });
  assert.equal(requests[3].options.headers.Authorization, "Bearer private-token");
  assert.ok(!requests[3].options.body.includes("private-token"));

  await assert.rejects(
    () => client.connect({ connectionApi: { connect: async () => null }, request, storage }),
    (error) => error.code === "service-unavailable"
  );
  await assert.rejects(
    () => client.connect({
      connectionApi: { connect: async () => ({ connection: {}, meta: { capabilities: [] } }) },
      request,
      storage,
    }),
    (error) => error.code === "unsupported-service-capability"
  );
  await assert.rejects(
    () => client.appendEntry(
      { ...connected, request: async () => ({ ok: false, status: 409, json: async () => ({ detail: "conflict" }) }) },
      { notebook_id: "id", relative_path: "Video Notebooks/N.pagenest" },
      { video_timestamp_seconds: 1, image_data_url: "data:image/png;base64,AA==" }
    ),
    (error) => error.code === "append-failed" && error.status === 409
  );
  await assert.rejects(
    () => client.createNotebook(
      { ...connected, request: async () => ({ ok: false, status: 500, json: async () => ({ detail: "write failed" }) }) },
      { title: "N", source_url: "https://example.test", source_title: "N", initial_entry: {} }
    ),
    (error) => error.code === "create-failed" && error.status === 500
  );
  await assert.rejects(
    () => client.renameNotebook(
      { ...connected, request: async () => ({ ok: false, status: 409, json: async () => ({ detail: "conflict" }) }) },
      { notebook_id: "id", relative_path: "Video Notebooks/N.pagenest" },
      "New"
    ),
    (error) => error.code === "rename-failed" && error.status === 409
  );
  await assert.rejects(
    () => client.analyzeEntry(
      { ...connected, request: async () => ({ ok: false, status: 503, json: async () => ({ detail: "offline" }) }) },
      { notebook_id: "id", relative_path: "Video Notebooks/N.pagenest" },
      "entry"
    ),
    (error) => error.code === "analyze-failed" && error.status === 503
  );
  console.log("video notebook client tests passed");
})().catch((error) => { console.error(error); process.exitCode = 1; });
