- [x] Implement preference store and localized selector
- [x] Bind all independent surfaces without remounting content
- [x] Implement editorial and water presentations from L2 references
- [x] Regenerate bundle and test persistence, drafts, invalid storage and variants
- [x] Capture desktop/mobile skins in isolated host
- [x] Document verification scope

OpenSpec CLI unavailable: installed launcher points to a missing @fission-ai/openspec module. Artifacts authored in existing OpenSpec tree; no CLI validation claimed.

Implemented all three skins with independent light/dark/follow-host mode. 162 isolated-host checks plus unit, regression and i18n tests passed; evidence in artifacts/three-skins-20260930.

Final upstream 3.2.4 integration: 230 smoke suites pass; 168 isolated-host checks pass. Revised L2-3 water reference and shared category accents retained on blue-white surfaces. Final evidence: docs/skin-figures/iter5-final/README.md.
