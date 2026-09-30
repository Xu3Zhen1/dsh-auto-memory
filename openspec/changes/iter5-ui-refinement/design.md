# Design

- Fold candidate dimensions into existing CSS rules; consolidate duplicate selectors rather than append another override layer. Use 12px panels, 8px controls and 6px tags; body stays 14px with user scaling.
- Memory rows target 68px at normal desktop scale, with natural growth for long titles. Use a shared list boundary and quiet separators; split approximately 34/66 at sufficient content width.
- Bound the selected document to measured host content space, not just viewport height; keep source selectable and visible. Single-column mode must give a selected row a reachable detail view.
- Preserve light blue landscape but reduce its height; prioritize recent files, group total memory files with subset counts, and retain existing context measurement and calendar actions.
- Validate supplied preview separately from live DSH. Compare the same isolated host data before/after at 1440×900, 1366×768, 390px, narrow embedded content, dark and enlarged type. Keep upstream CI failures separate.
