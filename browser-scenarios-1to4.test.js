const { createApp, flush } = require("./browser-test-harness.js");
const { clickByText, setNativeInputValue, blurInput, findInput } = require("./dom-test-helpers.js");

let passed=0, failed=0;
function check(cond, label){
  if(cond){ passed++; console.log("  ✅", label); }
  else { failed++; console.error("  ❌", label); }
}

function seedStorage(win){
  win.localStorage.setItem("tracker_mset", JSON.stringify({
    "2026-7": {weight:90, fat:25, activityIdx:1}
  }));
  const data = {};
  const tdee = 2651;
  for(let d=20; d<=31; d++){
    data["2026-6-"+d] = {kcalIn: tdee-500, kcalBurned:0, sports:[], meals:{}, logged:true};
  }
  data["2026-7-1"] = {kcalIn: tdee-500, kcalBurned:0, sports:[], meals:{}, logged:true, weight:89.5};
  win.localStorage.setItem("tracker_data", JSON.stringify(data));
  win.localStorage.setItem("tracker_goals", JSON.stringify([]));
}

function findByExactText(doc, text){
  return [...doc.querySelectorAll("*")].find(e=>e.children.length===0 && e.textContent.trim()===text);
}
function bodyHas(doc, text){
  return doc.body.textContent.includes(text);
}
function closeAnySheet(doc){
  // Sheet schliesst per Klick auf den abgedunkelten Hintergrund (Overlay)
  const overlay = doc.querySelector("[class*=overlay],[class*=backdrop],[class*=scrim]");
  if(overlay){ overlay.dispatchEvent(new doc.defaultView.MouseEvent("click",{bubbles:true})); return true; }
  return false;
}

