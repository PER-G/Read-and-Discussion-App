import { useState, useEffect, useRef, useCallback } from 'react'
import { loadVoiceSettings, saveVoiceSettings } from './storage.js'

// Hook für Text-to-Speech über die Web Speech API des Browsers.
// Liest Text satzweise vor, meldet den aktuellen Satz, kann ab einer Position
// fortsetzen und übernimmt Änderungen an Tempo/Tonhöhe/Stimme SOFORT.
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

  // Refs, damit speakNext immer die aktuellen Werte nutzt (ohne neu erstellt zu werden).
  const voicesRef = useRef([])
  const voiceURIRef = useRef(voiceURI)
  const rateRef = useRef(rate)
  const pitchRef = useRef(pitch)
  const speakingRef = useRef(false)
  const pausedRef = useRef(false)
  const sentencesRef = useRef([])
  const idxRef = useRef(0)
  const onDoneRef = useRef(null)
  const cancelledRef = useRef(false)

  useEffect(() => { voiceURIRef.current = voiceURI }, [voiceURI])
  useEffect(() => { rateRef.current = rate }, [rate])
  useEffect(() => { pitchRef.current = pitch }, [pitch])
  useEffect(() => { speakingRef.current = speaking }, [speaking])
  useEffect(() => { pausedRef.current = paused }, [paused])

  // Stimmen laden, Deutsch zuerst.
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
      voicesRef.current = sorted
      setVoices(sorted)
      setVoiceURI((cur) => {
        const next = cur && sorted.some((v) => v.voiceURI === cur)
          ? cur
          : (sorted.find((v) => v.lang?.toLowerCase().startsWith('de')) || sorted[0]).voiceURI
        voiceURIRef.current = next
        return next
      })
    }
    load()
    synth.addEventListener('voiceschanged', load)
    return () => synth.removeEventListener('voiceschanged', load)
  }, [supported, synth])

  useEffect(() => {
    if (voiceURI) saveVoiceSettings({ voiceURI, rate, pitch })
  }, [voiceURI, rate, pitch])

  const speakNext = useCallback(() => {
    if (cancelledRef.current || !synth) return
    const sentences = sentencesRef.current
    if (idxRef.current >= sentences.length) {
      setSpeaking(false); speakingRef.current = false
      setPaused(false); pausedRef.current = false
      setSentenceIndex(-1)
      const cb = onDoneRef.current
      onDoneRef.current = null
      if (cb) cb()
      return
    }
    const i = idxRef.current
    setSentenceIndex(i)
    const u = new SpeechSynthesisUtterance(sentences[i])
    const voice = voicesRef.current.find((v) => v.voiceURI === voiceURIRef.current)
    if (voice) u.voice = voice
    u.lang = voice?.lang || 'de-DE'
    u.rate = rateRef.current
    u.pitch = pitchRef.current
    u.onend = () => { if (!cancelledRef.current) { idxRef.current += 1; speakNext() } }
    u.onerror = () => { if (!cancelledRef.current) { idxRef.current += 1; speakNext() } }
    synth.speak(u)
  }, [synth])

  const stop = useCallback(() => {
    if (!supported) return
    cancelledRef.current = true
    try { synth.resume() } catch { /* egal */ }
    synth.cancel()
    setSpeaking(false); speakingRef.current = false
    setPaused(false); pausedRef.current = false
    setSentenceIndex(-1)
  }, [supported, synth])

  const speak = useCallback(
    (text, onDone, startIndex = 0) => {
      if (!supported || !text) return
      cancelledRef.current = true
      try { synth.resume() } catch { /* egal */ }
      synth.cancel()

      const sentences = text.replace(/\s+/g, ' ').match(/[^.!?]+[.!?]*|\S+/g) || [text]
      sentencesRef.current = sentences.map((s) => s.trim()).filter(Boolean)
      const maxIdx = Math.max(0, sentencesRef.current.length - 1)
      idxRef.current = Math.min(Math.max(0, startIndex), maxIdx)
      onDoneRef.current = onDone || null

      cancelledRef.current = false
      setSpeaking(true); speakingRef.current = true
      setPaused(false); pausedRef.current = false
      setTimeout(() => speakNext(), 80)
    },
    [supported, synth, speakNext]
  )

  // Tempo/Tonhöhe/Stimme während des Vorlesens ändern -> aktuellen Satz neu starten.
  useEffect(() => {
    if (!speakingRef.current || pausedRef.current || !synth) return
    cancelledRef.current = true
    try { synth.resume() } catch { /* egal */ }
    synth.cancel()
    cancelledRef.current = false
    const id = setTimeout(() => { if (!cancelledRef.current) speakNext() }, 80)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rate, pitch, voiceURI])

  const pause = useCallback(() => {
    if (!supported) return
    synth.pause()
    setPaused(true); pausedRef.current = true
  }, [supported, synth])

  const resume = useCallback(() => {
    if (!supported) return
    synth.resume()
    setPaused(false); pausedRef.current = false
  }, [supported, synth])

  useEffect(
    () => () => {
      if (synth) { try { synth.resume() } catch { /* egal */ }; synth.cancel() }
    },
    [synth]
  )

  return {
    supported, voices, voiceURI, setVoiceURI,
    rate, setRate, pitch, setPitch,
    speaking, paused, sentenceIndex, sentences: sentencesRef.current,
    speak, pause, resume, stop,
  }
}
