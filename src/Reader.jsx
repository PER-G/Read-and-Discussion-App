import React, { useEffect, useRef, useState } from 'react'
import { useTTS } from './useTTS.js'

// Vorlese-Overlay: liest das aktuelle Kapitel kapitelweise vor.
// Nach jedem Kapitel erscheint die Frage "Weiter oder Fragen?".
export default function Reader({ chapters, startIndex, onClose, onAskQuestions, onActiveChange }) {
  const tts = useTTS()
  const [index, setIndex] = useState(startIndex)
  const [finished, setFinished] = useState(false)
  const bodyRef = useRef(null)
  const spokenRef = useRef(null)

  const chapter = chapters[index]

  // Beim Kapitelwechsel: Sprachausgabe stoppen, Eltern informieren.
  useEffect(() => {
    setFinished(false)
    tts.stop()
    if (onActiveChange) onActiveChange(index)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index])

  // Auto-Scroll zum gerade gesprochenen Satz.
  useEffect(() => {
    if (spokenRef.current) {
      spokenRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }, [tts.sentenceIndex])

  const startReading = () => {
    if (!chapter) return
    setFinished(false)
    tts.speak(chapter.text, () => setFinished(true))
  }

  const goTo = (i) => {
    if (i < 0 || i >= chapters.length) return
    tts.stop()
    setIndex(i)
  }

  const hasNext = index < chapters.length - 1

  return (
    <div className="reader-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="reader">
        <div className="reader-head">
          <div>
            <div className="title">{chapter?.title || 'Kapitel'}</div>
            <div className="sub">
              Kapitel {index + 1} von {chapters.length}
              {chapter?.page ? ` · ab Seite ${chapter.page}` : ''}
            </div>
          </div>
          <button className="btn ghost" onClick={onClose}>✕ Schließen</button>
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
                <button className="iconbtn big" onClick={startReading} disabled={!chapter || !tts.supported} title="Vorlesen">▶</button>
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
              <button className="btn" onClick={() => onAskQuestions(index)}>💬 Fragen</button>
            </div>
          )}

          {/* Stimm-Einstellungen */}
          <div className="voice-row">
            <span>🎙 Stimme:</span>
            <select value={tts.voiceURI || ''} onChange={(e) => tts.setVoiceURI(e.target.value)}>
              {tts.voices.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name} ({v.lang})
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
