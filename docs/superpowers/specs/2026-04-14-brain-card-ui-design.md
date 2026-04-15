# Brain Card UI — Design Spec

**Date:** 2026-04-14
**Goal:** Add a card-based presentation layer to the brain that renders every data element (units, stratagems, enhancements, detachment rules, core rules) as GW-format cards with context highlighting and clickable navigation back to the brain.

---

## Principle

The brain's answer is the intelligence. Cards are reference material. Every card links back to the brain — cards never link to other cards. The brain is the hub, cards are spokes.

---

## Card Types

Five card types, using game-datacards (github.com/ronplanken/game-datacards, GPL-3.0) as a dependency. Their React components render the GW-authentic card layout. We wrap them in our own components to add the context overlay layer and apply our custom dark theme (slate-950 background, amber-400 accents from `packages/ui/tailwind-preset`) via CSS overrides.

### 1. Unit Card

GW 10th edition datasheet format:
- Header: unit name, faction keywords, points cost
- Stat line: M / T / SV / W / LD / OC / INV
- Ranged weapons table: Range, A, BS, S, AP, D + weapon abilities
- Melee weapons table: same format
- Abilities section: core abilities, faction abilities, datasheet abilities
- Keywords
- Composition, loadout
- Leader attachments (who can lead this unit)

Data source: brain nodes (datasheet + weapons + abilities via `datasheetId`), backed by IndexedDB game-data-store.

### 2. Stratagem Card

GW stratagem format:
- CP cost (diamond shape)
- Type (battle tactic, strategic ploy, etc.)
- Phase (when it can be used)
- WHEN / TARGET / EFFECT sections
- Detachment name

Data source: brain nodes (category: stratagem).

### 3. Enhancement Card

- Name, points cost
- Rules text
- Restrictions (e.g., "ADEPTUS ASTARTES model only")
- Detachment name

Data source: brain nodes (category: enhancement).

### 4. Army Rule Card

Same layout as Detachment Rule Card (below), applied to army-level rules:
- Army rule name (Oath of Moment, Blessings of Khorne, For the Greater Good, etc.)
- Faction name
- Full rules text including sub-rules (e.g., Blessings of Khorne shows all 6 blessings)
- Which units have the keyword (via modifies refs — "applies to 54 datasheets")

Data source: brain nodes (category: faction-ability, no detachmentId — these are army-wide rules from `abilities.json`).

### 5. Detachment Rule Card

- Rule name
- Full rules text
- Detachment name
- NOT the full detachment page — just the specific rule

Data source: brain nodes (category: faction-ability with detachmentId, or detachment-rule).

### 6. Detachment Page (full page, not overlay)

- Detachment name and description
- Detachment ability (the army-wide rule)
- All stratagems rendered as stratagem cards
- All enhancements rendered as enhancement cards
- Chapter restriction if applicable

This is the only full-page view. Accessed from Browse or when explicitly navigating to a detachment.

---

## Core Rules Reference (PDF Pages)

When a core mechanic is clicked (Devastating Wounds, Sustained Hits, Feel No Pain, etc.) and the source is a GW PDF:

- Render the PDF page as an image
- Highlight the relevant section with a semi-transparent color overlay
- Prominent close button — floating, visible, does NOT obscure the page content
- On small screens: zoom to the highlighted section, scrollable for more context

