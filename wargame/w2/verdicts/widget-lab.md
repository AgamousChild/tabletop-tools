# widget-lab — W2 Phase C verdict

> Grounded in `wargame/w2/apps/widget-lab.md` (census), `wargame/w2/decisions/D2-08-doc-drift-strategy.md`
> (widget-lab as positive exhibit), and a direct read of `apps/widget-lab/CLAUDE.md`,
> `client/src/lib/Compare.tsx`, and all six `client/src/pages/*.tsx` files, 2026-07-06.

## 1. Verdict

**Keep, as-is, no structural changes.** A healthy, correctly-scoped eval lab:
zero drift, zero dead code, zero dependents to break, and it has already
produced the artifact it exists to produce — six pages of `swap`/`keep`
verdicts covering every widget class in scope (Select, DataTable, Dialog,
Toast, Tabs, Number/Slider/Chip). No decision here trades effort for
benefit; the honest options are "leave it running" and "archive it," both
cheap, neither urgent.

## 2. App-local decision points wargamed

### (a) Graduation workflow — "swap" verdict → `packages/ui` component + migration PRs

Nothing today connects a `Caption`'s `swap:` text to an actual migration —
census confirms "no evidence any evaluated widget has graduated into
`packages/ui`"; zero component imports from it (`tailwind.config.ts:1,5` is
preset-only).

- **Decision log** — one flat markdown table (widget → verdict → target
  apps → status) copying the six pages' existing `swap`/`keep` lines.
  Under an hour, no code touched.
- **Tracked checklist** — GitHub issues/TASKS.md, one item per swap target
  (~15+ across 6+ apps). Real ongoing overhead to open/triage/close.
- **Leave informal** — read the `Caption` in source when migrating. Zero
  setup, but only surfaces if someone remembers to look.

**Recommendation: decision log, fallback informal.** The `Caption`
component already is 90% of a decision log — it just isn't extracted to
one place a migration-planning session would check. Skip the tracked
checklist; there's no evidence of migration volume that needs
issue-tracker ceremony yet — that's solving a coordination problem the
platform doesn't have. If the log doesn't get maintained, falling back to
"read the source" costs only a one-time re-derivation of a verdict that's
already sitting in a page file. **Flip trigger:** a second wave of widget
evals starts before any prior `swap` verdict is acted on.

### (b) Whether the lab has served its purpose

Grounded check: all six pages carry concrete `swap`/`keep` captions naming
real target files (e.g. `DataTablePage.tsx:25` names new-meta's
`FactionTable`, tournament standings, admin user list, list-builder's
`MyLists`; `DialogPage.tsx:23` names brain's card detail views). Every
widget class in the original scope (`CLAUDE.md:13`) has a rendered
verdict — this is not a partial eval with open questions. The
PrimeReact-vs-hand-rolled evaluation is **effectively decided.**

- **Archive/park** — stop treating it as active-eval surface; its Caption
  verdicts become the decision record (per (a)). Code stays untouched
  (already zero-maintenance: no tests, minimal deps, no CI surface). This
  is an attention move, not a deletion.
- **Stay live** — keep it as the default staging ground for a future
  PrimeReact-vs-current comparison (e.g. `Calendar`, `TreeTable`, `Chart`).

**Recommendation: archive/park, with "stay live" as the standing
fallback.** The lab costs nothing to leave in place; "park" means stop
scheduling review passes and stop treating "add more widgets" as pending
work, not `git rm`. If a genuinely new eval need appears, the same
`Compare`/`Caption` scaffolding is an immediate restart, not a rebuild.
**Flip trigger:** a concrete new widget-vs-hand-rolled question is raised
for a component not already covered by the six pages.

### (c) Theme-switcher addition

Conditional on (b) — since (b)'s recommendation is archive/park, this does
**not** apply now. The census's concern is real (`CLAUDE.md:81-93` documents
the `lara-dark-amber` vs `aura-dark-amber` call by hex-value reasoning, not
rendered comparison), but a theme switcher is investment in the lab's
evaluation apparatus, which only pays off if the lab stays live. Descoped,
not deferred — only resurfaces if (b)'s flip trigger fires.

## 3. Cross-cutting obligations

None beyond serving as D2-08's positive exhibit — widget-lab needs no
changes to comply with the drift-strategy decision; it's already the
example the other 13 apps' docs should converge toward. What to copy from
`apps/widget-lab/CLAUDE.md`'s style, concretely:

- **States shape, not counts.** "Six pages," "30 factions / 100 units /
  20 players" are fixture-shape description in prose, never a load-bearing
  count code could silently invalidate — contrast `packages/db`'s "22
  tables" failure D2-08 documents.
- **A "What this app is NOT" section** (`CLAUDE.md:105-110`) pre-empts
  scope-creep questions and describes a boundary, not a fact about current
  state — so it doesn't go stale.
- **Names its own anti-pattern rationale inline** — "does NOT import...
  would defeat the point" (`CLAUDE.md:75-76`) explains a deliberate Rule-3
  looking exception before a future reader flags it as a bug.
- **Points at the deploy story instead of re-asserting it** — "No gateway
  integration... Not in the prod nav" is architectural, not a checklist of
  files that rot, unlike the five apps D2-08 found with phantom
  `[x]`-checked `wrangler.toml` claims.

## 4. Ordered work plan

1. Write the one-file decision log for (a): flat table of the six pages'
   `swap`/`keep` verdicts, target apps, status. No code changes.
2. Mark the lab "parked" per (b) — one line noting the PrimeReact eval is
   decided and the lab isn't queued for further rounds absent a new need.
3. Skip the theme switcher now — descoped per (c).
4. No CLAUDE.md edit for widget-lab itself; if D2-08's trim-policy sweep
   touches other apps' docs, cite widget-lab's CLAUDE.md as the reference
   example in that sweep's PR description.
