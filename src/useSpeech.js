import { useState, useRef, useCallback, useEffect } from 'react'

// Hook für Spracheingabe über die Web Speech API (SpeechRecognition).
// Funktioniert in Chrome & Edge (auch mobil). start(onFinal) hört einmal zu
// und ruft onFinal(text) mit dem erkannten Satz auf.
export function useSpeech(lang = 'de-DE') {
  const SR =
    typeof window !== 'undefined'
      ? window.SpeechRecognition || window.webkitSpeechRecognition
      : null
  const supported = Boolean(SR)

  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const recRef = useRef(null)
  const onFinalRef = useRef(null)

  const start = useCallback(
    (onFinal) => {
      if (!supported || listening) return
      const rec = new SR()
      rec.lang = lang
      rec.interimResults = true
      rec.continuous = false
      rec.maxAlternatives = 1
      onFinalRef.current = onFinal
      let finalText = ''

      rec.onresult = (e) => {
        let interimText = ''
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const t = e.results[i][0].transcript
          if (e.results[i].isFinal) finalText += t
          else interimText += t
        }
        setInterim(interimText || finalText)
      }
      rec.onerror = () => setListening(false)
      rec.onend = () => {
        setListening(false)
        setInterim('')
        const text = finalText.trim()
        if (text && onFinalRef.current) onFinalRef.current(text)
      }

      recRef.current = rec
      setInterim('')
      setListening(true)
      try {
        rec.start()
      } catch {
        setListening(false)
      }
    },
    [supported, listening, SR, lang]
  )

  const stop = useCallback(() => {
    try { recRef.current?.stop() } catch { /* egal */ }
  }, [])

  const abort = useCallback(() => {
    try { recRef.current?.abort() } catch { /* egal */ }
    setListening(false)
    setInterim('')
  }, [])

  useEffect(() => () => { try { recRef.current?.abort() } catch { /* egal */ } }, [])

  return { supported, listening, interim, start, stop, abort }
}
