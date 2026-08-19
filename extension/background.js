"use strict";

// MV3 may stop and recreate this worker at any time. Future session identity
// must live in extension storage rather than module-level memory.
importScripts("core/runtime-protocol.js");

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const response = globalThis.PageNestRuntimeProtocol.dispatch(
    message,
    sender,
    chrome.runtime.id
  );
  if (!response) return false;
  sendResponse(response);
  return false;
});
