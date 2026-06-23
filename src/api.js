// Kleine Helfer für die Backend-Aufrufe.

export async function checkHealth() {
  const r = await fetch('/api/health')
  return r.json()
}

export async function uploadPdf(file) {
  const form = new FormData()
  form.append('file', file)
  const r = await fetch('/api/upload', { method: 'POST', body: form })
  if (!r.ok) throw new Error((await r.json()).error || 'Upload fehlgeschlagen')
  return r.json()
}

export async function getChapter(id, index) {
  const r = await fetch(`/api/document/${id}/chapter/${index}`)
  if (!r.ok) throw new Error('Kapitel konnte nicht geladen werden')
  return r.json()
}

export async function summarize(id) {
  const r = await fetch('/api/summarize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  })
  if (!r.ok) throw new Error((await r.json()).error || 'Zusammenfassung fehlgeschlagen')
  return (await r.json()).summary
}

export async function getQuiz(id, count = 5) {
  const r = await fetch('/api/quiz', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, count }),
  })
  if (!r.ok) throw new Error((await r.json()).error || 'Quiz fehlgeschlagen')
  return (await r.json()).questions
}

// Chat-Stream: ruft onChunk(text) für jedes Textstück auf.
export async function streamChat({ id, messages, mode, chapterIndex }, onChunk) {
  const r = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, messages, mode, chapterIndex }),
  })
  if (!r.ok) throw new Error((await r.json()).error || 'Chat fehlgeschlagen')

  const reader = r.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      const m = line.match(/^data: (.*)$/m)
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
