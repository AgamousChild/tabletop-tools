# apps/admin/client/src/pages/IngestPage.tsx

> Content ingestor dashboard — recent jobs, YouTube/web ingest triggers.

## Prompt

Show ingest jobs from `trpc.stats.ingestJobs.useQuery()`. Two trigger forms: YouTube URL input with optional source name → `trpc.stats.triggerYoutubeIngest.useMutation()`, and web article URL input → `trpc.stats.triggerWebIngest.useMutation()`. Job table: URL, source type, source name, status, nodes extracted, created date.
