const { createApp, flush } = require("./browser-test-harness.js");
const { clickByText, setNativeInputValue, blurInput } = require("./dom-test-helpers.js");

/* Browser-Verdrahtungstest fuer die kalenderuebergreifende Datenauswahl der
   Live-Prognose (Engine-Fix in forecast-engine.js): bestaetigt, dass der
   sichtbare Text im Empty-State wirklich die richtige Zahl zeigt ("noch 1
   vollstaendiger Ernaehrungstag", nicht "noch 6") UND dass nach dem 7.
   gueltigen Tag SOFORT, ohne Reload/Remount, die volle Prognosekarte
   erscheint. Die Engine-Unit-Tests (forecast-engine.test.js) decken die
   Logik ab -- dieser Test prueft nur die Verdrahtung zur UI. */

let passed=0, failed=0;
function check(cond, label){
  if(cond){ passed++; console.log("  ✅", label); }
  else { failed++; console.error("  ❌", label); }
}
function bodyHas(doc, text){ return doc.body.textContent.includes(text); }

function seedStorage(win){
  // Beide Monate haben einen Grundbedarf -- der Bug lag NICHT an fehlendem TDEE.
  win.localStorage.setItem("tracker_mset", JSON.stringify({
    "2026-6":{weight:90,fat:25,activityIdx:1}, // Juli
    "2026-7":{weight:90,fat:25,activityIdx:1}, // August
  }));
  // Akzeptanzszenario: 29.7.-3.8., 6 durchgehend gueltig geloggte Tage.
  const data = {};
  const tdee = 2700; // gemaess ACT[1].f*calcBMR(90,25) grob passend, Balance ist hier nicht entscheidend
  [
    {y:2026,m:6,d:29},{y:2026,m:6,d:30},{y:2026,m:6,d:31},
    {y:2026,m:7,d:1}, {y:2026,m:7,d:2}, {y:2026,m:7,d:3},
  ].forEach(({y,m,d})=>{
    data[y+"-"+m+"-"+d] = {kcalIn:tdee-500, kcalBurned:0, sports:[], meals:{}, logged:true};
  });
  data["2026-7-3"].weight = 84.0; // Ankergewicht = heute (3.8.)
  win.localStorage.setItem("tracker_data", JSON.stringify(data));
  win.localStorage.setItem("tracker_goals", JSON.stringify([]));
  // Ein Lebensmittel vorab in der persoenlichen Bibliothek, um den 7. Tag
  // gleich ueber die ECHTE Ernaehrungs-UI nachzutragen (keine direkte
  // localStorage-Manipulation von tracker_data fuer den entscheidenden
  // Reaktivitaets-Check).
  win.localStorage.setItem("tracker_products", JSON.stringify([
    {id:"ptest1", name:"ZZZTestSnack", brand:"Testmarke", category:"Verschiedenes",
     basis:"100g", kcal:400, favorite:false, useCount:0, lastUsed:null},
  ]));
}

async function main(){
  console.log("############################################");
  console.log("# Live-Prognose: UI-Verdrahtung der kalenderuebergreifenden Datenauswahl");
  console.log("############################################\n");

  const dom = createApp(seedStorage, {now:new Date(2026,7,3,12,0,0)}); // 3.8.2026, 12:00
  await flush(dom);
  const d = dom.window.document;

  // =================================================================
  console.log("\n--- 1. Empty-State zeigt die richtige Zahl (6 gueltige Tage -> noch 1 noetig) ---");
  clickByText(d, "Verlauf");
  await flush(dom);
  clickByText(d, "Gewicht");
  await flush(dom);
  check(bodyHas(d,"Live-Prognose"), "Live-Prognose-Karte (Empty-State) wird angezeigt");
  check(bodyHas(d,"Logge noch 1 vollständige Ernährungstage"),
    "Text zeigt korrekt 'noch 1' (6 kalenderuebergreifende gueltige Tage erkannt, nicht nur die August-Tage)");
  check(!bodyHas(d,"Logge noch 6") && !bodyHas(d,"Logge noch 4") && !bodyHas(d,"Logge noch 7"),
    "Text zeigt NICHT die alte, auf den laufenden Monat begrenzte Zahl");

  // =================================================================
  console.log("\n--- 2. 7. gueltigen Tag (28.7.) ueber die ECHTE Ernaehrungs-UI nachtragen ---");
  clickByText(d, "Kalender");
  await flush(dom);
  clickByText(d, "‹"); // einen Monat zurueck: August -> Juli
  await flush(dom);
  check(d.body.textContent.includes("Juli 2026"), "Kalender zeigt jetzt Juli 2026");
  const dayCell28 = [...d.querySelectorAll(".cell")].find(c=>{
    const numDiv = c.querySelector("div");
    return numDiv && numDiv.textContent.trim()==="28";
  });
  check(!!dayCell28, "Tageszelle 28 im Juli-Kalender gefunden");
  dayCell28.dispatchEvent(new dom.window.MouseEvent("click",{bubbles:true,cancelable:true}));
  await flush(dom);

  clickByText(d, "Frühstück");
  await flush(dom);
  check(bodyHas(d,"kcal insgesamt"), "Mahlzeiten-Detailseite (Frühstück) geöffnet");

  clickByText(d, "＋ Weiteres Lebensmittel hinzufügen");
  await flush(dom);
  const searchInput = [...d.querySelectorAll("input")].find(el=>el.getAttribute("type")==="text");
  check(!!searchInput, "Such-Eingabefeld gefunden");
  setNativeInputValue(searchInput, "ZZZTestSnack");
  await flush(dom);
  check(bodyHas(d,"ZZZTestSnack"), "Vorbereitetes Lebensmittel wird in der Suche gefunden");

  clickByText(d, "ZZZTestSnack");
  await flush(dom);
  check(bodyHas(d,"400 kcal") && bodyHas(d,"Hinzufügen"), "Mengenansicht geöffnet (100 g -> 400 kcal Vorschau)");

  clickByText(d, "Hinzufügen");
  await flush(dom);

  // Mahlzeiten-Detailseite schliessen (Zurueck zum Kalender)
  const closeX = [...d.querySelectorAll("button")].find(b=>b.textContent.trim()==="✕");
  if(closeX) closeX.click();
  await flush(dom);

  // =================================================================
  console.log("\n--- 3. OHNE Reload/Remount: Prognosekarte erscheint sofort ---");
  clickByText(d, "Verlauf");
  await flush(dom);
  clickByText(d, "Gewicht");
  await flush(dom);
  check(bodyHas(d,"Basis: Ø der letzten 7 geloggten Tage"),
    "Prognosekarte zeigt SOFORT 7 gueltige Tage (28.7.-3.8.), ohne Reload");
  check(!bodyHas(d,"Logge noch"), "Empty-State-Text ist verschwunden -- echte Prognosekarte ersetzt ihn");

  console.log("\n================================");
  console.log(passed+" bestanden, "+failed+" fehlgeschlagen");
  console.log("================================");
  dom.window.close();
  process.exit(failed>0?1:0);
}

main().catch(e=>{ console.error("FEHLER:", e.message); console.error(e.stack); process.exit(1); });
