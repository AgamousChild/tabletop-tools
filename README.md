# Tabletop Tools

A monorepo of tools for tabletop miniature wargamers — people who sit around a table, roll
dice, and fight battles with painted armies.

Built for personal use first. Open source and self-hostable if useful to anyone else. No
formal support commitment.

## Apps

Each app deploys independently and does one thing.

| App | What it does |
|---|---|
| **no-cheat** | Analyzes photos or video of dice rolls and detects loaded dice using statistical analysis. All CV runs in-browser; no pixels leave the device. |
| **versus** | Pits two units against each other and computes expected wounds, models removed, and best/worst case. Save simulation history. |
| **list-builder** | Army list builder where every unit carries a live performance rating derived from real tournament data. Surfaces higher-rated alternatives at the same points cost. |
| **game-tracker** | Live game companion — round-by-round VP/CP/units-lost tracking with tournament integration and per-round photo evidence. |
| **tournament** | Full tournament management: Swiss pairings, live standings, ELO, TO tools (yellow/red cards, awards, list submission). |
| **new-meta** | Meta analytics with radical transparency — every tournament result, army list, and game record is public and downloadable. Includes Glicko-2 player ratings. |
| **brain** | Knowledge graph for 40K rules, units, and competitive strategy. Search, browse, and ask questions across community-sourced data. |

Supporting Workers (`auth-server`, `gateway`, `admin`, `data-import`, `bcp-scraper`,
`content-ingestor`) sit behind the user-facing apps. See `apps/<name>/CLAUDE.md` for each app's
architecture.

## Not affiliated with Games Workshop

Warhammer 40,000 and all related names, marks, artwork, and IP are trademarks of Games
Workshop Limited. **This repository ships zero GW content.** Unit profiles, weapon stats, and
faction data are loaded at runtime from operator-supplied community sources (BSData,
Wahapedia). See [`docs/DISCLAIMER.md`](docs/DISCLAIMER.md) for the full statement.

## Stack

- **TypeScript** front to back
- **React** on the client, **tRPC + Hono** on the server
- **Turso** (libSQL / SQLite) via **Drizzle** ORM
- **Better Auth** for shared login across apps
- **Cloudflare Workers + Pages** for deployment
- **pnpm workspaces**, **Vite**, **Vitest**

Details in [`CLAUDE.md`](CLAUDE.md).

## Getting started

```bash
pnpm install
```

Each app has its own dev server, wired through the `dev:*` scripts in the root `package.json`:

```bash
pnpm dev:no-cheat        # server on :3001
pnpm dev:versus          # server on :3002
pnpm dev:list-builder    # server on :3003
pnpm dev:game-tracker    # server on :3004
pnpm dev:tournament      # server on :3005
pnpm dev:admin
```

For apps without a `dev:*` shortcut, use `pnpm --filter <package> dev` directly (e.g.
`pnpm --filter new-meta-server dev`).

Local dev falls back to a SQLite file (`file:./dev.db`) and a placeholder auth secret —
production values live in Cloudflare Worker secrets. Apps that display unit data (versus,
list-builder, game-tracker) additionally need a local BSData clone; point `BSDATA_DIR` at
your copy or they fall back to a null adapter and show no units.

## Testing

```bash
pnpm test                   # every workspace package
pnpm -F <app>-server test   # one app's server tests
pnpm -F <app>-client test   # one app's client tests
```

TDD is the norm for logic, algorithms, and routers. Tests use in-memory SQLite; only external
APIs and system boundaries get mocked.

## Contributing / working with the code

This is a personal project on Micah's roadmap, but the code is MIT-licensed and self-hostable.
If you want to submit a PR, open an issue first to confirm the direction is welcome.

If you're using an AI coding assistant on this repo, read [`CLAUDE.md`](CLAUDE.md) (or
[`AGENTS.md`](AGENTS.md) for Codex CLI). They encode the project's rules, session-behavior
norms, and per-app conventions.

## License

MIT — see [`LICENSE`](LICENSE).
