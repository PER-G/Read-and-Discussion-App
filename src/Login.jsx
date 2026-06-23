import React, { useState } from 'react'
import { login } from './api.js'

// Login-Maske. Wird angezeigt, solange keine gültige Sitzung besteht.
export default function Login({ onSuccess, health }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await login(username, password)
      onSuccess()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const notConfigured = health && health.authConfigured === false

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="login-logo">📖</div>
        <h1>Read &amp; Discuss</h1>
        <p className="login-sub">Bitte anmelden, um fortzufahren.</p>

        {notConfigured && (
          <div className="banner">
            ⚠ Der Server hat noch keine Zugangsdaten konfiguriert
            (<code>AUTH_USER</code>/<code>AUTH_PASS</code>). Login ist erst danach möglich.
          </div>
        )}

        <label>
          Benutzername
          <input
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
          />
        </label>

        <label>
          Passwort
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        {error && <div className="login-error">{error}</div>}

        <button className="btn primary full" type="submit" disabled={busy}>
          {busy ? <span className="spinner" /> : 'Anmelden'}
        </button>
      </form>
    </div>
  )
}
