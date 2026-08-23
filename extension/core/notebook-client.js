(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.PageNestNotebookClient = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const CAPABILITY = "video-notebook-v1";

  class NotebookClientError extends Error {
    constructor(code, message, status) {
      super(message);
      this.name = "NotebookClientError";
      this.code = code;
      this.status = status;
    }
  }

  async function connect(options = {}) {
    const connectionApi = options.connectionApi || root.PageNestConnection;
    const request = options.request || root.fetch?.bind(root);
    const storage = options.storage || root.chrome?.storage?.local;
    if (!connectionApi || !request || !storage) {
      throw new NotebookClientError("service-unavailable", "PageNest connection runtime is unavailable");
    }
    let result;
    try {
      result = await connectionApi.connect({ storage, request });
    } catch {
      throw new NotebookClientError("service-unavailable", "PageNest Service is unavailable");
    }
    if (!result) {
      throw new NotebookClientError("service-unavailable", "PageNest Service is unavailable");
    }
    if (!result.meta?.capabilities?.includes(CAPABILITY)) {
      throw new NotebookClientError(
        "unsupported-service-capability",
        "PageNest Service does not support Video Notebook"
      );
    }
    return Object.freeze({ connection: result.connection, meta: result.meta, request });
  }

  async function postJson(connected, path, body, errorCode, fallbackMessage) {
    let response;
    try {
      response = await connected.request(
        `${connected.connection.server}${path}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${connected.connection.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        }
      );
    } catch {
      throw new NotebookClientError("service-unavailable", "PageNest Service became unavailable");
    }
    if (!response.ok) {
      let detail = fallbackMessage;
      try {
        detail = (await response.json())?.detail || detail;
      } catch {}
      throw new NotebookClientError(errorCode, detail, response.status);
    }
    return response.json();
  }

  async function createNotebook(connected, notebook) {
    return postJson(connected, "/api/notebooks", notebook, "create-failed", "Notebook create failed");
  }

  async function appendEntry(connected, session, frame) {
    const body = {
      relative_path: session.relative_path,
      video_timestamp_seconds: frame.video_timestamp_seconds,
      image_data_url: frame.image_data_url,
    };
    if (frame.request_analysis === true) body.request_analysis = true;
    return postJson(
      connected,
      `/api/notebooks/${encodeURIComponent(session.notebook_id)}/entries`,
      body,
      "append-failed",
      "Notebook append failed"
    );
  }

  async function renameNotebook(connected, session, title) {
    return postJson(
      connected,
      `/api/notebooks/${encodeURIComponent(session.notebook_id)}/rename`,
      { relative_path: session.relative_path, title },
      "rename-failed",
      "Notebook rename failed"
    );
  }

  async function analyzeEntry(connected, session, entryId) {
    return postJson(
      connected,
      `/api/notebooks/${encodeURIComponent(session.notebook_id)}/entries/${encodeURIComponent(entryId)}/analyze`,
      { relative_path: session.relative_path },
      "analyze-failed",
      "Notebook frame analysis failed"
    );
  }

  return Object.freeze({
    CAPABILITY,
    NotebookClientError,
    connect,
    createNotebook,
    appendEntry,
    analyzeEntry,
    renameNotebook,
  });
});
