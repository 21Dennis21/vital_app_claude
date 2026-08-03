const { createApp, flush } = require("./browser-test-harness.js");
const { clickByText, setNativeInputValue, blurInput, findInput } = require("./dom-test-helpers.js");

/* Konkreter Akzeptanztest aus der Fehlermeldung: KW 31 (27.7.-2.8.), beide
   Monate (Juli+August) haben einen Grundbedarf. 31.7. wird nachtraeglich
   mit 500 kcal befuellt, 2.8. wird vollstaendig gespeichert. Prueft, dass
   Zaehler/Bilanz/Durchschnitt/Balken/Bottom Sheet ueberall uebereinstimmen,
   dass die Ansicht in Juli UND August identisch ist, und dass Loeschen den
   Tag sofort ueberall wieder auf "nicht geloggt" zuruecksetzt. */

let passed=0, failed=0;
function check(cond, label){
  if(cond){ passed++; console.log("  ✅", label); }
  else { failed++; console.error("  ❌", label); }
}

function kw31Card(d){
  return [...d.querySelectorAll(".card")].find(c=>c.textContent.includes("KW 31"));
}
function barsOf(card){
  return [...card.querySelectorAll("div")].filter(e=>e.style.height==="6px");
}

(async()=>{
  console.log("\n--- Akzeptanztest KW 31: beide Monate konfiguriert, nachtragen + löschen ---");
  const dom = createApp((win)=>{
    win.localStorage.setItem("tracker_mset", JSON.stringify({
      "2026-6":{weight:90,fat:25,activityIdx:1}, // Juli
      "2026-7":{weight:90,fat:25,activityIdx:1}  // August
    }));
    const data = {};
    data["2026-6-31"] = {kcalIn:500, kcalBurned:0, sports:[], meals:{}, logged:true};
    data["2026-7-2"]  = {kcalIn:2000, kcalBurned:0, sports:[], meals:{}, logged:true, weight:90};
    win.localStorage.setItem("tracker_data", JSON.stringify(data));
    win.localStorage.setItem("tracker_goals", JSON.stringify([{type:"weight", target:80, active:true}]));
  });
  await flush(dom);
  const d = dom.window.document;

  // --- Augustansicht ---
  clickByText(d, "Verlauf");
  await flush(dom);
  clickByText(d, "Rückblick");
  await flush(dom);
  let kw31 = kw31Card(d);
  check(!!kw31, "KW-31-Karte in der Augustansicht gefunden");
  check(!!kw31 && kw31.textContent.includes("2/7 Tage geloggt"), "August-Ansicht: 2/7 Tage geloggt");
  let bars = kw31 && barsOf(kw31);
  const GRAY="var(--day-muted)";
  check(bars && bars[4].style.background!==GRAY, "August-Ansicht: 31.7.-Balken ist farbig");
  check(bars && bars[6].style.background!==GRAY, "August-Ansicht: 2.8.-Balken ist farbig");
  const augustJul31Color = bars[4].style.background;
  const augustAug2Color = bars[6].style.background;

  kw31.dispatchEvent(new dom.window.MouseEvent("click",{bubbles:true,cancelable:true}));
  await flush(dom);
  let sheetRows = [...d.querySelectorAll(".sub")].filter(e=>/^(Mo|Di|Mi|Do|Fr|Sa|So) · /.test(e.textContent));
  const isChecked=(txt)=>{const r=sheetRows.find(r=>r.textContent.includes(txt));return r&&r.parentElement.textContent.includes("✔");};
  check(isChecked("31.7."), "Bottom Sheet (August-Ansicht): 31.7. ist ✔");
  check(isChecked("2.8."), "Bottom Sheet (August-Ansicht): 2.8. ist ✔");
  clickByText(d, "KW 31"); // Sheet wieder schliessen (Overlay-Klick alternativ)
  await flush(dom);

  // --- Julansicht: dieselbe Woche muss identisch aussehen ---
  clickByText(d, "Kalender");
  await flush(dom);
  clickByText(d, "‹");
  await flush(dom);
  clickByText(d, "Rückblick");
  await flush(dom);
  kw31 = kw31Card(d);
  check(!!kw31, "KW-31-Karte in der Juli-Ansicht gefunden");
  check(!!kw31 && kw31.textContent.includes("2/7 Tage geloggt"), "Juli-Ansicht: ebenfalls 2/7 Tage geloggt");
  bars = kw31 && barsOf(kw31);
  check(bars && bars[4].style.background===augustJul31Color, "31.7.-Balkenfarbe ist in Juli- und August-Ansicht identisch (erhalten: "+(bars&&bars[4].style.background)+" vs. "+augustJul31Color+")");
  check(bars && bars[6].style.background===augustAug2Color, "2.8.-Balkenfarbe ist in Juli- und August-Ansicht identisch");

  // --- 31.7. loeschen -> sofort ueberall zurueck auf "nicht geloggt" ---
  // Aktuell ist der "Rueckblick"-Reiter aktiv (kein Kalendergitter sichtbar) —
  // zuerst zurueck zu "Kalender" wechseln, dort steht der Monat noch auf Juli.
  clickByText(d, "Kalender");
  await flush(dom);
  const dayCell31b = [...d.querySelectorAll(".cell")].find(c=>{
    const numDiv=c.querySelector("div");
    return numDiv && numDiv.textContent.trim()==="31";
  });
  check(!!dayCell31b, "Tageszelle 31 im Juli-Kalender gefunden (fuer Loeschen)");
  dayCell31b.dispatchEvent(new dom.window.MouseEvent("click",{bubbles:true,cancelable:true}));
  await flush(dom);
  const delBtn = [...d.querySelectorAll("button")].find(b=>b.textContent.includes("Tag löschen")||b.textContent.includes("löschen"));
  check(!!delBtn, "Löschen-Button im Tagesdetail-Sheet gefunden");
  if(delBtn){
    delBtn.dispatchEvent(new dom.window.MouseEvent("click",{bubbles:true,cancelable:true}));
    await flush(dom);
    // Falls ein Bestaetigungsdialog erscheint, den bestaetigenden Button klicken.
    const confirmBtn=[...d.querySelectorAll("button")].find(b=>b.textContent.trim()==="Löschen");
    if(confirmBtn){confirmBtn.dispatchEvent(new dom.window.MouseEvent("click",{bubbles:true,cancelable:true}));await flush(dom);}
  }

  clickByText(d, "Rückblick");
  await flush(dom);
  kw31 = kw31Card(d);
  check(!!kw31 && kw31.textContent.includes("1/7 Tage geloggt"), "nach Loeschen von 31.7.: sofort 1/7 Tage geloggt (erhalten: "+(kw31&&kw31.textContent)+")");
  bars = kw31 && barsOf(kw31);
  check(bars && bars[4].style.background===GRAY, "nach Loeschen von 31.7.: Balken ist sofort wieder grau");

  kw31.dispatchEvent(new dom.window.MouseEvent("click",{bubbles:true,cancelable:true}));
  await flush(dom);
  sheetRows = [...d.querySelectorAll(".sub")].filter(e=>/^(Mo|Di|Mi|Do|Fr|Sa|So) · /.test(e.textContent));
  const jul31RowAfterDelete = sheetRows.find(r=>r.textContent.includes("31.7."));
  check(!!jul31RowAfterDelete && !jul31RowAfterDelete.parentElement.textContent.includes("✔"),
    "Bottom Sheet zeigt 31.7. nach dem Loeschen sofort NICHT mehr als ✔");

  dom.window.close();

  console.log("\n================================");
  console.log(passed+" bestanden, "+failed+" fehlgeschlagen");
  console.log("================================");
  process.exit(failed>0?1:0);
})().catch(e=>{console.error("FEHLER:",e.message);console.error(e.stack);process.exit(1);});
