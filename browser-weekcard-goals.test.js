const { createApp, flush } = require("./browser-test-harness.js");
const { clickByText } = require("./dom-test-helpers.js");

let passed=0, failed=0;
function check(cond, label){
  if(cond){ passed++; console.log("  ✅", label); }
  else { failed++; console.error("  ❌", label); }
}

function bilanzOfDay(kcalIn, tdee){ return kcalIn - tdee; }

async function testScenario(label, goalSetup, dailyOverrides, expectations){
  console.log("\n--- "+label+" ---");
  const dom = createApp((win)=>{
    win.localStorage.setItem("tracker_mset", JSON.stringify({"2026-7":{weight:90,fat:25,activityIdx:1}}));
    const data = {};
    // Gewicht bewusst auf den 1. August gelegt (NICHT in der Zukunft
    // relativ zum echten Systemdatum 2.8.2026) — lastWeight() scannt nur
    // rueckwaerts von "heute", ein Gewicht auf einem spaeteren Testtag
    // (z.B. 3.8.) wuerde nie gefunden und faelschlich curW=0 ergeben.
    data["2026-7-1"] = {kcalIn:2651, kcalBurned:0, sports:[], meals:{}, logged:true, weight:90};
    Object.keys(dailyOverrides).forEach(day=>{
      const o=dailyOverrides[day];
      data["2026-7-"+day] = {kcalIn:o.kcalIn, kcalBurned:o.kcalBurned||0, sports:[], meals:{}, logged:o.logged!==false};
    });
    win.localStorage.setItem("tracker_data", JSON.stringify(data));
    win.localStorage.setItem("tracker_goals", JSON.stringify(goalSetup));
  });
  await flush(dom);
  const d = dom.window.document;
  clickByText(d, "Statistiken");
  await flush(dom);
  // Wochenkarten stehen seit dem UI-Refactoring direkt im Kalender-Segment
  // (dem Standardsegment) — kein separater "Rückblick"-Klick mehr noetig.

  const cards = [...d.querySelectorAll(".card")].filter(c=>c.textContent.includes("KW"));
  // KW 32 (3.-9. August) enthaelt die Testtage vollstaendig im Monat
  const kw32 = cards.find(c=>c.textContent.includes("KW 32"));
  check(!!kw32, label+": KW-32-Karte gefunden");
  if(!kw32) return;

  // Die alten Kennzahlen-Labels duerfen auf der Wochenkarte nirgends mehr vorkommen —
  // rechts steht nur noch die kcal-Zahl oben und die kg-Zahl darunter.
  ["Fettverlust","Fettzunahme","Kalorienbilanz","Theoretische Gewichtsänderung"].forEach(label2=>{
    check(!kw32.textContent.includes(label2), label+": '"+label2+"' kommt auf der Wochenkarte nicht mehr vor");
  });
  check(kw32.textContent.includes("/7 Tage geloggt"), label+": Anzeige als 'X/7 Tage geloggt'");

  const bars = [...kw32.querySelectorAll("div")].filter(e=>e.style.height==="6px");
  expectations.forEach(exp=>{
    const bar = bars[exp.slotIndex];
    check(bar && bar.style.background===exp.expectedColor, label+": Tag "+exp.day+" ("+exp.desc+") hat Farbe "+exp.expectedColor+" (erhalten: "+(bar?bar.style.background:"nicht gefunden")+")");
  });

  dom.window.close();
}

(async()=>{
  // GREEN/ORANGE bilden die fachliche Zielbewertung ab (var(--good)/var(--amber)) —
  // getrennt von var(--accent), das seit dem UI-Rebrand die neue blaue
  // Akzentfarbe ist und mit der Gruen/Orange-Logik nichts mehr zu tun hat.
  // GRAY gilt fuer "nicht bewertbar" (nicht geloggt ODER geloggt ohne TDEE) —
  // dieselbe Farbe unabhaengig von der Monatszugehoerigkeit, die nur die
  // Deckkraft veraendert (siehe getWeekDayVisualState).
  const GREEN="var(--good)", ORANGE="var(--amber)", GRAY="var(--day-muted)";

  // Montag=3.8., ..., Sonntag=9.8. (KW32, slotIndex 0-6)
  await testScenario(
    "ZIEL ABNEHMEN — Defizit=grün, Überschuss=orange",
    [{type:"weight", target:80, active:true}], // aktuelles Gewicht wird unten auf 90 gesetzt -> abnehmen
    {
      3:{kcalIn:2151, logged:true, weight:90}, // -500 Defizit -> gruen
      4:{kcalIn:3000, logged:true},            // +349 Ueberschuss -> orange
      5:{kcalIn:0, logged:false},              // nicht geloggt -> grau
    },
    [
      {slotIndex:0, day:"Mo 3.8. (Defizit)", desc:"Defizit bei Ziel Abnehmen", expectedColor:GREEN},
      {slotIndex:1, day:"Di 4.8. (Überschuss)", desc:"Überschuss bei Ziel Abnehmen", expectedColor:ORANGE},
      {slotIndex:2, day:"Mi 5.8. (nicht geloggt)", desc:"nicht geloggt", expectedColor:GRAY},
    ]
  );

  await testScenario(
    "ZIEL ZUNEHMEN — Überschuss=grün, Defizit=orange",
    [{type:"weight", target:100, active:true}], // Ziel 100 > aktuelles Gewicht 90 -> zunehmen
    {
      3:{kcalIn:3000, logged:true, weight:90},  // +349 Ueberschuss -> gruen
      4:{kcalIn:2151, logged:true},             // -500 Defizit -> orange
    },
    [
      {slotIndex:0, day:"Mo 3.8. (Überschuss)", desc:"Überschuss bei Ziel Zunehmen", expectedColor:GREEN},
      {slotIndex:1, day:"Di 4.8. (Defizit)", desc:"Defizit bei Ziel Zunehmen", expectedColor:ORANGE},
    ]
  );

  await testScenario(
    "ZIEL HALTEN — kleine Abweichung=grün, große Abweichung=orange",
    [{type:"weight", target:90, active:true}], // Ziel = aktuelles Gewicht -> halten
    {
      3:{kcalIn:2651, logged:true, weight:90},  // exakt TDEE, 0 Abweichung -> gruen
      4:{kcalIn:2601, logged:true},             // -50, klein -> gruen
      5:{kcalIn:1500, logged:true},             // -1151, gross -> orange
    },
    [
      {slotIndex:0, day:"Mo 3.8. (exakt)", desc:"exakt im Ziel bei Halten", expectedColor:GREEN},
      {slotIndex:1, day:"Di 4.8. (klein)", desc:"kleine Abweichung bei Halten", expectedColor:GREEN},
      {slotIndex:2, day:"Mi 5.8. (groß)", desc:"große Abweichung bei Halten", expectedColor:ORANGE},
    ]
  );

  console.log("\n================================");
  console.log(passed+" bestanden, "+failed+" fehlgeschlagen");
  console.log("================================");
  process.exit(failed>0?1:0);
})().catch(e=>{console.error("FEHLER:",e.message);console.error(e.stack);process.exit(1);});
