// Backend-Aufrufe. Das PDF wird im Browser geparst (siehe pdfParse.js);
// hier schicken wir nur noch Texte an den geschützten Claude-Proxy.

const TOKEN_KEY = 'rad_token'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || ''
}
export function setToken(t) {
  if (t) localStorage.setItem(TOKEN_KEY, t)
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

function authHeaders(extra = {}) {
  const t = getToken()
  return t ? { ...extra, Authorization: `Bearer ${t}` } : extra
}

// Bei 401 das Token verwerfen und Fehler werfen (Frontend zeigt dann Login).
class AuthError extends Error {
  constructor(msg) {
    super(msg)
    this.name = 'AuthError'
  }
}
function handle401(r) {
  if (r.status === 401) {
    clearToken()
    throw new AuthError('Sitzung abgelaufen — bitte erneut anmelden.')
  }
}

// Text begrenzen, damit die Payload klein bleibt.
function clip(text, max) {
  if (!text) return ''
  return text.length <= max ? text : text.slice(0, max) + '\n\n[... gekürzt ...]'
}

export async function checkHealth() {
  const r = await fetch('/api/health')
  return r.json()
}

export async function login(username, password) {
  const r = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data.error || 'Login fehlgeschlagen')
  setToken(data.token)
  return true
}

// Prüfen, ob das gespeicherte Token noch gültig ist.
export async function verifySession() {
  if (!getToken()) return false
  try {
    const r = await fetch('/api/verify', { headers: authHeaders() })
    if (r.ok) return true
    clearToken()
    return false
  } catch {
    return false
  }
}

export async function summarize(doc) {
  const r = await fetch('/api/summarize', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      title: doc.title,
      chapterTitles: doc.chapters.map((c) => c.title),
      fullText: clip(doc.fullText, 120000),
    }),
  })
  handle401(r)
  if (!r.ok) throw new Error((await r.json()).error || 'Zusammenfassung fehlgeschlagen')
  return (await r.json()).summary
}

export async function summarizeChapter(title, text) {
  const r = await fetch('/api/summarize-chapter', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ title, text: clip(text, 40000) }),
  })
  handle401(r)
  if (!r.ok) throw new Error((await r.json()).error || 'Kapitel-Zusammenfassung fehlgeschlagen')
  return (await r.json()).summary
}

export async function getQuiz(doc, count = 5) {
  const r = await fetch('/api/quiz', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ fullText: clip(doc.fullText, 120000), count }),
  })
  handle401(r)
  if (!r.ok) throw new Error((await r.json()).error || 'Quiz fehlgeschlagen')
  return (await r.json()).questions
}

// Chat-Stream. context = relevanter Dokumenttext; onChunk(text) pro Textstück.
export async function streamChat({ context, messages, mode }, onChunk) {
  const r = await fetch('/api/chat', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ context: clip(context, 120000), messages, mode }),
  })
  handle401(r)
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

export { AuthError }
