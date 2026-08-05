const { createApp, flush } = require("./browser-test-harness.js");
const { clickByText } = require("./dom-test-helpers.js");

/* Test fuer die UX-Verbesserung der Kalender-Monatsansicht (Abschnitt
   "Wochenübersicht" zwischen Kalender und Wochenkarten, entkoppelter Klick
   auf Wochenkarten, vereinfachte Tageskacheln ohne Sport-km, angepasste
   Legende, groessere 3er-KPI-Karten mit Icon-Badge ohne "Sport km",
   Monatsfazit im Checklisten-Format mit Icon-Badge-Kopfzeile und 4
   Haken-Zeilen). Prueft ausschliesslich Struktur/Darstellung/Interaktion —
   keine der zugrunde liegenden Berechnungen (Wochenbilanz, Sport-
   Auswertung, Monats-KPIs) wird hier veraendert oder neu geprueft; die im
   Monatsfazit gezeigten Kennzahlen sind reine Wiederverwendung/Division/
   Prozentrechnung bereits vorhandener Werte (lg/totDef/dim/weekSummaries). */

let passed=0, failed=0;
function check(cond, label){
  if(cond){ passed++; console.log("  ✅", label); }
  else { failed++; console.error("  ❌", label); }
}

async function main(){
  console.log("############################################");
  console.log("# Kalender-Monatsansicht: UX-Verbesserung");
  console.log("############################################\n");

  const dom = createApp((win)=>{
    win.localStorage.setItem("tracker_mset", JSON.stringify({
      "2026-7":{weight:90,fat:25,activityIdx:1}, // August, TDEE=2651
    }));
    const data = {};
    // 5.8.: vollstaendig geloggt, Gewicht + Defizit + Sport (20km Rad).
    data["2026-7-5"] = {
      kcalIn:2000, kcalBurned:0, weight:82,
      sports:[{type:"bike",km:20}], meals:{}, logged:true,
    };
    win.localStorage.setItem("tracker_data", JSON.stringify(data));
    // Ziel "abnehmen" (Zielgewicht < aktuelles Gewicht) — damit die dritte
    // KPI-Kachel wie in den bestehenden Assertions unten "Fettverlust" zeigt.
    win.localStorage.setItem("tracker_goals", JSON.stringify([{type:"weight", target:70, active:true}]));
  }, {now:new Date(2026,7,15,12,0,0)});
  await flush(dom);
  const d = dom.window.document;

  clickByText(d, "Verlauf");
  await flush(dom);

  console.log("\n--- 1. Überschrift 'Wochenübersicht' zwischen Kalender und Wochenkarten ---");
  const allEls = [...d.querySelectorAll("body *")];
  const heading = allEls.find(e=>e.children.length===0 && e.textContent.trim()==="Wochenübersicht");
  check(!!heading, "Überschrift 'Wochenübersicht' ist vorhanden");
  const grid = d.querySelector(".cell") && d.querySelector(".cell").closest("div").parentElement;
  const firstWeekCard = [...d.querySelectorAll(".card")].find(c=>c.textContent.includes("KW "));
  check(!!firstWeekCard, "mindestens eine Wochenkarte vorhanden");
  if(heading && grid && firstWeekCard){
    const headingPos = heading.compareDocumentPosition(grid);
    const cardPos = heading.compareDocumentPosition(firstWeekCard);
    check(!!(headingPos & dom.window.Node.DOCUMENT_POSITION_PRECEDING), "Kalendergitter steht VOR der Überschrift");
    check(!!(cardPos & dom.window.Node.DOCUMENT_POSITION_FOLLOWING), "erste Wochenkarte steht NACH der Überschrift");
  }

  console.log("\n--- 2. Wochenkarte öffnet kein Week-Detail-Sheet mehr ---");
  check(!d.querySelector(".sheet"), "vor dem Klick: kein Sheet offen");
  check(!firstWeekCard.className.includes("dc"), "Wochenkarte hat keine Tap-Feedback-Klasse (\"dc\") mehr");
  firstWeekCard.dispatchEvent(new dom.window.MouseEvent("click",{bubbles:true,cancelable:true}));
  await flush(dom);
  check(!d.querySelector(".sheet"), "nach dem Klick auf die Wochenkarte: weiterhin kein Sheet offen");

  console.log("\n--- 3. Tageskachel zeigt keine Kilometerangabe mehr ---");
  const dayCell5 = [...d.querySelectorAll(".cell")].find(c=>{
    const numDiv=c.querySelector("div");
    return numDiv && numDiv.textContent.trim()==="5";
  });
  check(!!dayCell5, "Tageszelle für 5.8. gefunden");
  check(!!dayCell5 && !dayCell5.textContent.includes("km"), "Tageszelle enthält keine 'km'-Angabe mehr (erhalten: "+(dayCell5&&dayCell5.textContent)+")");

  console.log("\n--- 4. KPI-Bereich: 3 kompakte Karten, kein 'Sport km' mehr ---");
  const rawData = JSON.parse(dom.window.localStorage.getItem("tracker_data"));
  check(rawData["2026-7-5"] && rawData["2026-7-5"].sports.length===1 && rawData["2026-7-5"].sports[0].km===20,
    "Sport-Eintrag (20km Rad) ist unveraendert in tracker_data gespeichert (nur die Anzeige entfernt, keine Daten)");
  // KPI-Kacheln tragen keine ".card"-Klasse mehr (eigenes, flacheres Kartendesign)
  // — daher ueber den Grid-Container mit 3 Spalten identifiziert.
  const kpiGrid = [...d.querySelectorAll("div")].find(e=>(e.style.gridTemplateColumns||"").includes("repeat(3"));
  const kpiCards = kpiGrid ? [...kpiGrid.children] : [];
  const kpiLabels = ["Ø Kalorien","Kalorienbilanz","Fettverlust"];
  check(kpiCards.length===3, "genau 3 KPI-Karten sichtbar (erhalten: "+kpiCards.length+")");
  check(!kpiCards.some(c=>c.textContent.includes("Sport")), "keine KPI-Karte enthält 'Sport' mehr");
  kpiLabels.forEach(l=>check(kpiCards.some(c=>c.textContent.includes(l)), "KPI '"+l+"' weiterhin vorhanden"));
  check(!kpiCards.some(c=>/…|\.\.\./.test(c.textContent)), "keine KPI-Überschrift ist abgeschnitten (kein Ellipsis-Zeichen im Text)");

  console.log("\n--- 5. Legende zeigt kein 'Sport' mehr, jetzt 'Defizit / Überschuss' ---");
  const legendRow = [...d.querySelectorAll("div")].find(e=>e.style.justifyContent==="center" && e.style.gap==="14px");
  check(!!legendRow, "Legenden-Zeile gefunden");
  check(!!legendRow && !legendRow.textContent.includes("Sport"), "Legende enthält kein 'Sport' mehr (erhalten: "+(legendRow&&legendRow.textContent)+")");
  check(!!legendRow && legendRow.textContent.includes("Gewicht") && legendRow.textContent.includes("Defizit / Überschuss"), "Legende zeigt 'Gewicht' und 'Defizit / Überschuss' (erhalten: "+(legendRow&&legendRow.textContent)+")");

  console.log("\n--- 6. Gewicht und Bilanz bleiben in der Tageskachel sichtbar ---");
  check(!!dayCell5 && dayCell5.textContent.includes("82"), "Tageszelle zeigt weiterhin das Gewicht (82)");
  check(!!dayCell5 && dayCell5.textContent.includes("651"), "Tageszelle zeigt weiterhin die Bilanz (2000-2651=-651)");

  console.log("\n--- 7. Monatsfazit steht nach den Wochenkarten und zeigt die Checkliste ---");
  const weekCards = [...d.querySelectorAll(".card")].filter(c=>c.textContent.includes("KW "));
  const lastWeekCard = weekCards[weekCards.length-1];
  const fazitBox = [...d.querySelectorAll(".card")].find(c=>/Sehr guter Monat|Ausgeglichener Monat|Herausfordernder Monat/.test(c.textContent));
  check(!!fazitBox, "Monatsfazit-Karte gefunden (erhalten: "+(fazitBox&&fazitBox.textContent)+")");
  check(!!lastWeekCard && !!fazitBox && !!(lastWeekCard.compareDocumentPosition(fazitBox) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING),
    "Monatsfazit steht NACH der letzten Wochenkarte");
  const checkmarks = fazitBox ? [...fazitBox.querySelectorAll("span")].filter(e=>e.textContent.trim()==="✅") : [];
  check(checkmarks.length===4, "genau 4 Haken-Zeilen im Monatsfazit (erhalten: "+checkmarks.length+")");
  check(!!fazitBox && fazitBox.textContent.includes("1 / 31 Tage geloggt (3%)"), "Logging-Quote inkl. Prozent: 1 / 31 Tage geloggt (3%) (nur 5.8. ist geloggt), erhalten: "+(fazitBox&&fazitBox.textContent));
  check(!!fazitBox && fazitBox.textContent.includes("Ø 651 kcal Defizit pro Tag"), "Ø-Bilanz im Monatsfazit: Ø 651 kcal Defizit pro Tag (einziger geloggter Tag = Gesamtbilanz)");
  const totalWeeksShown = weekCards.length;
  check(!!fazitBox && fazitBox.textContent.includes("1 / "+totalWeeksShown+" Wochen im Defizit"),
    "Wochenstatistik im Monatsfazit: 1 / "+totalWeeksShown+" Wochen im Defizit (nur die KW mit 5.8. hat eine negative Bilanz), erhalten: "+(fazitBox&&fazitBox.textContent));
  check(!!fazitBox && fazitBox.textContent.includes("0.08 kg Fett verloren"), "Fett-kg-Zeile im Monatsfazit: ≈ 0.08 kg Fett verloren");

  dom.window.close();
}

