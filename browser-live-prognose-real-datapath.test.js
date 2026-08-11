const { createApp, flush } = require("./browser-test-harness.js");
const { clickByText, setNativeInputValue, blurInput } = require("./dom-test-helpers.js");

/* Akzeptanztest mit EXAKT derselben Speicherstruktur wie die echte App:
   anders als browser-live-prognose-crossmonth.test.js (die den 6-Tage-
   Ausgangszustand noch per Seed direkt in localStorage schreibt) entsteht
   HIER ausnahmslos JEDE Dateneinheit ueber echte Nutzer-Interaktionen:

     - Grundbedarf fuer August UND Juli je ueber die echte Kalender-UI
       (Kalender -> "Grundbedarf für <Monat> einrichten" -> speichern)
     - alle 6 Ernaehrungstage (29.7.-3.8.) je ueber die echte Ernaehrungs-UI
       (Kalender -> Tag -> Frühstück -> Suche -> Menge -> Hinzufügen)
     - das Ankergewicht ueber die echte "⚖️ Gewicht heute"-UI

   Hintergrund: ein gemeldeter Praxis-Fehler ("Logge noch 4" statt "noch 1")
   liess sich mit reinen Engine-Unit-Tests (synthetische Testdaten) nicht
   erklaeren. Dieser Test bildet deshalb den TATSAECHLICHEN Speicherpfad
   nach (dieselben Funktionen: openSetup/SetupSheet, addMealItem,
   attemptSaveWeight — keine direkte tracker_data/tracker_mset-Manipulation
   fuer die produktiven Tage), inklusive der Reihenfolge "Tage zuerst
   loggen, Grundbedarf fuer den Vormonat erst danach nachtragen", die beim
   echten Nutzer plausibel ist. */

let passed=0, failed=0;
function check(cond, label){
  if(cond){ passed++; console.log("  ✅", label); }
  else { failed++; console.error("  ❌", label); }
}
function bodyHas(doc, text){ return doc.body.textContent.includes(text); }

function findOwnDayCell(d, num){
  // Tage aus dem Vor-/Folgemonat (Padding) tragen denselben Text wie
  // echte Tage desselben Kalenderplatzes (z.B. "29"/"30"/"31" als
  // Juni-Padding UND als echte Juli-Tage) -- nur "eigene" Monatstage
  // sind klickbar (opacity:1, siehe monthGridDays/onClick={if(x.own)}).
  return [...d.querySelectorAll(".cell")].find(c=>{
    const numDiv = c.querySelector("div");
    return numDiv && numDiv.textContent.trim()===String(num) && c.style.opacity==="1";
  });
}

async function setupGrundbedarfIfNeeded(d, dom){
  if(!bodyHas(d,"ist noch kein Grundbedarf eingerichtet")) return false;
  const setupBtn = [...d.querySelectorAll("button")].find(b=>b.textContent.includes("Grundbedarf für")&&b.textContent.includes("einrichten"));
  setupBtn.dispatchEvent(new dom.window.MouseEvent("click",{bubbles:true,cancelable:true}));
  await flush(dom);
  const inputs = d.querySelectorAll("input[type=number]");
  setNativeInputValue(inputs[0], "90");
  setNativeInputValue(inputs[1], "25");
  await flush(dom);
  const saveBtn = [...d.querySelectorAll("button")].find(b=>b.textContent.trim()==="Speichern");
  saveBtn.dispatchEvent(new dom.window.MouseEvent("click",{bubbles:true,cancelable:true}));
  await flush(dom);
  return true;
}

async function logDayViaRealUi(d, dom, dayNum){
  const cell = findOwnDayCell(d, dayNum);
  if(!cell) return false;
  cell.dispatchEvent(new dom.window.MouseEvent("click",{bubbles:true,cancelable:true}));
  await flush(dom);
  clickByText(d, "Frühstück");
  await flush(dom);
  clickByText(d, "＋ Weiteres Lebensmittel hinzufügen");
  await flush(dom);
  const searchInput = [...d.querySelectorAll("input")].find(el=>el.getAttribute("type")==="text");
  setNativeInputValue(searchInput, "ZZZTestSnack");
  await flush(dom);
  clickByText(d, "ZZZTestSnack");
  await flush(dom);
  clickByText(d, "Hinzufügen");
  await flush(dom);
  const closeX = [...d.querySelectorAll("button")].find(b=>b.textContent.trim()==="✕");
  if(closeX) closeX.click();
  await flush(dom);
  return true;
}

