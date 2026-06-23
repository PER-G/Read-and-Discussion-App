import React, { useRef, useState } from 'react'

// Hauptmenü: Liste gespeicherter Projekte + neues PDF hinzufügen.
export default function Library({ projects, onOpen, onDelete, onAddFile, uploading, progress, error }) {
  const [drag, setDrag] = useState(false)
  const fileInputRef = useRef(null)

  return (
    <div className="library">
      <div className="library-inner">
        <h1 className="library-title">📚 Meine Dokumente</h1>
        <p className="library-sub">
          Lade ein PDF hoch oder öffne ein gespeichertes Projekt. Dein Lesefortschritt
          wird auf diesem Gerät gespeichert.
        </p>

        <div
          className={'dropzone big' + (drag ? ' drag' : '')}
          onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); onAddFile(e.dataTransfer.files[0]) }}
          onClick={() => fileInputRef.current?.click()}
          style={{ cursor: 'pointer' }}
        >
          {uploading ? (
            <><span className="spinner" /><div style={{ marginTop: 8 }}>PDF wird gelesen … {Math.round(progress * 100)}%</div></>
          ) : (
            <><strong>+ Neues PDF hinzufügen</strong>Klicken oder Datei hierher ziehen</>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            style={{ display: 'none' }}
            onChange={(e) => onAddFile(e.target.files[0])}
          />
        </div>

        {error && <div className="banner" style={{ marginTop: 14 }}>{error}</div>}

        {projects.length === 0 ? (
          <div className="library-empty">Noch keine gespeicherten Projekte.</div>
        ) : (
          <div className="project-grid">
            {projects.map((p) => {
              const total = p.chapters?.length || 0
              const at = (p.progress?.chapterIndex ?? 0) + 1
              const pct = total ? Math.round(((p.progress?.chapterIndex ?? 0) / total) * 100) : 0
              return (
                <div key={p.id} className="project-card" onClick={() => onOpen(p.id)}>
                  <div className="project-icon">📄</div>
                  <div className="project-name">{p.title}</div>
                  <div className="project-meta">
                    {p.numPages} Seiten · {total} Kapitel
                  </div>
                  <div className="project-progress">
                    <div className="bar"><div className="bar-fill" style={{ width: pct + '%' }} /></div>
                    <div className="progress-label">
                      {p.progress?.chapterIndex ? `Zuletzt: Kapitel ${at}/${total}` : 'Noch nicht gelesen'}
                    </div>
                  </div>
                  <div className="project-actions">
                    <button className="btn primary" onClick={(e) => { e.stopPropagation(); onOpen(p.id) }}>Öffnen</button>
                    <button
                      className="btn ghost"
                      onClick={(e) => {
                        e.stopPropagation()
                        if (confirm(`Projekt „${p.title}" wirklich löschen?`)) onDelete(p.id)
                      }}
                    >
                      🗑
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
