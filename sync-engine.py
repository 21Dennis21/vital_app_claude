#!/usr/bin/env python3
"""
sync-engine.py — Forecast-Engine-Synchronisation

WARUM DIESES SKRIPT EXISTIERT:
Die App (index.html) ist eine einzelne HTML-Datei, kann also die Engine
nicht per <script src="forecast-engine.js"> importieren, ohne einen echten
Build-Prozess oder CORS-faehiges Hosting vorauszusetzen. Bisher wurde die
Engine deshalb manuell in mehreren einzelnen str_replace-Schritten in
index.html einkopiert — dabei ist bereits einmal eine ganze Funktion
(evaluateWeightEntryContext) verloren gegangen, weil ein Patch an der
falschen Kommentarmarke ansetzte.

DIESES SKRIPT MACHT DAS UNMOEGLICH:
Es ersetzt den KOMPLETTEN Engine-Block in index.html (von der ersten Zeile
"const FORECAST_CONFIG = {" bis zum Ende des Node/CommonJS-Export-Blocks)
in EINEM einzigen, atomaren Schritt durch den kompletten, unveraenderten
Inhalt von forecast-engine.js. Es gibt keine Zwischenschritte, an denen
ein Teil vergessen werden koennte.

SOURCE OF TRUTH:
  forecast-engine.js  <- HIER wird die Engine-Logik geaendert, NIRGENDS SONST.
  index.html           <- wird ausschliesslich per "python3 sync-engine.py"
                           aktualisiert, nie manuell im Engine-Bereich editiert.

VERWENDUNG:
  python3 sync-engine.py [--check]

  Ohne Flag: synchronisiert index.html mit forecast-engine.js.
  --check:   prueft nur, ob beide Dateien bereits synchron sind (fuer CI/
             Vor-Auslieferungs-Checks), aendert nichts, exit code != 0 bei
             Abweichung.
"""
import sys
import re

ENGINE_FILE = "forecast-engine.js"
APP_FILE = "index.html"

START_MARKER = "const FORECAST_CONFIG = {"
# Ende: die schliessende Klammer des "if(typeof module..." Blocks
END_MARKER_OPEN = 'if(typeof module!=="undefined" && module.exports){'

# Kommentar, der IMMER direkt vor dem Engine-Block in index.html steht,
# damit klar bleibt, dass das hier eine automatisch synchronisierte Kopie
# ist und nicht von Hand editiert werden soll.
APP_HEADER_COMMENT = '''/* ===================================================================
   FORECAST ENGINE fuer die Monatsend-Gewichtsprognose.

   !!! DIESER BLOCK WIRD AUTOMATISCH GENERIERT — NICHT HIER EDITIEREN !!!
   Source of Truth ist ausschliesslich forecast-engine.js im Projekt-
   Wurzelverzeichnis. Aenderungen an der Engine-Logik IMMER dort vornehmen
   und anschliessend synchronisieren mit:

       python3 sync-engine.py

   Das Skript ersetzt diesen kompletten Block atomar — es kann dadurch
   nicht mehr passieren, dass beim Uebertragen eine Funktion vergessen
   oder nur teilweise kopiert wird.
   =================================================================== */

'''


def find_engine_block(text):
    start = text.index(START_MARKER)
    open_idx = text.index(END_MARKER_OPEN, start)
    # Ende: die zur END_MARKER_OPEN-Zeile gehoerende schliessende "}" der
    # if-Bedingung finden (einfache Klammer-Zaehlung ab der öffnenden "{")
    brace_start = text.index("{", open_idx)
    depth = 0
    i = brace_start
    while i < len(text):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                return start, i + 1
        i += 1
    raise ValueError("Ende des Engine-Blocks nicht gefunden — Klammern unausgeglichen?")


def main():
    check_only = "--check" in sys.argv

    with open(ENGINE_FILE, encoding="utf-8") as f:
        engine_src = f.read()
    with open(APP_FILE, encoding="utf-8") as f:
        app_src = f.read()

    # Aus forecast-engine.js NUR den reinen Code-Block extrahieren (ohne
    # den langen Datei-Kopfkommentar ganz oben in forecast-engine.js selbst
    # — die App bekommt ihren EIGENEN, kuerzeren Hinweis-Header).
    e_start = engine_src.index(START_MARKER)
    e_open = engine_src.index(END_MARKER_OPEN, e_start)
    e_brace_start = engine_src.index("{", e_open)
    depth = 0
    i = e_brace_start
    while i < len(engine_src):
        if engine_src[i] == "{":
            depth += 1
        elif engine_src[i] == "}":
            depth -= 1
            if depth == 0:
                e_end = i + 1
                break
        i += 1
    else:
        raise ValueError("Ende des Engine-Blocks in forecast-engine.js nicht gefunden")

    engine_block = engine_src[e_start:e_end]
    new_app_block = APP_HEADER_COMMENT + engine_block

    a_start, a_end = find_engine_block(app_src)
    # Vorangehenden, bereits vorhandenen Hinweis-Header (falls vorhanden)
    # mit einschliessen, damit er nicht dupliziert wird.
    header_start_marker = "/* ==================================================================="
    search_from = max(0, a_start - 2000)
    prior_chunk = app_src[search_from:a_start]
    header_pos = prior_chunk.rfind(header_start_marker)
    if header_pos != -1:
        a_start = search_from + header_pos

    current_block = app_src[a_start:a_end]

    if check_only:
        if current_block.strip() == new_app_block.strip():
            print("OK: index.html ist synchron mit forecast-engine.js")
            sys.exit(0)
        else:
            print("ABWEICHUNG: index.html ist NICHT synchron mit forecast-engine.js")
            print("Bitte ausfuehren: python3 sync-engine.py")
            sys.exit(1)

    new_app_src = app_src[:a_start] + new_app_block + app_src[a_end:]
    with open(APP_FILE, "w", encoding="utf-8") as f:
        f.write(new_app_src)
    print("Synchronisiert:", ENGINE_FILE, "->", APP_FILE)
    print("Engine-Block-Laenge:", len(new_app_block), "Zeichen")


if __name__ == "__main__":
    main()
