# Version compatibility

Hermes is released as three coordinated components. Their version numbers do
not need to be identical.

| Component | Current version | Compatibility |
| --- | --- | --- |
| Edge/Chrome extension | 1.7.4 | Local service 1.7.x |
| Windows local service | 1.7.4 | Extension 1.7.x |
| Obsidian page viewer | 1.3.0 | `.hermes` format 1.x, Obsidian 1.5.0+ |

The extension and local service exchange a capture payload, so their major and
minor versions should match. The viewer reads the self-contained `.hermes`
document and can evolve independently.

Before reporting a compatibility problem, reload the browser extension, restart
the local service, and confirm all three versions against this table.
