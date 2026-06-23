// Backend-Aufrufe. Das PDF wird im Browser geparst (siehe pdfParse.js);
// hier schicken wir nur noch Texte an den zustandslosen Claude-Proxy.

// Text begrenzen, damit die Payload an die Serverless-Function klein bleibt.
function clip(text, max) {
  if (!text) return ''
  return text.length <= max ? text : text.slice(0, max) + '\n\n[... gekürzt ...]'
}

export async function checkHealth() {
  const r = await fetch('/api/health')
  return r.json()
}

export async function summarize(doc) {
  const r = await fetch('/api/summarize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: doc.title,
      chapterTitles: doc.chapters.map((c) => c.title),
      fullText: clip(doc.fullText, 120000),
    }),
  })
  if (!r.ok) throw new Error((await r.json()).error || 'Zusammenfassung fehlgeschlagen')
  return (await r.json()).summary
}

export async function getQuiz(doc, count = 5) {
  const r = await fetch('/api/quiz', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fullText: clip(doc.fullText, 120000), count }),
  })
  if (!r.ok) throw new Error((await r.json()).error || 'Quiz fehlgeschlagen')
  return (await r.json()).questions
}

// Chat-Stream. context = relevanter Dokumenttext; onChunk(text) pro Textstück.
export async function streamChat({ context, messages, mode }, onChunk) {
  const r = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ context: clip(context, 120000), messages, mode }),
  })
  if (!r.ok) throw new Error((await r.json()).error || 'Chat fehlgeschlagen')

  const reader = r.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n\n')
    buffer = parts.pop() || ''
    for (const part of parts) {
      const m = part.match(/^data: (.*)$/m)
      if (!m) continue
      const payload = m[1]
      if (payload === '[DONE]') return
      try {
        const obj = JSON.parse(payload)
        if (obj.text) onChunk(obj.text)
        if (obj.error) throw new Error(obj.error)
      } catch {
        /* ignorieren */
      }
    }
  }
}
