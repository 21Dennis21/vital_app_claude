const { createApp, flush } = require("./browser-test-harness.js");
const { clickByText } = require("./dom-test-helpers.js");

/* Regressionstest fuer den gemeldeten Inkonsistenz-Bug: eine ISO-Woche, die
   ueber zwei Monate laeuft (KW31: Mo 27.7. .. So 2.8.), bei der nur EINER
   der beiden Monate einen eingerichteten Grundbedarf (TDEE) hat.

   Verlauf des Fixes:
   1. Urspruenglich fiel die Wochenkarte fuer den Tag ohne TDEE faelschlich
      auf die "nicht geloggt"-Graufarbe zurueck, obwohl der Tag echt geloggt
      war (waehrend Bottom Sheet/X-7-Zaehler korrekt "geloggt" zeigten).
   2. Der erste Fix ersetzte das faelschlich durch eine "neutrale" Ink-Farbe
      fuer diesen Fall — die im Dark Mode aber quasi WEISS ist, also eine
      neue, verbotene Sonderfarbe fuer den Balken erzeugte.
   3. Der finale Fix (getWeekDayVisualState) kennt nur noch DREI Zustaende:
      nicht geloggt (Grau/--day-muted), geloggt+Ziel unterstuetzt (Gruen),
      geloggt+Ziel nicht unterstuetzt (Orange) — nie eine vierte Farbe
      (kein Weiss, kein Blau). Ein geloggter Tag OHNE TDEE fuer seinen Monat
      ist NICHT mehr grau: die Bilanz nutzt denselben "||0"-Fallback wie die
      Wochenbilanz (wd-Berechnung) es schon immer tut, statt den Tag als
      "nicht bewertbar" zu behandeln — ein geloggter Tag ist IMMER farbig,
      exakt wie Zaehler/Bilanz/Bottom Sheet es fuer ihn bereits zeigen. Die
      Monatszugehoerigkeit (ext) aendert NIE die Farbe, sondern
      ausschliesslich die Deckkraft (opacity 0.5 statt 1 — wie frueher
      "opacity:x&&x.ext?.5:1"), einheitlich fuer alle drei Status. */

let passed=0, failed=0;
function check(cond, label){
  if(cond){ passed++; console.log("  ✅", label); }
  else { failed++; console.error("  ❌", label); }
}

