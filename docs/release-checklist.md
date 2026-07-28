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
- [ ] The Inno Setup compiler license is suitable for the intended distribution.
