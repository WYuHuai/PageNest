const VALID_NONCE_SOURCE = /^'nonce-([A-Za-z0-9+/_-]+={0,2})'$/i;

function cspContent(page) {
  const meta = page.match(/<meta\b[^>]*http-equiv\s*=\s*["']Content-Security-Policy["'][^>]*>/i)?.[0];
  if (!meta) return "";
  return meta.match(/\bcontent\s*=\s*"([^"]*)"/i)?.[1]
    || meta.match(/\bcontent\s*=\s*'([^']*)'/i)?.[1]
    || "";
}

function effectiveScriptTokens(csp) {
  const directives = csp.split(";").map(segment => segment.trim()).filter(Boolean).map(segment => {
    const [name, ...tokens] = segment.split(/\s+/u);
    return {name: name.toLowerCase(), tokens};
  });
  return directives.find(item => item.name === "script-src-elem")?.tokens
    || directives.find(item => item.name === "script-src")?.tokens
    || directives.find(item => item.name === "default-src")?.tokens
    || null;
}

function injectedRuntime(page) {
  const match = page.match(/<script\s+nonce="([^"]+)"\s+data-hermes-copy-bridge>([\s\S]*?)<\/script>/i);
  if (!match) return {allowed: false, csp: cspContent(page), nonce: "", script: ""};
  const csp = cspContent(page);
  const tokens = effectiveScriptTokens(csp);
  const allowedNonces = (tokens || []).map(token => token.match(VALID_NONCE_SOURCE)?.[1]).filter(Boolean);
  return {
    allowed: !csp || (tokens === null ? true : allowedNonces.includes(match[1])),
    csp,
    nonce: match[1],
    script: match[2],
  };
}

function bridgeWithCsp(Viewer, csp, channel = "a".repeat(64)) {
  const page = Viewer.withCopyBridge(
    `<meta http-equiv="Content-Security-Policy" content="${csp}"><body></body>`,
    channel,
  );
  return {...injectedRuntime(page), page};
}

module.exports = {bridgeWithCsp, cspContent, effectiveScriptTokens, injectedRuntime};
