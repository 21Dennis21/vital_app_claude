/* chart-resolution.test.js — Fixture-basierte, automatisierte Bewertung der
   adaptiven Aggregations-/Aufloesungs-Engine (chart-resolution.js) fuer
   unterschiedliche Datendichten bei Koerpergewicht und Ernaehrung (siehe
   Aufgabenstellung Phase 10/11: Testfaelle + automatische Bewertung).

   date-utils.js definiert seine Hilfsfunktionen als globale Browser-
   Funktionen (kein CommonJS-Modul) — fuer den Node-Test werden sie einmalig
   per vm.runInThisContext() in den globalen Kontext geladen, exakt wie sie
   im Browser via <script> verfuegbar waeren (chart-resolution.js nutzt zur
   Laufzeit weekStartDate/addMonths/daysInMonthOf daraus). */
const fs=require("fs");
const path=require("path");
const vm=require("vm");
vm.runInThisContext(fs.readFileSync(path.join(__dirname,"date-utils.js"),"utf8"),{filename:"date-utils.js"});
const CR=require("./chart-resolution.js");

let passed=0, failed=0;
function assert(cond,label){
  if(cond){passed++;}
  else{failed++;console.error("❌ FAIL:",label);}
}
function assertEq(actual,expected,label){
  const ok=actual===expected;
  if(ok){passed++;}
  else{failed++;console.error("❌ FAIL:",label,"— erwartet:",expected,"erhalten:",actual);}
}
function assertLte(actual,max,label){
  const ok=actual<=max;
  if(ok){passed++;}
  else{failed++;console.error("❌ FAIL:",label,"— erwartet <=",max,"erhalten:",actual);}
}
function assertNoNaNInfinity(points,label){
  const bad=points.some(p=>p.value!=null&&(Number.isNaN(p.value)||!Number.isFinite(p.value)));
  if(!bad){passed++;}
  else{failed++;console.error("❌ FAIL:",label,"— NaN/Infinity in Werten gefunden");}
}

const DAY=86400000;
function endOfDay(y,m,d){return new Date(y,m,d);}
// Erzeugt "count" taegliche echte Gewichtsmessungen endend bei "end" (inkl.), 70kg Basis + kleine Variation
function dailyWeightSeries(end,count,base){
  base=base||80;
  const out=[];
  for(let i=count-1;i>=0;i--){
    const d=new Date(end);d.setDate(d.getDate()-i);
    out.push({y:d.getFullYear(),m:d.getMonth(),d:d.getDate(),w:base-i*0.02,ts:d.getTime()});
  }
  return out;
}
// Erzeugt "count" SPARSE Messungen gleichmaessig ueber "spanDays" verteilt
function sparseWeightSeries(end,spanDays,count,base){
  base=base||80;
  const out=[];
  for(let i=0;i<count;i++){
    const offset=Math.round((spanDays-1)*(i/(count-1||1)));
    const d=new Date(end);d.setDate(d.getDate()-(spanDays-1)+offset);
    out.push({y:d.getFullYear(),m:d.getMonth(),d:d.getDate(),w:base,ts:d.getTime()});
  }
  return out;
}
function dailyNutritionSeries(end,count,kcalBase){
  kcalBase=kcalBase||2000;
  const out=[];
  for(let i=count-1;i>=0;i--){
    const d=new Date(end);d.setDate(d.getDate()-i);
    out.push({y:d.getFullYear(),m:d.getMonth(),d:d.getDate(),kcal:kcalBase,protein:120,carbs:200,fat:60,ts:d.getTime()});
  }
  return out;
}

const TODAY=new Date(2026,7,15); // 15. August 2026, deckungsgleich mit forecast-engine.test.js' Referenzdatum

/* ================= KOERPERGEWICHT ================= */

console.log("========== GEWICHT: 1 Messung in 1W ==========");
{
  const start=new Date(TODAY);start.setDate(start.getDate()-6);
  const pts=dailyWeightSeries(TODAY,1);
  const g=CR.pickGranularityByDensity(pts,"line");
  assertEq(g,"day","1 Messung in 1W: Granularitaet bleibt 'day'");
  const series=CR.buildWeightSeries(pts,g);
  assertEq(series.length,1,"1 Messung in 1W: genau 1 Punkt");
  assert(!series[0].isAgg,"1 Messung in 1W: nicht als aggregiert markiert");
  assertNoNaNInfinity(series,"1 Messung in 1W: keine NaN/Infinity");
}

