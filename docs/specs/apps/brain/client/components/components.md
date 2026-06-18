# apps/brain/client/src/components/ — UI Components

## Components

### NodeCard.tsx
Simple IndexedDB BrainNode display. Layer badge (colored by LAYER_COLORS), category, phase, title, summary, content, sources list.

### ResultCard.tsx
Search result wrapper: index rank + title + layer/category badges + score percentage + faction/subfaction/phase metadata. Summary truncated to 2 lines.

### ForceGraph.tsx
Force-directed graph visualization. Semantic search → node + edge data. Focus node at center, radial layout by category. BFS depth map. Filter by category/edition. Double-click to refocus. Detail panel shows selected node.

### LayerNav.tsx
Sidebar navigation for browse layer selection. 6 layers: core, faction, unit, errata, balance, community. Highlight on selected.

### LinkedText.tsx
Render text segments with clickable entity links. Uses entity-linker output. Linked segments → amber clickable buttons. `onEntityClick(text, type, nodeId)`.

### FactionBanner.tsx
Dismissible banner showing detected faction filter. "Filtered to {FACTION}" with dismiss button.

### Overlay.tsx
Full-screen modal backdrop + centered container. Backdrop click dismisses. Responsive max-width.

### Pagination.tsx
Prev/next buttons + page count. Hidden if totalPages ≤ 1.

### RefList.tsx
Display StoredRef connections with relation type + context. Colors by rel type.

### CollapsibleSection.tsx
Collapsible container with count badge. Returns null if count is 0. Rotates chevron on toggle.
