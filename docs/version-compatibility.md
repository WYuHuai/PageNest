# Version compatibility

PageNest is released as three coordinated components. Their version numbers do
not need to be identical.

| Component | Current version | Compatibility |
| --- | --- | --- |
| Edge/Chrome extension | 1.7.4 | Local service 1.7.x |
| Windows local service | 1.7.4 | Extension 1.7.x |
| PageNest Viewer | 1.3.0 | `.pagenest` format 1.x, legacy `.hermes`, Obsidian 1.5.0+ |

The extension and local service exchange a capture payload, so their major and
minor versions should match. The viewer reads self-contained `.pagenest` files
and legacy `.hermes` files and can evolve independently.

Before reporting a compatibility problem, reload the browser extension, restart
the local service, and confirm all three versions against this table.
