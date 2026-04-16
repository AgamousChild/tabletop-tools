# Brain Card Components + Overlay System — Implementation Plan (Plan 1 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build 5 GW-format card components (Unit, Stratagem, Enhancement, Army Rule, Detachment Rule) and an overlay system to display them.

**Architecture:** Each card is a self-contained React + Tailwind component that receives data as props and renders the GW card format in our dark theme. An `<Overlay>` wrapper handles open/close/dismiss behavior. Cards are data-driven — same component renders any unit, any stratagem, etc. The overlay mounts above the current view and dismisses back to it.

**Tech Stack:** React, Tailwind CSS, Vitest, @testing-library/react

**Spec:** `docs/superpowers/specs/2026-04-14-brain-card-ui-design.md`

**Test commands:**
- Client: `cd apps/brain/client && pnpm test`

---

## File Map

### Create

| File | Responsibility |
|---|---|
| `apps/brain/client/src/components/cards/UnitCard.tsx` | GW-format unit datasheet card |
| `apps/brain/client/src/components/cards/UnitCard.test.tsx` | Tests |
| `apps/brain/client/src/components/cards/StratagemCard.tsx` | Stratagem card with CP diamond, WHEN/TARGET/EFFECT |
| `apps/brain/client/src/components/cards/StratagemCard.test.tsx` | Tests |
| `apps/brain/client/src/components/cards/EnhancementCard.tsx` | Enhancement card with points cost |
| `apps/brain/client/src/components/cards/EnhancementCard.test.tsx` | Tests |
| `apps/brain/client/src/components/cards/RuleCard.tsx` | Shared layout for Army Rule + Detachment Rule cards |
| `apps/brain/client/src/components/cards/RuleCard.test.tsx` | Tests |
| `apps/brain/client/src/components/cards/types.ts` | Shared prop types for all cards |
| `apps/brain/client/src/components/Overlay.tsx` | Full-screen overlay shell with dismiss/back |
| `apps/brain/client/src/components/Overlay.test.tsx` | Tests |

### Modify

| File | Change |
|---|---|
| `apps/brain/client/src/pages/BrainScreen.tsx` | Add overlay state, wire up card opening from existing result clicks |

---

## Task 1: Card types + Overlay shell

**Files:**
- Create: `apps/brain/client/src/components/cards/types.ts`
- Create: `apps/brain/client/src/components/Overlay.tsx`
- Create: `apps/brain/client/src/components/Overlay.test.tsx`

- [ ] **Step 1: Write types.ts**

```typescript
// apps/brain/client/src/components/cards/types.ts

export interface UnitCardData {
  id: string
  name: string
  factionId: string
  subfaction?: string
  role: string
  points: string          // e.g. "5 models: 90pts, 10 models: 180pts"
  stats: {
    move: string; toughness: string; save: string; wounds: string;
    leadership: string; oc: string; invSv?: string
  }
  rangedWeapons: WeaponProfile[]
  meleeWeapons: WeaponProfile[]
  abilities: { name: string; description: string; type: string }[]
  coreAbilities: string[]
  keywords: string[]
  factionKeywords: string[]
  composition: string
  loadout: string
  leaders: string[]       // eligible leader names
  transport?: string
  damaged?: { threshold: string; description: string }
}

export interface WeaponProfile {
  name: string
  range: string
  attacks: string
  skill: string
  strength: string
  ap: string
  damage: string
  abilities: string       // e.g. "[TORRENT] [IGNORES COVER]"
}

export interface StratagemCardData {
  id: string
  name: string
  type: string            // "Battle Tactic", "Strategic Ploy", etc.
  cpCost: string
  turn: string
  phase: string
  when: string
  target: string
  effect: string
  detachmentName: string
  factionId: string
  subfaction?: string
}

export interface EnhancementCardData {
  id: string
  name: string
  cost: string
  description: string
  restriction?: string   // e.g. "Chaplain model only"
  detachmentName: string
  factionId: string
  subfaction?: string
}

export interface RuleCardData {
  id: string
  name: string
  description: string
  factionId: string
  subfaction?: string
  detachmentName?: string  // present for detachment rules, absent for army rules
  isArmyRule: boolean
  subRules?: { name: string; description: string }[]
  appliesTo?: number       // number of datasheets (army rules only)
}

export type CardData =
  | { type: 'unit'; data: UnitCardData }
  | { type: 'stratagem'; data: StratagemCardData }
  | { type: 'enhancement'; data: EnhancementCardData }
  | { type: 'rule'; data: RuleCardData }

export interface CardContext {
  highlightTerms: string[]    // which elements to highlight on the card
  onContentClick: (term: string) => void   // called when user clicks a content element
  onDismiss: () => void       // called when user dismisses the card
}
```

