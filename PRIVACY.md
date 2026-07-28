# PageNest Privacy Policy

Last updated: July 28, 2026

PageNest is a local-first web archiver. It saves a page only after the user
clicks the extension and asks PageNest to save it.

## Data PageNest handles

To create an archive, the browser extension may read the active page's URL,
title, selected article content, links, images, media metadata, and the optional
note entered by the user. Extension settings include the local service address,
the random connection token, the selected save mode, and the destination
folder.

PageNest does not collect browsing history from inactive tabs.

## Local processing and storage

- The collector service listens on `127.0.0.1` by default.
- The extension sends a requested capture to that local service.
- Saved `.pagenest` files are written only to the Obsidian vault and folder
  selected by the user.
- The Windows installer stores the random collector token in the local service
  configuration and its installed extension copy. Settings entered manually in
  the extension are stored in browser local storage.
- Organizer API keys are stored only in the local service `.env` file and are
  never returned to the extension.
- Temporary downloads and service logs stay on the user's device.

PageNest has no telemetry, analytics, advertising, or tracking. The project
does not sell user data or share it with PageNest developers.

## Optional AI organizer

AI organization is disabled unless the user configures an OpenAI-compatible
endpoint and selects an AI save mode.

- **Original** mode sends no content to an organizer endpoint.
- **Quick** mode may send article text and metadata to the configured endpoint.
- **Deep** mode may also send up to eight compressed article images.

Remote organizer endpoints must use HTTPS. Local loopback endpoints may use
HTTP. A chosen model provider processes submitted content under its own privacy
policy and may apply its own retention rules.

## Network access

PageNest downloads page resources only while processing a user-requested
capture. Its local service blocks loopback, private-network, link-local, and
cloud-metadata destinations by default. A user can explicitly enable
private-network downloads for pages they control.

## Retention and user controls

PageNest keeps data until the user removes it:

- delete saved `.pagenest` files from the Obsidian vault;
- clear PageNest extension data in the browser;
- remove local logs or temporary files;
- uninstall the extension, Obsidian viewer, or local service.

## Security

The local service binds to the loopback interface and requires a random token.
Archive content is sanitized before display. See [SECURITY.md](SECURITY.md) for
security reporting and supported versions.

## Contact

Privacy questions can be filed in the public project's GitHub issue tracker.
Security-sensitive reports must use the private method listed in
[SECURITY.md](SECURITY.md). Before store publication, this policy will be hosted
at the project's stable public HTTPS URL.
