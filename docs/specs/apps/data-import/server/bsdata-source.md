# apps/data-import/server/src/lib/sources/bsdata.ts

> Fetches BSData catalog XML files from GitHub and parses into unit profiles.

## Prompt

BSData is a community-maintained repository of game data in XML format. This module fetches the latest catalog files from the GitHub API, parses each with the shared `parseBSDataXml()` parser, and returns a flat array of unit profiles.

**`fetchAndProcessBSData(previousCommitSha?, repo?, branch?, githubToken?): Promise<BSDataResult>`**:
1. Fetch latest commit SHA from `GET /repos/{repo}/commits/{branch}`. If it matches `previousCommitSha`, return `{ skipped: true }`.
2. Fetch the full file tree from `GET /repos/{repo}/git/trees/{sha}?recursive=1`. Filter to `.cat` files only.
3. For each catalog file: derive faction name from filename (strip `.cat` extension and path prefix, then `normalizeFactionName()` which removes "Imperium - " and "Chaos - " prefixes). Fetch raw XML from `raw.githubusercontent.com`. Parse with `parseBSDataXml(xml, faction)`. Accumulate units and parse errors.
4. Log warning count if any parse errors. Return all units with commit SHA.

GitHub API headers include `User-Agent: tabletop-tools` and optional `Authorization: token {githubToken}` for rate limit.

## Dependencies

- `@tabletop-tools/game-content/src/adapters/bsdata/parser` — `parseBSDataXml`
- `@tabletop-tools/game-content/src/types` — `UnitProfile`

## Contracts

- Default repo: `BSData/wh40k-10e`, default branch: `main`
- Returns `BSDataResult`: `{ skipped: boolean, commitSha: string, units: UnitProfile[] }`
- Parse errors are accumulated but don't fail the overall fetch — partial results are returned
- Import from game-content uses deep path (NOT barrel export) to avoid Node fs in Worker
