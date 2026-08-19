const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, "extension", "manifest.json"), "utf8")
);

assert.strictEqual(manifest.manifest_version, 3);
assert.deepStrictEqual(manifest.background, { service_worker: "background.js" });
assert.strictEqual(manifest.action.default_popup, "popup.html");
assert.deepStrictEqual(manifest.permissions, [
  "activeTab",
  "scripting",
  "storage",
  "clipboardWrite",
]);
assert.ok(!Object.hasOwn(manifest, "commands"));

const calls = { network: 0, privileged: 0, keepalive: 0 };
const forbidden = (group) => () => {
  calls[group] += 1;
  throw new Error(`background used forbidden ${group} capability`);
};
let listener = null;
const context = {
  console,
  fetch: forbidden("network"),
  XMLHttpRequest: forbidden("network"),
  WebSocket: forbidden("network"),
  setInterval: forbidden("keepalive"),
  chrome: {
    runtime: {
      id: "abcdefghijklmnopabcdefghijklmnop",
      onMessage: {
        addListener(candidate) {
          listener = candidate;
        },
      },
    },
    tabs: new Proxy({}, { get: forbidden("privileged") }),
    scripting: new Proxy({}, { get: forbidden("privileged") }),
    desktopCapture: new Proxy({}, { get: forbidden("privileged") }),
  },
};
context.globalThis = context;
context.importScripts = (...files) => {
  for (const file of files) {
    const source = fs.readFileSync(path.join(root, "extension", file), "utf8");
    vm.runInContext(source, sandbox, { filename: file });
  }
};
const sandbox = vm.createContext(context);
vm.runInContext(
  fs.readFileSync(path.join(root, "extension", "background.js"), "utf8"),
  sandbox,
  { filename: "background.js" }
);
assert.strictEqual(typeof listener, "function");

const protocol = context.PageNestRuntimeProtocol;
const validMessage = {
  namespace: protocol.NAMESPACE,
  protocol_version: protocol.VERSION,
  type: protocol.PING,
};
const validSender = { id: context.chrome.runtime.id };

function send(message, sender = validSender) {
  let response;
  const handledAsync = listener(message, sender, (value) => {
    response = value;
  });
  return {
    handledAsync,
    response:
      response === undefined ? undefined : JSON.parse(JSON.stringify(response)),
  };
}

assert.deepStrictEqual(send(validMessage), {
  handledAsync: false,
  response: {
    namespace: protocol.NAMESPACE,
    protocol_version: protocol.VERSION,
    type: "PONG",
    ok: true,
  },
});

assert.deepStrictEqual(send({ ...validMessage, namespace: "other.extension" }), {
  handledAsync: false,
  response: undefined,
});
assert.strictEqual(
  send({ ...validMessage, protocol_version: 999 }).response.error,
  "UNSUPPORTED_PROTOCOL"
);
assert.strictEqual(
  send({ ...validMessage, type: "UNKNOWN" }).response.error,
  "UNSUPPORTED_MESSAGE"
);
assert.strictEqual(
  send(validMessage, { id: "ponmlkjihgfedcbaponmlkjihgfedcba" }).response.error,
  "UNTRUSTED_SENDER"
);
assert.strictEqual(send(validMessage, validSender).response.ok, true);
assert.deepStrictEqual(calls, { network: 0, privileged: 0, keepalive: 0 });

console.log("background runtime protocol tests passed");
