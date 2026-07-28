# Browser-store privacy disclosures

## Single purpose

Save the webpage selected by the user as one self-contained offline page in the
user's Obsidian vault through the local PageNest service.

## Permission justifications

| Permission | Justification |
| --- | --- |
| `activeTab` | Accesses only the active page after the user clicks PageNest. |
| `scripting` | Injects PageNest's bundled extractor and site adapters into that active page. |
| `storage` | Stores the local service URL and connection token on the user's device. |
| `clipboardWrite` | Copies a saved local path only after the user clicks the copy action. |
| `http://127.0.0.1:8765/*`, `http://localhost:8765/*` | Communicates with the locally installed, token-protected PageNest service. |
| `<all_urls>` | Reads the user-selected article and signed cross-origin page resources, including authenticated Feishu images. PageNest does not run continuously or collect browsing history. |

## Remote code

Select **No, this extension does not use remote code**. All executable extension
code is bundled in the ZIP. Website JavaScript is treated as untrusted page
content and is not executed as extension code. The optional organizer endpoint
returns text or metadata, not executable code.

## Data handled

Disclose website content and website activity because the extension reads the
URL, title, article content, images, links, and supported media metadata from the
page the user explicitly saves. Also disclose user-provided content because the
user may add a personal collection note.

PageNest does not collect authentication credentials, payment information,
health information, location, browsing history, analytics, or advertising data.
A signed-in webpage may provide image bytes through the user's current browser
session, but PageNest does not export cookies or passwords.

## Data use and sharing

- Core capture data goes only to the PageNest service on the same computer.
- Original mode does not send article content to an organizer endpoint.
- Quick mode may send article text and metadata to the endpoint configured by
  the user.
- Deep mode may additionally send up to eight compressed images.
- Remote organizer endpoints must use HTTPS; HTTP is accepted only for a model
  service on the local loopback interface.
- PageNest does not sell data, use it for advertising, or provide it to the
  PageNest maintainers.
- The extension contains no telemetry or analytics.

The store disclosure, listing, extension UI, and public `PRIVACY.md` must remain
consistent. Replace the privacy-policy URL placeholder before submission.