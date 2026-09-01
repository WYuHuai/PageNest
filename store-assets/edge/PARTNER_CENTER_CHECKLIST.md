# Microsoft Edge Add-ons Partner Center checklist

This repository contains everything needed for the listing, but Microsoft does
not expose listing metadata through the Edge Add-ons Update API. Complete these
steps in Partner Center after the final package passes certification checks.

## 5–10 minute listing pass

1. Open the PageNest product and add **Simplified Chinese (zh-CN)** as a listing
   language; keep **English (United States)**.
2. For zh-CN, paste `zh-CN/description.txt`. For en-US, paste
   `en-US/description.txt`.
3. Confirm the package-supplied name and short description are localized in both
   languages. zh-CN is the extension's `default_locale`.
4. Upload `assets/logo-300.png`, `assets/promo-small-440x280.png`, and, where
   offered, `assets/promo-large-1400x560.png`.
5. Upload screenshots `screenshots/01_web_capture.png` through
   `screenshots/05_local_first.png` in numeric order. Each is 1280×800. Captions
   are in `CAPTIONS.md`.
6. Enter no more than seven search terms from `CAPTIONS.md` for each language.
7. Copy the single-purpose, privacy, permission, and remote-code answers from
   `privacy-and-permissions.md`. Confirm the public privacy URL is
   `https://github.com/WYuHuai/PageNest/blob/main/PRIVACY.md`.
8. Paste `reviewer-notes.md`. Do not add an API key, local token, private Vault
   path, account, or test credential.
9. Save the listing, review every language preview, then choose **Publish**.

Before publishing, confirm the uploaded package is exactly
`pagenest-web-store-v1.10.2.zip` from the final store kit and that its SHA-256
matches the kit's `SHA256SUMS.txt`.
