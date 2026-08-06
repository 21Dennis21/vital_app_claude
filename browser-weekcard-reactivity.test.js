const { createApp, flush } = require("./browser-test-harness.js");
const { clickByText, setNativeInputValue, blurInput, findInput } = require("./dom-test-helpers.js");

/* Regressionstest fuer den gemeldeten Fehler: ein nachtraeglich (ueber den
   Kalender) fuer einen VERGANGENEN Tag gespeicherter Eintrag soll SOFORT,
   ohne Reload/Remount, ueberall in der Wochenkarte (seit dem UI-Refactoring
   direkt im Kalender-Segment) sichtbar sein — Balken, X/7-Zaehler,
   Wochenbilanz. Im Unterschied zu
   den anderen Wochenkarten-Tests hier mountet die App NUR EINMAL und der
   Eintrag wird ueber die ECHTE UI (Kalender -> Tag oeffnen -> speichern)
   nachgetragen, um echte React-Reaktivitaet zu pruefen (keine veralteten
   useMemo-/Cache-Werte). */

let passed=0, failed=0;
function check(cond, label){
  if(cond){ passed++; console.log("  ✅", label); }
  else { failed++; console.error("  ❌", label); }
}

function barsOf(kw31){
  return [...kw31.querySelectorAll("div")].filter(e=>e.style.height==="6px");
}

(async()=>{
  console.log("\n--- Nachtraeglicher Eintrag fuer 31.7. via echter Kalender-UI, keine Remount ---");
  const dom = createApp((win)=>{
    // BEIDE Monate (Juli+August) haben einen Grundbedarf -- der Bug darf
    // NICHT an fehlendem TDEE liegen.
    win.localStorage.setItem("tracker_mset", JSON.stringify({
      "2026-6":{weight:90,fat:25,activityIdx:1},
      "2026-7":{weight:90,fat:25,activityIdx:1}
    }));
    const data = {};
    // 31.7. bewusst NOCH NICHT vorhanden -- wird gleich nachgetragen.
    // 1.8.: schon geloggt, TDEE vorhanden, damit KW31 nicht komplett leer ist.
    data["2026-7-1"] = {kcalIn:2151, kcalBurned:0, sports:[], meals:{}, logged:true, weight:90};
    win.localStorage.setItem("tracker_data", JSON.stringify(data));
    win.localStorage.setItem("tracker_goals", JSON.stringify([{type:"weight", target:80, active:true}]));
  });
  await flush(dom);
  const d = dom.window.document;

  // --- Vorher: Wochenkarte pruefen, 31.7. muss noch grau/nicht geloggt sein ---
  // (Wochenkarten stehen seit dem UI-Refactoring direkt im Kalender-Segment,
  // dem Standardsegment — kein separater "Rückblick"-Klick mehr noetig.)
  clickByText(d, "Verlauf");
  await flush(dom);
  let kw31 = [...d.querySelectorAll(".card")].find(c=>c.textContent.includes("KW 31"));
  check(!!kw31, "KW-31-Karte vor dem Nachtragen gefunden");
  check(!!kw31 && kw31.textContent.includes("1/7 Tage geloggt"), "vorher: 1/7 Tage geloggt (nur 1.8.)");
  let jul31Bar = kw31 && barsOf(kw31)[4];
  check(!!jul31Bar && jul31Bar.style.background==="var(--day-muted)", "vorher: 31.7.-Balken ist grau");

  // --- Ueber die ECHTE Kalender-UI fuer 31.7. ein Gewicht nachtragen ---
  // (Gewicht allein macht isDayLogged() bereits true UND liefert ueber
  // kcalIn=0-tdee-0 eine echte, bewertbare Bilanz -- reicht also aus, um
  // die Reaktivitaet End-to-End zu pruefen, ohne die komplexere
  // Lebensmittelsuche simulieren zu muessen.)
  clickByText(d, "Kalender");
  await flush(dom);
  clickByText(d, "Vorheriger Monat"); // einen Monat zurueck: August -> Juli
  await flush(dom);
  check(d.body.textContent.includes("Juli 2026"), "Kalender zeigt jetzt Juli 2026");
  const dayCell31 = [...d.querySelectorAll(".cell")].find(c=>{
    const numDiv = c.querySelector("div");
    return numDiv && numDiv.textContent.trim()==="31";
  });
  check(!!dayCell31, "Tageszelle 31 im Juli-Kalender gefunden");
  dayCell31.dispatchEvent(new dom.window.MouseEvent("click",{bubbles:true,cancelable:true}));
  await flush(dom);
  const input = findInput(d);
  check(!!input, "Eingabefeld im Tagesdetail-Sheet gefunden");
  setNativeInputValue(input, "84.2");
  blurInput(input);
  await flush(dom);
  // Sheet schliessen (Klick auf den abdunkelnden Overlay-Hintergrund, wie
  // an anderer Stelle im Code ueblich) -- optional, das Speichern selbst
  // ist bereits synchron durch onFieldDone/attemptSaveWeight passiert.
  clickByText(d, "Verlauf");
  await flush(dom);

  // --- Danach: OHNE Remount pruefen, ob alles sofort aktualisiert ist ---
  kw31 = [...d.querySelectorAll(".card")].find(c=>c.textContent.includes("KW 31"));
  check(!!kw31, "KW-31-Karte nach dem Nachtragen gefunden");
  check(!!kw31 && kw31.textContent.includes("2/7 Tage geloggt"), "nachher: 2/7 Tage geloggt, SOFORT ohne Reload (erhalten: "+(kw31&&kw31.textContent)+")");
  jul31Bar = kw31 && barsOf(kw31)[4];
  check(!!jul31Bar && jul31Bar.style.background!=="var(--day-muted)" && jul31Bar.style.background!=="",
    "nachher: 31.7.-Balken ist SOFORT farbig, nicht mehr grau (erhalten: "+(jul31Bar&&jul31Bar.style.background)+")");

  // Wochenkarten sind seit der UX-Verbesserung nicht mehr antippbar (kein
  // Week-Detail-Sheet mehr) — die Balken-/Zaehler-Pruefungen oben decken die
  // Reaktivitaet bereits vollstaendig ab.
  check(!kw31.className.includes("dc"), "Wochenkarte hat keine Tap-Feedback-Klasse (\"dc\") mehr");

  dom.window.close();

  console.log("\n================================");
  console.log(passed+" bestanden, "+failed+" fehlgeschlagen");
  console.log("================================");
  process.exit(failed>0?1:0);
})().catch(e=>{console.error("FEHLER:",e.message);console.error(e.stack);process.exit(1);});