(async()=>{
  console.log("\n--- ISO-Woche ueber Monatsgrenze, TDEE nur fuer einen Monat eingerichtet ---");
  const dom = createApp((win)=>{
    // NUR August (Monatsindex 7) hat einen Grundbedarf — Juli (Index 6)
    // bewusst NICHT eingerichtet, genau wie im gemeldeten Fall.
    win.localStorage.setItem("tracker_mset", JSON.stringify({"2026-7":{weight:90,fat:25,activityIdx:1}}));
    const data = {};
    // 31. Juli: nachtraeglich geloggt, OHNE dass Juli einen TDEE hat.
    data["2026-6-31"] = {kcalIn:2000, kcalBurned:0, sports:[], meals:{}, logged:true};
    // 1. August: normal geloggt, TDEE vorhanden -> -500 Defizit (wie im
    // bestehenden weekcard-goals-Test) -> muss gruen sein.
    data["2026-7-1"]  = {kcalIn:2151, kcalBurned:0, sports:[], meals:{}, logged:true, weight:90};
    win.localStorage.setItem("tracker_data", JSON.stringify(data));
    win.localStorage.setItem("tracker_goals", JSON.stringify([{type:"weight", target:80, active:true}]));
  });
  await flush(dom);
  const d = dom.window.document;
  clickByText(d, "Verlauf");
  await flush(dom);
  // Wochenkarten stehen seit dem UI-Refactoring direkt im Kalender-Segment
  // (dem Standardsegment) — kein separater "Rückblick"-Klick mehr noetig.

  const cards = [...d.querySelectorAll(".card")].filter(c=>c.textContent.includes("KW"));
  const kw31 = cards.find(c=>c.textContent.includes("KW 31"));
  check(!!kw31, "KW-31-Karte (Monatsgrenze Juli/August) gefunden");
  if(!kw31) { console.log(passed+" bestanden, "+failed+" fehlgeschlagen"); process.exit(1); }

  check(kw31.textContent.includes("2/7 Tage geloggt"), "X/7-Zaehler zaehlt BEIDE geloggten Tage (2/7), auch den ohne TDEE");

  const bars = [...kw31.querySelectorAll("div")].filter(e=>e.style.height==="6px");
  // Mo=27(0) Di=28(1) Mi=29(2) Do=30(3) Fr=31(4) Sa=1.8.(5) So=2.8.(6)
  const GREEN="var(--good)", ORANGE="var(--amber)", DAY_MUTED="var(--day-muted)";
  const FORBIDDEN=["#fff","#ffffff","white","var(--accent)","var(--day-muted)"]; // kein Weiss, kein Blau, kein Grau am Balken eines geloggten Tages

  // 31.7.: kcalIn=2000, Juli hat KEIN TDEE -> Bilanz faellt auf "kcalIn-0-0"
  // zurueck (derselbe "||0"-Fallback wie bei der Wochenbilanz) = +2000
  // Ueberschuss -> bei Ziel "abnehmen" NICHT unterstuetzt -> Orange.
  const jul31Bar = bars[4];
  check(!!jul31Bar && !FORBIDDEN.includes((jul31Bar.style.background||"").toLowerCase()),
    "31.7. (geloggt, kein TDEE fuer Juli) ist trotzdem FARBIG, nicht grau/weiss/blau (erhalten: "+(jul31Bar&&jul31Bar.style.background)+")");
  check(!!jul31Bar && jul31Bar.style.background===ORANGE,
    "31.7. (geloggt, TDEE-Fallback auf 0 -> Ueberschuss) ist orange, wie die Wochenbilanz es fuer denselben Tag schon zeigt");
  check(!!jul31Bar && jul31Bar.style.opacity==="0.5",
    "31.7. ist externer Monat -> Deckkraft 0.5 (Farbe bleibt gleich, nur die Deckkraft aendert sich)");

  const aug1Bar = bars[5];
  check(!!aug1Bar && aug1Bar.style.background===GREEN,
    "1.8. (geloggt, TDEE vorhanden, -500 Defizit) ist gruen (erhalten: "+(aug1Bar&&aug1Bar.style.background)+")");
  check(!!aug1Bar && (aug1Bar.style.opacity===""||aug1Bar.style.opacity==="1"),
    "1.8. ist aktueller Monat -> volle Deckkraft");

  const jul27Bar = bars[0]; // nicht geloggt, ausserhalb des angezeigten Monats (August)
  check(!!jul27Bar && jul27Bar.style.background===DAY_MUTED && jul27Bar.style.opacity==="0.5",
    "27.7. (nicht geloggt, externer Monat) zeigt dieselbe Graufarbe mit reduzierter Deckkraft (0.5)");

  const aug2Bar = bars[6]; // nicht geloggt, im angezeigten Monat (August)
  check(!!aug2Bar && aug2Bar.style.background===DAY_MUTED && (aug2Bar.style.opacity===""||aug2Bar.style.opacity==="1"),
    "2.8. (nicht geloggt, aktueller Monat) zeigt dieselbe Graufarbe mit voller Deckkraft");

  // Bottom Sheet oeffnen und garantieren, dass es EXAKT dieselbe
  // Geloggt-Aussage trifft wie die Wochenkarte (kein separates Wochen-
  // Array, keine eigene Logik).
  kw31.dispatchEvent(new dom.window.MouseEvent("click",{bubbles:true,cancelable:true}));
  await flush(dom);
  const sheetRows = [...d.querySelectorAll(".sub")].filter(e=>/^(Mo|Di|Mi|Do|Fr|Sa|So) · /.test(e.textContent));
  check(sheetRows.length===7, "Bottom Sheet zeigt alle 7 Tage der Woche");
  const rowFor = (datePart)=>sheetRows.find(r=>r.textContent.includes(datePart));
  const jul31Row = rowFor("31.7.");
  const aug1Row = rowFor("1.8.");
  const jul27Row = rowFor("27.7.");
  const aug2Row = rowFor("2.8.");
  const isChecked = (row)=>row && row.parentElement.textContent.includes("✔");
  check(isChecked(jul31Row), "Bottom Sheet: 31.7. ist ✔ (deckt sich mit der Wochenkarte)");
  check(isChecked(aug1Row), "Bottom Sheet: 1.8. ist ✔ (deckt sich mit der Wochenkarte)");
  check(!isChecked(jul27Row), "Bottom Sheet: 27.7. ist NICHT ✔ (deckt sich mit der Wochenkarte)");
  check(!isChecked(aug2Row), "Bottom Sheet: 2.8. ist NICHT ✔ (deckt sich mit der Wochenkarte)");

  dom.window.close();

  console.log("\n================================");
  console.log(passed+" bestanden, "+failed+" fehlgeschlagen");
  console.log("================================");
  process.exit(failed>0?1:0);
})().catch(e=>{console.error("FEHLER:",e.message);console.error(e.stack);process.exit(1);});
