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

## Als Web-App veröffentlichen (Render.com, kostenlos)

Die App braucht einen Node-Server (für den geheimen API-Key), daher funktioniert
reines GitHub Pages **nicht**. Empfohlen: **Render.com** (Free-Tier).

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/PER-G/Read-and-Discussion-App)

Mit dem Button oben: anmelden, GitHub verbinden, beim Schritt **Environment**
den `ANTHROPIC_API_KEY` eintragen → **Deploy**. Fertig.

Oder manuell:

1. Code zu GitHub pushen (siehe Repo `PER-G/Read-and-Discussion-App`).
2. Auf https://render.com mit GitHub anmelden → **New → Blueprint**.
3. Repo auswählen — Render liest `render.yaml` automatisch.
4. Bei **Environment Variables** den `ANTHROPIC_API_KEY` als Secret eintragen
   (steht NICHT im Repo!).
5. **Apply / Deploy** klicken. Nach ein paar Minuten ist die App unter einer
   `https://...onrender.com`-Adresse erreichbar.

> Produktion: `npm run build` erzeugt `dist/`, und `npm start` startet den
> Express-Server, der Frontend **und** API über einen Port ausliefert.

## Spätere Ausbaustufen (optional)
- Hochwertigere Stimmen via OpenAI-TTS oder ElevenLabs
- Mehrere Dokumente gleichzeitig / dauerhafte Speicherung
- Zitate mit Seitenverweis in den KI-Antworten
