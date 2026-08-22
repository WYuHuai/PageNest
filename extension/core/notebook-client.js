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

  async function appendEntry(connected, session, frame) {
    const body = {
      relative_path: session.relative_path,
      video_timestamp_seconds: frame.video_timestamp_seconds,
      image_data_url: frame.image_data_url,
    };
    let response;
    try {
      response = await connected.request(
        `${connected.connection.server}/api/notebooks/${encodeURIComponent(session.notebook_id)}/entries`,
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
      let detail = "Notebook append failed";
      try {
        detail = (await response.json())?.detail || detail;
      } catch {}
      throw new NotebookClientError("append-failed", detail, response.status);
    }
    return response.json();
  }

  return Object.freeze({ CAPABILITY, NotebookClientError, connect, appendEntry });
});
