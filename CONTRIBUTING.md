# Contributing

1. Create a focused branch.
2. Install `local-server/requirements-dev.txt`.
3. Keep changes small and avoid unrelated dependencies.
4. Run `python -m pytest -q` and the JavaScript syntax checks documented in README.
5. Never include `.env`, vault data, logs, generated `.hermes` pages, or machine-specific paths.

Bug reports should include the webpage type, extraction warning, elapsed stage timings, and sanitized logs. Do not attach private pages or API keys.
