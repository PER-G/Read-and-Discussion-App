// Lokale Speicherung im Browser.
// - Projekte (geparste PDFs + Zusammenfassung + Lesefortschritt) in IndexedDB
//   (kein 5-MB-Limit wie bei localStorage, gut für große Dokumente).
// - Stimm-/Wiedergabe-Einstellungen in localStorage (klein).
// Hinweis: Speicherung ist pro Gerät/Browser — am Handy hast du eine eigene Ablage.

const DB_NAME = 'read-discuss-db'
const STORE = 'projects'

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function saveProject(project) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(project)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function listProjects() {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).getAll()
    req.onsuccess = () => {
      const items = req.result || []
      // Neueste zuerst
      items.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      resolve(items)
    }
    req.onerror = () => reject(req.error)
  })
}

export async function getProject(id) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(id)
    req.onsuccess = () => resolve(req.result || null)
    req.onerror = () => reject(req.error)
  })
}

export async function deleteProject(id) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export function newId() {
  if (crypto.randomUUID) return crypto.randomUUID()
  return 'p_' + Math.random().toString(36).slice(2) + Date.now().toString(36)
}

// ---- Stimm-Einstellungen (localStorage) ----
const VOICE_KEY = 'rad_voice_settings'

export function loadVoiceSettings() {
  try {
    return JSON.parse(localStorage.getItem(VOICE_KEY)) || {}
  } catch {
    return {}
  }
}

export function saveVoiceSettings(settings) {
  try {
    localStorage.setItem(VOICE_KEY, JSON.stringify(settings))
  } catch {
    /* ignorieren */
  }
}
