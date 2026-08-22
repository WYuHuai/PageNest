"use strict";

importScripts(
  "connection-config.js",
  "core/runtime-protocol.js",
  "core/connection.js",
  "core/video-notebook-session.js",
  "core/video-frame-probe.js",
  "core/video-frame-capture.js",
  "core/notebook-client.js",
  "core/video-notebook-runtime.js"
);

const sessionHandlers = Object.freeze({
  setNotebookSession: (session) => globalThis.PageNestVideoNotebookSession.setSession(session),
  getNotebookSession: () => globalThis.PageNestVideoNotebookSession.getSession(),
  clearNotebookSession: () => globalThis.PageNestVideoNotebookSession.clearSession(),
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const response = globalThis.PageNestRuntimeProtocol.dispatch(
    message,
    sender,
    chrome.runtime.id,
    sessionHandlers
  );
  if (!response) return false;
  if (typeof response.then === "function") {
    response.then(sendResponse);
    return true;
  }
  sendResponse(response);
  return false;
});

globalThis.PageNestVideoNotebookRuntime.registerCommandListener(chrome);
