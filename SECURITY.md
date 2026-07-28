# Security Policy

## Supported versions

Security fixes are applied to the latest release.

| Component | Supported line |
| --- | --- |
| Browser extension | 1.7.x |
| Local service | 1.7.x |
| Obsidian viewer | 1.3.x |

## Report a vulnerability privately

Do not open a public issue for a suspected vulnerability and do not attach
credentials, private vault contents, collected pages, or proof-of-concept user
data.

Use the repository's **Security → Advisories → Report a vulnerability** form.
This creates a private report visible to repository maintainers. If the button
is unavailable, open a public issue containing only the sentence “Please enable
a private security contact”; do not include technical details.

Please include:

- affected component and version;
- concise impact and prerequisites;
- minimal reproduction steps using non-private test data;
- whether credentials, local files, or network access are involved;
- a safe way for maintainers to confirm the fix.

Maintainers should acknowledge a complete report within five business days.
Timelines for validation and disclosure depend on severity and fix complexity.

## Security boundaries

- Keep the service bound to `127.0.0.1`; never expose port 8765 to a LAN or the
  internet.
- Use a unique collector token of at least 24 random characters.
- Never commit or share a service `.env`, an installed
  `Extension/connection-config.js`, or a collector token.
- Treat captured webpages, filenames, metadata, `.pagenest`, and legacy
  `.hermes` files as
  untrusted.
- Keep local-network downloads disabled unless a trusted local page requires
  them.
- Review the data policy of any optional organizer endpoint before enabling AI
  modes.
- Sanitize logs before sharing them.

## Out of scope

- Vulnerabilities in an AI provider, website, browser, Obsidian, Python, or
  third-party dependency should normally be reported to that upstream project.
- Social engineering, denial-of-service traffic against infrastructure the
  project does not operate, and reports containing only automated scanner output
  without a reproducible impact are not actionable here.
