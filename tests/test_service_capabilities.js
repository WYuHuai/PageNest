const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.resolve(__dirname, "../extension/popup.js"), "utf8");
const start = source.indexOf("async function collectWithServiceCapabilities");
const end = source.indexOf("async function loadFolders", start);
assert.ok(start >= 0 && end > start, "capability negotiation function is required");
const context = {};
vm.runInNewContext(
  `${source.slice(start, end)}\nthis.collectWithServiceCapabilities = collectWithServiceCapabilities; this.selectVaultWithServiceCapabilities = selectVaultWithServiceCapabilities;`,
  context,
);

async function expectError(run, status, message) {
  await assert.rejects(run, error => {
    assert.equal(error.status, status);
    assert.match(error.message, message);
    return true;
  });
}

(async () => {
  const payload = {page_variant: "xiaohongshu-note"};
  const calls = [];
  const saved = await context.collectWithServiceCapabilities(payload, async (url, body) => {
    calls.push([url, body]);
    if (url === "/api/meta") {
      return {
        service_version: "1.8.0",
        api_protocol_version: 1,
        pagenest_format_version: 1,
        supported_page_variants: ["standard", "xiaohongshu-note"],
      };
    }
    return {ok: true};
  });
  assert.deepEqual(saved, {ok: true});
  assert.deepEqual(calls.map(([url]) => url), ["/api/meta", "/api/collect"]);

  await expectError(
    () => context.collectWithServiceCapabilities(payload, async url => (
      url === "/api/meta"
        ? {supported_page_variants: ["standard"]}
        : {ok: true}
    )),
    undefined,
    /不支持当前网页保存格式/,
  );

  await expectError(
    () => context.collectWithServiceCapabilities(payload, async () => {
      const error = new Error("旧服务");
      error.status = 404;
      throw error;
    }),
    404,
    /版本过旧/,
  );

  const networkError = new TypeError("offline");
  await expectError(
    () => context.collectWithServiceCapabilities(payload, async () => { throw networkError; }),
    undefined,
    /offline/,
  );

  const authError = new Error("unauthorized");
  authError.status = 401;
  await expectError(
    () => context.collectWithServiceCapabilities(payload, async () => { throw authError; }),
    401,
    /unauthorized/,
  );

  const validationError = new Error("invalid payload");
  validationError.status = 422;
  let collectCalled = false;
  await expectError(
    () => context.collectWithServiceCapabilities(payload, async url => {
      if (url === "/api/meta") return {supported_page_variants: ["xiaohongshu-note"]};
      collectCalled = true;
      throw validationError;
    }),
    422,
    /invalid payload/,
  );
  assert.equal(collectCalled, true);

  const vaultCalls = [];
  const switched = await context.selectVaultWithServiceCapabilities(async (url, body) => {
    vaultCalls.push([url, body]);
    return url === "/api/meta"
      ? {capabilities: ["vault-selection"]}
      : {ok: true, vault_name: "Vault B"};
  });
  assert.deepEqual(switched, {ok: true, vault_name: "Vault B"});
  assert.deepEqual(vaultCalls.map(([url]) => url), ["/api/meta", "/api/vault/select"]);

  await expectError(
    () => context.selectVaultWithServiceCapabilities(async () => ({capabilities: []})),
    undefined,
    /不支持更换仓库/,
  );
  console.log("service capability negotiation tests passed");
})().catch(error => { console.error(error); process.exitCode = 1; });