async function main(){
  console.log("############################################");
  console.log("# Live-Prognose: Akzeptanztest mit echter Speicherstruktur (kein Seed fuer Tage/TDEE)");
  console.log("############################################\n");

  const dom = createApp((win)=>{
    // Nur die persoenliche Lebensmittelbibliothek wird vorbereitet (Katalog,
    // kein Tages-/Monatsdatum-Bezug) -- Grundbedarf, Ernaehrungstage und
    // Gewicht entstehen unten ausschliesslich ueber die echte UI.
    win.localStorage.setItem("tracker_products", JSON.stringify([
      {id:"ptest1", name:"ZZZTestSnack", brand:"Testmarke", category:"Verschiedenes",
       basis:"100g", kcal:400, favorite:false, useCount:0, lastUsed:null},
    ]));
    win.localStorage.setItem("tracker_goals", JSON.stringify([]));
  }, {now:new Date(2026,7,3,12,0,0)}); // 3.8.2026, 12:00
  await flush(dom);
  const d = dom.window.document;

  // =================================================================
  console.log("\n--- 1. August: Grundbedarf einrichten + 3 Tage loggen (echte UI) ---");
  clickByText(d, "Verlauf");
  await flush(dom);
  clickByText(d, "Kalender");
  await flush(dom);
  check(bodyHas(d,"August 2026"), "Kalender zeigt den aktuellen Monat (August 2026)");
  check(await setupGrundbedarfIfNeeded(d, dom), "Grundbedarf für August über die echte UI eingerichtet");
  for(const day of [1,2,3]){
    check(await logDayViaRealUi(d, dom, day), "August-Tag "+day+" über die echte Ernährungs-UI geloggt");
  }

  // =================================================================
  console.log("\n--- 2. Juli: ERST Tage loggen, DANACH Grundbedarf nachtragen (Reihenfolge wie beim echten Nutzer plausibel) ---");
  clickByText(d, "Verlauf");
  await flush(dom);
  clickByText(d, "Kalender");
  await flush(dom);
  clickByText(d, "Vorheriger Monat");
  await flush(dom);
  check(bodyHas(d,"Juli 2026"), "Kalender zeigt Juli 2026 nach Zurück-Navigation");
  check(bodyHas(d,"ist noch kein Grundbedarf eingerichtet"), "Juli hat zu diesem Zeitpunkt noch keinen Grundbedarf");
  for(const day of [29,30,31]){
    check(await logDayViaRealUi(d, dom, day), "Juli-Tag "+day+" über die echte Ernährungs-UI geloggt (TROTZ fehlendem TDEE)");
  }
  check(await setupGrundbedarfIfNeeded(d, dom), "Grundbedarf für Juli NACHTRÄGLICH über die echte UI eingerichtet");

  // =================================================================
  console.log("\n--- 3. Ankergewicht über die echte 'Gewicht heute'-UI eintragen ---");
  clickByText(d, "Heute");
  await flush(dom);
  clickByText(d, "⚖️ Gewicht heute");
  await flush(dom);
  const wInput = [...d.querySelectorAll("input")].find(el=>el.getAttribute("inputmode")==="decimal");
  setNativeInputValue(wInput, "84.0");
  await flush(dom);
  blurInput(wInput);
  await new Promise(r=>setTimeout(r,850));

  // =================================================================
  console.log("\n--- 4. Diagnose-Trace: alle 6 echten Tage müssen als gültig erkannt werden ---");
  const data = JSON.parse(dom.window.localStorage.getItem("tracker_data"));
  const mSet = JSON.parse(dom.window.localStorage.getItem("tracker_mset"));
  const now = new Date(2026,7,3,12,0,0);
  const built = dom.window.buildEngineInputsFor(now, data, mSet);
  const rows = dom.window.debugRecentForecastDays({now, dailyData:built.dailyData, monthlySettings:built.monthlySettings})
    .filter(r=>r.dayExists);
  check(rows.length===6, "Genau 6 real gespeicherte Tage existieren (erhalten: "+rows.length+")");
  check(rows.every(r=>r.valid), "ALLE 6 real geloggten Tage sind gültig (keine Ablehnung) — erhalten: "+
    JSON.stringify(rows.filter(r=>!r.valid).map(r=>({dayKey:r.dayKey,reasons:r.rejectionReasons}))));
  const julyRows = rows.filter(r=>r.monthId==="2026-07");
  const augRows = rows.filter(r=>r.monthId==="2026-08");
  check(julyRows.length===3 && augRows.length===3, "3 Juli- und 3 August-Tage werden ihrem jeweils EIGENEN Monat zugeordnet");
  check(julyRows.every(r=>r.monthlyTdee===julyRows[0].monthlyTdee) && augRows.every(r=>r.monthlyTdee===augRows[0].monthlyTdee),
    "Juli-Tage nutzen den Juli-TDEE, August-Tage den August-TDEE (kein geteilter TDEE über die Monatsgrenze)");

  // =================================================================
  console.log("\n--- 5. Engine-Ergebnis und UI-Text müssen exakt übereinstimmen ---");
  const forecast = dom.window.calculateCurrentMonthForecast({now, dailyData:built.dailyData, monthlySettings:built.monthlySettings, weightEntries:built.weightEntries});
  check(forecast.status==="ok", "Engine: ok (einfaches Modell hat keine Mindestanzahl an Tagen mehr, erhalten: "+forecast.status+")");
  check(forecast.validBalanceDays===6, "Engine: validBalanceDays=6 (erhalten: "+forecast.validBalanceDays+")");

  clickByText(d, "Verlauf");
  await flush(dom);
  clickByText(d, "Gewicht");
  await flush(dom);
  check(bodyHas(d,"Basis: Ø der letzten 6 geloggten Tage"),
    "UI zeigt 6 Tage — exakt aus forecast.validBalanceDays abgeleitet, keine eigene Zählung");
  check(!bodyHas(d,"letzten 4 geloggten Tage") && !bodyHas(d,"letzten 3 geloggten Tage"),
    "UI zeigt NICHT die im Praxis-Fehler gemeldete falsche Zahl");

  // =================================================================
  console.log("\n--- 6. 7. Tag (28.7.) nachtragen — Meldung aktualisiert sich SOFORT, ohne Reload ---");
  // WICHTIG (Diagnose-Fund, siehe Abschlussbericht): VerlaufView wird beim
  // Tab-Wechsel weg von "Verlauf" komplett unmountet ({tab==="verlauf"&&...})
  // und beim Zurueckwechseln FRISCH neu gemountet — der Kalender-Monats-
  // Cursor (sy/sm) springt dabei auf den AKTUELLEN Monat zurueck, auch wenn
  // zuvor Juli angezeigt wurde (wie hier durch den Abstecher zu "Heute" in
  // Schritt 3). Ohne dieses erneute "‹" wuerde der folgende Tagesklick auf
  // "28" den AUGUST-28. treffen statt Juli 28. -- exakt der Mechanismus, der
  // beim echten Nutzer zu falsch einsortierten Tagen fuehren kann, wenn
  // zwischendurch zu "Heute"/anderen Tabs gewechselt wird.
  clickByText(d, "Kalender");
  await flush(dom);
  clickByText(d, "Vorheriger Monat");
  await flush(dom);
  check(bodyHas(d,"Juli 2026"), "Kalender zeigt nach dem Tab-Ausflug wieder Juli 2026 (Monats-Cursor wurde zurueckgesetzt, erneute Navigation noetig)");
  check(await logDayViaRealUi(d, dom, 28), "Juli-Tag 28 über die echte Ernährungs-UI nachgetragen");
  clickByText(d, "Verlauf");
  await flush(dom);
  clickByText(d, "Gewicht");
  await flush(dom);
  check(bodyHas(d,"Basis: Ø der letzten 7 geloggten Tage"), "Prognosekarte zeigt SOFORT 7 gültige Tage, ohne Reload");

  console.log("\n================================");
  console.log(passed+" bestanden, "+failed+" fehlgeschlagen");
  console.log("================================");
  dom.window.close();
  process.exit(failed>0?1:0);
}

main().catch(e=>{ console.error("FEHLER:", e.message); console.error(e.stack); process.exit(1); });
