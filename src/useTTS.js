import { useState, useEffect, useRef, useCallback } from 'react'

// Hook für Text-to-Speech über die Web Speech API des Browsers.
// Liest Text satzweise vor (damit Pause/Weiter zuverlässig funktioniert) und
// meldet, welcher Satz gerade gesprochen wird sowie wann alles fertig ist.
export function useTTS() {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : null
  const supported = Boolean(synth)

  const [voices, setVoices] = useState([])
  const [voiceURI, setVoiceURI] = useState(null)
  const [rate, setRate] = useState(1)
  const [pitch, setPitch] = useState(1)
  const [speaking, setSpeaking] = useState(false)
  const [paused, setPaused] = useState(false)
  const [sentenceIndex, setSentenceIndex] = useState(-1)

  const sentencesRef = useRef([])
  const idxRef = useRef(0)
  const onDoneRef = useRef(null)
  const cancelledRef = useRef(false)

  // Verfügbare Stimmen laden (kommen teils asynchron).
  useEffect(() => {
    if (!supported) return
    const load = () => {
      const list = synth.getVoices()
      if (!list.length) return
      setVoices(list)
      setVoiceURI((cur) => {
        if (cur) return cur
        // Bevorzugt eine deutsche Stimme
        const de = list.find((v) => v.lang?.toLowerCase().startsWith('de'))
        return (de || list[0]).voiceURI
      })
    }
    load()
    synth.addEventListener('voiceschanged', load)
    return () => synth.removeEventListener('voiceschanged', load)
  }, [supported, synth])

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

  const stop = useCallback(() => {
    if (!supported) return
    cancelledRef.current = true
    synth.cancel()
    setSpeaking(false)
    setPaused(false)
    setSentenceIndex(-1)
  }, [supported, synth])

  // Text in Sätze zerlegen und vorlesen.
  const speak = useCallback(
    (text, onDone) => {
      if (!supported || !text) return
      cancelledRef.current = true
      synth.cancel()

      const sentences = text
        .replace(/\s+/g, ' ')
        .match(/[^.!?]+[.!?]*|\S+/g) || [text]
      sentencesRef.current = sentences.map((s) => s.trim()).filter(Boolean)
      idxRef.current = 0
      onDoneRef.current = onDone || null

      cancelledRef.current = false
      setSpeaking(true)
      setPaused(false)
      // Kurze Verzögerung, damit cancel() sicher durch ist.
      setTimeout(() => speakNext(), 60)
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

  // Beim Verlassen aufräumen.
  useEffect(() => () => { if (synth) synth.cancel() }, [synth])

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
