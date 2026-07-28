# Contributing

Thank you for helping improve Hermes. Keep changes focused, reviewable, and
backed by a test or a reproducible manual check.

## Before opening an issue

- Search existing issues.
- Use a public test URL or the fixtures under `test-pages/`.
- Remove tokens, local paths, account names, private article text, and vault
  contents.
- Use the private process in `SECURITY.md` for security reports.

## Development setup

```powershell
python -m venv local-server\.venv
local-server\.venv\Scripts\python -m pip install -r local-server\requirements-dev.txt
local-server\.venv\Scripts\python -m pytest -q
```

Node.js is used for syntax checks and dependency-free JavaScript tests; the
extension itself does not require a JavaScript package install.

## Architecture rules

- Keep generic extraction in `extension/core/`.
- Keep site-specific behavior in `extension/adapters/`.
- Adapters expose `detect`, `preparePage`, `extract`, `cleanup`, and `validate`.
- Route ordinary image and media HTTP downloads through
  `local-server/collector/network.py`.
- Keep HTML sanitation separate from rendering and storage orchestration.
- Do not add frameworks, databases, queues, or telemetry for a local fix.
- Preserve original capture behavior unless a focused test documents the
  intentional change.

## Required checks

```powershell
local-server\.venv\Scripts\python -m pip check
local-server\.venv\Scripts\python -m pytest -q

Get-ChildItem extension,obsidian-plugin,tests -Recurse -Filter *.js |
  ForEach-Object { node --check $_.FullName }
Get-ChildItem tests -Filter "test_*.js" |
  ForEach-Object { node $_.FullName }
```

For extension or viewer interaction changes, also load the affected component
and verify the real browser or Obsidian state.

## Pull requests

- Use a focused branch and small commits.
- Explain the problem, root cause, test coverage, and remaining risk.
- Update documentation when installation, permissions, format, compatibility,
  or supported-site behavior changes.
- Do not include `.env`, vault data, logs, generated `.hermes` pages, browser
  profiles, media caches, or machine-specific paths.
