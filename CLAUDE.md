# VITAL — Projektkontext für Claude Code

## Was ist das Projekt

VITAL ist eine Ernährungs-/Gewichts-Tracking-App als **einzige `index.html`-Datei**
(React 18 + Babel, alles per CDN-`<script>`-Tag geladen, kein Build-Prozess,
kein npm-Bundling für die App selbst). Deployment über Vercel als statische Seite
(siehe `vercel.json` — kein Build-Command).

## Architektur

- **`index.html`** — die komplette App: UI, Forecast-Engine, alles in einer Datei.
- **`forecast-engine.js`** — lesbare Referenzkopie der Forecast-Engine-Logik
  (Monatsend-Gewichtsprognose, Kalibrierung, Gewichtsvalidierung). Diese Logik
  ist auch 1:1 in `index.html` eingebettet.
- **`sync-engine.py`** — WICHTIG: Wenn die Engine-Logik geändert wird, IMMER
  zuerst in `forecast-engine.js` ändern, dann `python3 sync-engine.py`
  ausführen, um den Block in `index.html` atomar zu synchronisieren. Niemals
  den Engine-Block direkt in `index.html` von Hand editieren — das würde beim
  nächsten Sync überschrieben und die beiden Dateien liefen sonst auseinander.
  Check-Modus: `python3 sync-engine.py --check` (meldet nur Abweichungen, ändert nichts).
- **`forecast-engine*.test.js`** — Node-Unit-Tests der Engine (`node forecast-engine.test.js` etc.)
- **`browser-*.test.js` + `browser-test-harness.js` + `dom-test-helpers.js`** —
  jsdom-basierte End-to-End-Tests, die den echten kompilierten App-Code laden
  und per simulierten Klicks/Eingaben durchspielen (kein echter Browser
  verfügbar, aber echte React-Ausführung inkl. DOM/localStorage).

## Nicht verändern, außer explizit gewünscht

- Design: Farben, Typografie, Abstände, Dark Mode, Layout, Animationen
- Bestehende Berechnungslogik: 7.700 kcal/kg-Basis, Katch-McArdle-Formel,
  TDEE-Berechnung, Tagesbilanzformel, persönlicher Kalibrierungsfaktor, Lernrate
- Navigation / Hauptstruktur der App
- Bestehende Gewichts-/Ernährungsdaten der Nutzer

## Arbeitsweise, die sich bewährt hat

- Sprache: Deutsch, direkt und ohne Floskeln
- Vor jeder Code-Änderung: relevante SKILL.md-Dateien prüfen, falls vorhanden
- Nach jeder Änderung: Syntax-Check (`npx babel` + `node --check`), bei
  Engine-Änderungen zusätzlich die Node-Testsuiten laufen lassen
- Bei größeren/mehrdeutigen Anfragen: kurz zusammenfassen, was gemacht wird,
  bevor losgelegt wird — besonders wenn "nicht verändern"-Einschränkungen
  mitgegeben wurden
- Ehrlich sein über Grenzen des Testens (z. B. kein echter Browser verfügbar,
  nur jsdom-Simulation) statt zu behaupten, etwas sei vollständig geprüft,
  wenn das nicht stimmt
