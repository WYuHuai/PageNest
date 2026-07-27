# Security Policy

## Supported version

Security fixes are applied to the latest release.

## Reporting a vulnerability

Do not publish credentials, private vault contents, or proof-of-concept data in a public issue. Contact the repository maintainer privately through the security contact configured on GitHub.

## Security boundaries

- Keep the service bound to `127.0.0.1`; do not expose port 8765 to a LAN or the internet.
- Use a unique collector token of at least 24 random characters.
- Never commit `local-server/.env`.
- Treat collected webpage content as untrusted.
- Review the privacy policy of any remote organizer endpoint before enabling quick or deep mode.
