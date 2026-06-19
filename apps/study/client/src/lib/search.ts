import MiniSearch from 'minisearch'

import type { SearchResult, SlideBlock, SlidesManifest } from '@/types'

interface IndexedBlock {
  id: string
  deckId: string
  deckName: string
  slideNum: number
  slideTitle: string
  imageUrl: string
  text: string
  block: SlideBlock
}

export interface SearchEngine {
  search(query: string, limit?: number): SearchResult[]
}

export function buildSearchEngine(manifest: SlidesManifest): SearchEngine {
  const docs: IndexedBlock[] = []
  for (const deck of manifest.decks) {
    for (const slide of deck.slides) {
      for (let i = 0; i < slide.blocks.length; i++) {
        const block = slide.blocks[i]!
        docs.push({
          id: `${deck.id}:${slide.slideNum}:${i}`,
          deckId: deck.id,
          deckName: deck.name,
          slideNum: slide.slideNum,
          slideTitle: slide.title,
          imageUrl: slide.imageUrl,
          text: block.text,
          block,
        })
      }
    }
  }

  const ms = new MiniSearch<IndexedBlock>({
    fields: ['text', 'slideTitle'],
    storeFields: ['deckId', 'deckName', 'slideNum', 'slideTitle', 'imageUrl', 'text', 'block'],
    searchOptions: {
      fuzzy: 0.2,
      prefix: true,
      boost: { slideTitle: 2 },
    },
  })
  ms.addAll(docs)

  return {
    search(query: string, limit = 50) {
      if (!query.trim()) return []
      const hits = ms.search(query)
      const results: SearchResult[] = []
      const seenBySlide = new Set<string>()
      for (const h of hits) {
        const key = `${h.deckId}:${h.slideNum}`
        if (seenBySlide.has(key)) continue
        seenBySlide.add(key)
        results.push({
          deckId: h.deckId as string,
          deckName: h.deckName as string,
          slideNum: h.slideNum as number,
          slideTitle: h.slideTitle as string,
          imageUrl: h.imageUrl as string,
          matchedBlock: h.block as SlideBlock,
          snippet: (h.text as string).slice(0, 180),
          score: h.score,
        })
        if (results.length >= limit) break
      }
      return results
    },
  }
}
