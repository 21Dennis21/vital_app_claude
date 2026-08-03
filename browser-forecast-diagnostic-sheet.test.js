const { createApp, flush } = require("./browser-test-harness.js");
const { clickByText } = require("./dom-test-helpers.js");

/* Temporärer Diagnose-Sheet-Test (siehe ForecastDiagnosticSheet in
   index.html + debugRecentForecastDays/buildDayForecastDiagnostic/
   FORECAST_BUILD_ID in forecast-engine.js): bestätigt, dass die
   antippbare "Live-Prognose"-Überschrift in der ECHTEN, veröffentlichten
   App das Diagnose-Sheet öffnet und darin exakt die Werte des
   tatsächlich übergebenen forecast-Objekts sowie die real gespeicherten
   tracker_data/tracker_mset-Rohdaten anzeigt — keine zweite Berechnung,
   keine separate Zählung. Kann zusammen mit dem Diagnose-Sheet nach
   Abschluss der Fehlersuche wieder entfernt werden. */

let passed=0, failed=0;
function check(cond, label){
  if(cond){ passed++; console.log("  ✅", label); }
  else { failed++; console.error("  ❌", label); }
}
function bodyHas(doc, text){ return doc.body.textContent.includes(text); }

async function main(){
  console.log("############################################");
  console.log("# ForecastDiagnosticSheet: temporäres In-App-Diagnose-Sheet");
  console.log("############################################\n");

  const dom = createApp((win)=>{
    win.localStorage.setItem("tracker_mset", JSON.stringify({
      "2026-6":{weight:90,fat:25,activityIdx:1},
      "2026-7":{weight:90,fat:25,activityIdx:1}
    }));
    const data = {};
    [
      {y:2026,m:6,d:29},{y:2026,m:6,d:30},{y:2026,m:6,d:31},
      {y:2026,m:7,d:1}, {y:2026,m:7,d:2}, {y:2026,m:7,d:3},
    ].forEach(({y,m,d})=>{
      data[y+"-"+m+"-"+d] = {kcalIn:2200, kcalBurned:0, sports:[], meals:{}, logged:true};
    });
    data["2026-7-3"].weight = 84.0;
    win.localStorage.setItem("tracker_data", JSON.stringify(data));
    win.localStorage.setItem("tracker_goals", JSON.stringify([]));
  }, {now:new Date(2026,7,3,12,0,0)});
  await flush(dom);
  const d = dom.window.document;

  console.log("\n--- 1. Diagnose-Sheet öffnet sich über die 'Live-Prognose'-Überschrift ---");
  clickByText(d, "Verlauf");
  await flush(dom);
  clickByText(d, "Gewicht");
  await flush(dom);
  check(bodyHas(d,"Logge noch 1 vollständige Ernährungstage"), "Karte zeigt zunächst den Leerzustand (6 gültige Tage, noch 1 nötig)");
  clickByText(d, "Live-Prognose");
  await flush(dom);
  check(bodyHas(d,"Live-Prognose Diagnose"), "Diagnose-Sheet öffnet sich beim Antippen der Überschrift");

  console.log("\n--- 2. Engine-Status-Block zeigt exakt das reale forecast-Objekt ---");
  check(bodyHas(d,"cross-month-valid-days-v1"), "forecastBuildId ist sichtbar (Deployment-Marker)");
  check(bodyHas(d,"insufficient_data"), "status wird angezeigt");
  check(bodyHas(d,"not_enough_valid_log_days"), "reasons wird angezeigt");

  console.log("\n--- 3. Monatseinstellungen für Juli und August ---");
  check(bodyHas(d,"Juli 2026") && bodyHas(d,"2026-07"), "Juli-Monatsinfo (Label + monthId) vorhanden");
  check(bodyHas(d,"August 2026") && bodyHas(d,"2026-08"), "August-Monatsinfo (Label + monthId) vorhanden");

  console.log("\n--- 4. Alle 6 gemeldeten Tage einzeln geprüft ---");
  check(bodyHas(d,"29.07.2026") && bodyHas(d,"03.08.2026"), "Zeitraum 29.7.-3.8. wird explizit aufgeführt");
  const validMarks = (d.body.textContent.match(/✔ gültig/g)||[]).length;
  check(validMarks===6, "Alle 6 real gespeicherten Tage werden als gültig markiert (erhalten: "+validMarks+")");

  console.log("\n--- 5. Vollständiger 60-Tage-Suchhorizont sichtbar ---");
  check(bodyHas(d,"60-Tage-Suchhorizont"), "Abschnitt für den vollständigen Suchhorizont vorhanden");

  console.log("\n--- 6. Sheet schließt sich wieder (Overlay-Klick) ---");
  const overlay = d.querySelector(".ov");
  check(!!overlay, "Overlay zum Schließen gefunden");
  if(overlay) overlay.dispatchEvent(new dom.window.MouseEvent("click",{bubbles:true,cancelable:true}));
  await flush(dom);
  check(!bodyHas(d,"Live-Prognose Diagnose"), "Diagnose-Sheet ist nach dem Schließen weg");

  console.log("\n================================");
  console.log(passed+" bestanden, "+failed+" fehlgeschlagen");
  console.log("================================");
  dom.window.close();
  process.exit(failed>0?1:0);
}

main().catch(e=>{ console.error("FEHLER:", e.message); console.error(e.stack); process.exit(1); });
