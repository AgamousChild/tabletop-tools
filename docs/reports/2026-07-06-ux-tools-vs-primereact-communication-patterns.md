# UX Tools vs PrimeReact — Communication Pattern Review

**Date:** 2026-07-06
**Scope:** Compare the communication patterns (prop contracts, event shapes, control models)
of the platform's hand-rolled UX widgets against PrimeReact as evaluated in `apps/widget-lab`,
and decide whether the platform tools should adopt PrimeReact's pattern so the two are
interchangeable.

**Verdict:** **No.** Do not retrofit the platform's components to PrimeReact's communication
pattern. The platform's existing contract (controlled `value` + direct typed-value callbacks)
is the better one for this stack, and adapting PrimeReact to it is a one-line mapping per
component. Interchangeability should be achieved in the opposite direction: a thin wrapper
layer in `packages/ui` that keeps the platform contract and hides the widget library behind
it — which is what Rule 8 (skinnable UI) already prescribes.

---

## 1. What was compared

`apps/widget-lab` is a local-only test app (ships nothing to production) that renders each
hand-rolled pattern side-by-side with its PrimeReact equivalent, driven by the same fixture
state. Its six pages cite the real source files each "current pattern" was extracted from.
PrimeReact (`^10.9.8`) is a dependency of `widget-lab-client` only; no production app or
package imports it.

The production widgets reviewed (the "ux tools"):

| Widget | Location | Status |
|---|---|---|
| `VpStepper` | `apps/game-tracker/client/src/components/battle/VpStepper.tsx` | Real component, app-local |
| `Overlay` | `apps/brain/client/src/components/Overlay.tsx` | Real component, app-local |
| `FactionDetachmentPicker` | `apps/tournament/client/src/components/FactionDetachmentPicker.tsx` | Real component, app-local |
| `CollapsibleSection`, `AppShell`, `AuthScreen`, `HelpTip` | `packages/ui/src/components/` | Shared |
| Faction/detachment selects | 6+ apps (list-builder, game-tracker, tournament, new-meta, admin, …) | Inline native `<select>`, not a component |
| Tabs / segmented pills | 5+ apps (`ManageTournament`, `MyListsScreen`, `MetaWindowSelector`, admin `App.tsx`) | Inline `(['a','b'] as const).map` JSX, not a component |
| Stat/standings tables | new-meta `FactionTable`, tournament `MetricStackStandings`, admin `UsersPage` | Inline raw `<table>`, not a component |
| Toast / notifications | — | Does not exist; feedback is a local result-string near the button, or nothing |
| Inline row confirm | admin `UsersPage` (also list-builder) | Inline JSX swap, not a component |

## 2. The two communication patterns

### PrimeReact's pattern

- **Controlled `value` + `onChange(e)`** where the handler reads `e.value` from a synthetic
  event object (`{ value, originalEvent, … }`), never the raw value directly.
- **Options-driven selects:** `options` array + `optionLabel`; the bound value is the
  **option object** by default (an id string only if `optionValue` is set).
- **Dialog:** `visible` + `onHide`; backdrop dismiss via `dismissableMask`.
- **ConfirmDialog:** imperative singleton — mount `<ConfirmDialog />` once, call
  `confirmDialog({ message, accept, … })` from anywhere.
- **Toast:** ref-imperative — `toast.current?.show({ severity, summary, detail })` against a
  mounted `<Toast ref={…} />`.
- **TabView:** `activeIndex: number` + `onTabChange(e => e.index)`.
- **DataTable:** declarative `<Column field header sortable body={…} />` children; table-level
  props for `paginator`, `globalFilter`, `sortMode`.
- **InputNumber/Slider:** `value` + `onValueChange(e => e.value)` / `onChange(e => e.value)`.

### The platform's pattern

- **Controlled `value` + direct typed-value callback:**
  - `VpStepper`: `value: number`, `onChange(value: number)`, `min?`, `max?`.
  - `FactionDetachmentPicker`: `factionEntityId: string | null`,
    `onFactionChange(id: string | null)`, `onDetachmentChange(id: string | null)` — id-based,
    never option objects; owns its own data fetching via tRPC.
- **Modal:** `Overlay` takes `open: boolean` + `onDismiss: () => void` + `children`.
- **Disclosure:** `CollapsibleSection` is uncontrolled (`defaultOpen`), internal state.
- **Everything else** communicates through raw DOM events (`e.target.value` on native
  `<select>`/`<input>`) or plain `onClick={() => setState(x)}` on pill buttons, because it
  is inline JSX rather than a component with a contract.

### Interchangeability today

None of the real components are drop-in swappable with their PrimeReact counterparts:
prop names differ (`open`/`onDismiss` vs `visible`/`onHide`), event shapes differ
(`onChange(value)` vs `onChange(e)` → `e.value`), and value semantics differ (id strings vs
option objects). The larger blocker, though, is that most of the patterns are not components
at all — there is nothing with an API to swap.

## 3. Why adopting PrimeReact's pattern is the wrong direction

**3.1 — The adaptation cost is asymmetric.** Making PrimeReact conform to the platform
contract is one line per component:

