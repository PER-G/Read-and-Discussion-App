// Alle Aufrufe an die Claude-API gebündelt.
import Anthropic from '@anthropic-ai/sdk'

const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6'

let client = null
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      'ANTHROPIC_API_KEY fehlt. Lege eine .env-Datei an (siehe .env.example).'
    )
  }
  if (!client) {
    // maxRetries fängt kurzfristige Überlastung (429/529/5xx) automatisch ab.
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 4 })
  }
  return client
}

// Text kürzen, damit wir nicht das Token-Limit sprengen (~großzügig).
function clip(text, maxChars) {
  if (text.length <= maxChars) return text
  return text.slice(0, maxChars) + '\n\n[... Text gekürzt ...]'
}

// Gesamtzusammenfassung des Dokuments erstellen.
export async function summarizeDocument({ title, chapters, fullText }) {
  const anthropic = getClient()
  const chapterList = chapters
    .map((c, i) => `${i + 1}. ${c.title}`)
    .join('\n')

  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1500,
    system:
      'Du bist ein hilfreicher akademischer Lesebegleiter. Antworte auf Deutsch, klar und gut strukturiert.',
    messages: [
      {
        role: 'user',
        content: `Hier ist ein Dokument${title ? ` mit dem Titel "${title}"` : ''}.

Kapitelübersicht:
${chapterList}

Dokumenttext (ggf. gekürzt):
"""
${clip(fullText, 60000)}
"""

Erstelle eine prägnante Zusammenfassung in Markdown mit:
- einem kurzen Überblick (2-3 Sätze),
- den 3-5 wichtigsten Kernaussagen als Stichpunkte,
- einer Einschätzung, worum es im Kern geht.`,
      },
    ],
  })
  return msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('')
}

// Kurze Zusammenfassung eines einzelnen Kapitels.
export async function summarizeChapter({ title, text }) {
  const anthropic = getClient()
  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 600,
    system: 'Du bist ein akademischer Lesebegleiter. Antworte auf Deutsch.',
    messages: [
      {
        role: 'user',
        content: `Fasse das folgende Kapitel ("${title}") in 3-4 Sätzen zusammen:\n\n"""\n${clip(
          text,
          20000
        )}\n"""`,
      },
    ],
  })
  return msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('')
}

// Diskussions-Chat als Stream. context = relevanter Dokumenttext, history = bisheriger Verlauf.
export async function streamChat({ res, context, history, mode }) {
  const anthropic = getClient()

  let system
  if (mode === 'quiz') {
    system = `Du bist ein anspruchsvoller, aber freundlicher Prüfer/Tutor. Du stellst dem Nutzer Fragen zum Dokument, um sein Verständnis zu testen.
Regeln:
- Stelle IMMER nur EINE Frage pro Nachricht.
- Wenn der Nutzer antwortet: gib kurzes, konstruktives Feedback (richtig/teilweise/falsch + Begründung), dann stelle die NÄCHSTE Frage.
- Beziehe dich nur auf den Dokumentinhalt. Antworte auf Deutsch.`
  } else {
    system = `Du bist ein kluger akademischer Diskussionspartner. Der Nutzer möchte über das folgende Dokument sprechen (z. B. seine Bachelorthesis).
- Beantworte Fragen präzise und beziehe dich auf den Dokumentinhalt.
- Denke kritisch mit, weise auf Stärken/Schwächen hin, wenn passend.
- Antworte auf Deutsch, klar und nicht zu lang.`
  }

  const stream = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1500,
    system: `${system}\n\nDOKUMENT-KONTEXT:\n"""\n${clip(context, 80000)}\n"""`,
    messages: history,
    stream: true,
  })

  for await (const event of stream) {
    if (
      event.type === 'content_block_delta' &&
      event.delta.type === 'text_delta'
    ) {
      res.write(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`)
    }
  }
  res.write('data: [DONE]\n\n')
  res.end()
}

// Eine Liste von Quizfragen (ohne Antworten) generieren.
export async function generateQuiz({ context, count = 5 }) {
  const anthropic = getClient()
  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1000,
    system:
      'Du erstellst Verständnisfragen zu einem Dokument. Antworte ausschließlich mit gültigem JSON.',
    messages: [
      {
        role: 'user',
        content: `Erstelle ${count} prägnante Verständnisfragen (Deutsch) zum folgenden Dokument. Mische einfache und tiefergehende Fragen.
Antworte NUR mit einem JSON-Array von Objekten der Form: [{"frage": "...", "musterantwort": "..."}]

Dokument:
"""
${clip(context, 60000)}
"""`,
      },
    ],
  })
  const raw = msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('')
  const match = raw.match(/\[[\s\S]*\]/)
  try {
    return JSON.parse(match ? match[0] : raw)
  } catch {
    return []
  }
}
