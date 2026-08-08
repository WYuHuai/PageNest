# Supported sites

Support describes the current tested extraction path, not a promise that every
future layout or protected resource will remain accessible.

| Site or page type | Text and layout | Images | Media | Notes |
| --- | --- | --- | --- | --- |
| Generic article pages | Best effort | HTTP(S), data URLs, lazy images | Direct video when exposed | Reader-like selectors and metadata fallback |
| Local HTML opened in Edge/Chrome | Current rendered DOM, including body-only generated reports | Data URLs, remote HTTP(S), and browser-readable relative local images | Local media is not a v1.8.0 core feature | Requires **Allow access to file URLs**; scripts and source CSS are not preserved |
| Feishu / Lark documents | Dedicated virtual-block and embedded-frame capture | Signed-in browser fetch, position markers | Embedded players treated as media-only | Canvas content is preserved as an image fallback |
| WeChat Official Account articles | Dedicated cleanup | Lazy images, invalid placeholder filtering | Best effort | Login or anti-hotlinking can still block resources |
| CSDN articles | Dedicated code and layout cleanup | Inline and lazy images | Best effort | Preserves syntax colors, folding, copy controls, and repository links |
| Bilibili video pages | Dedicated title, author, description, chapter and tag extraction | Covers and note images | Direct media or bounded yt-dlp/FFmpeg fallback | Offline fallback is limited to supported public Bilibili pages |
| Bilibili columns and dynamics | Dedicated content selection | Inline images | Embedded video when identified | Player controls are excluded from article text |

## Known limitations

- A website can change its DOM without notice and temporarily break a dedicated
  adapter.
- DRM, encrypted streams, expiring signatures, strict anti-hotlinking, or
  resources that require a different browser session may not be downloadable.
- Canvas and WebGL have no semantic HTML. PageNest preserves a visual capture
  when
  it cannot reconstruct a table.
- Very large articles or media are rejected by the documented resource limits.
- Enabling local-network downloads weakens the default network boundary and
  should be used only for a trusted local page.
- `.pagenest` files need PageNest Viewer for supported Obsidian rendering;
  legacy `.hermes` files remain readable.
- Complex local HTML applications are captured as sanitized content and
  structure. Their JavaScript is not executed in the saved page, and their
  original CSS is not guaranteed to be reproduced.

When reporting a regression, use a public test URL when possible and remove
account names, vault paths, tokens, and private page content.
