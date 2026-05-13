# Tournament BCP Integration (#43)

## Goal

TOs manage events from tabletop-tools while staying synced with BCP. Players register from either platform.

## Reality Check

BCP has no public API. All our data comes from scraping with a paid subscriber account. Bidirectional sync (push data TO BCP) is not feasible — BCP doesn't accept external writes.

## What's Actually Possible

### Read from BCP → tabletop-tools (one-way sync)

- Import event metadata (name, date, location, rounds)
- Import player registrations (roster)
- Import pairings after each round
- Import results/standings

### tabletop-tools → BCP (NOT possible)

- Can't create events on BCP
- Can't register players on BCP
- Can't push pairings to BCP
- Can't push results to BCP

## Revised Design

### "BCP Mirror" mode

TO creates their event on BCP as normal. On tabletop-tools, they link to the BCP event by pasting the URL. The tournament app then:

1. **Imports roster** from BCP (one-time or periodic refresh)
2. **Imports pairings** after each round (scrape or manual trigger)
3. **Imports results** after event completes
4. **Adds tabletop-tools features** on top: awards, stats, Glicko-2 tracking, meta export

Players see the event on both platforms. TO manages pairings on BCP (it's the standard), views enhanced analytics on tabletop-tools.

### Player registration

- Players register on BCP (industry standard, TOs won't change)
- tabletop-tools imports the roster
- Players can optionally link their tabletop-tools account to their BCP player entry by name
- Player linking: exact name match first, then manual override UI for mismatches. No fuzzy matching.
- Linked players get Glicko-2 tracking, game history, personal stats

### BCP Result Edits

Re-import overwrites — most recent scrape wins. No merge logic needed.

## Implementation

### Step 1: Link event UI

Tournament settings page gets "Link BCP Event" field. Paste BCP event URL. Extract event ID.

### Step 2: Import roster

Scrape BCP roster tab for the event. Create/update tournament_players entries.

### Step 3: Import pairings per round

After each round, TO clicks "Sync Round X from BCP". Scrapes pairings, creates round + pairing entries.

### Step 4: Auto-sync option

Optional: poll BCP event page every 15 minutes for new rounds. Requires the persistent browser context to be running.

Auto-sync requires pm2 or systemd to keep the browser context alive during events — manual trigger is the fallback if the daemon isn't running.

## Estimated effort

- Link event UI: 1 hour
- Roster import scraper: 2 hours
- Pairings import scraper: 2 hours (reuse scrape-pairings logic)
- Auto-sync polling: 3 hours
- Player account linking: 2 hours

## Needs

- Micah's BCP subscriber account for scraping (already have it)
- TO workflow review — does this match how TOs actually work?
- Decision: auto-sync or manual trigger per round?

## Risk

- BCP could change their DOM at any time, breaking scrapers
- BCP could block automated access
- Rate limiting during live events
