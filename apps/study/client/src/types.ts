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

export interface PracticeExamOption {
  letter: string
  text: string
}

export interface PracticeExamHighlight {
  leftPct: number
  topPct: number
  widthPct: number
  heightPct: number
}

export interface PracticeExamSource {
  deckId: string
  slideNum: number
  /** Present only when the quote could be matched to a real positions block.
   * When absent, the popup shows the slide + quote without an overlay box. */
  highlight?: PracticeExamHighlight
  quote: string
}

export interface PracticeExamExternal {
  url: string
  quote?: string
}

export interface PracticeExamQuestion {
  n: number
  text: string
  options: PracticeExamOption[]
  selected: string | null
  correctAnswer: string | null
  correct: boolean | null
  source: PracticeExamSource | null
  external: PracticeExamExternal | null
  /** Path to the cropped question figure (e.g. brain scan), when the exam
   * question references an image. Relative to the SPA base. */
  questionImage?: string
}

export interface PracticeExam {
  gradedAt: string
  corpusSlideCount: number
  questions: PracticeExamQuestion[]
  stats?: {
    inCorpus: number
    external: number
    ungraded: number
    correct: number
    wrong: number
  }
  /** deckId → slide count. Powers popup source-slide prev/next bounds. */
  deckSlideCounts?: Record<string, number>
}

export type GradeStamp = 'correct' | 'wrong' | 'ungraded'

export function gradeStamp(q: PracticeExamQuestion): GradeStamp {
  if (q.correct === true) return 'correct'
  if (q.correct === false) return 'wrong'
  return 'ungraded'
}
