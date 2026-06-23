import React, { useEffect, useRef, useState } from 'react'
import { checkHealth, summarize, getQuiz, streamChat, verifySession, clearToken, AuthError } from './api.js'
import { parsePdfFile } from './pdfParse.js'
import Reader from './Reader.jsx'
import Login from './Login.jsx'

// Sehr leichter Markdown-Renderer (fett, Überschriften, Listen, Absätze).
function renderMarkdown(md) {
  if (!md) return null
  const lines = md.split('\n')
  const blocks = []
  let list = null
  const flush = () => {
    if (list) {
      blocks.push(<ul key={'ul' + blocks.length}>{list}</ul>)
      list = null
    }
  }
  const inline = (t) =>
    t.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
      part.startsWith('**') && part.endsWith('**') ? (
        <strong key={i}>{part.slice(2, -2)}</strong>
      ) : (
        <React.Fragment key={i}>{part}</React.Fragment>
      )
    )
  lines.forEach((raw, i) => {
    const line = raw.trimEnd()
    if (/^#{1,3}\s/.test(line)) {
      flush()
      blocks.push(<h3 key={i}>{inline(line.replace(/^#{1,3}\s/, ''))}</h3>)
    } else if (/^\s*[-*]\s+/.test(line)) {
      list = list || []
      list.push(<li key={i}>{inline(line.replace(/^\s*[-*]\s+/, ''))}</li>)
    } else if (line.trim() === '') {
      flush()
    } else {
      flush()
      blocks.push(<p key={i}>{inline(line)}</p>)
    }
  })
  flush()
  return blocks
}

export default function App() {
  const [health, setHealth] = useState(null)
  const [authed, setAuthed] = useState(false)
  const [authChecked, setAuthChecked] = useState(false)
  const [doc, setDoc] = useState(null) // { title, numPages, charCount, chapters[], fullText }
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const [drag, setDrag] = useState(false)

  // Studio
  const [summary, setSummary] = useState('')
  const [summarizing, setSummarizing] = useState(false)
  const [quiz, setQuiz] = useState([])
  const [quizLoading, setQuizLoading] = useState(false)

  // Reader
  const [readerOpen, setReaderOpen] = useState(false)
  const [readerStart, setReaderStart] = useState(0)
  const [activeChapter, setActiveChapter] = useState(0)

  // Chat
  const [mode, setMode] = useState('discuss') // 'discuss' | 'quiz'
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const messagesRef = useRef(null)
  const fileInputRef = useRef(null)

  useEffect(() => {
    checkHealth().then(setHealth).catch(() => setHealth({ ok: false }))
    verifySession()
      .then(setAuthed)
      .catch(() => setAuthed(false))
      .finally(() => setAuthChecked(true))
  }, [])

  function logout() {
    clearToken()
    setAuthed(false)
    setDoc(null)
    setMessages([])
    setSummary('')
    setQuiz([])
  }

  // Bei abgelaufener Sitzung (401) zurück zum Login.
  function handleAuthErr(e) {
    if (e instanceof AuthError) {
      setAuthed(false)
      return true
    }
    return false
  }

  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight
    }
  }, [messages, busy])

  async function handleFile(file) {
    if (!file) return
    if (!/\.pdf$/i.test(file.name)) {
      setError('Bitte eine PDF-Datei auswählen.')
      return
    }
    setError('')
    setUploading(true)
    setProgress(0)
    setSummary('')
    setQuiz([])
    setMessages([])
    try {
      const parsed = await parsePdfFile(file, setProgress)
      setDoc(parsed)
      setActiveChapter(0)
      runSummary(parsed) // automatisch zusammenfassen
    } catch (e) {
      console.error(e)
      setError('PDF konnte nicht gelesen werden: ' + e.message)
    } finally {
      setUploading(false)
    }
  }

  async function runSummary(d) {
    setSummarizing(true)
    try {
      setSummary(await summarize(d))
    } catch (e) {
      if (!handleAuthErr(e)) setError(e.message)
    } finally {
      setSummarizing(false)
    }
  }

  async function runQuiz() {
    if (!doc) return
    setQuizLoading(true)
    try {
      setQuiz(await getQuiz(doc, 5))
    } catch (e) {
      if (!handleAuthErr(e)) setError(e.message)
    } finally {
      setQuizLoading(false)
    }
  }

  async function startQuizChat() {
    if (!doc) return
    setMode('quiz')
    setMessages([])
    await send('Bitte stelle mir deine erste Frage zum Dokument.', 'quiz', [])
  }

  // Kontext für die KI zusammenbauen (aktuelles Kapitel im Fokus + Gesamtdokument).
  function buildContext() {
    if (!doc) return ''
    const c = doc.chapters[activeChapter]
    if (c) {
      return `Aktuelles Kapitel: ${c.title}\n\n${c.text}\n\n---\nWeiterer Dokumentkontext:\n${doc.fullText}`
    }
    return doc.fullText
  }

  async function send(textArg, modeArg, baseMessages) {
    const text = (textArg ?? input).trim()
    if (!text || !doc || busy) return
    const useMode = modeArg ?? mode
    const base = baseMessages ?? messages

    const next = [...base, { role: 'user', content: text }]
    setMessages([...next, { role: 'assistant', content: '' }])
    setInput('')
    setBusy(true)

    try {
      let acc = ''
      await streamChat(
        { context: buildContext(), messages: next, mode: useMode },
        (chunk) => {
          acc += chunk
          setMessages((m) => {
            const copy = m.slice()
            copy[copy.length - 1] = { role: 'assistant', content: acc }
            return copy
          })
        }
      )
    } catch (e) {
      if (handleAuthErr(e)) return
      setMessages((m) => {
        const copy = m.slice()
        copy[copy.length - 1] = { role: 'assistant', content: '⚠ Fehler: ' + e.message }
        return copy
      })
    } finally {
      setBusy(false)
    }
  }

  function openReader(start = 0) {
    setReaderStart(start)
    setActiveChapter(start)
    setReaderOpen(true)
  }

  const keyOk = health?.hasKey

  // Solange die Sitzung geprüft wird: kurzer Ladezustand.
  if (!authChecked) {
    return (
      <div className="login-wrap">
        <span className="spinner" />
      </div>
    )
  }

  // Nicht angemeldet -> Login-Maske.
  if (!authed) {
    return <Login health={health} onSuccess={() => setAuthed(true)} />
  }

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">
          <span className="logo">📖</span>
          Read &amp; Discuss
        </div>
        <div className="status">
          {health ? (
            <>
              <span className={'dot ' + (keyOk ? 'ok' : 'bad')} />
              {keyOk ? `Claude verbunden (${health.model})` : 'Kein API-Key — siehe .env'}
            </>
          ) : (
            'Verbinde …'
          )}
          <button className="btn ghost" style={{ marginLeft: 12 }} onClick={logout}>
            Abmelden
          </button>
        </div>
      </div>

      <div className="columns">
        {/* ---------- Spalte 1: Quellen ---------- */}
        <div className="panel">
          <div className="panel-head">Quellen</div>
          <div className="panel-body">
            {!keyOk && (
              <div className="banner">
                Kein <b>ANTHROPIC_API_KEY</b> auf dem Server gefunden. Lokal: <code>.env</code> anlegen.
                Auf Vercel/Render: als Umgebungsvariable (Secret) setzen.
              </div>
            )}

            <div
              className={'dropzone' + (drag ? ' drag' : '')}
              onDragOver={(e) => {
                e.preventDefault()
                setDrag(true)
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDrag(false)
                handleFile(e.dataTransfer.files[0])
              }}
              onClick={() => fileInputRef.current?.click()}
              style={{ cursor: 'pointer' }}
            >
              {uploading ? (
                <>
                  <span className="spinner" />
                  <div style={{ marginTop: 8 }}>
                    PDF wird gelesen … {Math.round(progress * 100)}%
                  </div>
                </>
              ) : (
                <>
                  <strong>+ PDF hinzufügen</strong>
                  Klicken oder Datei hierher ziehen
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                style={{ display: 'none' }}
                onChange={(e) => handleFile(e.target.files[0])}
              />
            </div>

            {error && <div className="banner" style={{ marginTop: 12 }}>{error}</div>}

            {doc && (
              <>
                <div className="doc-card">
                  <div className="name">📄 {doc.title}</div>
                  <div className="meta">
                    {doc.numPages} Seiten · {doc.chapters.length} Kapitel ·{' '}
                    {(doc.charCount / 1000).toFixed(0)}k Zeichen
                  </div>
                </div>

                <div className="chapter-list">
                  {doc.chapters.map((c, i) => (
                    <button
                      key={i}
                      className={'chapter-item' + (i === activeChapter ? ' active' : '')}
                      onClick={() => openReader(i)}
                      title="Dieses Kapitel vorlesen"
                    >
                      <span className="num">{i + 1}</span>
                      <span className="ct">{c.title}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* ---------- Spalte 2: Chat ---------- */}
        <div className="panel">
          <div className="panel-head">
            Chat
            {doc && (
              <div className="mode-tabs" style={{ border: 'none', padding: 0 }}>
                <button
                  className={'mode-tab' + (mode === 'discuss' ? ' active' : '')}
                  onClick={() => setMode('discuss')}
                >
                  💬 Diskussion
                </button>
                <button
                  className={'mode-tab' + (mode === 'quiz' ? ' active' : '')}
                  onClick={startQuizChat}
                  disabled={busy}
                >
                  ❓ Frage-Runde
                </button>
              </div>
            )}
          </div>

          <div className="chat-wrap">
            <div className="messages" ref={messagesRef}>
              {!doc ? (
                <div className="empty-state">
                  <div style={{ fontSize: 40 }}>📚</div>
                  <h2>Willkommen!</h2>
                  <p>
                    Lade links ein PDF hoch (z. B. deine Bachelorthesis).<br />
                    Es wird automatisch zusammengefasst, du kannst es dir kapitelweise
                    vorlesen lassen und mit der KI darüber diskutieren.
                  </p>
                </div>
              ) : messages.length === 0 ? (
                <div className="empty-state">
                  <p>
                    {mode === 'quiz'
                      ? 'Klicke auf „Frage-Runde", damit die KI dich abfragt.'
                      : 'Stelle der KI eine Frage zum Dokument — oder lass dir links Kapitel vorlesen.'}
                  </p>
                </div>
              ) : (
                messages.map((m, i) => (
                  <div key={i} className={'msg ' + m.role}>
                    {m.role === 'assistant' ? (
                      m.content ? renderMarkdown(m.content) : <span className="spinner" />
                    ) : (
                      m.content
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="composer">
              <textarea
                rows={1}
                placeholder={
                  doc
                    ? mode === 'quiz'
                      ? 'Deine Antwort …'
                      : 'Frage zum Dokument stellen …'
                    : 'Erst ein PDF hochladen …'
                }
                value={input}
                disabled={!doc || busy}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    send()
                  }
                }}
              />
              <button
                className="btn primary"
                onClick={() => send()}
                disabled={!doc || busy || !input.trim()}
              >
                {busy ? <span className="spinner" /> : '➤'}
              </button>
            </div>
          </div>
        </div>

        {/* ---------- Spalte 3: Studio ---------- */}
        <div className="panel">
          <div className="panel-head">Studio</div>
          <div className="panel-body">
            {!doc ? (
              <div className="empty-state" style={{ height: 'auto', padding: '30px 10px' }}>
                <div style={{ fontSize: 30 }}>✨</div>
                <p>Nach dem Hochladen erscheinen hier Vorlesen, Zusammenfassung und Frage-Runde.</p>
              </div>
            ) : (
              <>
                <div className="studio-card">
                  <h3>🔊 Vorlesen</h3>
                  <p>PDF öffnen und Kapitel für Kapitel mit Sprachausgabe vorlesen lassen.</p>
                  <button className="btn primary full" onClick={() => openReader(activeChapter)}>
                    ▶ Vorlesen starten
                  </button>
                </div>

                <div className="studio-card">
                  <h3>📝 Zusammenfassung</h3>
                  {summarizing ? (
                    <p><span className="spinner" /> Wird erstellt …</p>
                  ) : summary ? (
                    <div className="summary-box">{renderMarkdown(summary)}</div>
                  ) : (
                    <>
                      <p>Noch keine Zusammenfassung.</p>
                      <button className="btn full" onClick={() => runSummary(doc)}>
                        Zusammenfassung erstellen
                      </button>
                    </>
                  )}
                </div>

                <div className="studio-card">
                  <h3>❓ Frage-Runde</h3>
                  <p>Lass dich von der KI im Chat abfragen — oder erzeuge eine Liste von Übungsfragen.</p>
                  <button className="btn full" onClick={startQuizChat} disabled={busy} style={{ marginBottom: 8 }}>
                    KI fragt mich (Chat)
                  </button>
                  <button className="btn full" onClick={runQuiz} disabled={quizLoading}>
                    {quizLoading ? <span className="spinner" /> : 'Übungsfragen erzeugen'}
                  </button>
                  {quiz.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      {quiz.map((q, i) => (
                        <div key={i} className="quiz-q">
                          <span className="qn">{i + 1}.</span>
                          {q.frage}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {readerOpen && doc && (
        <Reader
          chapters={doc.chapters}
          startIndex={readerStart}
          onActiveChange={setActiveChapter}
          onClose={() => setReaderOpen(false)}
          onAskQuestions={(chapterIdx) => {
            setActiveChapter(chapterIdx)
            setReaderOpen(false)
            setMode('discuss')
          }}
        />
      )}
    </div>
  )
}
