# PLAN.md — Tabletop Tools Platform

> Work top to bottom. Do not skip phases.
> Every step follows TDD: write the test first, then the code.
> See CLAUDE.md for architecture decisions. See SOUL.md for the why.
> Each app has its own PLAN.md for app-specific phases.

---

## Phase 0: Platform Scaffold ✅ complete

Monorepo structure, shared packages, and the no-cheat app scaffold.

```
tabletop-tools/
  packages/
    ui/             ← shared components, dark theme, Geist, shadcn
    auth/           ← shared Better Auth — one login across all tools
    db/             ← shared Turso schema and Drizzle client
    game-content/   ← GameContentAdapter boundary (zero GW content)
  apps/
    no-cheat/       ← first app
```

**Exit criteria met:** Monorepo runs. Shared packages build. `pnpm test` passes across all packages.

---

## Phase 1: no-cheat — First App

The founding app. Validates the full platform stack end-to-end before any other app is built.

See `apps/no-cheat/PLAN.md` for the full phase breakdown.

**Exit criteria:** no-cheat is live, accessible by URL, and works on an iPhone.

---

## Future Apps

Each app is planned and built independently after the previous one ships.
Order is not yet fixed — priority depends on what's most useful.

| App | Dir | Plan |
|---|---|---|
| versus | `apps/versus` | `apps/versus/PLAN.md` |
| list-builder | `apps/list-builder` | `apps/list-builder/PLAN.md` |
| game-tracker | `apps/game-tracker` | `apps/game-tracker/PLAN.md` |
| tournament | `apps/tournament` | `apps/tournament/PLAN.md` |
| new-meta | `apps/new-meta` | `apps/new-meta/PLAN.md` |
