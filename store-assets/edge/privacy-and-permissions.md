# Edge listing privacy and permission answers

## Single purpose

PageNest saves webpages and user-invoked video frames as local, self-contained
notes through the PageNest Windows Local Service and opens those notes in the
user's Obsidian Vault.

## Permission explanations

| Permission | Reviewer explanation |
| --- | --- |
| `activeTab` | Accesses the current page only after the user opens PageNest or invokes its capture command. |
| `scripting` | Injects only the extractor and supported-site adapters bundled in the extension package into that user-selected page. |
| `storage` | Keeps the loopback Service address, the installer-issued local connection token, capture-quality preference, and session state in browser-local extension storage. |
| `clipboardWrite` | Copies a saved local path only after the user clicks the copy action. |
| Loopback host access | Communicates with the user's locally installed, token-protected PageNest Service on `127.0.0.1`/`localhost`. The installer selects the first available supported port. |
| `<all_urls>` | Allows user-invoked capture on ordinary websites and permits reading page resources needed for a self-contained note, including signed cross-origin images on supported sites. It is not used to collect browsing history. |

The permission set did not increase in v1.10.0. PageNest does not request
`tabCapture` or `offscreen` permission. Video Notebook uses a direct
`HTMLVideoElement` frame only after the user presses its shortcut.

## Data and privacy

The extension handles the URL, title, visible article content, images, links,
supported media metadata, and optional note from the page the user explicitly
captures. It does not export browser cookies or passwords, collect broad
browsing history, run advertising or analytics, or send data to PageNest-owned
cloud infrastructure.

Core capture data goes to the PageNest Service on the same computer. Original
capture mode does not send content to an AI provider. AI modes can send the
minimum text or image data needed for the request to the OpenAI-compatible
endpoint configured by the user. Remote AI endpoints must use HTTPS; loopback
HTTP is allowed for a local model server.

## Remote code

Select **No, this extension does not use remote code**. Every executable
extension file is bundled in the submitted ZIP. Webpage scripts remain untrusted
page content, and AI responses are treated as data rather than executable code.