Source PDFs are stored at `C:\R\sync-data\tools\gw-sync\.local\gw\pdfs\`. Brain nodes have `sources[].type === 'pdf'` with `page` numbers.

For Wahapedia-sourced content (sources[].type === 'wahapedia'), the card IS the reference — no PDF page, the card overlay serves that purpose.

---

## Context Highlighting

Every card/page has a semi-transparent color overlay on the specific element relevant to the current query context.

Example: User asks "how do I get sustained hits in blood angels." Answer mentions Infernus Squad's Pyreblaster. User clicks "Infernus Squad" — the full unit card opens with the Pyreblaster row highlighted in amber overlay, showing exactly which weapon is relevant.

The highlight color should match the query context:
- Weapon abilities: amber
- Abilities/rules: green
- Combos (stacks_with): red arrows/overlay between the relevant elements

---

## Navigation Model

### Opening Cards

Every named element across ALL brain views (Ask, Search, Browse, Graph) becomes a clickable link:
- Unit names → unit card overlay
- Stratagem names → stratagem card overlay
- Enhancement names → enhancement card overlay
- Army rule names → army rule card overlay
- Detachment rule names → detachment rule card overlay
- Core mechanic names → PDF page image or card (based on source type)

### On a Card — Two Actions

1. **Dismiss / back** — close the overlay, return to the previous view (Ask results, Search results, Browse list, Graph). No navigation history — just close.

2. **Click any content element** (weapon name, ability name, keyword, rule reference) — close the overlay, re-query the brain with that term added as a filter to the current query. The filter impacts results and highlights matching content in the new results.

Cards NEVER link to other cards. Every click on card content goes back to the brain.

### Graph Specific

Clicking a node in the graph does NOT immediately open a card overlay. The node shows summary info in the graph card. A "Show details" button on the node opens the full card overlay.

### Back Navigation

Every overlay has a clear, prominent way to return to the previous view. The close/dismiss action is always visible and obvious — not a tiny X.

---

## Where Cards Appear

All four brain views get clickable links:

- **Ask** — unit names, stratagem names, ability names in the answer text and reference section
- **Search** — result cards link to full detail cards
- **Browse** — node list items link to full detail cards
- **Graph** — "Show details" button on nodes

---

## Filter Behavior on Re-query

When a user clicks a content element on a card (e.g., "Torrent" keyword on Infernus Squad):

1. The overlay closes
2. The current view (Ask/Search/Browse/Graph) re-runs the query
3. The clicked term is added as a filter, not just appended to the query string
4. Results are filtered/prioritized by the new term
5. Matching content in the new results is highlighted

This creates a drill-down pattern: answer → card → click keyword → new filtered answer → different card → click another keyword → deeper filtered answer.

---

## Tech Stack

- game-datacards (GPL-3.0) as a dependency — their React components for card rendering
- CSS overrides for our custom dark theme (slate-950/amber-400)
- Our own wrapper components for context overlay, click handlers, navigation
- PDF rendering: pre-rendered PNG page images (generated at build time by gw-sync, stored in R2)
- Data: brain nodes via API + IndexedDB game-data-store for unit details

---

## Detachment Full Page Layout

The detachment page is the only full-page view. Layout:

- Detachment name as page header with faction color
- Chapter restriction badge if applicable (e.g., "Blood Angels only")
- Detachment ability card at the top (army rule card format)
- Stratagems section: all stratagems rendered as stratagem cards in a grid
- Enhancements section: all enhancements rendered as enhancement cards in a grid
- Every card on the page is clickable — same navigation rules (click content → re-query brain)
- Back button returns to previous view

---

## PDF Page Image Generation Pipeline

Add a build step to gw-sync that converts PDF pages to PNG images:

- Run after PDF fetch: `pdfs/*.pdf` → `pages/<pdf-name>/page-<N>.png`
- Resolution: 2x for retina (300 DPI)
- Upload to R2 alongside brain graph data
- Brain nodes with `sources[].type === 'pdf'` and `sources[].page` map directly to `pages/<pdf-name>/page-<page>.png`
- Tool: pdf-to-img, pdf-poppler, or sharp + pdf.js in a Node script

---

## Mobile Card Layouts

- Unit cards: stat line wraps to 2 rows on narrow screens
- Weapon tables: horizontal scroll if too wide, or stack columns vertically
- All overlays: full-screen on mobile instead of side panel
- PDF pages: zoom to highlighted section by default, pinch to zoom out
- Close button: large, fixed at bottom of screen on mobile
- Cards should be touch-friendly — tap targets at least 44px

---

## Combo Visualization

When the brain identifies a combo (stacks_with refs), the answer should show a visual:

- Two cards side by side (e.g., Forgefather + Immolation Protocols)
- Red arrow/connector between the relevant rules text on each card
- Both cards have the relevant section highlighted
- Label on the connector: "wound re-rolls + devastating wounds on torrent weapons"
- Clicking either card follows normal navigation (close overlay, re-query brain)
- On mobile: cards stack vertically with arrow between them

---

## Print / Export

Not in scope for the brain. Card printing and export belongs in the list-builder app where users have a specific army list to print.
