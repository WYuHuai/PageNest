HermesAdapters.register((() => {
  const CONTENT_SELECTOR = "main,article,[role='main'],.container,.content";
  const STRUCTURE_SELECTOR = "h1,h2,h3,h4,p,li,blockquote,table,pre,code,img";

  function readableText(element) {
    return String(element?.innerText || element?.textContent || "").replace(/\s+/g, " ").trim();
  }

  function meaningful(element) {
    const text = readableText(element);
    if (!text || PageNestContentQuality.looksLikeScriptBundle(text)) return false;
    return text.replace(/\s+/g, "").length >= 80 || (
      text.replace(/\s+/g, "").length >= 10
      && Boolean(element.querySelector?.(STRUCTURE_SELECTOR))
    );
  }

  function findContent(context) {
    const document = context.document;
    const structured = [...document.querySelectorAll(CONTENT_SELECTOR)].filter(meaningful);
    if (structured.length) {
      structured.sort((left, right) => readableText(right).length - readableText(left).length);
      return {element: structured[0], method: "local-html:structured-container"};
    }
    return meaningful(document.body)
      ? {element: document.body, method: "local-html:body"}
      : null;
  }

  function sourceName(location) {
    const encoded = location.pathname.split("/").filter(Boolean).pop() || "";
    try {
      return decodeURIComponent(encoded) || "local.html";
    } catch {
      return encoded || "local.html";
    }
  }

  function sourceInfo(context) {
    const name = sourceName(context.location);
    const title = String(context.document.title || "").trim()
      || name.replace(/\.(?:html?|xhtml)$/i, "")
      || "未命名文章";
    return {
      source_kind: "local-html",
      source_name: name,
      title,
      site_name: "本地 HTML",
      url: `local-html:///${encodeURIComponent(name)}`,
      canonical_url: "",
    };
  }

  return {
    name: "local-html",
    allowFallback: false,
    preserveStructure: true,
    detect: context => context.location.protocol === "file:",
    preparePage: context => HermesExtractorCore.waitForContent(
      () => Boolean(findContent(context)),
      1200,
      100,
    ),
    extract: async context => findContent(context),
    cleanup() {},
    validate: result => Boolean(result?.element && result.method),
    isContentAcceptable: (_text, details) => meaningful(details.clone),
    sourceInfo,
  };
})());
