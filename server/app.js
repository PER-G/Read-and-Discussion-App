// Zustandsloser Claude-Proxy als Express-App (ohne app.listen).
// Wird von server/index.js (lokal/Render) und api/index.js (Vercel) genutzt.
// Das PDF wird im BROWSER geparst; hier kommen nur noch Texte an.
import express from 'express'
import cors from 'cors'
import {
  summarizeDocument,
  summarizeChapter,
  streamChat,
  generateQuiz,
} from './claude.js'
import {
  authConfigured,
  verifyCredentials,
  createToken,
  requireAuth,
} from './auth.js'

const app = express()

app.use(cors())
app.use(express.json({ limit: '12mb' }))

// Offen: nur Status-Infos (kein Geheimnis).
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    hasKey: Boolean(process.env.ANTHROPIC_API_KEY),
    model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-6',
    authConfigured: authConfigured(),
  })
})

// Login: Zugangsdaten prüfen, Token ausstellen.
app.post('/api/login', async (req, res) => {
  // Künstliche Verzögerung bremst Brute-Force-Versuche aus.
  await new Promise((r) => setTimeout(r, 400))
  if (!authConfigured()) {
    return res
      .status(503)
      .json({ error: 'Login ist auf dem Server nicht konfiguriert (AUTH_USER/AUTH_PASS fehlen).' })
  }
  const { username, password } = req.body || {}
  if (verifyCredentials(username, password)) {
    return res.json({ token: createToken() })
  }
  res.status(401).json({ error: 'Benutzername oder Passwort falsch.' })
})

// Prüfen, ob ein vorhandenes Token noch gültig ist.
app.get('/api/verify', requireAuth, (req, res) => {
  res.json({ ok: true })
})

// Ab hier: alle KI-Endpunkte sind geschützt.
app.use('/api/summarize', requireAuth)
app.use('/api/summarize-chapter', requireAuth)
app.use('/api/chat', requireAuth)
app.use('/api/quiz', requireAuth)

// Gesamtzusammenfassung. Body: { title, chapterTitles[], fullText }
app.post('/api/summarize', async (req, res) => {
  try {
    const { title, chapterTitles = [], fullText = '' } = req.body
    if (!fullText) return res.status(400).json({ error: 'Kein Text übergeben.' })
    const chapters = chapterTitles.map((t) => ({ title: t }))
    const summary = await summarizeDocument({ title, chapters, fullText })
    res.json({ summary })
  } catch (err) {
    console.error('Summarize-Fehler:', err)
    res.status(500).json({ error: err.message })
  }
})

// Kapitel-Zusammenfassung. Body: { title, text }
app.post('/api/summarize-chapter', async (req, res) => {
  try {
    const { title, text } = req.body
    if (!text) return res.status(400).json({ error: 'Kein Text übergeben.' })
    const summary = await summarizeChapter({ title, text })
    res.json({ summary })
  } catch (err) {
    console.error('Chapter-Summarize-Fehler:', err)
    res.status(500).json({ error: err.message })
  }
})

// Chat / Diskussion als SSE-Stream. Body: { context, messages, mode }
app.post('/api/chat', async (req, res) => {
  try {
    const { context = '', messages, mode } = req.body
    if (!messages?.length) return res.status(400).json({ error: 'Keine Nachrichten.' })

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no') // Streaming nicht puffern

    await streamChat({ res, context, history: messages, mode })
  } catch (err) {
    console.error('Chat-Fehler:', err)
    if (!res.headersSent) res.status(500).json({ error: err.message })
    else {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`)
      res.end()
    }
  }
})

// Quizfragen. Body: { fullText, count }
app.post('/api/quiz', async (req, res) => {
  try {
    const { fullText = '', count = 5 } = req.body
    if (!fullText) return res.status(400).json({ error: 'Kein Text übergeben.' })
    const questions = await generateQuiz({ context: fullText, count })
    res.json({ questions })
  } catch (err) {
    console.error('Quiz-Fehler:', err)
    res.status(500).json({ error: err.message })
  }
})

export default app
