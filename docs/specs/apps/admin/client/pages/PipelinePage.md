# apps/admin/client/src/pages/PipelinePage.tsx

> Meta analytics pipeline status — 3NF counts, cube status, dimension counts.

## Prompt

Show pipeline health from `trpc.stats.pipeline.useQuery()`. Three sections: Meta 3NF (events, players, pairings, lists coverage, detachment coverage, date range), Cube (fact rows, frames, meta_top rows, cube status, last completed), Dimensions (faction count, detachment count). Also show match results from `trpc.stats.matchResults.useQuery()` and list parser status from `trpc.stats.listParserStatus.useQuery()`.
