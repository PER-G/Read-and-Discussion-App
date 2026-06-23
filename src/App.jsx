import React, { useEffect, useRef, useState } from 'react'
import { checkHealth, summarize, getQuiz, streamChat, verifySession, clearToken, AuthError } from './api.js'
import { parsePdfFile } from './pdfParse.js'
import {
  listProjects,
  getProject,
  saveProject,
  deleteProject,
  newId,
} from './storage.js'
import Reader from './Reader.jsx'
import Login from './Login.jsx'
import Library from './Library.jsx'
import { useTTS } from './useTTS.js'
import { useSpeech } from './useSpeech.js'
import { stripMarkdown, isSkippableChapter } from './textUtils.js'
import VoiceSettings from './VoiceSettings.jsx'

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

// Technische Fehlermeldungen in verständliches Deutsch übersetzen.
function friendlyError(msg) {
  const m = (msg || '').toLowerCase()
  if (m.includes('529') || m.includes('overloaded'))
    return 'Der KI-Dienst ist gerade überlastet. Bitte in ein paar Sekunden erneut versuchen.'
  if (m.includes('429') || m.includes('rate'))
    return 'Zu viele Anfragen in kurzer Zeit. Bitte kurz warten und erneut versuchen.'
  if (m.includes('401') || m.includes('autoris'))
    return 'Sitzung abgelaufen. Bitte neu anmelden.'
  return msg
}