/* Dritte KPI-Kachel: dynamisch anhand des aktiven Gewichtsziels
   (inferWeightGoalDirection). Prueft ausschliesslich Titel/Farbe der
   Kachel fuer alle drei moeglichen Zielrichtungen — die zugrunde liegende
   Bilanz-/kg-Berechnung (totDef/KCAL_PER_KG) ist identisch zur bereits
   oben getesteten "abnehmen"-Variante und wird hier nicht erneut geprueft. */
function findThirdTileCard(d){
  const kpiGrid = [...d.querySelectorAll("div")].find(e=>(e.style.gridTemplateColumns||"").includes("repeat(3"));
  const kpiCards = kpiGrid ? [...kpiGrid.children] : [];
  return kpiCards[2];
}

async function testGoalAwareThirdTile(){
  console.log("\n--- 8. Dritte KPI-Kachel passt sich dynamisch an das Gewichtsziel an ---");

  // Ziel "zunehmen" (Zielgewicht deutlich > aktuelles Gewicht) + Ueberschuss
  // (totDef>0) -> Titel "Gewichtszunahme", gruen (Zunahme entspricht bei
  // diesem Ziel dem gewuenschten Fortschritt).
  {
    const dom = createApp((win)=>{
      win.localStorage.setItem("tracker_mset", JSON.stringify({"2026-7":{weight:70,fat:20,activityIdx:1,tdeeOverride:2000}}));
      const data = {};
      data["2026-7-5"] = {kcalIn:2500, kcalBurned:0, weight:70, meals:{}, logged:true};
      win.localStorage.setItem("tracker_data", JSON.stringify(data));
      win.localStorage.setItem("tracker_goals", JSON.stringify([{type:"weight", target:80, active:true}]));
    }, {now:new Date(2026,7,15,12,0,0)});
    await flush(dom);
    const d = dom.window.document;
    clickByText(d, "Verlauf");
    await flush(dom);
    const tile = findThirdTileCard(d);
    check(!!tile, "dritte KPI-Kachel gefunden (Ziel: zunehmen)");
    check(!!tile && tile.textContent.includes("Gewichtszunahme"), "Ziel 'zunehmen': Titel ist 'Gewichtszunahme' (erhalten: "+(tile&&tile.textContent)+")");
    check(!!tile && !tile.textContent.includes("Fettverlust"), "Ziel 'zunehmen': KEIN 'Fettverlust' angezeigt");
    const numSpan = tile && tile.querySelector(".num");
    check(!!numSpan && numSpan.style.color==="var(--good)", "Ziel 'zunehmen' + Ueberschuss: Zahl ist gruen (erhalten: "+(numSpan&&numSpan.style.color)+")");
    dom.window.close();
  }

  // Ziel "halten" (leeres Ziel-Array, kein weight-/deficit-/surplus-Goal
  // aktiv) -> Titel "Gewichtsänderung", neutrale Farbe (--ink), unabhaengig
  // vom Vorzeichen der Bilanz.
  {
    const dom = createApp((win)=>{
      win.localStorage.setItem("tracker_mset", JSON.stringify({"2026-7":{weight:90,fat:25,activityIdx:1}}));
      const data = {};
      data["2026-7-5"] = {kcalIn:2000, kcalBurned:0, weight:82, sports:[{type:"bike",km:20}], meals:{}, logged:true};
      win.localStorage.setItem("tracker_data", JSON.stringify(data));
      win.localStorage.setItem("tracker_goals", JSON.stringify([]));
    }, {now:new Date(2026,7,15,12,0,0)});
    await flush(dom);
    const d = dom.window.document;
    clickByText(d, "Verlauf");
    await flush(dom);
    const tile = findThirdTileCard(d);
    check(!!tile, "dritte KPI-Kachel gefunden (Ziel: halten / kein Ziel gesetzt)");
    check(!!tile && tile.textContent.includes("Gewichtsänderung"), "Ziel 'halten': Titel ist 'Gewichtsänderung' (erhalten: "+(tile&&tile.textContent)+")");
    check(!!tile && !tile.textContent.includes("Fettverlust") && !tile.textContent.includes("Gewichtszunahme"), "Ziel 'halten': weder 'Fettverlust' noch 'Gewichtszunahme' angezeigt");
    const numSpan = tile && tile.querySelector(".num");
    check(!!numSpan && numSpan.style.color==="var(--ink)", "Ziel 'halten': Zahl ist neutral (var(--ink)), erhalten: "+(numSpan&&numSpan.style.color));
    check(!!tile && !/…|\.\.\./.test(tile.textContent), "Ziel 'halten': Titel 'Gewichtsänderung' (16 Zeichen, laenger als 'Kalorienbilanz') ist NICHT abgeschnitten");
    dom.window.close();
  }
}

(async()=>{
  await main();
  await testGoalAwareThirdTile();
  console.log("\n================================");
  console.log(passed+" bestanden, "+failed+" fehlgeschlagen");
  console.log("================================");
  process.exit(failed>0?1:0);
})().catch(e=>{ console.error("FEHLER:", e.message); console.error(e.stack); process.exit(1); });
