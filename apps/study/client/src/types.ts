export interface SlideBlock {
  text: string
  topPct: number
  heightPct: number
  leftPct: number
  widthPct: number
}

export interface Slide {
  deckId: string
  slideNum: number
  title: string
  body: string
  imageUrl: string
  blocks: SlideBlock[]
}

export interface Deck {
  id: string
  name: string
  slides: Slide[]
}

export interface SlidesManifest {
  builtAt: string
  decks: Deck[]
}

export interface SearchResult {
  deckId: string
  deckName: string
  slideNum: number
  slideTitle: string
  imageUrl: string
  matchedBlock: SlideBlock
  snippet: string
  score: number
}
