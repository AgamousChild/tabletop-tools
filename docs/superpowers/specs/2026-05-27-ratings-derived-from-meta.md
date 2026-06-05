# Ratings — a Derived Layer on Meta (drop the standalone rating tables)

> Status: **Decision — for Micah's review.**
> Companion to `2026-05-27-tournament-bcp-data-design.md` (source ≠ meta) and the meta analytics model.

---

## 0. Finding

Ratings are not a separate data set — they're **a computation over the meta data**, and right now they don't exist at all. Verified against the live Turso DB (2026-05-27):

| table | rows |
|---|---|
| `player_glicko` | 0 |
| `glicko_history` | 0 |
| `player_elo` | 0 |
| `elo_history` | 0 |
| `meta_event_players` **with a `gl2_rating_end`** | **0 / 30,485** |

The meta schema already has the **right home** for ratings:
- `meta_event_players` → `gl2_rating_start/end`, `gl2_rd_start/end`, `gl2_vol_start/end` (per player, per event).
- `meta_pairings` → `player1_gl2`, `player2_gl2` (the rating at each game).

The Glicko-2 run has simply never been executed against the 75k scraped pairings, so every `gl2_*` is NULL.

---

## 1. Decision

**Ratings are a derived layer over meta. The four standalone rating tables are dropped.**

- **Glicko-2** is computed across `meta_pairings` (chronological, per rating period) and written **into meta**: the per-event snapshot lands in `meta_event_players.gl2_*`, and each game's rating in `meta_pairings.player*_gl2`.
- A player's **current rating** is simply their latest `gl2_rating_end` (ordered by event date). No separate "running rating" table needed.
- **Anonymous players** are already handled: `meta_event_players` keys players by name within an event (no user FK required), which is exactly what the Glicko run needs — `player_glicko`'s nullable `user_id` was solving a problem meta already solves.

### Dropped tables

| table | why |
|---|---|
| `player_elo`, `elo_history` | **Legacy** tournament-app ELO — already being torn out (the ELO UI was removed). Superseded by Glicko-2 in meta. |
| `player_glicko`, `glicko_history` | A parallel store for a "running" rating that is just a rollup of the per-event `gl2_*` already in meta. |

(`unit_ratings` is unrelated — it rates *units*, not players, and stays.)

---

## 2. How it works (the derived layer)

```
meta_pairings  (chronological, per rating period)
      |  Glicko-2 update
      v
meta_event_players.gl2_rating/rd/vol (start, end)   -- per player, per event
meta_pairings.player1_gl2 / player2_gl2             -- per game
      |
      v
current rating = latest gl2_rating_end per player (by event date)
```

- The compute step is part of the **meta pipeline** (alongside the cube build), run when new events land — idempotent: recomputing replays the pairings and overwrites the `gl2_*` snapshots.
- A **leaderboard** reads the latest `gl2_rating_end` per player. If that ever needs to be fast at scale, materialize it as a thin view/rollup off meta — but that's YAGNI for a personal build; derive it.

---

## 3. What changes

- **Drop** `player_elo`, `elo_history`, `player_glicko`, `glicko_history` (all empty — no data migration).
- **Remove** the ELO rating code paths (in progress) and any `player_glicko`/`glicko_history` reads/writes.
- **Add** the Glicko-2 compute step to the meta pipeline, writing `gl2_*` into `meta_event_players` + `meta_pairings`.
- Leaderboard / "my rating" reads derive from `meta_event_players.gl2_rating_end`.

This is the same principle as the tournament spec: ratings aren't their own data set, they're **meta, computed** — one source, no parallel store.

---

## 4. Test plan

- Glicko-2 run over a known set of `meta_pairings` populates `gl2_*` on the involved `meta_event_players` (no longer 0/30,485) and `player*_gl2` on the pairings.
- Current rating = the latest `gl2_rating_end` for a player by event date.
- Idempotency: rerunning the compute reproduces identical `gl2_*` (replays pairings, overwrites snapshots — no drift, no duplicate history).
- Anonymous (non-user) players get rated the same as registered ones.
