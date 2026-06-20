import MiniSearch from 'minisearch'

import type { SearchResult, SlidesManifest } from '@/types'

interface IndexedSlide {
  id: string
  meetingId: string
  meetingName: string
  slideNum: number
  startSec: number
  endSec: number
  text: string
  imageUrl: string
}

export interface SearchEngine {
  search(query: string, limit?: number): SearchResult[]
}

export function buildSearchEngine(manifest: SlidesManifest): SearchEngine {
  const docs: IndexedSlide[] = []
  for (const m of manifest.meetings) {
    for (const s of m.slides) {
      docs.push({
        id: `${m.id}:${s.slideNum}`,
        meetingId: m.id,
        meetingName: m.name,
        slideNum: s.slideNum,
        startSec: s.startSec,
        endSec: s.endSec,
        text: s.text,
        imageUrl: s.imageUrl,
      })
    }
  }

  const ms = new MiniSearch<IndexedSlide>({
    fields: ['text'],
    storeFields: ['meetingId', 'meetingName', 'slideNum', 'startSec', 'endSec', 'text', 'imageUrl'],
    searchOptions: { fuzzy: 0.2, prefix: true },
  })
  ms.addAll(docs)

  return {
    search(query: string, limit = 50) {
      if (!query.trim()) return []
      const hits = ms.search(query)
      return hits.slice(0, limit).map((h) => ({
        meetingId: h.meetingId as string,
        meetingName: h.meetingName as string,
        slideNum: h.slideNum as number,
        startSec: h.startSec as number,
        endSec: h.endSec as number,
        text: h.text as string,
        imageUrl: h.imageUrl as string,
        score: h.score,
      }))
    },
  }
}

export function fmtTs(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}
