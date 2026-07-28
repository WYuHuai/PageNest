# Release checklist

## Source

- [ ] Working tree is clean and the release commit is on `main`.
- [ ] Python, JavaScript, manifest, version, and package checks pass.
- [ ] No `.env`, virtual environment, logs, browser profile, database,
      `.hermes`, screenshot, or media cache is tracked.
- [ ] `CHANGELOG.md` and `release-manifest.json` describe the release.

## Clean Windows smoke test

- [ ] Extract the local-service package into a new directory.
- [ ] Run `安装依赖.bat` with Python 3.11+.
- [ ] Configure a new empty test vault and a new random token.
- [ ] Start the service and open `/status`.
- [ ] Load the unpacked browser extension.
- [ ] Install and enable Hermes Page Viewer in the test vault.
- [ ] Save generic, CSDN, WeChat, Bilibili, and public Feishu test pages.
- [ ] Disconnect the network and reopen the generated `.hermes` files.
- [ ] Verify images, GIFs, supported video, links, and code copying.
- [ ] Remove the disposable test vault and test configuration manually.

## GitHub

- [ ] Repository description, topics, license, and social preview are set.
- [ ] `main` is the default branch and branch protection is enabled.
- [ ] Private vulnerability reporting is enabled before public launch.
- [ ] CI passes on Windows and Linux.
- [ ] A draft Release is created from the intended tag.

## Release assets

- [ ] Browser extension ZIP contains `manifest.json` at its root.
- [ ] Obsidian ZIP contains `main.js`, `manifest.json`, `styles.css`, and
      `versions.json` at its root.
- [ ] Local-service ZIP contains source, requirements, `.env.example`, and
      Windows launch scripts, but no environment or runtime data.
- [ ] SHA-256 values match every ZIP.
- [ ] All assets are attached before publishing the draft Release.
