// Erkennt "Nicht-Inhalts"-Kapitel (Inhalts-/Abbildungs-/Tabellenverzeichnis usw.),
// die beim Vorlesen übersprungen werden sollen.
export function isSkippableChapter(ch) {
  if (!ch) return false
  const title = (ch.title || '').toLowerCase().trim()

  // Titel deutet auf ein Verzeichnis hin
  if (/verzeichnis|inhaltsangabe|table of contents|list of (figures|tables)/.test(title)) return true
  // Titel ist ein Inhaltsverzeichnis-Eintrag (Punktführung + Seitenzahl, z. B. "... 43")
  if (/\.{3,}\s*\d{1,4}$/.test((ch.title || '').trim())) return true

  // Inhaltsbasiert: viele Zeilen wie "Überschrift ........ 12" -> Verzeichnis
  const lines = (ch.text || '').split('\n').map((l) => l.trim()).filter(Boolean)
  if (lines.length >= 6) {
    const tocLike = lines.filter(
      (l) => /\.{3,}\s*\d{1,4}$/.test(l) || (l.length < 80 && /\s\d{1,4}$/.test(l))
    ).length
    if (tocLike / lines.length > 0.6) return true
  }
  return false
}

// Markdown grob in reinen Text wandeln, damit die Sprachausgabe keine
// Sternchen/Rauten o. Ä. mitliest.
export function stripMarkdown(md) {
  return (md || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/^[ \t]*[-*]\s+/gm, '')
    .replace(/[#*_>]/g, '')
    .replace(/\n{2,}/g, '. ')
    .replace(/\s+/g, ' ')
    .trim()
}
