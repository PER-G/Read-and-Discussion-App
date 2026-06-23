// Express-Backend: PDF-Upload, Zusammenfassung, Chat (Stream) und Quiz.
import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import multer from 'multer'
import path from 'path'
import { fileURLToPath } from 'url'
import { existsSync } from 'fs'
import { parsePdf } from './pdf.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
import {
  summarizeDocument,
  summarizeChapter,
  streamChat,
  generateQuiz,
} from './claude.js'

const app = express()
const PORT = process.env.PORT || 8787

app.use(cors())
app.use(express.json({ limit: '5mb' }))

// PDFs im Speicher behalten (max. 50 MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
})

// Einfache In-Memory-Ablage des zuletzt geladenen Dokuments.
// (Für eine lokale Single-User-App völlig ausreichend.)
const store = new Map()

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    hasKey: Boolean(process.env.ANTHROPIC_API_KEY),
    model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-6',
  })
})

// PDF hochladen + parsen
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Keine Datei erhalten.' })
    const parsed = await parsePdf(req.file.buffer)
    const id = Date.now().toString(36)
    const docTitle = parsed.title || req.file.originalname.replace(/\.pdf$/i, '')
    store.set(id, { ...parsed, title: docTitle })

    res.json({
      id,
      title: docTitle,
      numPages: parsed.numPages,
      charCount: parsed.charCount,
      chapters: parsed.chapters.map((c, i) => ({
        index: i,
        title: c.title,
        page: c.page,
        chars: c.text.length,
      })),
    })
  } catch (err) {
    console.error('Upload-Fehler:', err)
    res.status(500).json({ error: 'PDF konnte nicht verarbeitet werden: ' + err.message })
  }
})

// Volltext eines Kapitels (zum Vorlesen)
app.get('/api/document/:id/chapter/:index', (req, res) => {
  const doc = store.get(req.params.id)
  if (!doc) return res.status(404).json({ error: 'Dokument nicht gefunden.' })
  const chapter = doc.chapters[Number(req.params.index)]
  if (!chapter) return res.status(404).json({ error: 'Kapitel nicht gefunden.' })
  res.json({ title: chapter.title, text: chapter.text, page: chapter.page })
})

// Gesamtzusammenfassung
app.post('/api/summarize', async (req, res) => {
  try {
    const doc = store.get(req.body.id)
    if (!doc) return res.status(404).json({ error: 'Dokument nicht gefunden.' })
    const summary = await summarizeDocument(doc)
    res.json({ summary })
  } catch (err) {
    console.error('Summarize-Fehler:', err)
    res.status(500).json({ error: err.message })
  }
})

// Kapitel-Zusammenfassung
app.post('/api/summarize-chapter', async (req, res) => {
  try {
    const doc = store.get(req.body.id)
    if (!doc) return res.status(404).json({ error: 'Dokument nicht gefunden.' })
    const chapter = doc.chapters[req.body.index]
    if (!chapter) return res.status(404).json({ error: 'Kapitel nicht gefunden.' })
    const summary = await summarizeChapter(chapter)
    res.json({ summary })
  } catch (err) {
    console.error('Chapter-Summarize-Fehler:', err)
    res.status(500).json({ error: err.message })
  }
})

// Chat / Diskussion als Server-Sent-Events-Stream
app.post('/api/chat', async (req, res) => {
  try {
    const { id, messages, mode, chapterIndex } = req.body
    const doc = store.get(id)
    if (!doc) return res.status(404).json({ error: 'Dokument nicht gefunden.' })

    // Kontext: ganzes Dokument, oder Fokus auf aktuelles Kapitel
    let context = doc.fullText
    if (typeof chapterIndex === 'number' && doc.chapters[chapterIndex]) {
      const c = doc.chapters[chapterIndex]
      context = `Aktuelles Kapitel: ${c.title}\n\n${c.text}\n\n---\nWeiterer Dokumentkontext:\n${doc.fullText}`
    }

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')

    await streamChat({ res, context, history: messages, mode })
  } catch (err) {
    console.error('Chat-Fehler:', err)
    // Falls noch keine Header gesendet wurden
    if (!res.headersSent) {
      res.status(500).json({ error: err.message })
    } else {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`)
      res.end()
    }
  }
})

// Quizfragen generieren
app.post('/api/quiz', async (req, res) => {
  try {
    const doc = store.get(req.body.id)
    if (!doc) return res.status(404).json({ error: 'Dokument nicht gefunden.' })
    const questions = await generateQuiz({ context: doc.fullText, count: req.body.count || 5 })
    res.json({ questions })
  } catch (err) {
    console.error('Quiz-Fehler:', err)
    res.status(500).json({ error: err.message })
  }
})

// Im Produktionsbetrieb das gebaute Frontend (dist/) ausliefern,
// damit alles über EINEN Server/Port läuft (für Deployment).
const distPath = path.join(__dirname, '..', 'dist')
if (existsSync(distPath)) {
  app.use(express.static(distPath))
  // Alle Nicht-API-Routen an die SPA weiterreichen.
  app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'))
  })
}

app.listen(PORT, () => {
  console.log(`\n  Backend läuft auf http://localhost:${PORT}`)
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('  ⚠  ANTHROPIC_API_KEY fehlt — bitte .env anlegen (siehe .env.example).\n')
  }
})
