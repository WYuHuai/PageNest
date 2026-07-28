# Privacy

PageNest is local-first.

- The collector service listens on `127.0.0.1` by default.
- Saved pages are written only to the configured Obsidian vault.
- The Windows installer writes its random collector token only to the local
  service and installed extension configuration. Manual extension changes use
  browser local storage.
- Organizer API keys are stored only in the local service `.env` and are never
  returned to the extension.
- In **quick** mode, article text and metadata may be sent to the organizer
  endpoint you configure.
- In **deep** mode, article text, metadata, and up to eight compressed images may
  be sent to that endpoint.
- In **original** mode, no content is sent to an organizer endpoint.

The project has no telemetry or analytics. Your chosen model provider may retain
or process submitted content under its own privacy policy.
