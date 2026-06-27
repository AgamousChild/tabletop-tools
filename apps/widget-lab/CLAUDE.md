# CLAUDE.md — widget-lab

> Read the root CLAUDE.md for platform-wide conventions.

---

## What This App Is

`widget-lab` is a **local-only Vite SPA** for evaluating PrimeReact widgets side-by-side
against the patterns the platform currently hand-rolls. One PR landed it; it ships nothing
to production.

Use it to *see* what a Dropdown, DataTable, Dialog, Toast, TabView, InputNumber, Slider, or
Chip would look like rendered next to the corresponding inlined-from-real-code "current
pattern" — driven by the same fixture state on both sides — so migration calls aren't
made from screenshots in a README.

**No gateway integration. No Pages Functions. No Cloudflare config. Not in the prod nav.**

---

## Run

```bash
pnpm install              # if not already
pnpm -F widget-lab-client dev
```

Then visit the printed `localhost` URL (Vite default 5173 if free).

Hash routes (six pages):

```
#/select       Searchable Select / Combobox
#/datatable    DataTable (sort + filter + paginate)
#/dialog       Dialog + Confirm
#/toast        Toast / Messages
#/tabs         Tabs / SegmentedControl
#/number       InputNumber + Slider + Chip
```

---

## Structure

```
apps/widget-lab/
  client/
    src/
      App.tsx                  hash router + sidebar
      main.tsx                 entry, PrimeReactProvider wraps App
      index.css                tailwind + lara-dark-amber theme imports
      lib/
        Compare.tsx            two-column layout used by every page
        fixtures.ts            30 factions / 100 units / 20 players (synthetic)
      pages/
        SelectPage.tsx
        DataTablePage.tsx
        DialogPage.tsx
        ToastPage.tsx
        TabsPage.tsx
        NumberPage.tsx
    tailwind.config.ts         extends packages/ui/tailwind-preset
    vite.config.ts             local-only dev server, no proxy
    package.json
    tsconfig.json
    index.html
```

---

## "Current pattern" rules

The left column of every page is inlined **verbatim** (or as close as possible) from real
files in the repo. The lab does NOT import from those apps — that would defeat the point.
Each inlined snippet has a comment pointing at the source file + line so the call is
auditable.

---

## Theme choice

`lara-dark-amber` because the platform accent is `amber-400` (`#fbbf24`) — see
`packages/ui/tailwind-preset.ts`. Lara dark amber's primary highlight comes in around
`amber-300` (`#FCD34D`) so it stays in-family with everything else. `aura-dark-amber` was
the runner-up but its surface palette is grayer and clashed with `slate-950`.

Imported in `src/index.css`:

```css
@import 'primereact/resources/themes/lara-dark-amber/theme.css';
@import 'primeicons/primeicons.css';
```

---

## Testing

There are no tests. This is a throwaway eval app; writing component tests for it would be
overkill. `pnpm -F widget-lab-client test` runs `vitest run --passWithNoTests` so the
workspace `pnpm -r test` doesn't fail.

---

## What this app is NOT

- Not a design system. We have `packages/ui` for that.
- Not a runtime. Nothing here is imported by any other app.
- Not a marketing site. No SEO, no analytics, no SSR.
- Not deployed. No gateway entry. No Pages project. Local only.
