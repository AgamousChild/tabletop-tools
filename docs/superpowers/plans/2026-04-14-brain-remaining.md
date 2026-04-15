# Brain PDF Pipeline + Combo Viz + Mobile + Detachment Page — Implementation Plan (Plan 3 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the remaining card UI features: PDF page images for core rules, combo visualization with arrows between cards, responsive mobile layouts, and the detachment full-page view.

**Architecture:** PDF pages are pre-rendered as PNGs by gw-sync and served from R2. Combo visualization renders two cards side-by-side with a connector arrow. Mobile layouts use responsive Tailwind breakpoints. The detachment page is a full-screen view with embedded stratagem and enhancement cards.

**Tech Stack:** React, Tailwind CSS, Vitest, Node.js (pdf-to-img for PDF rendering)

**Spec:** `docs/superpowers/specs/2026-04-14-brain-card-ui-design.md`
**Depends on:** Plan 1 (card components), Plan 2 (linked answers)

**Test commands:**
- Client: `cd apps/brain/client && pnpm test`
- Server: `cd apps/brain/server && pnpm test`

---

## File Map

### Create

| File | Responsibility |
|---|---|
| `apps/brain/client/src/components/cards/PdfPageView.tsx` | Renders a PDF page image with text-search highlight overlay |
| `apps/brain/client/src/components/cards/PdfPageView.test.tsx` | Tests |
| `apps/brain/client/src/components/cards/ComboView.tsx` | Two cards side-by-side with red arrow connector |
| `apps/brain/client/src/components/cards/ComboView.test.tsx` | Tests |
| `apps/brain/client/src/pages/DetachmentPage.tsx` | Full-page detachment view with embedded cards |
| `apps/brain/client/src/pages/DetachmentPage.test.tsx` | Tests |

### Modify

| File | Change |
|---|---|
| All card components in `cards/` | Add responsive Tailwind classes for mobile |
| `apps/brain/client/src/components/Overlay.tsx` | Full-screen on mobile, bottom close button |
| `apps/brain/client/src/pages/BrainScreen.tsx` | Add detachment page routing, combo view in ask answers |
| `apps/brain/server/src/worker.ts` | Serve PDF page image URLs, combo data in ask responses |

### External

| Item | Action |
|---|---|
| gw-sync PDF→PNG pipeline | Add script to convert PDF pages to PNG, upload to R2 |

---

## Task 1: PDF page image generation pipeline

**Files:**
- Create: script in gw-sync or apps/brain/server to convert PDFs to PNGs

- [ ] **Step 1: Install pdf-to-img or similar**

Use `pdf-poppler` or `pdf-to-img` npm package to convert PDF pages to PNG files.

- [ ] **Step 2: Write conversion script**

