// Lokaler / Render-Server: nutzt die Express-App und liefert zusätzlich das
// gebaute Frontend (dist/) aus, damit alles über EINEN Port läuft.
import 'dotenv/config'
import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import { existsSync } from 'fs'
import app from './app.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = process.env.PORT || 8787

// Im Produktionsbetrieb das gebaute Frontend ausliefern.
const distPath = path.join(__dirname, '..', 'dist')
if (existsSync(distPath)) {
  app.use(express.static(distPath))
  app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'))
  })
}

app.listen(PORT, () => {
  console.log(`\n  Server läuft auf http://localhost:${PORT}`)
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('  ⚠  ANTHROPIC_API_KEY fehlt — bitte .env anlegen (siehe .env.example).\n')
  }
})
