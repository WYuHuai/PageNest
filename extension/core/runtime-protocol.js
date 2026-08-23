(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.PageNestRuntimeProtocol = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const NAMESPACE = "pagenest.extension.runtime";
  const VERSION = 1;
  const PING = "PING";
  const SET_NOTEBOOK_SESSION = "SET_NOTEBOOK_SESSION";
  const GET_NOTEBOOK_SESSION = "GET_NOTEBOOK_SESSION";
  const CLEAR_NOTEBOOK_SESSION = "CLEAR_NOTEBOOK_SESSION";
  const RENAME_VIDEO_NOTEBOOK = "RENAME_VIDEO_NOTEBOOK";

  function reply(type, details = {}) {
    return Object.freeze({
      namespace: NAMESPACE,
      protocol_version: VERSION,
      type,
      ...details,
    });
  }

  function dispatch(message, sender, runtimeId, handlers = {}) {
    if (!message || message.namespace !== NAMESPACE) return null;
    if (!sender || sender.id !== runtimeId) {
      return reply("ERROR", { ok: false, error: "UNTRUSTED_SENDER" });
    }
    if (message.protocol_version !== VERSION) {
      return reply("ERROR", { ok: false, error: "UNSUPPORTED_PROTOCOL" });
    }
    if (message.type === PING) return reply("PONG", { ok: true });
    let operation;
    let responseType = "NOTEBOOK_SESSION";
    if (message.type === SET_NOTEBOOK_SESSION && handlers.setNotebookSession) {
      operation = () => handlers.setNotebookSession(message.session);
    } else if (message.type === GET_NOTEBOOK_SESSION && handlers.getNotebookSession) {
      operation = () => handlers.getNotebookSession();
    } else if (message.type === CLEAR_NOTEBOOK_SESSION && handlers.clearNotebookSession) {
      operation = () => handlers.clearNotebookSession();
    } else if (
      message.type === RENAME_VIDEO_NOTEBOOK &&
      handlers.renameNotebook &&
      String(message.notebook_id || "").trim() &&
      String(message.title || "").trim()
    ) {
      responseType = "NOTEBOOK_RENAMED";
      operation = () => handlers.renameNotebook(message.notebook_id, message.title);
    } else {
      return reply("ERROR", { ok: false, error: "UNSUPPORTED_MESSAGE" });
    }
    return Promise.resolve()
      .then(operation)
      .then((session) => reply(responseType, { ok: true, session: session || null }))
      .catch(() => reply("ERROR", { ok: false, error: "NOTEBOOK_SESSION_ERROR" }));
  }

  return Object.freeze({
    NAMESPACE,
    VERSION,
    PING,
    SET_NOTEBOOK_SESSION,
    GET_NOTEBOOK_SESSION,
    CLEAR_NOTEBOOK_SESSION,
    RENAME_VIDEO_NOTEBOOK,
    dispatch,
  });
});
