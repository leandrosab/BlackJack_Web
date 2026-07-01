# ♠ Blackjack Royale

Online Multiplayer Blackjack — mit Login, Fake-Credits, Chat und einem hübschen Casino-Design. Bis zu 5 Spieler pro Tisch, echter Live-Modus mit WebSockets.

![screenshot](https://via.placeholder.com/900x450/0f5132/d4af37?text=%E2%99%A0+Blackjack+Royale)

## Features

- 🔐 **Konten** — Registrierung, Login, JWT-Cookie-Session (bcrypt-Passwort-Hashing)
- 💰 **Fake-Credits** — jeder Spieler startet mit 1000 Credits
- 🃏 **Echte Blackjack-Regeln** — 3:2 Auszahlung bei Blackjack, Dealer zieht bis 17, Verdoppeln (Double Down)
- 🌐 **Online-Multiplayer** — Socket.io, bis zu 5 Spieler pro Tisch, Live-Chat
- 🏆 **Bestenliste** — Top 10 nach Credits
- 🎨 **Design** — Casino-Filz-Tisch, Chip-Grafiken, Karten-Animationen, Gold-Akzente

## Lokal starten

```bash
npm install
cp .env.example .env         # Windows: copy .env.example .env
# JWT_SECRET in .env auf einen langen Zufallsstring setzen!
npm start
```

Dann öffnen: **http://localhost:3000**

Für Multiplayer-Test einfach zwei verschiedene Browser (oder Inkognito-Fenster) öffnen und beide Konten am selben Tisch anmelden.

## Struktur

```
server/
  index.js       Express + Socket.io Entrypoint
  auth.js        Register/Login/JWT-Middleware
  db.js          JSON-Datei-Datenbank
  game.js        Blackjack-Engine (Deck, Score, Payout)
  rooms.js       Multiplayer-Räume + Spielfluss
public/
  index.html     Login/Register
  lobby.html     Räume-Liste + Bestenliste
  game.html      Spieltisch
  css/style.css  Alle Styles
  js/            Frontend-Skripte
data/db.json     Benutzer-Daten (wird beim ersten Start erzeugt)
```

## Deployment

Siehe [DEPLOYMENT.md](DEPLOYMENT.md) für eine Schritt-für-Schritt-Anleitung zum kostenlosen Hosten auf **Render.com**.

## Regeln (kurz)

- Ziel: näher an 21 als der Dealer, ohne zu überkaufen.
- Karten 2–10 = Wert, J/Q/K = 10, Ass = 1 oder 11 (automatisch beste Wahl).
- **Blackjack** (Ass + 10er in ersten 2 Karten) zahlt 3:2.
- **Hit** = weitere Karte. **Stand** = passen. **Double** = Einsatz verdoppeln + genau 1 Karte.
- Dealer zieht bis 17 und bleibt dann stehen.
- Min. Einsatz: 10, Max. Einsatz: 500.
- Timer: 20s zum Setzen, 25s pro Zug.
