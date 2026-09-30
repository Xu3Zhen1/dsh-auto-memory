# Design

## Updated visual direction — owner instruction 2026-09-28

The owner supplied ten GPT reference images and explicitly released the whitepaper/demo visual restrictions. Target is now a polished luminous blue product UI: stronger typography, generous but useful card layouts, landscape artwork, layered blue accents, structured list/detail views and domain-specific settings cards. The images are visual references, not a feature specification. Do not fabricate health scores, trends, accounts, confidence values, backups or unsupported editing. Continue the existing integration and validation work. The previous no-decoration choice is superseded; use existing shipped assets through the real asset route. Keep classic available and host behavior intact where practical.

Keep upstream classic functions byte-identical. Add scoped iter5 CSS and React components inside the existing ModuleLoader factory. Source lives in skins/iter5; a deterministic Node script embeds it in lib/client.js without a runtime dependency. Reuse current host-connected components for complex workflows. A separate settings component derives from the current classic source at build time, with explicit checked transformations for four groups, accessible controls, patch-only drafts, immediate engine mode, and destructive-disable confirmation.

Use the current conversation.view surface (added since the old handoff); do not redraw host navigation. Inside the plugin, nine primary destinations follow the demo. Teamwork and statistics remain reachable as upstream additions. Compact panel and global DialogHost retain their controllers. All async custom views bind response acceptance to session/workspace and unmount lifetime. No mock routes are installed in the live host.

Use host fonts; omit decorative images and slogans. Tokens follow iter5 light values and explicit host dark-theme adaptation. Accessible tabs use roving focus; radio controls are native. On narrow containers, controls are at least 44px and content stacks.

Validation distinguishes isolated fixture rendering, automated host tests, live DSH interactions, Desktop/Mica, and user visual acceptance. The upstream guide's appearance-scan script is absent; do not claim it ran. Global OpenSpec launcher is broken (missing npm module); existing initialized structure is retained and specification artifacts are authored directly before implementation.