console.log("========== GEWICHT: taeglich in 1W (7 Messungen) ==========");
{
  const pts=dailyWeightSeries(TODAY,7);
  const g=CR.pickGranularityByDensity(pts,"line");
  assertEq(g,"day","Taeglich in 1W: Granularitaet 'day'");
  const series=CR.buildWeightSeries(pts,g);
  assertEq(series.length,7,"Taeglich in 1W: alle 7 echten Tage sichtbar");
  assertNoNaNInfinity(series,"Taeglich in 1W: keine NaN/Infinity");
}

console.log("========== GEWICHT: 5 Messungen in 1M (sparse) ==========");
{
  const pts=sparseWeightSeries(TODAY,30,5);
  const g=CR.pickGranularityByDensity(pts,"line");
  assertEq(g,"day","5 sparse Messungen in 1M: bleibt 'day' (keine unnoetige Glaettung)");
  const series=CR.buildWeightSeries(pts,g);
  assertEq(series.length,5,"5 sparse Messungen in 1M: alle 5 echten Punkte erhalten");
}

console.log("========== GEWICHT: taeglich in 1M (30 Messungen) ==========");
{
  const pts=dailyWeightSeries(TODAY,30);
  const g=CR.pickGranularityByDensity(pts,"line");
  assertEq(g,"day","Taeglich in 1M (30 Punkte, Budget 30): bleibt 'day'");
  const series=CR.buildWeightSeries(pts,g);
  assertEq(series.length,30,"Taeglich in 1M: alle 30 Tage sichtbar");
  assertLte(series.length,30,"Taeglich in 1M: Punktzahl im Budget");
}

console.log("========== GEWICHT: 10 Messungen in 3M (sparse) ==========");
{
  const pts=sparseWeightSeries(TODAY,90,10);
  const g=CR.pickGranularityByDensity(pts,"line");
  assertEq(g,"day","10 sparse Messungen in 3M: bleibt 'day'");
}

console.log("========== GEWICHT: taeglich in 3M (90 Messungen) ==========");
{
  const pts=dailyWeightSeries(TODAY,90);
  const g=CR.pickGranularityByDensity(pts,"line");
  assertEq(g,"week","Taeglich in 3M (90>30): eskaliert auf 'week'");
  const series=CR.buildWeightSeries(pts,g);
  assertLte(series.length,30,"Taeglich in 3M: Punktzahl nach Verdichtung im Budget");
  assert(series.every(p=>p.isAgg),"Taeglich in 3M: alle Punkte als aggregiert markiert");
  assert(series.every(p=>p.count>=1),"Taeglich in 3M: jeder Bucket hat mindestens 1 echten Wert");
  assertNoNaNInfinity(series,"Taeglich in 3M: keine NaN/Infinity nach Mittelung");
}

console.log("========== GEWICHT: taeglich in 6M (~180 Messungen) ==========");
{
  const pts=dailyWeightSeries(TODAY,180);
  const g=CR.pickGranularityByDensity(pts,"line");
  assertEq(g,"week","Taeglich in 6M: 'week' (feiner als das alte hartcodierte 'month')");
  const series=CR.buildWeightSeries(pts,g);
  assertLte(series.length,30,"Taeglich in 6M: Punktzahl im Budget");
}

console.log("========== GEWICHT: taeglich in 12M (~365 Messungen) ==========");
{
  const pts=dailyWeightSeries(TODAY,365);
  const g=CR.pickGranularityByDensity(pts,"line");
  assertEq(g,"biweek","Taeglich in 12M: 'biweek' (feiner als das alte hartcodierte 'month')");
  const series=CR.buildWeightSeries(pts,g);
  assertLte(series.length,30,"Taeglich in 12M: Punktzahl im Budget");
  assertNoNaNInfinity(series,"Taeglich in 12M: keine NaN/Infinity");
}

console.log("========== GEWICHT: 2 Jahre taeglich (~730 Messungen) ==========");
{
  const pts=dailyWeightSeries(TODAY,730);
  const g=CR.pickGranularityByDensity(pts,"line");
  assertEq(g,"month","2 Jahre taeglich: 'month'");
  const series=CR.buildWeightSeries(pts,g);
  assertLte(series.length,30,"2 Jahre taeglich: Punktzahl im Budget");
}

console.log("========== GEWICHT: 5 Jahre taeglich (~1825 Messungen) ==========");
{
  const pts=dailyWeightSeries(TODAY,1825);
  const g=CR.pickGranularityByDensity(pts,"line");
  assertEq(g,"quarter","5 Jahre taeglich: 'quarter'");
  const series=CR.buildWeightSeries(pts,g);
  assertLte(series.length,30,"5 Jahre taeglich: Punktzahl im Budget");
  assertNoNaNInfinity(series,"5 Jahre taeglich: keine NaN/Infinity");
}

