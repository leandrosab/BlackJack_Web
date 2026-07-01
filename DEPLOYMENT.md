# Deployment auf Render.com (kostenlos)

Render.com bietet einen **kostenlosen** Web-Service-Tier, der Node.js + WebSockets unterstützt (das brauchen wir für Socket.io). Die Einrichtung dauert ~5 Minuten.

## Voraussetzungen

- GitHub-Konto (für den Code-Push)
- Render-Konto: https://render.com (Anmeldung mit GitHub geht am einfachsten)

## Schritt 1 — Code auf GitHub

```bash
cd BlackJack_Web
git init
git add .
git commit -m "Initial Blackjack Royale"
git branch -M main
# Erstelle vorher ein leeres Repo auf github.com/new
git remote add origin https://github.com/DEIN-USER/blackjack-royale.git
git push -u origin main
```

## Schritt 2 — Neuen Web Service auf Render erstellen

1. Öffne https://dashboard.render.com/select-repo?type=web
2. Wähle dein GitHub-Repo `blackjack-royale`.
3. Fülle die Felder aus:
   - **Name**: `blackjack-royale` (oder was du willst)
   - **Region**: Frankfurt (nächster EU-Standort)
   - **Branch**: `main`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: **Free**
4. Unten unter **Environment** → **Add Environment Variable**:
   - Key: `JWT_SECRET` — Value: einen langen Zufallsstring, z.B. mit `openssl rand -hex 32` erzeugen
   - Key: `NODE_ENV` — Value: `production`
5. Klicke **Create Web Service**.

Nach ~2 Minuten Build ist deine Seite live unter `https://blackjack-royale.onrender.com` (der Genaue Name wird angezeigt).

## Schritt 3 — Fertig!

Öffne die URL, registriere dich, öffne die URL in einem zweiten Browser (oder auf einem Handy) und spielt zusammen ✨

---

## Wichtige Hinweise

### ⚠️ Free-Tier: Kaltstart

Der Free-Service auf Render **schläft** nach 15 Minuten Inaktivität ein. Der erste Aufruf danach dauert ~30 Sekunden (Wake-up). Danach ist alles wieder flott.

Workaround: einen kostenlosen Uptime-Ping-Dienst wie https://uptimerobot.com einrichten, der alle 10 Minuten die Seite pingt.

### ⚠️ Free-Tier: Ephemere Daten

Der Free-Plan hat **keinen persistenten Speicher**. Bei jedem Deploy und jedem Wake-up werden lokale Dateien gelöscht — d.h. `data/db.json` (Benutzer + Credits) wird zurückgesetzt.

Optionen für persistente Daten:
- **Render Persistent Disk** (~$1/Monat für 1 GB) — kleinste kostenpflichtige Option; danach bleibt `data/db.json` erhalten.
- **PostgreSQL** (z.B. Neon.tech Free-Tier) — dafür müsste die App auf SQL umgestellt werden.

Für einen Hobby-/Fun-Betrieb ist der Ephemere Modus meist völlig OK.

### Alternative: Fly.io / Railway

Die App ist reine Node.js — sie läuft überall wo Node ≥ 18 + WebSockets unterstützt wird:
- **Railway** (railway.app) — 500 Std/Monat gratis, persistenter Speicher inklusive.
- **Fly.io** — Free-Tier, verlangt Kreditkarten-Verifizierung.

Für Railway: Repo verknüpfen → `npm start` als Startbefehl → `JWT_SECRET` als Env-Variable → fertig.

## Lokal testen mit `NODE_ENV=production`

Achtung: In Production werden Cookies mit `secure: true` gesetzt — das funktioniert nur über HTTPS. Bei lokalen Tests deshalb `NODE_ENV=development` lassen.
