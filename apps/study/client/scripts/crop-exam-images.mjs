/**
 * Crop the image region out of each image-bearing exam question's source JPG.
 * Saves each as `public/data/exam-images/q<N>.png`, updates the graded JSON
 * with `questionImage` per record.
 *
 * Bounding boxes are hand-identified per question from the source scans.
 * All values are percentages of the source JPG (0-100).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import sharp from 'sharp'

const SRC_DIR = 'C:/Users/micah/Downloads/Brain Collab 2'
const OUT_DIR = resolve('public', 'data', 'exam-images')
const EXAM_PATH = resolve('public', 'data', 'practice-exam-graded.json')

// Question number → { page (JPG page number), bbox: {leftPct, topPct, widthPct, heightPct} }
const IMAGE_QUESTIONS = {
  5: { page: 3, bbox: { leftPct: 18, topPct: 0, widthPct: 60, heightPct: 62 } },
  6: { page: 4, bbox: { leftPct: 28, topPct: 0, widthPct: 45, heightPct: 55 } },
  21: { page: 11, bbox: { leftPct: 14, topPct: 0, widthPct: 65, heightPct: 45 } },
  31: { page: 15, bbox: { leftPct: 33, topPct: 35, widthPct: 35, heightPct: 25 } },
  38: { page: 18, bbox: { leftPct: 22, topPct: 50, widthPct: 55, heightPct: 30 } },
  40: { page: 19, bbox: { leftPct: 20, topPct: 55, widthPct: 60, heightPct: 45 } },
  41: { page: 20, bbox: { leftPct: 18, topPct: 47, widthPct: 60, heightPct: 30 } },
  46: { page: 23, bbox: { leftPct: 14, topPct: 0, widthPct: 60, heightPct: 45 } },
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })

  // Find the filename pattern in SRC_DIR
  const files = readdirSync(SRC_DIR).filter((f) => /_\d+\.jpg$/.test(f))
  const byPage = new Map()
  for (const f of files) {
    const m = f.match(/_(\d+)\.jpg$/)
    if (m) byPage.set(Number(m[1]), join(SRC_DIR, f))
  }

  const exam = JSON.parse(readFileSync(EXAM_PATH, 'utf8'))
  let cropped = 0

  for (const [nStr, spec] of Object.entries(IMAGE_QUESTIONS)) {
    const n = Number(nStr)
    const src = byPage.get(spec.page)
    if (!src) {
      console.warn(`Q${n}: source JPG for page ${spec.page} not found`)
      continue
    }
    const meta = await sharp(src).metadata()
    const w = meta.width
    const h = meta.height
    const left = Math.round((spec.bbox.leftPct / 100) * w)
    const top = Math.round((spec.bbox.topPct / 100) * h)
    const width = Math.round((spec.bbox.widthPct / 100) * w)
    const height = Math.round((spec.bbox.heightPct / 100) * h)
    const outPath = join(OUT_DIR, `q${n}.png`)
    await sharp(src)
      .extract({ left, top, width, height })
      .png()
      .toFile(outPath)
    console.log(`Q${n}: cropped ${w}x${h} @ (${left},${top} ${width}x${height}) → ${outPath}`)

    // Update the graded JSON
    const q = exam.questions.find((x) => x.n === n)
    if (q) q.questionImage = `data/exam-images/q${n}.png`
    cropped++
  }

  writeFileSync(EXAM_PATH, JSON.stringify(exam, null, 2))
  console.log(`\nCropped ${cropped} images; updated ${EXAM_PATH}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
