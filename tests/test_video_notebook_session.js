const assert = require("node:assert/strict");
const path = require("node:path");
const protocol = require("../extension/core/runtime-protocol.js");

function storageArea() {
  const values = {};
  return {
    async get(key) { return { [key]: values[key] }; },
    async set(update) { Object.assign(values, JSON.parse(JSON.stringify(update))); },
    async remove(key) { delete values[key]; },
    values,
  };
}

(async () => {
  const storage = storageArea();
  const modulePath = path.resolve(__dirname, "../extension/core/video-notebook-session.js");
  const sessionApi = require(modulePath);
  const input = {
    notebook_id: "notebook-1",
    relative_path: "Video Notebooks/Lecture.pagenest",
    source_url: "https://example.test/watch?v=1&utm_source=feed#chapter",
    source_title: "Lecture",
    service_token: "must-not-persist",
    vault_path: "D:/Private/Vault",
  };
  const saved = await sessionApi.setSession(input, { storage });
  assert.equal(saved.notebook_id, "notebook-1");
  assert.equal(storage.values[sessionApi.STORAGE_KEY].service_token, undefined);
  assert.equal(storage.values[sessionApi.STORAGE_KEY].vault_path, undefined);
  assert.ok(!JSON.stringify(storage.values).includes("D:/Private"));
  assert.deepEqual(await sessionApi.getSession({ storage }), saved);

  delete require.cache[require.resolve(modulePath)];
  const recreated = require(modulePath);
  assert.deepEqual(await recreated.getSession({ storage }), saved);
  assert.equal(
    recreated.sourcesMatch(saved.source_url, "https://example.test/watch?utm_medium=x&v=1#other"),
    true
  );
  assert.equal(
    recreated.sourcesMatch(
      "https://www.bilibili.com/video/BV1xkNoeuEFv/",
      "https://www.bilibili.com/video/BV1xkNoeuEFv/?vd_source=smoke"
    ),
    true
  );
  const bilibili = "https://www.bilibili.com/video/BV1xkNoeuEFv";
  const matchingSources = [
    [`${bilibili}/?vd_source=first`, `${bilibili}?vd_source=second`],
    [`${bilibili}/`, bilibili],
    [
      `${bilibili}?episode=2&vd_source=abc&utm_campaign=smoke`,
      `${bilibili}/?utm_campaign=other&episode=2&vd_source=def`,
    ],
    [`${bilibili}?episode=2&vd_source=abc`, `${bilibili}?episode=2`],
    [
      `${bilibili}?spm_id_from=333.1007&from_spmid=main`,
      `${bilibili}?from_spmid=other&spm_id_from=333.999`,
    ],
  ];
  for (const [left, right] of matchingSources) {
    assert.equal(recreated.sourcesMatch(left, right), true, `${left} should match ${right}`);
  }
  const differentSources = [
    [
      "https://www.bilibili.com/video/BV1AAAA/",
      "https://www.bilibili.com/video/BV1BBBB/?vd_source=abc",
    ],
    [`${bilibili}?episode=2`, `${bilibili}?episode=3`],
    [`${bilibili}?episode=2&vd_source=abc`, `${bilibili}?episode=3`],
  ];
  for (const [left, right] of differentSources) {
    assert.equal(recreated.sourcesMatch(left, right), false, `${left} must not match ${right}`);
  }
  assert.equal(recreated.sourcesMatch(saved.source_url, "https://example.test/watch?v=2"), false);
  await recreated.clearSession({ storage });
  assert.equal(await recreated.getSession({ storage }), null);

  for (const relative_path of ["D:/Vault/a.pagenest", "../a.pagenest", "\\\\server\\a.pagenest"]) {
    await assert.rejects(
      () => recreated.setSession({ ...input, relative_path }, { storage }),
      (error) => error.code === "invalid-notebook-session"
    );
  }

  const handlers = {
    setNotebookSession: (session) => recreated.setSession(session, { storage }),
    getNotebookSession: () => recreated.getSession({ storage }),
    clearNotebookSession: () => recreated.clearSession({ storage }),
    renameNotebook: async (notebookId, title) => ({ notebook_id: notebookId, title }),
  };
  const sender = { id: "abcdefghijklmnopabcdefghijklmnop" };
  const message = (type, extra = {}) => ({
    namespace: protocol.NAMESPACE,
    protocol_version: protocol.VERSION,
    type,
    ...extra,
  });
  assert.equal((await protocol.dispatch(
    message(protocol.SET_NOTEBOOK_SESSION, { session: input }), sender, sender.id, handlers
  )).session.notebook_id, "notebook-1");
  assert.equal((await protocol.dispatch(
    message(protocol.GET_NOTEBOOK_SESSION), sender, sender.id, handlers
  )).session.notebook_id, "notebook-1");
  assert.equal((await protocol.dispatch(
    message(protocol.CLEAR_NOTEBOOK_SESSION), sender, sender.id, handlers
  )).session, null);
  const renamed = await protocol.dispatch(
    message(protocol.RENAME_VIDEO_NOTEBOOK, { notebook_id: "notebook-1", title: "新标题" }),
    sender,
    sender.id,
    handlers
  );
  assert.equal(renamed.ok, true);
  assert.equal(renamed.type, "NOTEBOOK_RENAMED");
  assert.equal(renamed.session.title, "新标题");
  const rejectedRename = await protocol.dispatch(
    message(protocol.RENAME_VIDEO_NOTEBOOK, { notebook_id: "notebook-1", title: "" }),
    sender,
    sender.id,
    handlers
  );
  assert.equal(rejectedRename.ok, false);
  console.log("video notebook session tests passed");
})().catch((error) => { console.error(error); process.exitCode = 1; });