console.log("========== GEWICHT: 5 Jahre mit nur 20 Messungen (Kernfall) ==========");
{
  const pts=sparseWeightSeries(TODAY,1825,20);
  const g=CR.pickGranularityByDensity(pts,"line");
  assertEq(g,"day","5 Jahre / 20 Messungen: bleibt 'day' — KEINE unnoetige Glaettung trotz langer Zeitspanne");
  const series=CR.buildWeightSeries(pts,g);
  assertEq(series.length,20,"5 Jahre / 20 Messungen: alle 20 echten Punkte einzeln sichtbar");
  assert(series.every(p=>!p.isAgg),"5 Jahre / 20 Messungen: kein Punkt faelschlich als aggregiert markiert");
}

console.log("========== GEWICHT: keine Messungen ==========");
{
  const g=CR.pickGranularityByDensity([],"line");
  assertEq(g,"day","Keine Messungen: Fallback 'day' (kein Crash)");
  const series=CR.buildWeightSeries([],g);
  assertEq(series.length,0,"Keine Messungen: leere Punktliste, kein Fake-Punkt");
}

console.log("========== GEWICHT: X-Achsen-Ticks getrennt von Punktzahl ==========");
{
  const pts=dailyWeightSeries(TODAY,90);
  const series=CR.buildWeightSeries(pts,CR.pickGranularityByDensity(pts,"line"));
  const ticks=CR.pickTimeTicks(series,7);
  assertLte(ticks.length,7,"Ticks: nie mehr als angefordert");
  assert(ticks.length<series.length,"Ticks: deutlich weniger Labels als Datenpunkte bei dichten Serien");
  const idxSet=new Set(ticks.map(t=>t.idx));
  assertEq(idxSet.size,ticks.length,"Ticks: keine doppelten Indizes");
  assert(ticks.some(t=>t.idx===0),"Ticks: erster Punkt ist immer dabei");
  assert(ticks.some(t=>t.idx===series.length-1),"Ticks: letzter (aktuellster) Punkt ist immer dabei");
}
{
  const pts=dailyWeightSeries(TODAY,5);
  const ticks=CR.pickTimeTicks(pts,7);
  assertEq(ticks.length,5,"Ticks: bei n<=maxCount werden ALLE Punkte beschriftet (keine Interpolation noetig)");
}

/* ================= ERNAEHRUNG ================= */

console.log("========== ERNAEHRUNG: 1W (7 Slots) ==========");
{
  const start=new Date(TODAY);start.setDate(start.getDate()-6);
  const g=CR.pickGranularityBySpan(start,TODAY,"bar");
  assertEq(g,"day","Ernaehrung 1W: 'day'");
  const slots=CR.fixedBucketSlots(start,TODAY,g);
  assertEq(slots.length,7,"Ernaehrung 1W: exakt 7 feste Slots (immer alle 7 Tage sichtbar)");
}

console.log("========== ERNAEHRUNG: 1M (30 Slots) ==========");
{
  const start=new Date(TODAY);start.setDate(start.getDate()-29);
  const g=CR.pickGranularityBySpan(start,TODAY,"bar");
  assertEq(g,"day","Ernaehrung 1M (30 Slots, Budget 30): bleibt 'day'");
  const slots=CR.fixedBucketSlots(start,TODAY,g);
  assertEq(slots.length,30,"Ernaehrung 1M: 30 feste Tages-Slots");
}

console.log("========== ERNAEHRUNG: 3M (~90 Slots) ==========");
{
  const start=new Date(TODAY);start.setDate(start.getDate()-89);
  const g=CR.pickGranularityBySpan(start,TODAY,"bar");
  assertEq(g,"week","Ernaehrung 3M: eskaliert auf 'week'");
  const slots=CR.fixedBucketSlots(start,TODAY,g);
  assertLte(slots.length,30,"Ernaehrung 3M: Slot-Anzahl im Budget");
}

console.log("========== ERNAEHRUNG: 6M (~180 Slots) ==========");
{
  const start=new Date(TODAY);start.setDate(start.getDate()-179);
  const g=CR.pickGranularityBySpan(start,TODAY,"bar");
  assertEq(g,"week","Ernaehrung 6M: 'week' (feiner als das alte hartcodierte 'month')");
}

console.log("========== ERNAEHRUNG: 12M (~365 Slots) ==========");
{
  const start=new Date(TODAY);start.setDate(start.getDate()-364);
  const g=CR.pickGranularityBySpan(start,TODAY,"bar");
  assertEq(g,"biweek","Ernaehrung 12M: 'biweek' (feiner als das alte hartcodierte 'month')");
}

