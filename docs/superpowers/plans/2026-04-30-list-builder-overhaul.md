# List Builder Overhaul (#38, #42)

## Goal

Redesign list-builder with a polished interface that uses brain detachment cards and unit cards for display.

## Current State

- Multi-screen wizard stored in IndexedDB
- Basic text-based unit selection
- No visual unit cards, no detachment display
- Works but looks bare

## Needs Micah's Design Input

Before implementation, need answers to:

1. **Layout:** Single page with sidebar? Multi-step wizard? Split panel (list left, unit browser right)?
2. **Unit browsing:** Grid of unit cards? Searchable list? Filter by role?
3. **List display:** Stack of unit cards? Compact table? Expandable rows?
4. **Points tracking:** Always-visible points bar? Header badge?
5. **Detachment view:** Full detachment card at top? Collapsible?
6. **Export:** TTT format JSON? BattleScribe format? Plain text? Print-friendly?
7. **Mobile:** Mobile-first or desktop-first?

## Proposed Architecture

### Shared components from brain

Extract from `apps/brain/client/src/components/cards/`:
- `UnitCard` → `packages/ui/src/components/UnitCard`
- `DetachmentCard` → `packages/ui/src/components/DetachmentCard`
- `EnhancementCard` → `packages/ui/src/components/EnhancementCard`
- `StratagemCard` → `packages/ui/src/components/StratagemCard`

These become shared UI components any app can use.

Card component extraction requires abstracting brain-specific data shapes to generic props. Budget 4-6h for extraction alone — the brain card components currently consume brain node shapes directly, which must be decoupled before they can be shared.

Card component tests move alongside the components to `packages/ui`.

### Data source

Units, detachments, stratagems, enhancements all come from game-data-store (IndexedDB). Already loaded by the data-import pipeline.

### List storage

Keep IndexedDB storage (game-data-store lists + list_units stores). The migration adds new fields without breaking existing data — backwards compatible with existing IndexedDB lists. Add TTT format export.

## Estimated effort

- Extract card components to packages/ui (including prop abstraction): 4-6 hours
- List builder UI redesign: 4-6 hours (depends on complexity of design)
- TTT format export: 1 hour
- Testing: 2 hours

## Blocked by

- Design input from Micah
- #45 (TTT list format) for export