```tsx
// PrimeReact conforming to the platform contract
<Dropdown value={id} optionValue="id" options={factions} optionLabel="name"
          onChange={(e) => onFactionChange(e.value ?? null)} />

<Dialog visible={open} onHide={onClose} dismissableMask>{children}</Dialog>

<InputNumber value={value} min={min} max={max} showButtons
             onValueChange={(e) => onChange(e.value ?? min)} />
```

Making the platform conform to PrimeReact means rewriting every callsite in every app to
unwrap `e.value`, rename props, and handle option-object values — and if the migration to
PrimeReact then proceeds (which the widget-lab captions anticipate), the retrofitted
hand-rolled internals get deleted anyway. The work is wasted in both the migrate and
don't-migrate scenarios.

**3.2 — It inverts the dependency Rule 8 exists to prevent.** If app code is written against
PrimeReact's event shapes, the apps are coupled to PrimeReact, and "interchangeable" narrows
to "interchangeable with PrimeReact clones." If app code is written against a stable platform
contract exported from `packages/ui`, the *implementation* becomes the interchangeable part:
hand-rolled today, PrimeReact tomorrow, a different library later — with zero app churn.
That is the skinnable-UI rule applied to widgets.

**3.3 — The platform contract is better for this stack.** Direct typed-value callbacks
(`onChange(value: number)`, `onFactionChange(id | null)`) feed tRPC mutation inputs and
Zustand setters without an unwrap step, and they typecheck end-to-end without importing
PrimeReact event types into app code. `e.value` buys nothing here — it is a library idiom,
not a standard.

**3.4 — The imperative singletons are new patterns either way.** The platform has no toast
and no confirm service, so PrimeReact's `confirmDialog()` / `toast.show()` idioms don't
conflict with anything — but they should still be wrapped (`useToast()` hook, `confirm()`
function in `packages/ui`) so app code never plumbs PrimeReact refs.

## 4. The real gap the lab exposed

The comparison's most actionable finding is not about event shapes — it is that the platform's
widget layer barely exists as a shared layer, which is a standing Rule 2 (shared UI
components) violation:

- `Overlay`, `VpStepper`, and `FactionDetachmentPicker` are app-local, not in `packages/ui`.
- Selects, tabs, tables, chips, and confirms are copy-pasted inline JSX in 5–6 apps each.
- There is no notification surface at all; every mutation reinvents (or skips) user feedback.
- The hand-rolled patterns have real functional deficits PrimeReact fixes for free: no focus
  trap / ESC / ARIA on Overlay, no typeahead on 30-option selects, no sort/filter/pagination
  on 100-row tables, no keyboard support on steppers.

Until the shared components exist, interchangeability is moot — there is no seam to swap at.

## 5. Recommendation

**Now:** no changes to the existing tools' communication patterns. `VpStepper`'s and
`FactionDetachmentPicker`'s contracts are correct as-is; the widget-lab captions agree
("VpStepper — its API is fine, just swap internals").

**If/when the PrimeReact migration is approved,** build the seam in `packages/ui` with the
platform contract on the outside and PrimeReact on the inside:

| `packages/ui` wrapper | Platform contract (outside) | Wraps (inside) |
|---|---|---|
| `Select` | `value: string \| null`, `onChange(id \| null)`, `options: {id, name}[]` | `Dropdown` with `optionValue="id"`, `filter`, `showClear` |
| `MultiSelect` | `value: string[]`, `onChange(ids)` | `MultiSelect` with `optionValue="id"`, `display="chip"` |
| `Modal` | `open`, `onClose`, `children` (Overlay's API, renamed) | `Dialog` with `visible`/`onHide`/`dismissableMask` |
| `confirm()` | plain async/callback function — no per-component state | `ConfirmDialog` singleton mounted once in `renderApp` |
| `useToast()` | hook returning `{ success, info, warn, error }` | one global `Toast` mounted once in `renderApp` |
| `Stepper` | `VpStepper`'s exact API (`label`, `value`, `onChange(n)`, `min`, `max`) | `InputNumber` with `showButtons` |
| `Tabs` | `active: string`, `onChange(key)`, keyed panels | `TabView` with index↔key mapping |

**Accepted exception — DataTable.** Its declarative `<Column>` children API is load-bearing
(sorting, filtering, body templates, pagination live on it), and abstracting it behind a
column-config prop would rebuild half the library to preserve a seam we may never use.
Re-export `DataTable`/`Column` from `packages/ui` so imports stay platform-scoped, and accept
the PrimeReact API at callsites.

**Worth doing regardless of the PrimeReact decision:** promote `Overlay`, `VpStepper`, and
`FactionDetachmentPicker` from their apps into `packages/ui`, and replace the inline
select/tabs/table/confirm JSX with the shared components. That closes the Rule 2 gap and
creates the seam that makes any future widget-library decision a `packages/ui`-internal
change.

## 6. Theming note

If the wrappers land, `lara-dark-amber` is the chosen PrimeReact theme (evaluated in
widget-lab; primary highlight ≈ `amber-300`, in-family with the platform's `amber-400`
accent from `packages/ui/tailwind-preset.ts`). Theme CSS imports would move from
widget-lab's `index.css` into the shared layer so apps don't each import PrimeReact
resources.