- [ ] **Step 2: Write Overlay test**

```typescript
// apps/brain/client/src/components/Overlay.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Overlay } from './Overlay'

describe('Overlay', () => {
  it('renders children when open', () => {
    render(<Overlay open onDismiss={() => {}}><div>Card content</div></Overlay>)
    expect(screen.getByText('Card content')).toBeInTheDocument()
  })

  it('renders nothing when closed', () => {
    render(<Overlay open={false} onDismiss={() => {}}><div>Card content</div></Overlay>)
    expect(screen.queryByText('Card content')).not.toBeInTheDocument()
  })

  it('calls onDismiss when close button clicked', () => {
    const onDismiss = vi.fn()
    render(<Overlay open onDismiss={onDismiss}><div>Content</div></Overlay>)
    fireEvent.click(screen.getByLabelText('Close'))
    expect(onDismiss).toHaveBeenCalled()
  })

  it('calls onDismiss when backdrop clicked', () => {
    const onDismiss = vi.fn()
    render(<Overlay open onDismiss={onDismiss}><div>Content</div></Overlay>)
    fireEvent.click(screen.getByTestId('overlay-backdrop'))
    expect(onDismiss).toHaveBeenCalled()
  })

  it('does not dismiss when card content clicked', () => {
    const onDismiss = vi.fn()
    render(<Overlay open onDismiss={onDismiss}><div>Content</div></Overlay>)
    fireEvent.click(screen.getByText('Content'))
    expect(onDismiss).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Run tests — verify fail**

Run: `cd apps/brain/client && pnpm test -- --reporter verbose src/components/Overlay.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 4: Implement Overlay**

The Overlay is a full-screen fixed-position container with a semi-transparent backdrop. The card content scrolls inside it. A prominent close button floats at the top-right — large, visible, not a tiny X. Clicking the backdrop dismisses. Clicking card content does NOT dismiss (stopPropagation).

```typescript
// apps/brain/client/src/components/Overlay.tsx
import { type ReactNode } from 'react'

interface OverlayProps {
  open: boolean
  onDismiss: () => void
  children: ReactNode
}

export function Overlay({ open, onDismiss, children }: OverlayProps) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto"
      data-testid="overlay-backdrop"
      onClick={onDismiss}
    >
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/70" />

      {/* Card container */}
      <div
        className="relative z-10 my-8 mx-4 max-w-3xl w-full"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button — prominent, floating */}
        <button
          onClick={onDismiss}
          aria-label="Close"
          className="absolute -top-2 -right-2 z-20 w-10 h-10 rounded-full bg-slate-800 border border-slate-600 text-slate-300 hover:text-white hover:bg-slate-700 flex items-center justify-center text-xl font-bold shadow-lg"
        >
          ×
        </button>

        {children}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Run tests — verify pass**

Run: `cd apps/brain/client && pnpm test -- --reporter verbose src/components/Overlay.test.tsx`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add apps/brain/client/src/components/cards/types.ts apps/brain/client/src/components/Overlay.tsx apps/brain/client/src/components/Overlay.test.tsx
git commit -m "feat(brain): card types + overlay shell component"
```

