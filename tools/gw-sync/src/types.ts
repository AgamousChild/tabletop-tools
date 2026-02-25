/** Categories of GW downloads */
export type DocCategory = 'core-rules' | 'faction-pack'

/** A discovered PDF download from the GW page */
export interface PdfEntry {
  title: string
  url: string
  category: DocCategory
}

/** Metadata for a single downloaded PDF */
export interface PdfMetadata {
  title: string
  url: string
  category: DocCategory
  sha256: string
  downloadedAt: string
  markdownFile: string
}

/** Persistent state file */
export interface SyncMetadata {
  lastScrapedAt: string | null
  pdfs: Record<string, PdfMetadata>
}

/** Core rules document titles to classify */
export const CORE_RULES_KEYWORDS = [
  'core rules',
  'rules updates',
  'commentary',
  'balance dataslate',
  'munitorum field manual',
  'chapter approved',
  'tournament companion',
] as const

/** Selectors for the GW downloads page (isolated for easy update) */
export const SELECTORS = {
  /** Container for each download card */
  downloadCard: '[class*="DownloadCard"]',
  /** Fallback: any link to a PDF */
  pdfLink: 'a[href$=".pdf"]',
  /** Title text within a card */
  cardTitle: 'h3, h4, [class*="title"], [class*="Title"]',
} as const

export const GW_DOWNLOADS_URL =
  'https://www.warhammer-community.com/en-gb/downloads/warhammer-40000/'
