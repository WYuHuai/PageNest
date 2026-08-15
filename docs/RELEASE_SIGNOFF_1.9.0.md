# PageNest 1.9.0 Release Sign-off

Date: 2026-08-15

## Candidate

- Extension: 1.9.0
- Local service: 1.9.0
- PageNest Viewer: 1.4.0
- `.pagenest` format: 1
- Installer SHA-256: `6bdc7ff71439b25a04b24b5299de819a4c1bb0c788d67fea3e7772b429133632`

## Automated validation

- Python: 154 passed
- Ruff: passed
- JavaScript tests: 17 test files passed
- JavaScript syntax: 38 files passed
- Repository and version validation: passed
- Frozen service smoke: passed
- Installer smoke on the development machine: passed

## Clean Windows 11 Sandbox

Result: **PASS**

The candidate was installed in a new Windows Sandbox instance with a read-only,
sanitized test bundle. The sandbox reported Windows `10.0.26100.0` and no system
Python before installation.

- Installer SHA-256: verified
- Standalone bundled service without Python on `PATH`: passed
- Unicode Vault: passed
- Viewer installation: passed
- Extension preconfiguration: passed
- Store extension pairing and untrusted-origin rejection: passed
- Upgrade token preservation: passed
- Occupied-port fallback to 18765: passed
- Test `.pagenest` save: passed
- Uninstall connection-secret cleanup: passed
- User-created page preserved after uninstall: passed

## Remaining limitations

- Windows 10 has not been fully validated.
- Windows Sandbox is disposable, so a persistent VM restart and subsequent
  Windows sign-in startup cycle was not covered by this run.
- The installer is unsigned and Windows SmartScreen may display an unknown
  publisher warning.
- Edge Add-ons publication is independent of this GitHub release candidate.

## Conclusion

The v1.9.0 local release candidate passes automated, installed-runtime, and
clean Windows 11 Sandbox validation. GitHub push and Release publication remain
separate external actions and were not performed by this sign-off.
