# widget-lab — design census

> W2 Phase A census. Grounded by a read-only agent sweep 2026-07-06; claims
> cite file:line as read that day.

## Purpose

Local-only Vite SPA for side-by-side visual evaluation of PrimeReact widgets
against the platform's hand-rolled "current pattern" equivalents, to inform
migration decisions (`CLAUDE.md:7-18`). Landed in one PR (`e99e380`, #39).

## Architecture

- Workspace member is `client/` only (no app-root package.json). Entry
  `main.tsx:1-18` (PrimeReactProvider); hand-rolled hash router
  (`App.tsx:10-54`), 6 pages: select, datatable, dialog, toast, tabs,
  number.
- `lib/Compare.tsx:23-52` — two-column "Current pattern vs PrimeReact"
  layout with `Caption` (swap/keep/notes) documenting the migration call per
  widget.
- Pages inline the current patterns **copied** from real app files with
  source comments (by design — importing them "would defeat the point",
  CLAUDE.md:75-76).
- Theme `lara-dark-amber` (`index.css:13-14`), rationale documented.

## Data model

No DB/API/store. Pure synthetic fixtures (`lib/fixtures.ts`: 30 factions,
100 units, 20 players, derived FactionStat[]), header explicitly honest
about being demo data, not GW content. Appropriate for a lab.

## API surface

None — no server, no fetch/tRPC anywhere (deps: primereact, react,
@tabletop-tools/ui only).

## Deploy

Local-only by design and by absence of config — no wrangler/Pages anywhere;
CLAUDE.md:18,110 and vite.config.ts:5-6 agree.

## Shared-package usage

`@tabletop-tools/ui` used **only for the Tailwind preset**
(`tailwind.config.ts:1,5`); zero component imports. **Rule 2 graduation
flow: no evidence any evaluated widget has graduated into packages/ui** —
zero outbound consumers; the lab is decision-support only.

## CLAUDE.md drift

**None found.** Routes, theme, no-tests claim, tailwind preset, and file
structure all match code exactly — the only fully drift-free CLAUDE.md in
the W2 census.

## Health signals

No tests (intentional, `--passWithNoTests`); no TODO/FIXME; no dead code;
build artifacts correctly gitignored.

## Candidate design decision points

1. **Graduation workflow undefined** — nothing turns a "swap" verdict into
   a packages/ui component + migration PRs; formalize a decision log
   (Caption half-does it) or per-widget tracked checklist.
2. **Storybook/Ladle vs bespoke lab** — the app reimplements routing/nav/
   compare layout; standard tooling vs tight-fixture simplicity.
3. **Theme validation methodology** — lara vs aura decided by eyeballing hex
   values, not side-by-side rendering; add a theme switcher (that's the
   lab's whole purpose)?
4. **Fixture realism ceiling** — synthetic modulo-generated data may
   understate DataTable edge cases (long names, nulls, skew); seeded
   anonymized snapshot vs the explicit anti-goal of touching real data.
