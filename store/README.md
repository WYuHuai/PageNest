# PageNest browser-store submission kit

This directory contains source material for Chrome Web Store and Microsoft Edge
Add-ons. Both stores use the same Manifest V3 extension ZIP.

Before submission:

1. Replace every `<GITHUB_OWNER>` placeholder after the public repository exists.
2. Publish `PRIVACY.md` at a stable public HTTPS URL.
3. Create unpublished Chrome and Edge drafts to obtain their fixed extension
   IDs. Do not publish either draft yet.
4. Rebuild the installer with both IDs, for example:

   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts\build_windows_installer.ps1 `
     -ExtensionIds "<CHROME_ID>,<EDGE_ID>"
   ```

5. Confirm automatic pairing and the full flow on a clean Windows 10/11 machine
   by following `reviewer-notes.md` exactly.
6. Review current store policies and complete developer-account identity checks.
7. Upload the generated ZIP and the assets under `store/assets/`.

Build the kit with:

```powershell
local-server\.venv\Scripts\python scripts\generate_store_assets.py
local-server\.venv\Scripts\python scripts\package_store.py
```

The generated output is written to `release/store-v<version>/` and remains
ignored by Git. Upload only `pagenest-web-store-v<version>.zip` as the extension
package. The other files are dashboard copy and image assets, not ZIP contents.

Required and supplied images:

- extension icon: 128x128;
- product screenshot: 1280x800;
- small promotional image: 440x280;
- optional marquee promotional image: 1400x560.