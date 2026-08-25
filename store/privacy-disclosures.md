# Browser-store privacy disclosures

The canonical Partner Center answers are maintained in
[`store-assets/edge/privacy-and-permissions.md`](../store-assets/edge/privacy-and-permissions.md).

PageNest captures content only when the user explicitly invokes capture. It
communicates with the user's locally installed, token-protected PageNest Service
and does not require broad browsing-history collection for its primary workflow.
The v1.10.1 permission set remains `activeTab`, `scripting`, `storage`, and
`clipboardWrite`; it does not add `tabCapture` or `offscreen`.
