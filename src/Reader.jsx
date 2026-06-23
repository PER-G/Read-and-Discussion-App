import React, { useEffect, useRef, useState } from 'react'
import { useTTS } from './useTTS.js'

// Vorlese-Overlay: liest das aktuelle Kapitel kapitelweise vor.
// - stoppt die Sprachausgabe zuverlässig beim Schließen
// - merkt sich die Position (Kapitel + Satz) über onProgress
// - kann an gespeicherter Stelle weiterlesen (startSentence)
export default function Reader({
  chapters,
  startIndex,
  startSentence = 0,
  onClose,
  onAskQuestions,
  onProgress,
}) {
  const tts = useTTS()
  const [index, setIndex] = useState(startIndex)
  const [finished, setFinished] = useState(false)
  const bodyRef = useRef(null)
  const spokenRef = useRef(null)
  const resumeRef = useRef(startSentence || 0)

  const chapter = chapters[index]

  // Sauberes Schließen: Audio stoppen, dann Overlay zu.
  const handleClose = () => {
    if (onProgress) onProgress(index, Math.max(0, tts.sentenceIndex))
    tts.stop()
    onClose()
  }

  // Beim Kapitelwechsel: Sprachausgabe stoppen.
  useEffect(() => {
    setFinished(false)
    tts.stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index])

  // Position laufend melden (zum Speichern des Fortschritts).
  useEffect(() => {
    if (onProgress) onProgress(index, Math.max(0, tts.sentenceIndex))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, tts.sentenceIndex])

  // Auto-Scroll zum gerade gesprochenen Satz.
  useEffect(() => {
    if (spokenRef.current) {
      spokenRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }, [tts.sentenceIndex])

  const startReading = () => {
    if (!chapter) return
    setFinished(false)
    const from = resumeRef.current
    resumeRef.current = 0 // nur beim ersten Mal ab gespeicherter Stelle
    tts.speak(chapter.text, () => setFinished(true), from)
  }

  const goTo = (i) => {
    if (i < 0 || i >= chapters.length) return
    tts.stop()
    resumeRef.current = 0
    setIndex(i)
  }

  const hasNext = index < chapters.length - 1
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
              {hasNext && (
                <button className="btn primary" onClick={() => goTo(index + 1)}>
                  ▶ Nächstes Kapitel
                </button>
              )}
              <button className="btn" onClick={() => onAskQuestions(index)}>
                💬 Fragen stellen
              </button>
              <button className="btn ghost" onClick={startReading}>↻ Nochmal</button>
            </div>
          ) : (
            <div className="controls-row">
              <button className="iconbtn" onClick={() => goTo(index - 1)} disabled={index === 0} title="Vorheriges Kapitel">⏮</button>

              {!tts.speaking ? (
                <button className="iconbtn big" onClick={startReading} disabled={!chapter || !tts.supported} title={hasResume ? 'Weiterlesen' : 'Vorlesen'}>▶</button>
              ) : tts.paused ? (
                <button className="iconbtn big" onClick={tts.resume} title="Fortsetzen">▶</button>
              ) : (
                <button className="iconbtn big" onClick={tts.pause} title="Pause">⏸</button>
              )}

              {tts.speaking && (
                <button className="iconbtn" onClick={tts.stop} title="Stopp">⏹</button>
              )}

              <button className="iconbtn" onClick={() => goTo(index + 1)} disabled={!hasNext} title="Nächstes Kapitel">⏭</button>

              <span className="grow" />
              {hasResume && <span style={{ fontSize: 12, color: 'var(--muted)' }}>↩ liest ab gespeicherter Stelle</span>}
              <button className="btn" onClick={() => onAskQuestions(index)}>💬 Fragen</button>
            </div>
          )}

          {/* Stimm-Einstellungen */}
          <div className="voice-row">
            <span>🎙 Stimme:</span>
            <select value={tts.voiceURI || ''} onChange={(e) => tts.setVoiceURI(e.target.value)}>
              {tts.voices.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.lang?.toLowerCase().startsWith('de') ? '🇩🇪 ' : ''}{v.name} ({v.lang})
                </option>
              ))}
            </select>

            <span>Tempo {tts.rate.toFixed(1)}×</span>
            <input type="range" min="0.6" max="1.6" step="0.1" value={tts.rate} onChange={(e) => tts.setRate(Number(e.target.value))} />

            <span>Tonhöhe</span>
            <input type="range" min="0.6" max="1.4" step="0.1" value={tts.pitch} onChange={(e) => tts.setPitch(Number(e.target.value))} />
          </div>
        </div>
      </div>
    </div>
  )
}
