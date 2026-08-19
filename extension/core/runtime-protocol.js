(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.PageNestRuntimeProtocol = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const NAMESPACE = "pagenest.extension.runtime";
  const VERSION = 1;
  const PING = "PING";

  function reply(type, details = {}) {
    return Object.freeze({
      namespace: NAMESPACE,
      protocol_version: VERSION,
      type,
      ...details,
    });
  }

  function dispatch(message, sender, runtimeId) {
    if (!message || message.namespace !== NAMESPACE) return null;
    if (!sender || sender.id !== runtimeId) {
      return reply("ERROR", { ok: false, error: "UNTRUSTED_SENDER" });
    }
    if (message.protocol_version !== VERSION) {
      return reply("ERROR", { ok: false, error: "UNSUPPORTED_PROTOCOL" });
    }
    if (message.type !== PING) {
      return reply("ERROR", { ok: false, error: "UNSUPPORTED_MESSAGE" });
    }
    return reply("PONG", { ok: true });
  }

  return Object.freeze({ NAMESPACE, VERSION, PING, dispatch });
});
