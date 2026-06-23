// Server-seitige Authentifizierung.
// - Zugangsdaten kommen aus Umgebungsvariablen (NICHT im Code!):
//     AUTH_USER, AUTH_PASS, AUTH_SECRET
// - Nach erfolgreichem Login bekommt der Client ein HMAC-signiertes Token
//   mit Ablaufdatum. Gefälschte/abgelaufene Tokens werden abgewiesen.
// - Passwortvergleich ist timing-sicher (gegen Timing-Angriffe).
// - "Fail closed": Ohne konfigurierte Zugangsdaten ist KEIN Login möglich.
import crypto from 'crypto'

const USER = process.env.AUTH_USER || ''
const PASS = process.env.AUTH_PASS || ''
// Ohne gesetztes Secret: zufälliges erzeugen (lokal ok; auf Vercel/Render
// unbedingt AUTH_SECRET setzen, sonst werden Tokens bei Neustart ungültig).
const SECRET = process.env.AUTH_SECRET || crypto.randomBytes(32).toString('hex')
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 Tage

export function authConfigured() {
  return Boolean(USER && PASS)
}

// Timing-sicherer Vergleich: beide Seiten auf feste Länge hashen, dann vergleichen.
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest()
  const hb = crypto.createHash('sha256').update(String(b)).digest()
  return crypto.timingSafeEqual(ha, hb)
}

export function verifyCredentials(user, pass) {
  if (!authConfigured()) return false
  // Beide Vergleiche immer ausführen (kein frühes Abbrechen).
  const okUser = safeEqual(user, USER)
  const okPass = safeEqual(pass, PASS)
  return okUser && okPass
}

function sign(data) {
  return crypto.createHmac('sha256', SECRET).update(data).digest('base64url')
}

export function createToken() {
  const payload = Buffer.from(
    JSON.stringify({ exp: Date.now() + TOKEN_TTL_MS })
  ).toString('base64url')
  return `${payload}.${sign(payload)}`
}

export function verifyToken(token) {
  if (!token || typeof token !== 'string') return false
  const [payload, sig] = token.split('.')
  if (!payload || !sig) return false
  if (!safeEqual(sig, sign(payload))) return false
  try {
    const { exp } = JSON.parse(Buffer.from(payload, 'base64url').toString())
    return typeof exp === 'number' && exp > Date.now()
  } catch {
    return false
  }
}

// Express-Middleware: schützt Endpunkte. Fail closed.
export function requireAuth(req, res, next) {
  const header = req.headers['authorization'] || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (verifyToken(token)) return next()
  res.status(401).json({ error: 'Nicht autorisiert. Bitte anmelden.' })
}
