# Chrome Web Store / Edge Add-ons listing (English)

## Basic information

- Name: PageNest Web Collector
- Category: Productivity
- Language: English (United States)
- Short description: Save the current article, images, and links as one offline `.pagenest` page and view it safely in Obsidian.

## Full description

PageNest is a local-first web collector. When the user clicks the extension, it
extracts the current article, images, code blocks, links, and supported media
metadata. The PageNest service then creates one self-contained `.pagenest` file.
PageNest Viewer opens that file directly in Obsidian without producing a sidecar
image folder or a large set of Markdown attachments.

Highlights:

- One-file offline capture for content that was embedded successfully;
- Preserves article structure, image placement, GIFs, code blocks, and external
  repository links;
- Dedicated capture paths for Feishu, WeChat, CSDN, and Bilibili in addition to
  generic articles;
- Folder selection and a separate personal collection note;
- Optional support for a user-configured OpenAI Chat Completions-compatible
  organizer endpoint;
- No telemetry, advertising, or analytics.

Requirements:

1. Windows 10 or Windows 11;
2. The PageNest Windows local service;
3. PageNest Viewer enabled in Obsidian;
4. Users must only archive content they are authorized to save.

PageNest processes a page only after the user clicks the extension. By default,
content is sent to the token-protected local service on `127.0.0.1` and written
to the selected Obsidian vault. Article text or compressed images leave the
device only when the user explicitly selects an AI organization mode and has
configured an organizer endpoint.

## Support and privacy URLs

- Support: `https://github.com/WYuHuai/PageNest/issues`
- Privacy: `https://github.com/WYuHuai/PageNest/blob/main/PRIVACY.md`
- Source: `https://github.com/WYuHuai/PageNest`
