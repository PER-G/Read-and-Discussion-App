import React, { useEffect, useRef, useState } from 'react'
import { useTTS } from './useTTS.js'
import { useSpeech } from './useSpeech.js'
import { summarizeChapter, streamChat } from './api.js'
import { stripMarkdown, isSkippableChapter } from './textUtils.js'
import VoiceSettings from './VoiceSettings.jsx'

// Vorlese-Overlay: liest das aktuelle Kapitel kapitelweise vor.
// - stoppt die Sprachausgabe zuverlässig beim Schließen
// - merkt sich die Position (Kapitel + Satz) über onProgress
// - kann das Kapitel zusammenfassen und die Zusammenfassung vorlesen
// - Sprach-Diskussion: Frage zum Kapitel per Mikrofon, Antwort wird vorgelesen
export default function Reader({
  chapters,
  startIndex,
  startSentence = 0,
  onClose,
  onAskQuestions,
  onProgress,
}) {
  const tts = useTTS()
  const speech = useSpeech('de-DE')
  const [index, setIndex] = useState(startIndex)
  const [finished, setFinished] = useState(false)

  // Kapitel-Zusammenfassung
  const [chapterSummary, setChapterSummary] = useState('')
  const [summarizing, setSummarizing] = useState(false)

  // Sprach-Diskussion
  const [vqQuestion, setVqQuestion] = useState('')
  const [vqAnswer, setVqAnswer] = useState('')
  const [vqBusy, setVqBusy] = useState(false)
  const [aiError, setAiError] = useState('')

  const bodyRef = useRef(null)
  const spokenRef = useRef(null)
  const resumeRef = useRef(startSentence || 0)

  const chapter = chapters[index]
  const chapterContext = chapter ? `Aktuelles Kapitel: ${chapter.title}\n\n${chapter.text}` : ''

  const handleClose = () => {
    if (onProgress) onProgress(index, Math.max(0, tts.sentenceIndex))
    speech.abort()
    tts.stop()
    onClose()
  }

  // Beim Kapitelwechsel: alles zurücksetzen.
  useEffect(() => {
    setFinished(false)
    setChapterSummary('')
    setVqQuestion('')
    setVqAnswer('')
    setAiError('')
    speech.abort()
    tts.stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index])

  useEffect(() => {
    if (onProgress) onProgress(index, Math.max(0, tts.sentenceIndex))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, tts.sentenceIndex])

  useEffect(() => {
    if (spokenRef.current) {
      spokenRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }, [tts.sentenceIndex])

  const startReading = () => {
    if (!chapter) return
    setFinished(false)
    const from = resumeRef.current
    resumeRef.current = 0
    tts.speak(chapter.text, () => setFinished(true), from)
  }

  const goTo = (i) => {
    if (i < 0 || i >= chapters.length) return
    tts.stop()
    resumeRef.current = 0
    setIndex(i)
  }

  // Nächstes/voriges INHALTS-Kapitel finden (Verzeichnisse überspringen).
  const findContent = (from, step) => {
    let i = from
    while (i >= 0 && i < chapters.length) {
      if (!isSkippableChapter(chapters[i])) return i
      i += step
    }
    return -1
  }
  const goContent = (from, step) => {
    const i = findContent(from, step)
    if (i >= 0) goTo(i)
  }

  const skippable = isSkippableChapter(chapter)
  const nextContent = findContent(index + 1, 1)
  const prevContent = findContent(index - 1, -1)

  // KI: Kapitel zusammenfassen und vorlesen.
  const summarizeNow = async () => {
    if (!chapter || summarizing) return
    tts.stop()
    setAiError('')
    setSummarizing(true)
    try {
      const s = await summarizeChapter(chapter.title, chapter.text)
      setChapterSummary(s)
      tts.speak(stripMarkdown(s))
    } catch (e) {
      setAiError(e.message)
    } finally {
      setSummarizing(false)
    }
  }

  // KI: Frage zum Kapitel (Text), Antwort streamen und vorlesen.
  const askChapter = async (text) => {
    if (!text || vqBusy) return
    tts.stop()
    setAiError('')
    setVqQuestion(text)
    setVqAnswer('')
    setVqBusy(true)
    try {
      let acc = ''
      await streamChat(
        { context: chapterContext, messages: [{ role: 'user', content: text }], mode: 'discuss' },
        (chunk) => {
          acc += chunk
          setVqAnswer(acc)
        }
      )
      tts.speak(stripMarkdown(acc))
    } catch (e) {
      setAiError(e.message)
    } finally {
      setVqBusy(false)
    }
  }

  // Mikrofon: zuhören und Frage stellen.
  const toggleMic = () => {
    if (speech.listening) {
      speech.stop()
    } else {
      tts.stop()
      speech.start((text) => askChapter(text))
    }
  }

  const hasResume = resumeRef.current > 0 && !tts.speaking

  return (
    <div className="reader-backdrop" onMouseDown={(e) => e.target === e.currentTarget && handleClose()}>
      <div className="reader">
        <div className="reader-head">
          <div>
            <div className="title">{chapter?.title || 'Kapitel'}</div>
            <div className="sub">
              Kapitel {index + 1} von {chapters.length}
              {chapter?.page ? ` · ab Seite ${chapter.page}` : ''}
            </div>
          </div>
          <button className="btn ghost" onClick={handleClose}>✕ Schließen</button>
        </div>

        <div className="reader-body" ref={bodyRef}>
          {/* KI-Aktionen */}
          <div className="ai-actions">
            <button className="btn" onClick={summarizeNow} disabled={summarizing || !tts.supported}>
              {summarizing ? <><span className="spinner" /> Fasse zusammen …</> : '✨ Kapitel zusammenfassen & vorlesen'}
            </button>
            {speech.supported && (
              <button
                className={'btn mic' + (speech.listening ? ' listening' : '')}
                onClick={toggleMic}
                disabled={vqBusy}
                title="Frage zum Kapitel per Sprache stellen"
              >
                {speech.listening ? '● Höre zu … (zum Stoppen klicken)' : '🎤 Frage per Sprache'}
              </button>
            )}
          </div>

          {speech.listening && speech.interim && (
            <div className="interim">„{speech.interim}"</div>
          )}
          {aiError && <div className="banner" style={{ marginBottom: 12 }}>{aiError}</div>}

          {skippable && (
            <div className="banner" style={{ marginBottom: 12 }}>
              🗂 Das sieht nach einem Verzeichnis aus (z. B. Inhalts-/Abbildungsverzeichnis).
              Beim Weiterlesen wird es übersprungen — du kannst es hier aber trotzdem vorlesen lassen.
            </div>
          )}

          {chapterSummary && (
            <div className="ai-panel">
              <div className="ai-panel-head">
                📝 Kapitel-Zusammenfassung
                <button className="btn ghost sm" onClick={() => tts.speak(stripMarkdown(chapterSummary))}>🔊 erneut vorlesen</button>
              </div>
              <div className="ai-panel-body">{chapterSummary}</div>
            </div>
          )}

          {(vqQuestion || vqAnswer) && (
            <div className="ai-panel">
              <div className="ai-panel-head">
                💬 {vqQuestion}
                {vqAnswer && !vqBusy && (
                  <button className="btn ghost sm" onClick={() => tts.speak(stripMarkdown(vqAnswer))}>🔊 erneut vorlesen</button>
                )}
              </div>
              <div className="ai-panel-body">{vqAnswer || <span className="spinner" />}</div>
            </div>
          )}

          {!tts.supported ? (
            <div className="banner">
              Dein Browser unterstützt die Sprachausgabe (Web Speech API) nicht.
              Bitte nutze Chrome, Edge oder Safari.
            </div>
          ) : (
            <p className="reading-text">
              {tts.speaking && tts.sentences.length
                ? tts.sentences.map((s, i) => (
                    <span
                      key={i}
                      ref={i === tts.sentenceIndex ? spokenRef : null}
                      className={i === tts.sentenceIndex ? 'spoken' : ''}
                    >
                      {s}{' '}
                    </span>
                  ))
                : chapter?.text}
            </p>
          )}
        </div>

        <div className="reader-controls">
          {finished ? (
            <div className="next-prompt">
              <span className="q">✅ Kapitel vorgelesen. Weiter zum nächsten Kapitel oder Fragen?</span>
              {nextContent >= 0 && (
                <button className="btn primary" onClick={() => goTo(nextContent)}>▶ Nächstes Kapitel</button>
              )}
              <button className="btn" onClick={() => onAskQuestions(index)}>💬 Im Chat fragen</button>
              <button className="btn ghost" onClick={startReading}>↻ Nochmal</button>
            </div>
          ) : (
            <div className="controls-row">
              <button className="iconbtn" onClick={() => goContent(index - 1, -1)} disabled={prevContent < 0} title="Vorheriges Kapitel">⏮</button>
              {!tts.speaking ? (
                <button className="iconbtn big" onClick={startReading} disabled={!chapter || !tts.supported} title={hasResume ? 'Weiterlesen' : 'Vorlesen'}>▶</button>
              ) : tts.paused ? (
                <button className="iconbtn big" onClick={tts.resume} title="Fortsetzen">▶</button>
              ) : (
                <button className="iconbtn big" onClick={tts.pause} title="Pause">⏸</button>
              )}
              {tts.speaking && <button className="iconbtn" onClick={tts.stop} title="Stopp">⏹</button>}
              <button className="iconbtn" onClick={() => goContent(index + 1, 1)} disabled={nextContent < 0} title="Nächstes Kapitel">⏭</button>
              <span className="grow" />
              {hasResume && <span style={{ fontSize: 12, color: 'var(--muted)' }}>↩ ab gespeicherter Stelle</span>}
              <button className="btn" onClick={() => onAskQuestions(index)}>💬 Chat</button>
            </div>
          )}

          <VoiceSettings tts={tts} />
        </div>
      </div>
    </div>
  )
}
