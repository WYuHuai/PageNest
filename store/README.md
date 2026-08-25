# PageNest Microsoft Edge Add-ons submission kit

The public v1.10.1 extension package supports Simplified Chinese (`zh_CN`, the
default locale) and English (`en`). Full listing copy, five 1280×800 screenshots,
permission answers, reviewer notes, and the Partner Center checklist live under
`store-assets/edge/`.

Build the final kit after all release files are tracked:

```powershell
python scripts/package_store.py
```

Output: `release/store-v1.10.1/`.

- Upload only `pagenest-web-store-v1.10.1.zip` as the extension package.
- Use `PARTNER_CENTER_CHECKLIST.md` for listing metadata and image uploads.
- The Update API can upload/publish the package but cannot change listing
  languages, descriptions, search terms, screenshots, or promotional assets.
- Never put an API key, local Service token, Vault path, or user data in the ZIP
  or reviewer notes.

The normal public installation path starts inside the extension's Welcome or
Popup onboarding and downloads the stable `PageNest-Setup.exe` alias. Unpacked
extension loading is for development or recovery only.
