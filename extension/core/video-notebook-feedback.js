(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.PageNestVideoNotebookFeedback = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const HOST_ID = "pagenest-video-notebook-feedback";

  function hideTransientUi() {
    const host = document.getElementById("pagenest-video-notebook-feedback");
    if (!host) return false;
    host.hidden = true;
    return true;
  }

  function renderFeedback(payload = {}) {
    const doc = document;
    const hostId = "pagenest-video-notebook-feedback";
    doc.getElementById(hostId)?.remove();

    const host = doc.createElement("div");
    host.id = hostId;
    const shadow = host.attachShadow({ mode: "closed" });
    const style = doc.createElement("style");
    style.textContent = `
      :host { all: initial; }
      .card {
        box-sizing: border-box;
        width: min(360px, calc(100vw - 32px));
        padding: 14px;
        color: #f8fafc;
        background: rgba(15, 23, 42, .96);
        border: 1px solid rgba(148, 163, 184, .35);
        border-radius: 12px;
        box-shadow: 0 16px 48px rgba(0, 0, 0, .35);
        font: 14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .status { margin: 0; font-weight: 650; }
      .row { display: flex; gap: 8px; margin-top: 10px; }
      input {
        box-sizing: border-box;
        min-width: 0;
        flex: 1;
        padding: 8px 10px;
        color: #0f172a;
        background: #fff;
        border: 1px solid #cbd5e1;
        border-radius: 8px;
        font: inherit;
      }
      button {
        padding: 8px 12px;
        color: #fff;
        background: #2563eb;
        border: 0;
        border-radius: 8px;
        font: inherit;
        font-weight: 650;
        cursor: pointer;
      }
      button:disabled { cursor: wait; opacity: .7; }
      .detail { margin: 8px 0 0; color: #cbd5e1; font-size: 12px; }
    `;
    const card = doc.createElement("div");
    card.className = "card";
    const status = doc.createElement("p");
    status.className = "status";

    if (payload.mode === "started") {
      status.textContent = "✓ 已开始视频笔记";
      const row = doc.createElement("div");
      row.className = "row";
      const input = doc.createElement("input");
      input.type = "text";
      input.maxLength = 2000;
      input.value = String(payload.title || "");
      input.setAttribute?.("aria-label", "视频笔记标题");
      const button = doc.createElement("button");
      button.type = "button";
      button.textContent = "确定";
      const detail = doc.createElement("p");
      detail.className = "detail";
      detail.textContent = "可直接修改标题，首张截图已经安全保存。";
      button.addEventListener("click", async (event) => {
        event.preventDefault();
        const title = String(input.value || "").trim();
        if (!title) {
          detail.textContent = "标题不能为空。";
          input.focus();
          return;
        }
        button.disabled = true;
        detail.textContent = "正在保存标题…";
        try {
          const response = await chrome.runtime.sendMessage({
            namespace: payload.namespace,
            protocol_version: payload.protocol_version,
            type: payload.rename_type,
            notebook_id: payload.notebook_id,
            title,
          });
          if (!response?.ok) throw new Error("rename failed");
          detail.textContent = "标题已保存。";
          button.textContent = "已保存";
          setTimeout(() => host.remove(), 800);
        } catch {
          detail.textContent = "标题保存失败，截图和原笔记仍然保留。";
          button.disabled = false;
        }
      });
      row.append(input, button);
      card.append(status, row, detail);
      setTimeout(() => {
        input.focus();
        input.select();
      }, 0);
    } else if (payload.mode === "saved") {
      status.textContent = `✓ 已保存 ${String(payload.timestamp || "")}`.trim();
      card.append(status);
      const duration = Number(payload.duration_ms) || 1300;
      setTimeout(() => {
        host.style.opacity = "0";
        setTimeout(() => host.remove(), 160);
      }, duration);
    } else {
      status.textContent = "操作未完成";
      const detail = doc.createElement("p");
      detail.className = "detail";
      detail.textContent = String(payload.message || "请稍后重试。");
      card.append(status, detail);
      setTimeout(() => host.remove(), 3200);
    }

    shadow.append(style, card);
    host.style.position = "fixed";
    host.style.top = "16px";
    host.style.right = "16px";
    host.style.zIndex = "2147483647";
    host.style.transition = "opacity 160ms ease";
    doc.documentElement.appendChild(host);
    return true;
  }

  return Object.freeze({ HOST_ID, hideTransientUi, renderFeedback });
});
