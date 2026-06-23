import React from 'react'

// Wiederverwendbare Stimm-/Tempo-/Tonhöhen-Einstellungen für eine useTTS-Instanz.
export default function VoiceSettings({ tts, showPitch = true }) {
  if (!tts.supported) return null
  return (
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
      <input type="range" min="0.6" max="1.6" step="0.1" value={tts.rate}
        onChange={(e) => tts.setRate(Number(e.target.value))} />

      {showPitch && (
        <>
          <span>Tonhöhe</span>
          <input type="range" min="0.6" max="1.4" step="0.1" value={tts.pitch}
            onChange={(e) => tts.setPitch(Number(e.target.value))} />
        </>
      )}
    </div>
  )
}
