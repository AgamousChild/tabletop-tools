# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: brain.spec.ts >> Brain — API endpoints >> /search returns detected factions and results
- Location: specs\brain.spec.ts:229:7

# Error details

```
Error: apiRequestContext.post: connect ECONNREFUSED ::1:5173
Call log:
  - → POST http://localhost:5173/brain/api/search
    - user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.7727.15 Safari/537.36
    - accept: */*
    - accept-encoding: gzip,deflate,br
    - content-type: application/json
    - content-length: 36

```