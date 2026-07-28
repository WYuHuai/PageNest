# Roadmap

Security, reliable offline fidelity, and simple installation take priority over
new features.

## Release readiness

- Reproducible packages for the browser extension, Obsidian viewer, and Windows
  local service.
- Clean Windows installation smoke test.
- Version compatibility checks and actionable update guidance.
- Public documentation, issue templates, and private vulnerability reporting.

## Collection quality

1. Score each collection for text, image, video, link, size, and extraction
   anomalies.
2. Retry only failed images or media instead of saving the entire article again.
3. Update an existing collection while preserving the personal note.
4. Switch between source-like and clean-reading modes inside one `.hermes` file.
5. Prefer copyable HTML tables for Feishu Canvas tables, with image fallback.

## Library experience

1. Build a local full-text index for `.hermes` without generating Markdown
   sidecars.
2. Filter collections by source, date, tag, folder, failure state, and duplicate
   URL.
3. Support multiple configured Obsidian vaults.
4. Generate a one-click diagnostic report with explicit redaction.

## Distribution

- Optional BRAT installation for preview builds.
- Evaluate Obsidian Community Plugins submission.
- Evaluate Edge Add-ons and Chrome Web Store publication after the GitHub
  release and permission documentation are stable.

The roadmap is directional. A feature is complete only after focused tests and
real interaction verification.
