# Roadmap

Security, reliable offline fidelity, and simple installation take priority over
new features.

## Public Beta readiness

- Finish version update guidance, public repository metadata, and private
  vulnerability reporting for the Public Beta.
- Verify the configured Edge store ID through the certification channel, then
  add the Chrome ID before a later Chrome Web Store release.

## Post-beta validation and distribution hardening

- Complete a persistent clean Windows 11 restart and sign-in validation.
- Run the full installer and Viewer workflow on Windows 10.
- Add Authenticode signing; until then, keep SmartScreen expectations explicit.
- Complete Edge Add-ons certification and evaluate Chrome Web Store
  publication.

## Collection quality

1. Score each collection for text, image, video, link, size, and extraction
   anomalies.
2. Retry only failed images or media instead of saving the entire article again.
3. Update an existing collection while preserving the personal note.
4. Switch between source-like and clean-reading modes inside one `.pagenest` file.
5. Prefer copyable HTML tables for Feishu Canvas tables, with image fallback.

## Library experience

1. Build a local full-text index for `.pagenest` without generating Markdown
   sidecars.
2. Filter collections by source, date, tag, folder, failure state, and duplicate
   URL.
3. Support multiple configured Obsidian vaults.
4. Generate a one-click diagnostic report with explicit redaction.

## Additional distribution options

- Optional BRAT installation for preview builds.
- Evaluate Obsidian Community Plugins submission.
- Evaluate additional preview channels after the GitHub release and permission
  documentation are stable.

The roadmap is directional. A feature is complete only after focused tests and
real interaction verification.