export default function App() {
  const [health, setHealth] = useState(null)
  const [authed, setAuthed] = useState(false)
  const [authChecked, setAuthChecked] = useState(false)

  // Bibliothek + aktives Projekt
  const [projects, setProjects] = useState([])
  const [doc, setDoc] = useState(null) // aktives Projekt
  const docRef = useRef(null)
  useEffect(() => { docRef.current = doc }, [doc])

  const [uploading, setUploading] = useState(false)
  const [parseProgress, setParseProgress] = useState(0)
  const [error, setError] = useState('')

  // Studio
  const [summary, setSummary] = useState('')
  const [summarizing, setSummarizing] = useState(false)
  const [summaryError, setSummaryError] = useState('')
  const [quiz, setQuiz] = useState([])
  const [quizLoading, setQuizLoading] = useState(false)

  // Reader
  const [readerOpen, setReaderOpen] = useState(false)
  const [readerStart, setReaderStart] = useState(0)
  const [readerStartSentence, setReaderStartSentence] = useState(0)
  const [activeChapter, setActiveChapter] = useState(0)

  // Chat
  const [mode, setMode] = useState('discuss')
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const messagesRef = useRef(null)

  // Sprachausgabe + Spracheingabe für den Chat
  const chatTts = useTTS()
  const chatSpeech = useSpeech('de-DE')

  useEffect(() => {
    checkHealth().then(setHealth).catch(() => setHealth({ ok: false }))
    verifySession()
      .then((ok) => {
        setAuthed(ok)
        if (ok) loadProjects()
      })
      .catch(() => setAuthed(false))
      .finally(() => setAuthChecked(true))
  }, [])

  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight
    }
  }, [messages, busy])

  async function loadProjects() {
    try {
      setProjects(await listProjects())
    } catch (e) {
      console.error(e)
    }
  }

  function logout() {
    clearToken()
    setAuthed(false)
    setDoc(null)
    setMessages([])
    setSummary('')
    setQuiz([])
  }

  function handleAuthErr(e) {
    if (e instanceof AuthError) {
      setAuthed(false)
      return true
    }
    return false
  }

  // --- Projektverwaltung ---

  async function handleFile(file) {
    if (!file) return
    if (!/\.pdf$/i.test(file.name)) {
      setError('Bitte eine PDF-Datei auswählen.')
      return
    }
    setError('')
    setUploading(true)
    setParseProgress(0)
    try {
      const parsed = await parsePdfFile(file, setParseProgress)
      const project = {
        id: newId(),
        ...parsed,
        summary: '',
        progress: { chapterIndex: 0, sentenceIndex: 0 },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      await saveProject(project)
      await loadProjects()
      openDoc(project)
      runSummary(project)
    } catch (e) {
      console.error(e)
      setError('PDF konnte nicht gelesen werden: ' + e.message)
    } finally {
      setUploading(false)
    }
  }

  function openDoc(project) {
    setDoc(project)
    setSummary(project.summary || '')
    setSummaryError('')
    setQuiz([])
    setMessages([])
    setActiveChapter(project.progress?.chapterIndex || 0)
    setError('')
  }

  async function openProjectById(id) {
    const p = await getProject(id)
    if (p) openDoc(p)
  }

  async function backToLibrary() {
    if (readerOpen) setReaderOpen(false)
    setDoc(null)
    await loadProjects()
  }

  // Teilaktualisierung des aktiven Projekts speichern.
  async function persist(patch) {
    const cur = docRef.current
    if (!cur) return
    const updated = { ...cur, ...patch, updatedAt: Date.now() }
    setDoc(updated)
    docRef.current = updated
    try {
      await saveProject(updated)
    } catch (e) {
      console.error('Speichern fehlgeschlagen:', e)
    }
  }

  async function runSummary(d) {
    setSummarizing(true)
    setSummaryError('')
    try {
      const s = await summarize(d)
      setSummary(s)
      // in das (ggf. aktuelle) Projekt schreiben
      if (docRef.current && docRef.current.id === d.id) persist({ summary: s })
      else {
        const fresh = await getProject(d.id)
        if (fresh) await saveProject({ ...fresh, summary: s, updatedAt: Date.now() })
      }
    } catch (e) {
      if (!handleAuthErr(e)) setSummaryError(friendlyError(e.message))
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

  // Lesefortschritt speichern (nur bei Änderung).
  const lastProgressRef = useRef('')
  function saveProgress(chapterIndex, sentenceIndex) {
    setActiveChapter(chapterIndex)
    const key = chapterIndex + ':' + sentenceIndex
    if (key === lastProgressRef.current) return
    lastProgressRef.current = key
    persist({ progress: { chapterIndex, sentenceIndex } })
  }

  async function startQuizChat() {
    if (!doc) return
    setMode('quiz')
    setMessages([])
    await send('Bitte stelle mir deine erste Frage zum Dokument.', 'quiz', [])
  }

  function buildContext() {
    if (!doc) return ''
    const c = doc.chapters[activeChapter]
    if (c) {
      return `Aktuelles Kapitel: ${c.title}\n\n${c.text}\n\n---\nWeiterer Dokumentkontext:\n${doc.fullText}`
    }
    return doc.fullText
  }

  async function send(textArg, modeArg, baseMessages, opts = {}) {
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
      // Antwort vorlesen, wenn die Frage per Sprache kam.
      if (opts.speak && acc) chatTts.speak(stripMarkdown(acc))
    } catch (e) {
      if (handleAuthErr(e)) return
      setMessages((m) => {
        const copy = m.slice()
        copy[copy.length - 1] = { role: 'assistant', content: '⚠ ' + friendlyError(e.message) }
        return copy
      })
    } finally {
      setBusy(false)
    }
  }

  // Mikrofon im Chat: zuhören, Frage senden, Antwort vorlesen.
  function toggleChatMic() {
    if (chatSpeech.listening) {
      chatSpeech.stop()
    } else {
      chatTts.stop()
      chatSpeech.start((text) => send(text, undefined, undefined, { speak: true }))
    }
  }

  // Eine Assistenten-Nachricht vorlesen / stoppen.
  function speakMessage(content) {
    if (chatTts.speaking) chatTts.stop()
    else chatTts.speak(stripMarkdown(content))
  }

  function openReader(start = 0) {
    setReaderStart(start)
    // an gespeicherter Satzposition fortsetzen, wenn es das gespeicherte Kapitel ist
    const sentence = doc?.progress?.chapterIndex === start ? doc?.progress?.sentenceIndex || 0 : 0
    setReaderStartSentence(sentence)
    setActiveChapter(start)
    setReaderOpen(true)
  }

  const keyOk = health?.hasKey

  // --- Render ---

  if (!authChecked) {
    return <div className="login-wrap"><span className="spinner" /></div>
  }
  if (!authed) {
    return <Login health={health} onSuccess={() => { setAuthed(true); loadProjects() }} />
  }

  // Hauptmenü (keine Datei offen)
  if (!doc) {
    return (
      <div className="app">
        <div className="topbar">
          <div className="brand"><span className="logo">📖</span> Read &amp; Discuss</div>
          <div className="status">
            {health && <><span className={'dot ' + (keyOk ? 'ok' : 'bad')} />{keyOk ? `Claude verbunden (${health.model})` : 'Kein API-Key'}</>}
            <button className="btn ghost" style={{ marginLeft: 12 }} onClick={logout}>Abmelden</button>
          </div>
        </div>
        <Library
          projects={projects}
          onOpen={openProjectById}
          onDelete={async (id) => { await deleteProject(id); loadProjects() }}
          onAddFile={handleFile}
          uploading={uploading}
          progress={parseProgress}
          error={error}
        />
      </div>
    )
  }

  // Arbeitsbereich (Datei offen)
  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">
          <button className="btn ghost" onClick={backToLibrary} style={{ marginRight: 6 }}>← Übersicht</button>
          <span className="logo">📖</span> Read &amp; Discuss
        </div>
        <div className="status">
          {health ? (
            <>
              <span className={'dot ' + (keyOk ? 'ok' : 'bad')} />
              {keyOk ? `Claude verbunden (${health.model})` : 'Kein API-Key — siehe .env'}
            </>
          ) : 'Verbinde …'}
          <button className="btn ghost" style={{ marginLeft: 12 }} onClick={logout}>Abmelden</button>
        </div>
      </div>

      <div className="columns">
        {/* ---------- Spalte 1: Quellen ---------- */}
        <div className="panel">
          <div className="panel-head">Kapitel</div>
          <div className="panel-body">
            <div className="doc-card">
              <div className="name">📄 {doc.title}</div>
              <div className="meta">
                {doc.numPages} Seiten · {doc.chapters.length} Kapitel ·{' '}
                {(doc.charCount / 1000).toFixed(0)}k Zeichen
              </div>
            </div>

            <div className="chapter-list">
              {doc.chapters.map((c, i) => {
                const skip = isSkippableChapter(c)
                return (
                  <button
                    key={i}
                    className={'chapter-item' + (i === activeChapter ? ' active' : '') + (skip ? ' skip' : '')}
                    onClick={() => openReader(i)}
                    title={skip ? 'Verzeichnis — wird beim Vorlesen übersprungen' : 'Dieses Kapitel vorlesen'}
                  >
                    <span className="num">{skip ? '🗂' : i + 1}</span>
                    <span className="ct">{c.title}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* ---------- Spalte 2: Chat ---------- */}
        <div className="panel">
          <div className="panel-head">
            Chat
            <div className="mode-tabs" style={{ border: 'none', padding: 0 }}>
              <button className={'mode-tab' + (mode === 'discuss' ? ' active' : '')} onClick={() => setMode('discuss')}>💬 Diskussion</button>
              <button className={'mode-tab' + (mode === 'quiz' ? ' active' : '')} onClick={startQuizChat} disabled={busy}>❓ Frage-Runde</button>
            </div>
          </div>

          <div className="chat-wrap">
            <div className="messages" ref={messagesRef}>
              {messages.length === 0 ? (
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
                      m.content ? (
                        <>
                          {renderMarkdown(m.content)}
                          {chatTts.supported && (
                            <button
                              className="speak-btn"
                              title="Antwort vorlesen"
                              onClick={() => speakMessage(m.content)}
                            >
                              {chatTts.speaking ? '⏹ Stopp' : '🔊 Vorlesen'}
                            </button>
                          )}
                        </>
                      ) : (
                        <span className="spinner" />
                      )
                    ) : (
                      m.content
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="composer">
              {chatSpeech.supported && (
                <button
                  className={'iconbtn mic-btn' + (chatSpeech.listening ? ' listening' : '')}
                  onClick={toggleChatMic}
                  disabled={busy}
                  title={chatSpeech.listening ? 'Höre zu … (zum Stoppen klicken)' : 'Frage per Sprache stellen'}
                >
                  {chatSpeech.listening ? '●' : '🎤'}
                </button>
              )}
              <textarea
                rows={1}
                placeholder={
                  chatSpeech.listening
                    ? (chatSpeech.interim ? '„' + chatSpeech.interim + '"' : 'Höre zu …')
                    : mode === 'quiz' ? 'Deine Antwort …' : 'Frage zum Dokument stellen …'
                }
                value={input}
                disabled={busy}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
                }}
              />
              <button className="btn primary" onClick={() => send()} disabled={busy || !input.trim()}>
                {busy ? <span className="spinner" /> : '➤'}
              </button>
            </div>
          </div>
        </div>

        {/* ---------- Spalte 3: Studio ---------- */}
        <div className="panel">
          <div className="panel-head">Studio</div>
          <div className="panel-body">
            <div className="studio-card">
              <h3>🔊 Vorlesen</h3>
              <p>PDF öffnen und Kapitel für Kapitel mit Sprachausgabe vorlesen lassen.</p>
              <button className="btn primary full" onClick={() => openReader(activeChapter)}>
                ▶ {doc.progress?.chapterIndex ? 'Weiterlesen' : 'Vorlesen starten'}
              </button>
            </div>

            <div className="studio-card">
              <h3>📝 Zusammenfassung</h3>
              {summarizing ? (
                <p><span className="spinner" /> Wird erstellt …</p>
              ) : summaryError ? (
                <>
                  <div className="banner" style={{ marginBottom: 10 }}>⚠ {summaryError}</div>
                  <button className="btn full" onClick={() => runSummary(doc)}>↻ Erneut versuchen</button>
                </>
              ) : summary ? (
                <>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                    {chatTts.supported && (
                      <button className="btn" onClick={() => speakMessage(summary)}>
                        {chatTts.speaking ? '⏹ Stopp' : '🔊 Vorlesen'}
                      </button>
                    )}
                    <button className="btn ghost" onClick={() => runSummary(doc)}>↻ Neu</button>
                  </div>
                  <div className="summary-box">{renderMarkdown(summary)}</div>
                  {chatTts.supported && (
                    <div style={{ marginTop: 10 }}>
                      <VoiceSettings tts={chatTts} showPitch={false} />
                    </div>
                  )}
                </>
              ) : (
                <>
                  <p>Noch keine Zusammenfassung.</p>
                  <button className="btn full" onClick={() => runSummary(doc)}>Zusammenfassung erstellen</button>
                </>
              )}
            </div>

            <div className="studio-card">
              <h3>❓ Frage-Runde</h3>
              <p>Lass dich von der KI im Chat abfragen — oder erzeuge eine Liste von Übungsfragen.</p>
              <button className="btn full" onClick={startQuizChat} disabled={busy} style={{ marginBottom: 8 }}>KI fragt mich (Chat)</button>
              <button className="btn full" onClick={runQuiz} disabled={quizLoading}>
                {quizLoading ? <span className="spinner" /> : 'Übungsfragen erzeugen'}
              </button>
              {quiz.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  {quiz.map((q, i) => (
                    <div key={i} className="quiz-q"><span className="qn">{i + 1}.</span>{q.frage}</div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {readerOpen && (
        <Reader
          chapters={doc.chapters}
          startIndex={readerStart}
          startSentence={readerStartSentence}
          onClose={() => setReaderOpen(false)}
          onProgress={saveProgress}
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