---

## Task 2: Unit Card component

**Files:**
- Create: `apps/brain/client/src/components/cards/UnitCard.tsx`
- Create: `apps/brain/client/src/components/cards/UnitCard.test.tsx`

- [ ] **Step 1: Write UnitCard test**

```typescript
// apps/brain/client/src/components/cards/UnitCard.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { UnitCard } from './UnitCard'
import type { UnitCardData, CardContext } from './types'

const mockUnit: UnitCardData = {
  id: '000000126',
  name: 'Infernus Squad',
  factionId: 'space-marines',
  role: 'Other',
  points: '5 models: 90pts',
  stats: { move: '6"', toughness: '4', save: '3+', wounds: '2', leadership: '6+', oc: '1' },
  rangedWeapons: [
    { name: 'Bolt pistol', range: '12"', attacks: '1', skill: '3+', strength: '4', ap: '0', damage: '1', abilities: '[PISTOL]' },
    { name: 'Pyreblaster', range: '12"', attacks: 'D6', skill: 'N/A', strength: '5', ap: '-1', damage: '1', abilities: '[IGNORES COVER] [TORRENT]' },
  ],
  meleeWeapons: [
    { name: 'Close combat weapon', range: 'Melee', attacks: '3', skill: '3+', strength: '4', ap: '0', damage: '1', abilities: '' },
  ],
  abilities: [{ name: 'Incendiary Terror', description: 'After shooting, select one enemy INFANTRY unit hit — it must take a Battle-shock test.', type: 'Datasheet' }],
  coreAbilities: ['Grenades'],
  keywords: ['Infantry', 'Grenades', 'Imperium', 'Tacticus'],
  factionKeywords: ['Adeptus Astartes'],
  composition: '1 Infernus Sergeant, 4-9 Infernus Marines',
  loadout: 'bolt pistol; pyreblaster; close combat weapon',
  leaders: ['Vulkan He\'stan', 'Captain', 'Chaplain'],
}

const mockContext: CardContext = {
  highlightTerms: ['torrent'],
  onContentClick: vi.fn(),
  onDismiss: vi.fn(),
}

describe('UnitCard', () => {
  it('renders unit name', () => {
    render(<UnitCard data={mockUnit} context={mockContext} />)
    expect(screen.getByText('Infernus Squad')).toBeInTheDocument()
  })

  it('renders stat line', () => {
    render(<UnitCard data={mockUnit} context={mockContext} />)
    expect(screen.getByText('6"')).toBeInTheDocument()
    expect(screen.getByText('3+')).toBeInTheDocument()
  })

  it('renders ranged weapons', () => {
    render(<UnitCard data={mockUnit} context={mockContext} />)
    expect(screen.getByText('Pyreblaster')).toBeInTheDocument()
    expect(screen.getByText('Bolt pistol')).toBeInTheDocument()
  })

  it('renders melee weapons', () => {
    render(<UnitCard data={mockUnit} context={mockContext} />)
    expect(screen.getByText('Close combat weapon')).toBeInTheDocument()
  })

  it('renders abilities', () => {
    render(<UnitCard data={mockUnit} context={mockContext} />)
    expect(screen.getByText('Incendiary Terror')).toBeInTheDocument()
  })

  it('renders keywords', () => {
    render(<UnitCard data={mockUnit} context={mockContext} />)
    expect(screen.getByText('Infantry')).toBeInTheDocument()
  })

  it('renders eligible leaders', () => {
    render(<UnitCard data={mockUnit} context={mockContext} />)
    expect(screen.getByText("Vulkan He'stan")).toBeInTheDocument()
  })

  it('renders points', () => {
    render(<UnitCard data={mockUnit} context={mockContext} />)
    expect(screen.getByText(/90/)).toBeInTheDocument()
  })

  it('highlights weapon row containing highlight term', () => {
    const { container } = render(<UnitCard data={mockUnit} context={mockContext} />)
    // The Pyreblaster row should have the highlight class because its abilities contain "torrent"
    const pyreRow = container.querySelector('[data-highlight="true"]')
    expect(pyreRow).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run tests — verify fail**

Run: `cd apps/brain/client && pnpm test -- --reporter verbose src/components/cards/UnitCard.test.tsx`

- [ ] **Step 3: Implement UnitCard**

Build the UnitCard component matching the approved mockup: header with name/faction/points, compact stat line, two-column layout (weapons left, abilities right), keywords bar, footer with composition/loadout/leaders. Use `data-highlight="true"` attribute on rows that match `context.highlightTerms`. Every named element calls `context.onContentClick(term)` on click.

Reference the approved HTML mockup at `.superpowers/brainstorm/301936-1776221896/unit-card-v2.html` for exact CSS classes and layout.

Fonts: `Oswald` for headers/stats, `Source Sans 3` for body. Import via Tailwind config or Google Fonts link in index.html.

- [ ] **Step 4: Run tests — verify pass**

- [ ] **Step 5: Commit**

```bash
git add apps/brain/client/src/components/cards/UnitCard.tsx apps/brain/client/src/components/cards/UnitCard.test.tsx
git commit -m "feat(brain): UnitCard component — GW-format datasheet in dark theme"
```

---

## Task 3: Stratagem Card component

**Files:**
- Create: `apps/brain/client/src/components/cards/StratagemCard.tsx`
- Create: `apps/brain/client/src/components/cards/StratagemCard.test.tsx`

- [ ] **Step 1: Write StratagemCard test**

Tests should verify: renders name, CP diamond with cost, type line, WHEN/TARGET/EFFECT sections, detachment name, highlights EFFECT section when `highlightTerms` match content.

- [ ] **Step 2: Run tests — verify fail**

- [ ] **Step 3: Implement StratagemCard**

Layout: left sidebar with CP diamond (rotated 45deg square), body with name/type/sections. Reference mockup at `.superpowers/brainstorm/301936-1776221896/all-cards.html`.

- [ ] **Step 4: Run tests — verify pass**

- [ ] **Step 5: Commit**

```bash
git add apps/brain/client/src/components/cards/StratagemCard.tsx apps/brain/client/src/components/cards/StratagemCard.test.tsx
git commit -m "feat(brain): StratagemCard component — CP diamond, WHEN/TARGET/EFFECT"
```

---

## Task 4: Enhancement Card component

**Files:**
- Create: `apps/brain/client/src/components/cards/EnhancementCard.tsx`
- Create: `apps/brain/client/src/components/cards/EnhancementCard.test.tsx`

- [ ] **Step 1: Write EnhancementCard test**

Tests should verify: renders name, points cost, restriction text, description, detachment name, highlights description when terms match.

- [ ] **Step 2: Run tests — verify fail**

- [ ] **Step 3: Implement EnhancementCard**

Layout: header with name + cost, restriction line, rules text, detachment footer. Purple accent color. Reference mockup.

- [ ] **Step 4: Run tests — verify pass**

- [ ] **Step 5: Commit**

```bash
git add apps/brain/client/src/components/cards/EnhancementCard.tsx apps/brain/client/src/components/cards/EnhancementCard.test.tsx
git commit -m "feat(brain): EnhancementCard component"
```

---

## Task 5: Rule Card component (Army Rule + Detachment Rule)

**Files:**
- Create: `apps/brain/client/src/components/cards/RuleCard.tsx`
- Create: `apps/brain/client/src/components/cards/RuleCard.test.tsx`

- [ ] **Step 1: Write RuleCard test**

Tests should verify:
- Renders rule name and description
- Shows "Army Rule" header with amber accent when `isArmyRule` is true
- Shows "Detachment Ability" header with blue accent when `isArmyRule` is false
- Renders sub-rules when present (Blessings of Khorne shows 6 sub-rules)
- Highlights matching sub-rule
- Shows "Applies to X datasheets" when `appliesTo` is set
- Shows chapter badge when `subfaction` is set

- [ ] **Step 2: Run tests — verify fail**

- [ ] **Step 3: Implement RuleCard**

Same layout for both army rules and detachment rules — the `isArmyRule` flag controls the accent color (amber vs blue) and header text. Sub-rules render as individual cards within the rule card. "Applies to X datasheets" line is clickable. Reference mockup.

- [ ] **Step 4: Run tests — verify pass**

- [ ] **Step 5: Commit**

```bash
git add apps/brain/client/src/components/cards/RuleCard.tsx apps/brain/client/src/components/cards/RuleCard.test.tsx
git commit -m "feat(brain): RuleCard component — army rules + detachment rules"
```

---

## Task 6: Wire cards into BrainScreen

**Files:**
- Modify: `apps/brain/client/src/pages/BrainScreen.tsx`

- [ ] **Step 1: Add overlay state to BrainScreen**

Add state:
```typescript
const [activeCard, setActiveCard] = useState<CardData | null>(null)
const [cardContext, setCardContext] = useState<CardContext | null>(null)
```

- [ ] **Step 2: Add Overlay + card rendering**

Below the tab content, render:
```tsx
<Overlay open={!!activeCard} onDismiss={() => setActiveCard(null)}>
  {activeCard?.type === 'unit' && <UnitCard data={activeCard.data} context={cardContext!} />}
  {activeCard?.type === 'stratagem' && <StratagemCard data={activeCard.data} context={cardContext!} />}
  {activeCard?.type === 'enhancement' && <EnhancementCard data={activeCard.data} context={cardContext!} />}
  {activeCard?.type === 'rule' && <RuleCard data={activeCard.data} context={cardContext!} />}
