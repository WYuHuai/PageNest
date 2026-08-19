HermesAdapters.register((() => {
  const CONTENT_SELECTOR = "main,article,[role='main'],.container,.content";
  const STRUCTURE_SELECTOR = "h1,h2,h3,h4,p,li,blockquote,table,pre,code,img";
  const MAX_STYLE_RULES = 4000;
  const MAX_STYLE_CHARS = 512 * 1024;
  const UNSAFE_CSS = /url\s*\(|expression\s*\(|javascript\s*:|vbscript\s*:|behavior\s*:|-moz-binding|@import|@font-face|file\s*:|https?\s*:|[a-z]:[\\/]/i;

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

  function safeSelector(value) {
    const selector = String(value || "").trim();
    return selector.length > 0
      && selector.length <= 2048
      && !/[{}<>]/.test(selector)
      && !UNSAFE_CSS.test(selector);
  }

  function serializeDeclarations(style) {
    const declarations = [];
    for (let index = 0; index < Number(style?.length || 0); index += 1) {
      const property = String(style[index] || "").trim();
      const value = String(style.getPropertyValue(property) || "").trim();
      if (!/^--[-_a-z0-9]+$/i.test(property) && !/^[a-z][a-z0-9-]*$/i.test(property)) continue;
      if (!value || value.length > 4096 || UNSAFE_CSS.test(`${property}:${value}`) || /[<>]/.test(value)) continue;
      const priority = style.getPropertyPriority(property) === "important" ? "!important" : "";
      declarations.push(`${property}:${value}${priority}`);
    }
    return declarations.join(";");
  }

  function groupRuleEnabled(rule) {
    const kind = String(rule?.constructor?.name || "");
    if (rule?.media || kind === "CSSMediaRule") {
      return !rule.conditionText || window.matchMedia(rule.conditionText).matches;
    }
    if (kind === "CSSSupportsRule") {
      return !rule.conditionText || !globalThis.CSS?.supports || CSS.supports(rule.conditionText);
    }
    return true;
  }

  function collectRules(rules, output, depth = 0) {
    if (depth > 16) return;
    for (const rule of Array.from(rules || [])) {
      if (output.visited >= MAX_STYLE_RULES || output.length >= MAX_STYLE_CHARS) return;
      output.visited += 1;
      if (rule?.href || !groupRuleEnabled(rule)) continue;
      if (rule.selectorText && rule.style) {
        const declarations = serializeDeclarations(rule.style);
        if (!safeSelector(rule.selectorText) || !declarations) continue;
        const serialized = `${rule.selectorText}{${declarations}}`;
        if (output.length + serialized.length > MAX_STYLE_CHARS) return;
        output.rules.push(serialized);
        output.length += serialized.length;
        continue;
      }
      try {
        if (rule.cssRules) collectRules(rule.cssRules, output, depth + 1);
      } catch {}
    }
  }

  function collectDocumentStyles(document) {
    const output = {rules: [], length: 0, visited: 0};
    for (const sheet of Array.from(document.styleSheets || [])) {
      try {
        collectRules(sheet.cssRules, output);
      } catch {
        // Cross-origin stylesheets stay untouched; PageNest never fetches them.
      }
    }
    return output.rules.join("\n");
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
    extract: async context => {
      const found = findContent(context);
      return found ? {...found, document_styles: collectDocumentStyles(context.document)} : null;
    },
    cleanup() {},
    validate: result => Boolean(result?.element && result.method),
    isContentAcceptable: (_text, details) => meaningful(details.clone),
    sourceInfo,
  };
})());
