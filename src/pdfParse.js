// PDF-Verarbeitung im Browser mit pdf.js (dort ist es nativ zuhause).
// Extrahiert Text pro Seite und teilt in Kapitel auf:
//   1. Outline/Lesezeichen  ->  Kapitel
//   2. Überschriften-Heuristik
//   3. Fallback: ein Kapitel
import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

async function getPageText(page) {
  const content = await page.getTextContent()
  let lastY = null
  let text = ''
  for (const item of content.items) {
    if (!('str' in item)) continue
    const y = item.transform ? item.transform[5] : null
    if (lastY !== null && y !== null && Math.abs(y - lastY) > 4) text += '\n'
    text += item.str
    if (item.hasEOL) text += '\n'
    lastY = y
  }
  return text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

async function resolveOutlineToChapters(doc, outline, pageTexts) {
  const flat = []
  async function walk(items, depth) {
    for (const item of items) {
      let pageIndex = null
      try {
        let dest = item.dest
        if (typeof dest === 'string') dest = await doc.getDestination(dest)
        if (Array.isArray(dest) && dest[0]) pageIndex = await doc.getPageIndex(dest[0])
      } catch {
        pageIndex = null
      }
      flat.push({ title: (item.title || '').trim(), pageIndex, depth })
      if (item.items && item.items.length && depth < 1) await walk(item.items, depth + 1)
    }
  }
  await walk(outline, 0)

  const valid = flat.filter((e) => e.pageIndex !== null && e.title)
  valid.sort((a, b) => a.pageIndex - b.pageIndex)
  if (valid.length < 2) return null

  const chapters = []
  for (let i = 0; i < valid.length; i++) {
    const start = valid[i].pageIndex
    const end = i + 1 < valid.length ? valid[i + 1].pageIndex : pageTexts.length
    const text = pageTexts.slice(start, Math.max(end, start + 1)).join('\n\n').trim()
    if (text.length < 40) continue
    chapters.push({ title: valid[i].title, text, page: start + 1 })
  }
  return chapters.length >= 2 ? chapters : null
}

function detectChaptersByHeadings(fullText) {
  const lines = fullText.split('\n')
  const headingRegex =
    /^\s*((kapitel|chapter)\s+\d+|(\d+(\.\d+)*)\s+[A-ZÄÖÜ].{2,80}|(einleitung|einführung|zusammenfassung|fazit|schluss|abstract|literaturverzeichnis|anhang|methodik|ergebnisse|diskussion|grundlagen)\b.{0,60})\s*$/i

  const marks = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (line.length < 3 || line.length > 90) continue
    if (headingRegex.test(line)) marks.push({ title: line, index: i })
  }
  if (marks.length < 2) return null

  const chapters = []
  for (let i = 0; i < marks.length; i++) {
    const start = marks[i].index
    const end = i + 1 < marks.length ? marks[i + 1].index : lines.length
    const text = lines.slice(start, end).join('\n').trim()
    if (text.length < 80) continue
    chapters.push({ title: marks[i].title, text, page: null })
  }
  return chapters.length >= 2 ? chapters : null
}

// Hauptfunktion: nimmt ein File-Objekt, gibt das geparste Dokument zurück.
// onProgress(0..1) optional für eine Fortschrittsanzeige.
export async function parsePdfFile(file, onProgress) {
  const buffer = await file.arrayBuffer()
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise
  const numPages = doc.numPages

  const pageTexts = []
  for (let i = 1; i <= numPages; i++) {
    const page = await doc.getPage(i)
    pageTexts.push(await getPageText(page))
    if (onProgress) onProgress(i / numPages)
  }
  const fullText = pageTexts.join('\n\n').trim()

  let chapters = null
  try {
    const outline = await doc.getOutline()
    if (outline && outline.length) chapters = await resolveOutlineToChapters(doc, outline, pageTexts)
  } catch {
    chapters = null
  }
  if (!chapters) chapters = detectChaptersByHeadings(fullText)
  if (!chapters) chapters = [{ title: 'Gesamtes Dokument', text: fullText, page: 1 }]

  let title = ''
  try {
    const meta = await doc.getMetadata()
    title = (meta?.info?.Title || '').trim()
  } catch {
    title = ''
  }
  if (!title) title = file.name.replace(/\.pdf$/i, '')

  return { title, numPages, chapters, fullText, charCount: fullText.length }
}
