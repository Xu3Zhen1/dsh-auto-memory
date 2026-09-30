# Iter5 UI

## ADDED Requirements

### Requirement: Approved design with real data
The skin SHALL use iter5 tokens, card layout, nine primary destinations, memory sub-tabs and continuation sub-tabs. It SHALL preserve all upstream features and existing API contracts.

#### Scenario: Missing data
- WHEN a request fails or a measurement is unavailable
- THEN display an error/retry or unavailable value, never a fabricated count.

### Requirement: Settings safety
The skin SHALL expose four grouped settings tabs, native engine radios, immediate engine persistence, draft-only preference patches, cancellation and unsaved-change protection. Appearance preferences SHALL remain local and emission mode SHALL use semanticEmit.

#### Scenario: Disable engine
- WHEN the enabled engine is switched off
- THEN explain observation-data clearing and require confirmation before including the change in a saved patch.

### Requirement: Classic isolation
The skin SHALL preserve classic source and host routes, with a classic fallback and reversible skin selection.

#### Scenario: Skin rendering fails
- WHEN a skin component throws
- THEN the existing error boundary displays the classic page and the error.