Script reads all PDFs from `C:\R\sync-data\tools\gw-sync\.local\gw\pdfs\`, converts each page to a PNG at 2x resolution (300 DPI), saves to `.local/brain/pages/<pdf-name>/page-<N>.png`.

- [ ] **Step 3: Upload page images to R2**

Add page images to the upload-graph.ts pipeline — they upload alongside brain graph data.

- [ ] **Step 4: Add `/pages/:path` endpoint to worker**

Serve page images from R2, same pattern as `/data/:path`.

- [ ] **Step 5: Test with curl**

Verify a page image URL returns a PNG.

- [ ] **Step 6: Commit**

---

## Task 2: PdfPageView component

**Files:**
- Create: `apps/brain/client/src/components/cards/PdfPageView.tsx`
- Create: `apps/brain/client/src/components/cards/PdfPageView.test.tsx`

- [ ] **Step 1: Write tests**

Tests: renders image tag with correct src URL, shows highlight overlay, has prominent close button, on small screens zooms to highlight area.

- [ ] **Step 2: Implement PdfPageView**

Renders `<img>` of the PDF page PNG. Overlays a semi-transparent colored div at the approximate position of the highlighted text. Prominent close button below the image — large, floating, not obscuring content. On mobile: container scrolls horizontally if needed, auto-scrolls to highlight position.

The highlight position is approximate — derived from the node's position in the parsed markdown source (which section of the page it came from). This is good enough for reference, not pixel-perfect.

- [ ] **Step 3: Run tests — verify pass**
- [ ] **Step 4: Commit**

---

## Task 3: Combo visualization

**Files:**
- Create: `apps/brain/client/src/components/cards/ComboView.tsx`
- Create: `apps/brain/client/src/components/cards/ComboView.test.tsx`

- [ ] **Step 1: Write tests**

Tests: renders two cards side-by-side, shows red arrow between them, arrow has label text, both cards are clickable (same onContentClick behavior), on mobile cards stack vertically with arrow between.

- [ ] **Step 2: Implement ComboView**

Takes two CardData + a label string. Renders them side-by-side with a red SVG arrow/connector between them pointing from the highlighted element on card 1 to the highlighted element on card 2. Label on the arrow (e.g., "wound re-rolls + devastating wounds on torrent weapons").

- [ ] **Step 3: Run tests — verify pass**
- [ ] **Step 4: Commit**

---

## Task 4: Mobile responsive layouts

**Files:**
- Modify: all card components, Overlay

- [ ] **Step 1: UnitCard responsive**

- Stat line: wraps to 2 rows on `sm:` screens
- Weapon tables: horizontal scroll or stacked columns
- Two-column body becomes single column on mobile

- [ ] **Step 2: Overlay responsive**

- Full-screen on mobile (`sm:` breakpoint)
- Close button: fixed at bottom of screen on mobile, large tap target (48px)

- [ ] **Step 3: All cards responsive**

- Stratagem, Enhancement, RuleCard: reduce font sizes, padding on mobile
- Touch targets: minimum 44px on all clickable elements

- [ ] **Step 4: Test on mobile viewport**

Use browser dev tools responsive mode. All cards should be readable at 375px width.

- [ ] **Step 5: Commit**

---

## Task 5: Detachment Page

**Files:**
- Create: `apps/brain/client/src/pages/DetachmentPage.tsx`
- Create: `apps/brain/client/src/pages/DetachmentPage.test.tsx`
- Modify: `apps/brain/client/src/pages/BrainScreen.tsx`

- [ ] **Step 1: Write tests**

Tests: renders detachment name as header, shows chapter restriction badge, renders detachment ability as RuleCard, renders all stratagems as StratagemCards in grid, renders all enhancements as EnhancementCards in grid, clicking any card content navigates away (closes detachment page, re-queries brain).

- [ ] **Step 2: Implement DetachmentPage**

Full-page view (replaces the main content area, not an overlay):
- Header with detachment name, faction color
- Chapter restriction badge if applicable
- Detachment ability rendered as a RuleCard
- Stratagems section: 2-column grid of StratagemCards
- Enhancements section: 2-column grid of EnhancementCards
- Back button returns to previous view
- Every card's onContentClick closes the detachment page and re-queries the brain

- [ ] **Step 3: Wire into BrainScreen**

Add a `detachmentView` state. When a detachment name is clicked in Browse or search results, show the DetachmentPage instead of the normal tab content.

- [ ] **Step 4: Run all tests**
- [ ] **Step 5: Commit**

---

## Task 6: Full integration

- [ ] **Step 1: Run all client + server tests**
- [ ] **Step 2: Build and deploy**
- [ ] **Step 3: Run E2E tests**
- [ ] **Step 4: Manual testing on mobile**
- [ ] **Step 5: Commit and update memory**

---

## Task Summary

| Task | Description | Dependencies |
|---|---|---|
| 1 | PDF page image pipeline | None (server/build) |
| 2 | PdfPageView component | 1 |
| 3 | Combo visualization | Plan 1 cards |
| 4 | Mobile responsive | Plan 1 cards |
| 5 | Detachment Page | Plan 1 cards, Plan 2 links |
| 6 | Integration | All |

Tasks 1, 3, 4 can start in parallel.
