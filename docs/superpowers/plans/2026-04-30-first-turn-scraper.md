# Fix First Turn Scraper (#27)

## Problem

scrape-first-turn.ts visits BCP game detail pages but detects 0 "First Turn" checkboxes. 3,700 pages visited, zero data captured.

## Root Cause

Not debugged yet. The checkbox exists on the page (confirmed via MCP Playwright snapshot: `checkbox "First Turn" [checked] [disabled]`). The scraper's `page.getByRole('checkbox', { name: 'First Turn' })` returns 0 matches when run from the background script.

Possible causes:
1. **Page not fully rendered** — React hasn't hydrated by the time we check. `waitForSelector('text=First Turn')` was added but may not be enough.
2. **Auth required** — game detail pages may require BCP login. The persistent browser context may have stale cookies. If root cause is auth expiry, re-run with fresh persistent browser context login.
3. **Different DOM in headless vs headed** — BCP may serve different markup to automated browsers.

## Plan

### Step 1: Debug on ONE page interactively

Micah runs `! npx tsx` with a minimal test script that:
1. Opens the persistent browser context (headed, not headless)
2. Navigates to one known game URL
3. Waits for "First Turn" text
4. Counts checkboxes via getByRole
5. Prints the result
6. If 0, takes a screenshot and dumps the page HTML for inspection

Do NOT proceed to step 2 until step 1 returns data for one page.

### Step 2: Verify on 5 more pages

Run the same script on 5 different game URLs from different events. Confirm consistent detection.

### Step 3: Scale to full scrape

Only after step 2 passes. Resume from first-turn-progress.json: retry only entries with status `'unknown'` — do NOT discard cached data that already succeeded. If root cause was auth expiry, re-run with a fresh persistent browser context login before resuming.

### Step 4: Add first_turn column to meta_pairings

```sql
ALTER TABLE meta_pairings ADD COLUMN first_turn TEXT; -- 'p1' / 'p2' / null
```

Schema migration 0005 needed. Update the CREATE TABLE SQL in all 8 test files per CLAUDE.md conventions.

### Step 5: Import first turn data and rebuild cube

Load first-turn-progress.json, match by event_id + player names, update meta_pairings.first_turn. Add first_turn to fact_game_results. Rebuild meta_top with first-turn win rate stats.

Update CREATE TABLE SQL in all 8 test files after schema change.

## Estimated effort

Step 1-2: 30 min (requires Micah interactive)
Step 3: Hours (automated, ~75K pages)
Step 4-5: 1 hour

## Blocker

Step 1 requires Micah to run the browser interactively. Cannot be automated in background.