console.log("========== ERNAEHRUNG: Buckets mitteln, keine Summe, keine Fake-0 ==========");
{
  const start=new Date(TODAY);start.setDate(start.getDate()-89); // 3M -> week
  const g=CR.pickGranularityBySpan(start,TODAY,"bar");
  // Nur an 2 von ~90 Tagen tatsaechlich geloggt — Rest bleibt "keine Daten"
  const pts=[
    {y:start.getFullYear(),m:start.getMonth(),d:start.getDate(),kcal:2000,protein:120,carbs:200,fat:60,ts:start.getTime()},
    {y:TODAY.getFullYear(),m:TODAY.getMonth(),d:TODAY.getDate(),kcal:1800,protein:110,carbs:180,fat:55,ts:TODAY.getTime()},
  ];
  const slots=CR.fixedBucketSlots(start,TODAY,g);
  const aggMap=CR.bucketNutritionPoints(pts,g);
  const chartPoints=slots.map(s=>{
    const agg=aggMap[s.key];
    return {ts:s.ts,y:s.y,m:s.m,d:s.d,value:agg?agg.kcal:null,isAgg:g!=="day"};
  });
  const withValue=chartPoints.filter(p=>p.value!=null);
  assertEq(withValue.length,2,"Nur die 2 tatsaechlich befuellten Buckets haben einen Wert");
  assert(withValue.every(p=>p.value===2000||p.value===1800),"Bucket-Werte sind der reine Tageswert (Durchschnitt ueber 1 echten Tag), keine Summe");
  const withoutValue=chartPoints.filter(p=>p.value==null);
  assert(withoutValue.length>0,"Leere Buckets bleiben 'Keine Daten' (null), nicht 0");
  assertNoNaNInfinity(chartPoints,"Ernaehrung-Buckets: keine NaN/Infinity");
}

console.log("========== ERNAEHRUNG: Durchschnitt statt Summe bei mehreren Tagen im selben Bucket ==========");
{
  const g="week";
  const wsA=weekStartDate(TODAY.getFullYear(),TODAY.getMonth(),TODAY.getDate());
  const d1=new Date(wsA), d2=new Date(wsA); d2.setDate(d2.getDate()+1);
  const pts=[
    {y:d1.getFullYear(),m:d1.getMonth(),d:d1.getDate(),kcal:2000,protein:100,carbs:200,fat:60,ts:d1.getTime()},
    {y:d2.getFullYear(),m:d2.getMonth(),d:d2.getDate(),kcal:3000,protein:150,carbs:300,fat:90,ts:d2.getTime()},
  ];
  const aggMap=CR.bucketNutritionPoints(pts,g);
  const key=CR.bucketKeyOf(d1.getFullYear(),d1.getMonth(),d1.getDate(),g);
  assertEq(aggMap[key].kcal,2500,"2 Tage im selben Wochen-Bucket: Durchschnitt (2500), nicht Summe (5000)");
  assertEq(aggMap[key].count,2,"Bucket kennt die Anzahl echter Tage (fuer 'Ø'-Kennzeichnung)");
}

console.log("========== MONATS-/JAHRESWECHSEL ==========");
{
  // Bucket ueber einen Jahreswechsel hinweg (29. Dez 2025 - 4. Jan 2026)
  const pts=[
    {y:2025,m:11,d:29,w:80,ts:new Date(2025,11,29).getTime()},
    {y:2026,m:0,d:2,w:79.5,ts:new Date(2026,0,2).getTime()},
  ];
  const g="week";
  const series=CR.buildWeightSeries(pts,g);
  assertEq(series.length,1,"Jahreswechsel: beide Tage fallen korrekt in denselben Wochen-Bucket");
  assertEq(series[0].value,79.75,"Jahreswechsel: Durchschnitt korrekt berechnet");
  // Monatswechsel: Bucket-Ende innerhalb eines Monats darf nicht ueberlaufen
  const endFeb=CR.chartBucketEnd(2026,1,1,"month"); // Februar 2026 (kein Schaltjahr)
  assertEq(endFeb.d,28,"Monatsende Februar 2026 (kein Schaltjahr) korrekt: 28");
  const endFeb2028=CR.chartBucketEnd(2028,1,1,"month");
  assertEq(endFeb2028.d,29,"Monatsende Februar 2028 (Schaltjahr) korrekt: 29");
  // Quartalsende darf nicht ins naechste Jahr rollen (Q4 endet im selben Jahr)
  const endQ4=CR.chartBucketEnd(2026,9,1,"quarter");
  assertEq(endQ4.y,2026,"Quartalsende Q4: bleibt im selben Jahr");
  assertEq(endQ4.m,11,"Quartalsende Q4: letzter Monat ist Dezember");
  assertEq(endQ4.d,31,"Quartalsende Q4: 31. Dezember");
}

console.log("\n"+passed+" bestanden, "+failed+" fehlgeschlagen");
process.exit(failed>0?1:0);
