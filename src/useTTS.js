import { useState, useEffect, useRef, useCallback } from 'react'
import { loadVoiceSettings, saveVoiceSettings } from './storage.js'

// Hook für Text-to-Speech über die Web Speech API des Browsers.
// Liest Text satzweise vor (damit Pause/Weiter zuverlässig funktioniert),
// meldet den aktuell gesprochenen Satz und kann ab einer Position fortsetzen.
export function useTTS() {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : null
  const supported = Boolean(synth)

  const saved = loadVoiceSettings()
  const [voices, setVoices] = useState([])
  const [voiceURI, setVoiceURI] = useState(saved.voiceURI || null)
  const [rate, setRate] = useState(saved.rate || 1)
  const [pitch, setPitch] = useState(saved.pitch || 1)
  const [speaking, setSpeaking] = useState(false)
  const [paused, setPaused] = useState(false)
  const [sentenceIndex, setSentenceIndex] = useState(-1)

  const sentencesRef = useRef([])
  const idxRef = useRef(0)
  const onDoneRef = useRef(null)
  const cancelledRef = useRef(false)

  // Stimmen laden und nach Sprache sortieren: Deutsch zuerst.
  useEffect(() => {
    if (!supported) return
    const load = () => {
      const list = synth.getVoices()
      if (!list.length) return
      const sorted = [...list].sort((a, b) => {
        const da = a.lang?.toLowerCase().startsWith('de') ? 0 : 1
        const db = b.lang?.toLowerCase().startsWith('de') ? 0 : 1
        if (da !== db) return da - db
        return a.name.localeCompare(b.name)
      })
      setVoices(sorted)
      setVoiceURI((cur) => {
        if (cur && sorted.some((v) => v.voiceURI === cur)) return cur
        const de = sorted.find((v) => v.lang?.toLowerCase().startsWith('de'))
        return (de || sorted[0]).voiceURI
      })
    }
    load()
    synth.addEventListener('voiceschanged', load)
    return () => synth.removeEventListener('voiceschanged', load)
  }, [supported, synth])

  // Einstellungen merken.
  useEffect(() => {
    if (voiceURI) saveVoiceSettings({ voiceURI, rate, pitch })
  }, [voiceURI, rate, pitch])

  const speakNext = useCallback(() => {
    if (cancelledRef.current) return
    const sentences = sentencesRef.current
    if (idxRef.current >= sentences.length) {
      setSpeaking(false)
      setPaused(false)
      setSentenceIndex(-1)
      const cb = onDoneRef.current
      onDoneRef.current = null
      if (cb) cb()
      return
    }
    const i = idxRef.current
    setSentenceIndex(i)
    const u = new SpeechSynthesisUtterance(sentences[i])
    const voice = voices.find((v) => v.voiceURI === voiceURI)
    if (voice) u.voice = voice
    u.lang = voice?.lang || 'de-DE'
    u.rate = rate
    u.pitch = pitch
    u.onend = () => {
      if (cancelledRef.current) return
      idxRef.current += 1
      speakNext()
    }
    u.onerror = () => {
      if (cancelledRef.current) return
      idxRef.current += 1
      speakNext()
    }
    synth.speak(u)
  }, [voices, voiceURI, rate, pitch, synth])

  // Zuverlässig stoppen: gegen die Chrome-Eigenheit erst resume(), dann cancel().
  const stop = useCallback(() => {
    if (!supported) return
    cancelledRef.current = true
    try { synth.resume() } catch { /* egal */ }
    synth.cancel()
    setSpeaking(false)
    setPaused(false)
    setSentenceIndex(-1)
  }, [supported, synth])

  // Text in Sätze zerlegen und ab startIndex vorlesen.
  const speak = useCallback(
    (text, onDone, startIndex = 0) => {
      if (!supported || !text) return
      cancelledRef.current = true
      try { synth.resume() } catch { /* egal */ }
      synth.cancel()

      const sentences =
        text.replace(/\s+/g, ' ').match(/[^.!?]+[.!?]*|\S+/g) || [text]
      sentencesRef.current = sentences.map((s) => s.trim()).filter(Boolean)
      const maxIdx = Math.max(0, sentencesRef.current.length - 1)
      idxRef.current = Math.min(Math.max(0, startIndex), maxIdx)
      onDoneRef.current = onDone || null

      cancelledRef.current = false
      setSpeaking(true)
      setPaused(false)
      setTimeout(() => speakNext(), 80)
    },
    [supported, synth, speakNext]
  )

  const pause = useCallback(() => {
    if (!supported) return
    synth.pause()
    setPaused(true)
  }, [supported, synth])

  const resume = useCallback(() => {
    if (!supported) return
    synth.resume()
    setPaused(false)
  }, [supported, synth])

  // Beim Verlassen sauber aufräumen (resume + cancel).
  useEffect(
    () => () => {
      if (synth) {
        try { synth.resume() } catch { /* egal */ }
        synth.cancel()
      }
    },
    [synth]
  )

  return {
    supported,
    voices,
    voiceURI,
    setVoiceURI,
    rate,
    setRate,
    pitch,
    setPitch,
    speaking,
    paused,
    sentenceIndex,
    sentences: sentencesRef.current,
    speak,
    pause,
    resume,
    stop,
  }
}