async function main(){
  console.log("############################################");
  console.log("# BROWSER-AEHNLICHER TEST — jsdom + echter App-Code");
  console.log("############################################\n");

  const dom = createApp(seedStorage);
  await flush(dom);
  const d = dom.window.document;
  const ls = dom.window.localStorage;
  check(d.getElementById("root").innerHTML.length>0, "SETUP: App rendert mit Vorab-Daten");

  // =================================================================
  console.log("\n--- 1. Normales Gewicht speichern (Dashboard) ---");
  clickByText(d, "⚖️ Gewicht heute");
  await flush(dom);
  let input = findInput(d);
  setNativeInputValue(input, "89.7");
  await flush(dom);
  blurInput(input);
  await new Promise(r=>setTimeout(r,850)); // Modal schliesst nach Toast automatisch
  let data = JSON.parse(ls.getItem("tracker_data"));
  check(data["2026-7-2"] && data["2026-7-2"].weight===89.7, "89.7kg wurde gespeichert");
  check(bodyHas(d,"Gewicht heute")===false || !d.querySelector("input[inputmode=decimal]"), "Modal hat sich nach Erfolg automatisch geschlossen");
  let confirmations = JSON.parse(ls.getItem("tracker_weight_confirmations")||"[]");
  check(confirmations.length===0, "Keine Bestätigung für normalen Wert erzeugt");

  // =================================================================
  console.log("\n--- 2. Offensichtlich falsches Gewicht (999) ---");
  clickByText(d, "⚖️ Gewicht heute");
  await flush(dom);
  input = findInput(d);
  setNativeInputValue(input, "999");
  await flush(dom);
  blurInput(input);
  await flush(dom);
  check(bodyHas(d,"Bitte gib ein gültiges Gewicht"), "Fehlermeldung erscheint");
  check(bodyHas(d,"20") && bodyHas(d,"400"), "Fehlermeldung nennt Min/Max aus FORECAST_CONFIG");
  data = JSON.parse(ls.getItem("tracker_data"));
  check(data["2026-7-2"].weight===89.7, "999kg wurde NICHT gespeichert (alter Wert 89.7 bleibt)");
  check(!bodyHas(d,"Gewicht kurz prüfen"), "Kein Bestätigungsdialog bei invalid");
  // Modal schliessen fuer naechsten Test — X-Button suchen
  let closeX = [...d.querySelectorAll("button")].find(b=>["×","✕","X"].includes(b.textContent.trim()));
  if(closeX) closeX.click(); else closeAnySheet(d);
  await flush(dom);

  // =================================================================
  console.log("\n--- 3. Auffälligen, aber erlaubten Wert eingeben und bestätigen ---");
  clickByText(d, "⚖️ Gewicht heute");
  await flush(dom);
  input = findInput(d);
  setNativeInputValue(input, "97"); // 89.7 -> 97 = +7.3kg an einem Tag, klar ueber der Toleranz
  await flush(dom);
  blurInput(input);
  await flush(dom);
  check(bodyHas(d,"Gewicht kurz prüfen"), "Bestätigungsdialog öffnet sich für 97kg");
  check(bodyHas(d,"Neue Eingabe"), "Zeigt die neue Eingabe an");
  check(bodyHas(d,"Letzter gültiger Wert"), "Zeigt den letzten gültigen Wert an");
  check(bodyHas(d,"Ja, Wert stimmt") && bodyHas(d,"Eingabe korrigieren"), "Beide Aktionen sind vorhanden");
  data = JSON.parse(ls.getItem("tracker_data"));
  check(data["2026-7-2"].weight===89.7, "Wert ist VOR Bestätigung noch nicht übernommen (alter Anker bleibt)");
  let confirmBtn = findByExactText(d,"Ja, Wert stimmt");
  confirmBtn.dispatchEvent(new d.defaultView.MouseEvent("click",{bubbles:true}));
  await flush(dom);
  data = JSON.parse(ls.getItem("tracker_data"));
  check(data["2026-7-2"].weight===97, "97kg wurde NACH Bestätigung gespeichert");
  confirmations = JSON.parse(ls.getItem("tracker_weight_confirmations")||"[]");
  check(confirmations.length===1 && confirmations[0].confirmedByUser===true, "Bestätigung wurde in tracker_weight_confirmations gespeichert");
  check(confirmations[0].weightEntryId==="weight_2026-08-02", "Bestätigung trägt die korrekte, stabile Entry-ID");

  // =================================================================
  console.log("\n--- 4. Auffälligen Wert über 'Eingabe korrigieren' abbrechen ---");
  clickByText(d, "⚖️ Gewicht heute");
  await flush(dom);
  input = findInput(d);
  setNativeInputValue(input, "150"); // klar auffaellig
  await flush(dom);
  blurInput(input);
  await flush(dom);
  check(bodyHas(d,"Gewicht kurz prüfen"), "Bestätigungsdialog öffnet sich für 150kg");
  let correctBtn = findByExactText(d,"Eingabe korrigieren");
  correctBtn.dispatchEvent(new d.defaultView.MouseEvent("click",{bubbles:true}));
  await flush(dom);
  check(!bodyHas(d,"Gewicht kurz prüfen"), "Dialog schließt sich nach 'Eingabe korrigieren'");
  data = JSON.parse(ls.getItem("tracker_data"));
  check(data["2026-7-2"].weight===97, "150kg wurde NICHT gespeichert, alter Wert (97) bleibt");
  confirmations = JSON.parse(ls.getItem("tracker_weight_confirmations")||"[]");
  check(confirmations.length===1, "Keine neue Bestätigung durch 'Eingabe korrigieren' erzeugt (weiterhin nur die aus Schritt 3)");
  closeX = [...d.querySelectorAll("button")].find(b=>["×","✕","X"].includes(b.textContent.trim()));
  if(closeX) closeX.click(); else closeAnySheet(d);
  await flush(dom);

  console.log("\n--- ZWISCHENSTAND nach Szenario 1-4 ---");
  console.log(passed+" bestanden, "+failed+" fehlgeschlagen");

  // Zustand für den naechsten Teil (5-10) sichern
  const fs = require("fs");
  fs.writeFileSync("/tmp/localstorage_snapshot.json", JSON.stringify({
    tracker_mset: ls.getItem("tracker_mset"),
    tracker_data: ls.getItem("tracker_data"),
    tracker_goals: ls.getItem("tracker_goals"),
    tracker_weight_confirmations: ls.getItem("tracker_weight_confirmations"),
    tracker_forecast_calibration: ls.getItem("tracker_forecast_calibration"),
  }));

  dom.window.close();
  process.exit(failed>0?1:0);
}

main().catch(e=>{ console.error("FEHLER:", e.message); console.error(e.stack); process.exit(1); });
