const { createApp, flush } = require("./browser-test-harness.js");
const { clickByText } = require("./dom-test-helpers.js");

/* Test fuer die UX-Verbesserung der Kalender-Monatsansicht (Abschnitt
   "Wochenübersicht" zwischen Kalender und Wochenkarten, entkoppelter Klick
   auf Wochenkarten, vereinfachte Tageskacheln ohne Sport-km, angepasste
   Legende, vereinfachter 3er-KPI-Bereich ohne "Sport km", erweitertes
   Monatsfazit mit Logging-Quote/Ø-Bilanz/Wochenstatistik). Prueft
   ausschliesslich Struktur/Darstellung/Interaktion — keine der zugrunde
   liegenden Berechnungen (Wochenbilanz, Sport-Auswertung, Monats-KPIs)
   wird hier veraendert oder neu geprueft; die im Monatsfazit gezeigten
   zusaetzlichen Kennzahlen sind reine Wiederverwendung/Division bereits
   vorhandener Werte (lg/totDef/dim/weekSummaries). */

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
    win.localStorage.setItem("tracker_goals", JSON.stringify([]));
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

  console.log("\n--- 4. KPI-Bereich vereinfacht: kein 'Sport km' mehr, nur 3 KPIs ---");
  const rawData = JSON.parse(dom.window.localStorage.getItem("tracker_data"));
  check(rawData["2026-7-5"] && rawData["2026-7-5"].sports.length===1 && rawData["2026-7-5"].sports[0].km===20,
    "Sport-Eintrag (20km Rad) ist unveraendert in tracker_data gespeichert (nur die Anzeige entfernt, keine Daten)");
  const kpiTiles = [...d.querySelectorAll(".mini")];
  check(kpiTiles.length===3, "genau 3 KPI-Kacheln sichtbar (erhalten: "+kpiTiles.length+")");
  check(!kpiTiles.some(m=>m.textContent.includes("Sport")), "keine KPI-Kachel enthält 'Sport' mehr");
  check(kpiTiles.some(m=>m.textContent.includes("Ø kcal")), "KPI 'Ø kcal' weiterhin vorhanden");
  check(kpiTiles.some(m=>m.textContent.includes("Bilanz")), "KPI 'Bilanz' weiterhin vorhanden");
  check(kpiTiles.some(m=>m.textContent.includes("Fettverlust")), "KPI 'Fettverlust' vorhanden");

  console.log("\n--- 5. Legende zeigt kein 'Sport' mehr ---");
  const legendRow = [...d.querySelectorAll("div")].find(e=>e.style.justifyContent==="center" && e.style.gap==="14px");
  check(!!legendRow, "Legenden-Zeile gefunden");
  check(!!legendRow && !legendRow.textContent.includes("Sport"), "Legende enthält kein 'Sport' mehr (erhalten: "+(legendRow&&legendRow.textContent)+")");
  check(!!legendRow && legendRow.textContent.includes("Gewicht") && legendRow.textContent.includes("Defizit"), "Legende zeigt weiterhin 'Gewicht' und 'Defizit'");

  console.log("\n--- 6. Gewicht und Bilanz bleiben in der Tageskachel sichtbar ---");
  check(!!dayCell5 && dayCell5.textContent.includes("82"), "Tageszelle zeigt weiterhin das Gewicht (82)");
  check(!!dayCell5 && dayCell5.textContent.includes("651"), "Tageszelle zeigt weiterhin die Bilanz (2000-2651=-651)");

  console.log("\n--- 7. Monatsfazit steht nach den Wochenkarten und zeigt die erweiterten Kennzahlen ---");
  const weekCards = [...d.querySelectorAll(".card")].filter(c=>c.textContent.includes("KW "));
  const lastWeekCard = weekCards[weekCards.length-1];
  const allElsAfter = [...d.querySelectorAll("body *")];
  const fazitHeadline = allElsAfter.find(e=>e.children.length===0 && /Guter Monat|Ausgeglichener Monat|Herausfordernder Monat/.test(e.textContent));
  check(!!fazitHeadline, "Monatsfazit-Überschrift gefunden (erhalten: "+(fazitHeadline&&fazitHeadline.textContent)+")");
  check(!!lastWeekCard && !!fazitHeadline && !!(lastWeekCard.compareDocumentPosition(fazitHeadline) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING),
    "Monatsfazit steht NACH der letzten Wochenkarte");
  const fazitBox = fazitHeadline && fazitHeadline.parentElement;
  check(!!fazitBox && fazitBox.textContent.includes("1 / 31"), "Logging-Quote im Monatsfazit: 1 / 31 Ernährungstage geloggt (nur 5.8. ist geloggt)");
  check(!!fazitBox && fazitBox.textContent.includes("Ø Defizit") && fazitBox.textContent.includes("651 kcal"),
    "Ø-Bilanz im Monatsfazit: Ø Defizit 651 kcal (einziger geloggter Tag = Gesamtbilanz)");
  const totalWeeksShown = weekCards.length;
  check(!!fazitBox && fazitBox.textContent.includes("Wochen im Defizit") && fazitBox.textContent.includes("1 von "+totalWeeksShown),
    "Wochenstatistik im Monatsfazit: 1 von "+totalWeeksShown+" Wochen im Defizit (nur die KW mit 5.8. hat eine negative Bilanz), erhalten: "+(fazitBox&&fazitBox.textContent));

  console.log("\n================================");
  console.log(passed+" bestanden, "+failed+" fehlgeschlagen");
  console.log("================================");
  dom.window.close();
  process.exit(failed>0?1:0);
}

main().catch(e=>{ console.error("FEHLER:", e.message); console.error(e.stack); process.exit(1); });
