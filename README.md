# Read & Discuss — KI-Lesebegleiter

Eine lokale Web-App im Stil von NotebookLM: PDF hochladen → von **Claude** zusammenfassen
lassen → **kapitelweise vorlesen** (Browser-Stimme) → mit der KI **diskutieren** oder sich
**abfragen** lassen. Gebaut für das Lesen & Besprechen einer Bachelorthesis.

## Funktionen
- 📄 **PDF-Upload** mit automatischer Kapitel-Erkennung (Lesezeichen oder Überschriften)
- 📝 **Automatische Zusammenfassung** (gesamt) durch Claude
- 🔊 **Vorlesen** Kapitel für Kapitel mit der Browser-Sprachausgabe
  - Stimme wechselbar, Tempo & Tonhöhe einstellbar
  - Nach jedem Kapitel: *„Weiter zum nächsten Kapitel oder Fragen?"*
- 💬 **Diskussion**: Fragen an die KI stellen (mit Dokumentkontext, gestreamt)
- ❓ **Frage-Runde**: die KI fragt **dich** ab und gibt Feedback — oder erzeugt eine Liste Übungsfragen
- 🔒 **Login-Schutz**: Benutzername + Passwort schützen die App und den API-Key.
  Geprüft wird **server-seitig**; alle KI-Endpunkte verlangen ein gültiges, signiertes
  Token (HMAC). Zugangsdaten liegen nur als Umgebungsvariablen vor, nie im Code.

## Einrichtung

### 1. Abhängigkeiten installieren
```bash
npm install
```

### 2. API-Key hinterlegen
Kopiere `.env.example` zu `.env` und trage deinen Anthropic-Key ein:
```
ANTHROPIC_API_KEY=sk-ant-...
CLAUDE_MODEL=claude-sonnet-4-6
PORT=8787
```
Key bekommst du hier: https://console.anthropic.com/settings/keys

### 3. Starten
```bash
npm run dev
```
- Frontend: http://localhost:5173
- Backend:  http://localhost:8787 (wird automatisch mitgestartet)

Öffne **http://localhost:5173** im Browser (Chrome/Edge/Safari empfohlen für die Sprachausgabe).

## Technik
- **Frontend**: React + Vite
- **Backend**: Node + Express, `@anthropic-ai/sdk`, PDF-Parsing mit `pdfjs-dist`
- **Sprachausgabe**: Web Speech API (im Browser, kostenlos)

## Hinweise
- Das Dokument wird nur **im Arbeitsspeicher** des lokalen Servers gehalten (kein Speichern auf Platte).
  Beim Neustart des Servers muss das PDF erneut hochgeladen werden.
- Die Stimmen-Auswahl hängt vom Betriebssystem/Browser ab. Unter Windows liefert Edge meist
  natürlichere (Online-)Stimmen als Chrome.
- Sehr große PDFs werden für die KI-Aufrufe automatisch gekürzt, um Token-Limits einzuhalten.

## Als Web-App veröffentlichen

Das PDF wird **im Browser** geparst; der Server ist ein zustandsloser Claude-Proxy.
Dadurch läuft die App sowohl auf **Vercel** (serverless) als auch auf **Render** /
einem eigenen Node-Server. Reines GitHub Pages reicht **nicht** (es braucht den
Server für den geheimen API-Key).

### Variante A: Vercel (empfohlen, wenn du ein Vercel-Konto hast)
1. Auf https://vercel.com → **Add New… → Project** → Repo
   `PER-G/Read-and-Discussion-App` importieren.
2. Vercel erkennt Vite automatisch. Unter **Environment Variables** eintragen:
   - `ANTHROPIC_API_KEY` = dein Key (Secret)
   - `AUTH_USER` = Benutzername fürs Login
   - `AUTH_PASS` = Passwort fürs Login
   - `AUTH_SECRET` = langer zufälliger String (signiert die Login-Tokens)
   - optional `CLAUDE_MODEL` = `claude-sonnet-4-6`
3. **Deploy** klicken. Die `vercel.json` richtet die API-Function automatisch ein.

> ⚠️ **Wichtig:** Ohne `AUTH_USER`/`AUTH_PASS` ist die App gesperrt (Login nicht möglich) —
> das schützt deinen API-Key. `AUTH_SECRET` unbedingt setzen, sonst wirst du nach jedem
> Server-Neustart abgemeldet.

> Hinweis: Der API-Aufruf läuft als Serverless-Function (`api/index.js`) mit bis zu
> 60 s Laufzeit (in `vercel.json` gesetzt).

### Variante B: Render.com (kostenlos)
[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/PER-G/Read-and-Discussion-App)

Render liest `render.yaml` automatisch. Beim Schritt **Environment** den
`ANTHROPIC_API_KEY` als Secret eintragen → **Apply**.

> Produktion lokal testen: `npm run build` erzeugt `dist/`, und `npm start` startet
> den Express-Server, der Frontend **und** API über einen Port ausliefert.

## Spätere Ausbaustufen (optional)
- Hochwertigere Stimmen via OpenAI-TTS oder ElevenLabs
- Mehrere Dokumente gleichzeitig / dauerhafte Speicherung
- Zitate mit Seitenverweis in den KI-Antworten
