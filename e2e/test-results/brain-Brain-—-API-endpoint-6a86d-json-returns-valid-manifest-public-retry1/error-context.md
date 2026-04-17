# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: brain.spec.ts >> Brain — API endpoints >> /manifest.json returns valid manifest
- Location: specs\brain.spec.ts:389:7

# Error details

```
Error: apiRequestContext.get: connect ECONNREFUSED ::1:5173
Call log:
  - → GET http://localhost:5173/brain/api/manifest.json
    - user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.7727.15 Safari/537.36
    - accept: */*
    - accept-encoding: gzip,deflate,br

```