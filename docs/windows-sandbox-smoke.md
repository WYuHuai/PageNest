# Clean Windows Sandbox smoke test

This test starts a disposable Windows environment and exercises the packaged
PageNest installer without relying on the development machine's Python
installation or PageNest configuration.

## Requirements

- Windows 10 or 11 Pro, Enterprise, or Education
- Hardware virtualization enabled
- The optional **Windows Sandbox** feature enabled
- A restart after enabling the feature

Windows Sandbox is not enabled automatically because that requires
administrator access and may restart the computer.

## Run

From the repository root:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\start_windows_sandbox_smoke.ps1
```

The launcher creates a temporary sanitized bundle containing only the
installer, its checksum, release metadata, and the two smoke scripts. It maps
that bundle into Windows Sandbox as read-only. It does not expose the source
checkout, `.env`, vaults, browser profiles, or other host files.

Inside the sandbox, the test verifies:

- the installer SHA-256 checksum;
- installation and startup with no system Python dependency;
- a Unicode-path disposable Obsidian vault;
- PageNest Viewer installation;
- extension connection preconfiguration;
- pairing for the configured Edge extension ID;
- authenticated local collection to a `.pagenest` file;
- secret removal and user-page preservation after uninstall.

The final result opens in Edge and is written to
`PageNest-Sandbox-Smoke-Result.html` on the sandbox desktop. Close the sandbox
window to discard the entire environment and let the launcher remove its
temporary host bundle.

## Prepare without launching

To inspect the exact mapped files on a machine where Windows Sandbox is not
enabled:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\start_windows_sandbox_smoke.ps1 `
  -PrepareOnly `
  -OutputDirectory C:\Temp\PageNest-Sandbox-Smoke
```

The output directory must not already exist. Remove that generated directory
after inspection.

## Remaining manual checks

The automated smoke test verifies the installed files and local API, but it
does not replace these release checks:

- install the extension from Microsoft Edge Add-ons rather than unpacked files;
- open a captured page in the real Obsidian desktop UI and test code copying;
- repeat on a separate Windows 10 system if the sandbox host runs Windows 11;
- observe SmartScreen behavior for the final signed or unsigned installer.
