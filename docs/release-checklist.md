# Release checklist

## Source

- [ ] Working tree is clean and the release commit is on `main`.
- [ ] Python, JavaScript, manifest, version, package, frozen-service, and
      installer checks pass.
- [ ] No `.env`, virtual environment, logs, browser profile, database,
      `.hermes`, `.pagenest`, screenshot, or media cache is tracked or packaged.
- [ ] `CHANGELOG.md`, `release-manifest.json`, README files, and release notes
      describe the same versions and installation flow.

## Clean Windows smoke test

- [ ] Use a Windows 10/11 account without Python installed.
- [ ] Verify and run `PageNest-Setup-1.7.4.exe` without administrator rights.
- [ ] Select a disposable Unicode-path Obsidian vault containing `.obsidian`.
- [ ] Confirm PageNest starts without a console and starts again after sign-in.
- [ ] Load `%LOCALAPPDATA%\Programs\PageNest\Extension` in Edge and Chrome;
      confirm no token entry is required.
- [ ] Restart Obsidian and enable PageNest Viewer in the selected vault.
- [ ] Save generic, CSDN, WeChat, Bilibili, and public Feishu test pages.
- [ ] Disconnect the network and reopen `.pagenest` plus one legacy `.hermes`.
- [ ] Verify images, GIFs, supported video, links, code folding, and copying.
- [ ] Uninstall PageNest; confirm connection secrets are removed and collected
      files in the vault remain.

## GitHub

- [ ] Repository description, topics, license, and social preview are set.
- [ ] `main` is the default branch and branch protection is enabled.
- [ ] Private vulnerability reporting is enabled before public launch.
- [ ] CI passes on Windows and Linux.
- [ ] A draft Release is created from the intended tag.

## Release assets

- [ ] `PageNest-Setup-1.7.4.exe` contains the frozen service, extension folder,
      and PageNest Viewer; it contains no runtime logs or local configuration.
- [ ] The installer SHA-256 file matches the executable.
- [ ] Browser extension ZIP contains `manifest.json` and
      `connection-config.js` at its root.
- [ ] Obsidian ZIP contains `main.js`, `manifest.json`, `styles.css`, and
      `versions.json` at its root.
- [ ] Optional source-service ZIP contains `.env.example`, not `.env`.
- [ ] Windows installer signing and SmartScreen expectations are documented.
- [ ] Confirm the intended distribution qualifies for Inno Setup's
      non-commercial mode, or purchase its commercial license before release.

## Browser stores

- [ ] Run `python scripts/package_store.py` and verify the SHA-256 checksum.
- [ ] Replace every `<GITHUB_OWNER>` placeholder in the listing material.
- [x] Record the Edge CRX ID in `release-manifest.json`.
- [ ] Add the Chrome item ID before a later Chrome Web Store release.
- [x] Rebuild the Edge installer and verify its embedded extension ID.
- [ ] Confirm a store-installed extension pairs without manual token entry and
      an untrusted extension origin cannot call `/api/pair`.
- [ ] Publish `PRIVACY.md` at the exact stable HTTPS URL submitted to the store.
- [ ] Upload `pagenest-web-store-v1.7.4.zip`; do not upload the full kit folder.
- [ ] Upload the 1280x800 screenshot and 440x280 promotional image.
- [ ] Complete the single-purpose, permission, remote-code, and data-use fields
      using `store/privacy-disclosures.md`.
- [ ] Give reviewers the local-service setup in `store/reviewer-notes.md` without
      including a real connection token.
- [ ] Repeat the reviewer flow on a clean Windows 10/11 virtual machine.