</Overlay>
```

- [ ] **Step 3: Wire existing NodeDetailModal and ResultCard clicks to open cards**

When a user clicks a search result or ask reference result, instead of opening the NodeDetailModal, determine the card type from the node's category and open the appropriate card in the overlay. Categories map as:
- `datasheet` → UnitCard
- `stratagem` → StratagemCard
- `enhancement` → EnhancementCard
- `faction-ability` (no detachmentId) → RuleCard (army rule)
- `faction-ability` (with detachmentId) or `detachment-rule` → RuleCard (detachment rule)

- [ ] **Step 4: Build card data from brain node**

Create a helper function `buildCardData(node: ResultNode | BrowseNode): CardData | null` that maps brain node data to the card data types. For UnitCard, this requires fetching the weapons and abilities from the API by datasheetId.

- [ ] **Step 5: Run all client tests**

Run: `cd apps/brain/client && pnpm test`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add apps/brain/client/src/pages/BrainScreen.tsx
git commit -m "feat(brain): wire card overlay into BrainScreen — search/ask/browse results open cards"
```

---

## Task 7: Full integration test

- [ ] **Step 1: Run all client tests**

Run: `cd apps/brain/client && pnpm test`
Expected: All pass

- [ ] **Step 2: Build client**

Run: `cd apps/brain/client && rm -f tsconfig.tsbuildinfo && rm -rf node_modules/.vite dist && npx vite build`
Expected: Clean build

- [ ] **Step 3: Commit if any fixups**

---

## Task Summary

| Task | Description | Dependencies |
|---|---|---|
| 1 | Card types + Overlay shell | None |
| 2 | UnitCard component | 1 |
| 3 | StratagemCard component | 1 |
| 4 | EnhancementCard component | 1 |
| 5 | RuleCard component | 1 |
| 6 | Wire into BrainScreen | 1-5 |
| 7 | Integration test | All |

Tasks 2, 3, 4, 5 can run in parallel after Task 1.
