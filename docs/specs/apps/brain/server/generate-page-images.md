# apps/brain/server/src/generate-page-images.ts

> CLI script — convert PDF pages to PNG images at 3x scale for serving via /pages endpoint.

## Prompt

Discovers PDFs in gw-sync + Chapter Approved directories, skips large print-and-play spreads, converts each page via pdf-to-img library to `.local/brain/pages/{pdfname}/page-{N}.png`. Optional `--upload` flag pushes to R2 via wrangler.
