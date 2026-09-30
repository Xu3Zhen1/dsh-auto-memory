# Design

One shared data and action implementation with three presentation variants. A small client preference store normalizes an allowlist, persists only a skin ID, broadcasts to mounted boundaries and synchronizes browser storage events. Boundaries include workbench, host settings and portal dialogs/panels. A native select in the toolbar and host settings exposes the three localized names.

Home retains existing instrument components; editorial renders a typographic water-level reading, horizontal ruler and three-column ledger; water renders a continuous blue basin, waterline, session/schedule surface, and layered records. Secondary pages use variant-specific surface, type and control styles. Theme tokens and reduced-motion are preserved.

Switching never changes the component key, query, draft or selected page. Invalid stored values fall back to instrument; denied storage still permits in-memory switching. No new model calls. Keep existing generated bundle workflow.
