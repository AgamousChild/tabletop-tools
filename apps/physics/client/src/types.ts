export interface Slide {
  meetingId: string
  slideNum: number
  startSec: number
  endSec: number
  text: string
  imageUrl: string
}

export interface Meeting {
  id: string
  name: string
  durationSec: number
  slides: Slide[]
}

export interface SlidesManifest {
  builtAt: string
  meetings: Meeting[]
}

export interface SearchResult {
  meetingId: string
  meetingName: string
  slideNum: number
  startSec: number
  endSec: number
  text: string
  imageUrl: string
  score: number
}
