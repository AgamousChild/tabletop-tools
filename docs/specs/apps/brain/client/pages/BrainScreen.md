# apps/brain/client/src/pages/BrainScreen.tsx

> Main page orchestrator — tabs (Ask, Search, Browse, Graph) + card overlay system.

## Prompt

Manages tab state, open cards stack, active faction filters, detachment page navigation. Contains local AskTab/SearchTab/BrowseTab components inline.

**AskTab**: text input → `GET /ask?q=` → displays conversational answer + source cards. Handles loading/error states.

**SearchTab**: text input → `GET /search?q=&faction=` → paginated ResultCard list. Click opens card overlay via `buildCardFromNode()`.

**BrowseTab**: layer/faction/category filters → `GET /browse` → paginated node list.

**Graph tab**: renders ForceGraph component.

Card overlay: `Overlay` component wrapping typed card components. `buildCardFromNode()` routes node.category to the correct CardData builder. DetachmentPage opened for detachment cards (full-page view with stratagems/enhancements).

## Dependencies

All card components, Overlay, ResultCard, ForceGraph, LayerNav, FactionBanner, Pagination, card-data-builder, card-display, hooks, sync.
