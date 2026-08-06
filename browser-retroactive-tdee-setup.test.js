const { createApp, flush } = require("./browser-test-harness.js");
const { clickByText, setNativeInputValue } = require("./dom-test-helpers.js");

/* Nutzerwunsch: statt nur einen Fallback fuer fehlendes TDEE zu haben, soll
   sich der Grundbedarf auch NACHTRAEGLICH fuer einen bereits vergangenen,
   in der Kalender-Ansicht navigierten Monat einrichten lassen — nicht nur
   fuer den aktuellen Monat (wie bisher nur ueber "Heute"/Profil moeglich). */

let passed=0, failed=0;
function check(cond, label){
  if(cond){ passed++; console.log("  ✅", label); }
  else { failed++; console.error("  ❌", label); }
}

(async()=>{
  console.log("\n--- Grundbedarf nachtraeglich fuer einen vergangenen Monat einrichten ---");
  const dom = createApp((win)=>{
    // NUR August ist eingerichtet, Juli fehlt bewusst.
    win.localStorage.setItem("tracker_mset", JSON.stringify({"2026-7":{weight:90,fat:25,activityIdx:1}}));
    win.localStorage.setItem("tracker_data", JSON.stringify({}));
  });
  await flush(dom);
  const d = dom.window.document;
  clickByText(d, "Verlauf");
  await flush(dom);
  clickByText(d, "Kalender");
  await flush(dom);
  clickByText(d, "Vorheriger Monat"); // August -> Juli
  await flush(dom);
  check(d.body.textContent.includes("Juli 2026"), "Kalender zeigt Juli 2026 nach Zurueck-Navigation");
  check(d.body.textContent.includes("ist noch kein Grundbedarf eingerichtet"), "Hinweis auf fehlenden Grundbedarf fuer Juli erscheint");

  const setupBtn = [...d.querySelectorAll("button")].find(b=>b.textContent.includes("Grundbedarf für Juli einrichten"));
  check(!!setupBtn, "Button 'Grundbedarf für Juli einrichten' vorhanden");
  setupBtn.dispatchEvent(new dom.window.MouseEvent("click",{bubbles:true,cancelable:true}));
  await flush(dom);
  check(d.body.textContent.includes("Grundbedarf · Juli"), "Setup-Sheet oeffnet sich fuer Juli (nicht fuer den aktuellen Monat)");

  const inputs = d.querySelectorAll("input[type=number]");
  check(inputs.length===2, "Gewicht- und Koerperfett-Eingabefelder vorhanden");
  setNativeInputValue(inputs[0], "90");
  setNativeInputValue(inputs[1], "25");
  await flush(dom);
  const saveBtn = [...d.querySelectorAll("button")].find(b=>b.textContent.trim()==="Speichern");
  check(!!saveBtn, "Speichern-Button gefunden");
  saveBtn.dispatchEvent(new dom.window.MouseEvent("click",{bubbles:true,cancelable:true}));
  await flush(dom);

  check(!d.body.textContent.includes("ist noch kein Grundbedarf eingerichtet"),
    "Hinweis verschwindet SOFORT nach dem Speichern, ohne Reload");
  check(d.body.textContent.includes("Juli 2026"), "Kalender-Ansicht bleibt weiterhin auf Juli 2026");

  dom.window.close();

  console.log("\n================================");
  console.log(passed+" bestanden, "+failed+" fehlgeschlagen");
  console.log("================================");
  process.exit(failed>0?1:0);
})().catch(e=>{console.error("FEHLER:",e.message);console.error(e.stack);process.exit(1);});
