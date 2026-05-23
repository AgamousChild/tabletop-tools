# apps/admin/client/src/pages/ScraperPage.tsx

> BCP scraper dashboard — status, history, trigger button.

## Prompt

Show scraper status from `trpc.stats.bcpScraperStatus.useQuery()` and job history from `trpc.stats.bcpScraperHistory.useQuery()`. Display: latest job status, events found/scraped, pairings/lists scraped, errors. "Trigger Scrape" button calls `trpc.stats.triggerBcpScrape.useMutation()`. Job history table with status, timestamps, counts.
