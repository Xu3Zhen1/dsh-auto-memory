## ADDED Requirements

### Requirement: Three distinct selectable skins
The plugin SHALL provide instrument, editorial and water skins based on the confirmed L2 HTML references.

#### Scenario: Switch without losing work
- WHEN the user changes the skin while a page contains an unsaved draft
- THEN the current page and draft remain mounted and only the presentation changes

### Requirement: Safe local persistence
The plugin SHALL store only an allowlisted skin ID in browser storage and use instrument as fallback.

#### Scenario: Invalid or inaccessible storage
- WHEN storage has an unknown value or rejects access
- THEN the interface renders instrument initially and allows in-memory switching

### Requirement: Shared independent surfaces
All mounted plugin surfaces SHALL follow the preference, including portal dialogs and host settings.

#### Scenario: Refresh and multiple surfaces
- WHEN the user selects a skin and reloads or opens a second plugin surface
- THEN the selected skin is restored without changing classic fallback or host settings

### Requirement: Accessible variants
Each skin SHALL preserve functionality, localization, focus, small-screen layout, theme tokens and reduced motion.

### Requirement: Independent color mode
All three skins SHALL support light, dark and follow-host modes independently of the skin choice.

#### Scenario: Theme override
- WHEN the user forces light or dark
- THEN all plugin boundaries including portals follow the choice without changing the host theme or current skin
- AND selecting follow-host restores host theme synchronization

## Final color and reference constraint
All presentations retain the blue-white base. Memory categories use matching small accents (logs blue, notes green, reflections purple, user preferences amber) across meters, legends and records. Water uses the revised L2-3 tank and sediment composition. Upgrades preserve upstream dam-skin-theme preferences when no new appearance preference exists.
