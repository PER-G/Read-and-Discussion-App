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
