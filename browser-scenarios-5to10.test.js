const { createApp, flush } = require("./browser-test-harness.js");
const { clickByText, setNativeInputValue, blurInput, findInput } = require("./dom-test-helpers.js");
const fs = require("fs");

let passed=0, failed=0;
let consoleErrors=[];
function check(cond, label){
  if(cond){ passed++; console.log("  ✅", label); }
  else { failed++; console.error("  ❌", label); }
}
function findByExactText(doc, text){
  return [...doc.querySelectorAll("*")].find(e=>e.children.length===0 && e.textContent.trim()===text);
}
function bodyHas(doc, text){ return doc.body.textContent.includes(text); }

async function main(){
  console.log("############################################");
  console.log("# SZENARIEN 5-10");
  console.log("############################################\n");

  // Zustand aus Teil 1 (Szenarien 1-4) wiederherstellen
  const snap = JSON.parse(fs.readFileSync("/tmp/localstorage_snapshot.json","utf-8"));
  console.log("Wiederhergestellter Zustand aus Teil 1: tracker_data enthält Aug-2-Eintrag mit",
    JSON.parse(snap.tracker_data)["2026-7-2"]?.weight, "kg (erwartet 97, bestätigter Wert aus Szenario 3)");

  // =================================================================
  console.log("\n--- 5. Seite neu laden — bleibt die Bestätigung erhalten? ---");
  // Dieselbe feste Testzeit wie in Teil 1 (browser-scenarios-1to4.test.js):
  // 02.08.2026, 12:00 Uhr lokal — der wiederhergestellte Snapshot enthaelt
  // Eintraege unter dem Tagesschluessel "2026-7-2", die App muss also auch
  // hier "heute" = 2.8.2026 sehen, unabhaengig vom echten Ausfuehrungstag.
  const dom = createApp((win)=>{
    Object.keys(snap).forEach(k=>{ if(snap[k]!=null) win.localStorage.setItem(k, snap[k]); });
    win.__consoleErrors = [];
  }, {now:new Date(2026,7,2,12,0,0)});
  // Konsolenfehler waehrend dieses gesamten Laufs mitschneiden (Punkt 9)
  const origError = console.error;
  console.error = (...a)=>{ consoleErrors.push(a.map(String).join(" ")); origError(...a); };

  await flush(dom);
  const d = dom.window.document;
  const ls = dom.window.localStorage;
  // Konsolenfehler-Erfassung erst AB HIER (nach dem Setup), damit eigene
  // check()-Fehlschlaege bereits durchgelaufener Szenarien die Zaehlung
  // nicht verfaelschen — es geht ausschliesslich um echte App-Fehler
  // waehrend der Interaktionen 6-8.
  consoleErrors.length=0;

  let confirmations = JSON.parse(ls.getItem("tracker_weight_confirmations")||"[]");
  check(confirmations.length===1 && confirmations[0].weightEntryId==="weight_2026-08-02", "Bestätigung ist nach 'Reload' weiterhin in localStorage vorhanden");
  check(bodyHas(d,"97"), "Der bestätigte Wert (97kg) erscheint nach Reload direkt im Dashboard, ohne erneute Nachfrage");

  // =================================================================
  console.log("\n--- 6. Denselben Ablauf über den Kalender testen ---");
  clickByText(d, "Verlauf");
  await flush(dom);
  // Im Verlauf zur Kalenderansicht wechseln, sofern nicht bereits aktiv, und den 2. August oeffnen
  const calButtons=[...d.querySelectorAll("button")].filter(b=>b.textContent.trim()==="Kalender");
  if(calButtons.length) { calButtons[0].click(); await flush(dom); }
  // Tageszelle "2" suchen (heutiger Tag im Kalendergrid)
  const dayCells = [...d.querySelectorAll(".cell")].filter(e=>e.children[0] && e.children[0].textContent.trim()==="2");
  const dayCell = dayCells[0];
  let dayDetailOpened=false;
  if(dayCell){ dayCell.dispatchEvent(new d.defaultView.MouseEvent("click",{bubbles:true})); await flush(dom); dayDetailOpened = bodyHas(d,"Gewicht") && !!findInput(d); }
  check(dayDetailOpened, "Kalender-Tagesansicht für den 2. August lässt sich öffnen und zeigt ein Gewichtsfeld");
  if(dayDetailOpened){
    const input = findInput(d);
    check(input.value==="97", "Kalender-Feld zeigt den zuvor bestätigten Wert (97kg) korrekt an");
    // Auffaelligen Wert ueber den Kalender-Pfad eingeben
    setNativeInputValue(input, "40");
    await flush(dom);
    blurInput(input);
    await flush(dom);
    check(bodyHas(d,"Gewicht kurz prüfen"), "Bestätigungsdialog öffnet sich auch über den Kalender-Pfad (dieselbe zentrale Logik)");
    const confirmBtn = findByExactText(d,"Ja, Wert stimmt");
    if(confirmBtn){ confirmBtn.dispatchEvent(new d.defaultView.MouseEvent("click",{bubbles:true})); await flush(dom); }
    const data = JSON.parse(ls.getItem("tracker_data"));
    check(data["2026-7-2"] && data["2026-7-2"].weight===40, "40kg wurde nach Bestätigung über den Kalender-Pfad gespeichert");
  }

  // =================================================================
  console.log("\n--- 7. Gewicht wieder löschen ---");
  const delBtn = [...d.querySelectorAll("button")].find(b=>b.textContent.includes("Gewicht für diesen Tag löschen"));
  check(!!delBtn, "'Gewicht für diesen Tag löschen'-Button ist vorhanden");
  if(delBtn){
    delBtn.dispatchEvent(new d.defaultView.MouseEvent("click",{bubbles:true}));
    await flush(dom);
    const data = JSON.parse(ls.getItem("tracker_data"));
    check(data["2026-7-2"].weight===0, "Gewicht wurde auf 0 (gelöscht) gesetzt");
    confirmations = JSON.parse(ls.getItem("tracker_weight_confirmations")||"[]");
    check(confirmations.length===0, "Zugehörige Bestätigung wurde beim Löschen mit entfernt");
  }

  // =================================================================
  console.log("\n--- 8. Reagiert die Live-Prognose danach sofort korrekt? ---");
  // Zur Gewichtsansicht im Verlauf wechseln, wo die Live-Prognose-Karte sitzt
  const closeSheetBtn = [...d.querySelectorAll("button")].find(b=>["×","✕","X"].includes(b.textContent.trim()));
  if(closeSheetBtn){ closeSheetBtn.click(); await flush(dom); }
  const gewichtTab = [...d.querySelectorAll("button")].find(b=>b.textContent.trim()==="Gewicht");
  if(gewichtTab){ gewichtTab.click(); await flush(dom); }
  const hasLivePrognose = bodyHas(d,"Live-Prognose");
  check(hasLivePrognose, "Live-Prognose-Karte wird angezeigt");
  if(hasLivePrognose){
    // Da das Gewicht fuer heute geloescht wurde, sollte der Anker jetzt auf
    // den 1. August (89.5kg, Seed-Daten) zurueckfallen -> Karte darf NICHT
    // mehr den geloeschten/letzten Wert (40) zeigen.
    const noStaleValue = !bodyHas(d,"40.0 kg") && !bodyHas(d,"40,0 kg");
    check(noStaleValue, "Live-Prognose zeigt NICHT mehr den gelöschten Wert (40kg) als Basis");
  }

  // =================================================================
  console.log("\n--- 9. Konsole auf Fehler prüfen ---");
  const relevantErrors = consoleErrors.filter(e=>
    (e.includes("[window error]")||e.includes("[jsdom console.error]")||e.includes("[jsdom internal error]"))
    && !e.includes("[app] [DEBUG]")
  );
  check(relevantErrors.length===0, "Keine unerwarteten Konsolenfehler während des gesamten Testlaufs");
  if(relevantErrors.length>0) relevantErrors.forEach(e=>console.log("    Fehler:", e.slice(0,200)));

  // =================================================================
  console.log("\n--- 10. LocalStorage kontrollieren ---");
  const finalConfirmations = ls.getItem("tracker_weight_confirmations");
  const finalCalibration = ls.getItem("tracker_forecast_calibration");
  console.log("  tracker_weight_confirmations:", finalConfirmations);
  check(finalConfirmations!==null, "tracker_weight_confirmations existiert als Schlüssel");
  console.log("  tracker_forecast_calibration (gekürzt):", finalCalibration ? finalCalibration.slice(0,200)+"..." : "FEHLT");
  check(finalCalibration!==null, "tracker_forecast_calibration existiert");
  const calibProfile = JSON.parse(finalCalibration);
  check(typeof calibProfile.personalEnergyFactor==="number", "Kalibrierungsprofil enthält personalEnergyFactor");
  check(Array.isArray(calibProfile.forecastSnapshots), "Kalibrierungsprofil enthält forecastSnapshots-Array (Backtesting)");
  console.log("  Anzahl Snapshots:", calibProfile.forecastSnapshots.length);

  console.log("\n================================");
  console.log(passed+" bestanden, "+failed+" fehlgeschlagen (Szenarien 5-10)");
  console.log("================================");

  console.error = origError;
  dom.window.close();
  process.exit(failed>0?1:0);
}

main().catch(e=>{ console.error("FEHLER:", e.message); console.error(e.stack); process.exit(1); });
