/* chart-resolution.test.js — Fixture-basierte Tests des zentralen Zeitraum-/
   Aggregationssystems (chart-resolution.js) fuer die Statistik-Detailcharts:
   feste Kalender-Granularitaet je Zeitspanne (statGranularityFor), die
   dynamische Wahl bei "Max" (pickMaxGranularity), echte ISO-Kalenderwochen-
   Bucketing ueber Monats-/Jahresgrenzen hinweg, sowie die 1M-Tages-Tick-
   Auswahl (pickWeekAnchoredDayTicks).

   date-utils.js definiert seine Hilfsfunktionen als globale Browser-
   Funktionen (kein CommonJS-Modul) — fuer den Node-Test werden sie einmalig
   per vm.runInThisContext() in den globalen Kontext geladen, exakt wie sie
   im Browser via <script> verfuegbar waeren (chart-resolution.js nutzt zur
   Laufzeit weekStartDate/isoWeek/addMonths/daysInMonthOf daraus).

   bucketDateLabel()/selDetailDateLabel() (die sichtbaren "KW N"/Monats-/
   Jahres-Texte) brauchen zusaetzlich MN/DS/WD_FULL/detailDateRangeLabel aus
   index.html und werden deshalb hier bewusst NICHT direkt getestet (siehe
   Modul-Exports-Kommentar in chart-resolution.js) — ihre korrekte
   Darstellung wird stattdessen per Playwright gegen den echten App-Code
   verifiziert. Hier getestet wird die darunterliegende, reine Bucket-/
   Kalendermathematik, auf der diese Labels aufbauen. */
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
function assertNoNaNInfinity(points,label){
  const bad=points.some(p=>p.value!=null&&(Number.isNaN(p.value)||!Number.isFinite(p.value)));
  if(!bad){passed++;}
  else{failed++;console.error("❌ FAIL:",label,"— NaN/Infinity in Werten gefunden");}
}

const TODAY=new Date(2026,7,15); // 15. August 2026 (Samstag)

/* ================= ZENTRALES ZEITRAUMSYSTEM ================= */

console.log("========== statGranularityFor: feste Kalender-Granularitaet je Zeitraum ==========");
{
  assertEq(CR.statGranularityFor("1W",new Date(2026,7,9),new Date(2026,7,15)),"day","1W -> day");
  assertEq(CR.statGranularityFor("1M",new Date(2026,6,17),new Date(2026,7,15)),"day","1M -> day");
  assertEq(CR.statGranularityFor("3M",new Date(2026,4,15),new Date(2026,7,15)),"week","3M -> week (echte Kalenderwochen)");
  assertEq(CR.statGranularityFor("6M",new Date(2026,1,15),new Date(2026,7,15)),"week","6M -> week (echte Kalenderwochen)");
  assertEq(CR.statGranularityFor("12M",new Date(2025,7,15),new Date(2026,7,15)),"month","12M -> month");
  // "Max" hat keinen festen Zeitraum -> delegiert an pickMaxGranularity (Historienlaenge)
  assertEq(CR.statGranularityFor("Max",new Date(2026,6,1),new Date(2026,7,15)),"week","Max mit kurzer Historie -> wie pickMaxGranularity");
}

console.log("========== pickMaxGranularity: dynamisch nach tatsaechlicher Historienlaenge ==========");
{
  assertEq(CR.pickMaxGranularity(new Date(2026,5,1),TODAY),"week","~76 Tage Historie -> week");
  assertEq(CR.pickMaxGranularity(new Date(2025,3,1),TODAY),"month","~1,4 Jahre Historie -> month");
  assertEq(CR.pickMaxGranularity(new Date(2020,7,15),TODAY),"quarter","6 Jahre Historie -> quarter");
  assertEq(CR.pickMaxGranularity(new Date(2008,7,15),TODAY),"year","18 Jahre Historie -> year");
  // Schwellenwerte exakt treffen (120/730/2555 Tage) — keine Off-by-One-Fehler
  const at120=new Date(TODAY);at120.setDate(at120.getDate()-119);
  assertEq(CR.pickMaxGranularity(at120,TODAY),"week","genau 120 Tage Historie: noch 'week'");
  const at121=new Date(TODAY);at121.setDate(at121.getDate()-120);
  assertEq(CR.pickMaxGranularity(at121,TODAY),"month","121 Tage Historie: bereits 'month'");
  const at730=new Date(TODAY);at730.setDate(at730.getDate()-729);
  assertEq(CR.pickMaxGranularity(at730,TODAY),"month","genau 730 Tage Historie: noch 'month'");
  const at731=new Date(TODAY);at731.setDate(at731.getDate()-730);
  assertEq(CR.pickMaxGranularity(at731,TODAY),"quarter","731 Tage Historie: bereits 'quarter'");
  assertEq(CR.pickMaxGranularity(TODAY,TODAY),"week","1 einziger Tag Historie: kein Crash, 'week'");
}

/* ================= ISO-KALENDERWOCHEN: BUCKET-GRENZEN ================= */

console.log("========== Kalenderwoche ueber einen Monatswechsel hinweg ==========");
{
  // Aug31,2026 ist ein Montag -> die Woche Mo 31.08.-So 06.09.2026 ueberspannt
  // den Monatswechsel August/September.
  const startFromAug31=CR.bucketStartOf(2026,7,31,"week");
  const startFromSep2=CR.bucketStartOf(2026,8,2,"week");
  assertEq(startFromAug31.y+"-"+startFromAug31.m+"-"+startFromAug31.d,"2026-7-31","Aug31 (Montag) ist bereits der Wochenstart");
  assertEq(startFromSep2.y+"-"+startFromSep2.m+"-"+startFromSep2.d,"2026-7-31","Sep2 faellt in dieselbe Woche wie Aug31 (ueber den Monatswechsel hinweg)");
  const end=CR.chartBucketEnd(2026,7,31,"week");
  assertEq(end.y+"-"+end.m+"-"+end.d,"2026-8-6","Wochenende korrekt im Folgemonat: So 06.09.2026");
}

console.log("========== Kalenderwoche ueber den Jahreswechsel hinweg (KW1 2026) ==========");
{
  // Jan1,2026 ist ein Donnerstag -> ISO-KW1 2026 = Mo 29.12.2025 - So 04.01.2026.
  assertEq(isoWeek(2025,11,29),1,"29.12.2025 gehoert bereits zu ISO-KW1 des Jahres 2026");
  const startFromDec29=CR.bucketStartOf(2025,11,29,"week");
  const startFromJan2=CR.bucketStartOf(2026,0,2,"week");
  assertEq(startFromDec29.y+"-"+startFromDec29.m+"-"+startFromDec29.d,"2025-11-29","29.12.2025 (Montag) ist der Start von KW1 2026");
  assertEq(startFromJan2.y+"-"+startFromJan2.m+"-"+startFromJan2.d,"2025-11-29","02.01.2026 faellt in dieselbe Woche (KW1 2026), obwohl im neuen Kalenderjahr");
  const series=CR.buildWeightSeries([
    {y:2025,m:11,d:29,w:80,ts:new Date(2025,11,29).getTime()},
    {y:2026,m:0,d:2,w:79.5,ts:new Date(2026,0,2).getTime()},
  ],"week");
  assertEq(series.length,1,"Beide Tage werden zu EINEM Wochen-Bucket zusammengefasst (echtes KW1, nicht zwei getrennte Jahres-Buckets)");
  assertEq(series[0].value,79.75,"Durchschnitt ueber den Jahreswechsel hinweg korrekt berechnet");
}

console.log("========== KW52 (letzte volle Kalenderwoche eines 52-Wochen-Jahres) ==========");
{
  // 2025 hat nur 52 ISO-Wochen (Jan1,2025 = Mittwoch, kein Schaltjahr) ->
  // KW52 = Mo 22.12.2025 - So 28.12.2025 (danach beginnt bereits KW1 2026).
  assertEq(isoWeek(2025,11,22),52,"22.12.2025 ist KW52 2025");
  const start=CR.bucketStartOf(2025,11,24,"week");
  assertEq(start.y+"-"+start.m+"-"+start.d,"2025-11-22","24.12.2025 faellt in den KW52-Bucket (Start Mo 22.12.2025)");
}

console.log("========== KW53 (Jahr MIT 53. Kalenderwoche) ueber den Jahreswechsel ==========");
{
  // 2026 hat 53 ISO-Wochen (Jan1,2026 = Donnerstag) -> KW53 2026 = Mo
  // 28.12.2026 - So 03.01.2027, obwohl der Donnerstag dieser Woche
  // (31.12.2026) noch in 2026 liegt.
  assertEq(isoWeek(2026,11,28),53,"28.12.2026 ist bereits KW53 (nicht KW1 2027)");
  const startFromDec28=CR.bucketStartOf(2026,11,28,"week");
  const startFromJan3=CR.bucketStartOf(2027,0,3,"week");
  assertEq(startFromDec28.y+"-"+startFromDec28.m+"-"+startFromDec28.d,"2026-11-28","28.12.2026 (Montag) ist der Start von KW53 2026");
  assertEq(startFromJan3.y+"-"+startFromJan3.m+"-"+startFromJan3.d,"2026-11-28","03.01.2027 (Sonntag) faellt noch in denselben KW53-Bucket");
  assertEq(isoWeek(2027,0,4),1,"Der naechste Tag (04.01.2027, Montag) ist bereits KW1 2027 — kein Off-by-One an der Grenze");
}

console.log("========== Monatsende: 28/29/30/31 Tage (Schaltjahr-Februar inklusive) ==========");
{
  const endFeb2026=CR.chartBucketEnd(2026,1,1,"month");
  assertEq(endFeb2026.d,28,"Februar 2026 (kein Schaltjahr): 28 Tage");
  const endFeb2028=CR.chartBucketEnd(2028,1,1,"month");
  assertEq(endFeb2028.d,29,"Februar 2028 (Schaltjahr): 29 Tage");
  const endApr=CR.chartBucketEnd(2026,3,1,"month");
  assertEq(endApr.d,30,"April 2026: 30 Tage");
  const endAug=CR.chartBucketEnd(2026,7,1,"month");
  assertEq(endAug.d,31,"August 2026: 31 Tage");
  const endQ4=CR.chartBucketEnd(2026,9,1,"quarter");
  assertEq(endQ4.y+"-"+endQ4.m+"-"+endQ4.d,"2026-11-31","Quartalsende Q4 rollt nicht ins naechste Jahr: 31.12.2026");
}

console.log("========== 12M: Monats-Buckets ueber einen Jahreswechsel (z.B. Sep 2025 - Sep 2026) ==========");
{
  const start=new Date(2025,8,3), end=new Date(2026,8,2); // rollierendes 12M-Beispiel (365 Tage bis "heute" 02.09.2026)
  const slots=CR.fixedBucketSlots(start,end,"month");
  assertEq(slots.length,13,"Rollierendes 12M-Fenster (Sep2025-Sep2026, beide Enden angeschnitten) ergibt 13 Monats-Buckets (September existiert als zwei verschiedene Jahres-Buckets)");
  assertEq(slots[0].y+"-"+slots[0].m,"2025-8","Erster Bucket: September 2025");
  assertEq(slots[12].y+"-"+slots[12].m,"2026-8","Letzter Bucket: September 2026");
  // Voller Kalenderjahr-Zeitraum (01.01.-31.12.) ergibt exakt 12 Buckets
  const yearSlots=CR.fixedBucketSlots(new Date(2025,0,1),new Date(2025,11,31),"month");
  assertEq(yearSlots.length,12,"Volles Kalenderjahr 2025: exakt 12 Monats-Buckets");
}

/* ================= ERNAEHRUNG: FEHLENDE/LEERE TAGE, WOCHEN, MONATE ================= */

console.log("========== Ernaehrung: fehlende Messungen INNERHALB einer Kalenderwoche ==========");
{
  const monday=weekStartDate(2026,7,10); // Kalenderwoche, in der TODAY (15.08.) liegt
  const wed=new Date(monday);wed.setDate(wed.getDate()+2);
  const fri=new Date(monday);fri.setDate(fri.getDate()+4);
  // Nur Mittwoch + Freitag geloggt, die uebrigen 5 Tage der Woche fehlen.
  const pts=[
    {y:wed.getFullYear(),m:wed.getMonth(),d:wed.getDate(),kcal:2000,protein:120,carbs:200,fat:60,ts:wed.getTime()},
    {y:fri.getFullYear(),m:fri.getMonth(),d:fri.getDate(),kcal:1800,protein:110,carbs:180,fat:55,ts:fri.getTime()},
  ];
  const agg=CR.bucketNutritionPoints(pts,"week");
  const key=CR.bucketKeyOf(monday.getFullYear(),monday.getMonth(),monday.getDate(),"week");
  assertEq(agg[key].count,2,"Nur die 2 tatsaechlich geloggten Tage fliessen in den Durchschnitt ein");
  assertEq(agg[key].kcal,1900,"Durchschnitt ueber genau die 2 echten Tage (1900), NICHT durch 7 geteilt");
}

console.log("========== Ernaehrung: komplette Kalenderwoche OHNE jede Messung ==========");
{
  const monday=weekStartDate(2026,7,10);
  const nextMonday=new Date(monday);nextMonday.setDate(nextMonday.getDate()+7);
  const slots=CR.fixedBucketSlots(monday,nextMonday,"week");
  assertEq(slots.length,2,"Zeitraum ueber 2 Kalenderwochen ergibt 2 feste Wochen-Slots");
  const agg=CR.bucketNutritionPoints([],"week"); // keine einzige Messung im ganzen Zeitraum
  const chartPoints=slots.map(s=>({ts:s.ts,value:agg[s.key]?agg[s.key].kcal:null}));
  assert(chartPoints.every(p=>p.value==null),"Beide Wochen-Slots bleiben 'Keine Daten' (null) statt 0 — Positionen bleiben trotzdem erhalten");
}

console.log("========== Koerpergewicht: kompletter Monat OHNE jede Messung ==========");
{
  // Messungen nur im Juli, August komplett ohne Eintrag.
  const pts=[{y:2026,m:6,d:15,w:80,ts:new Date(2026,6,15).getTime()}];
  const series=CR.buildWeightSeries(pts,"month");
  assertEq(series.length,1,"Nur EIN Monats-Bucket entsteht (Juli) — fuer August ohne Messung wird kein Fake-Punkt erzeugt");
  assertEq(series[0].m,6,"Der einzige Bucket ist tatsaechlich Juli (Monat 6), nicht August");
  assertNoNaNInfinity(series,"Kein NaN/Infinity trotz Monat ohne Daten");
}

/* ================= X-ACHSEN-TICKS ================= */

function weekPoints(startWs,count){
  const out=[];
  for(let i=0;i<count;i++){const d=new Date(startWs);d.setDate(d.getDate()+i*7);out.push({ts:d.getTime(),y:d.getFullYear(),m:d.getMonth(),d:d.getDate()});}
  return out;
}
function idxGaps(ticks){
  const gaps=[];
  for(let i=1;i<ticks.length;i++)gaps.push(ticks[i].idx-ticks[i-1].idx);
  return gaps;
}

console.log("========== pickStrideTicks: fester, gleichmaessiger Rhythmus (6M: jede 2. KW) ==========");
{
  const weeks=weekPoints(weekStartDate(2026,1,15),26); // ~26 Kalenderwochen (6M)
  const ticks=CR.pickStrideTicks(weeks,2);
  assertEq(weeks.length,26,"6M-Beispiel: 26 echte Wochen-Datenpunkte bleiben vollstaendig vorhanden");
  assertEq(ticks.length,13,"Jede 2. Kalenderwoche beschriftet (13 von 26)");
  assert(idxGaps(ticks).every(g=>g===2),"Der Index-Abstand zwischen den Labels ist UEBERALL exakt 2 — kein unregelmaessiger Sprung");
  assertEq(ticks[0].idx,0,"Erste sichtbare Kalenderwoche ist immer dabei");
}
{
  assertEq(CR.pickStrideTicks([],3).length,0,"Leeres Array: keine Ticks, kein Crash");
  const single=weekPoints(weekStartDate(2026,7,1),1);
  assertEq(CR.pickStrideTicks(single,2).length,1,"Ein einzelner Punkt bleibt trotz Schrittweite 2 sichtbar (Index 0 immer dabei)");
}

console.log("========== pickEvenStrideTicks: 3M soll JEDE Kalenderwoche zeigen (kein Ausduennen bei ueblichen 13-14 Wochen) ==========");
{
  const weeks=weekPoints(weekStartDate(2026,4,15),13); // typisches 3M-Rolling-Fenster
  const ticks=CR.pickEvenStrideTicks(weeks,15);
  assertEq(ticks.length,13,"13 Kalenderwochen bei Deckel 15: ALLE werden beschriftet, keine Ausduennung");
  assert(idxGaps(ticks).every(g=>g===1),"Lueckenlos: jede einzelne Kalenderwoche hat ein Label");
}
{
  const weeks=weekPoints(weekStartDate(2026,4,15),14); // volles Kalenderquartal, oft 14 Wochen
  const ticks=CR.pickEvenStrideTicks(weeks,15);
  assertEq(ticks.length,14,"14 Kalenderwochen bei Deckel 15: ebenfalls ALLE beschriftet");
}

console.log("========== pickEvenStrideTicks: NIE eine unregelmaessige Folge wie '23,25,27,29,32,34,36' ==========");
{
  // Regressionstest fuer genau den in der Aufgabenstellung kritisierten Fall:
  // 14 Wochen-Datenpunkte bei einem Deckel von 7 duerfen NICHT ungleichmaessig
  // ausgeduennt werden (das alte, zeit-ziel-basierte Verfahren erzeugte hier
  // Sprung-Muster wie 2,2,2,2,3,2,2 statt eines konstanten Rhythmus).
  const weeks=weekPoints(weekStartDate(2026,4,15),14);
  const ticks=CR.pickEvenStrideTicks(weeks,7);
  const gaps=idxGaps(ticks);
  assert(gaps.every(g=>g===gaps[0]),"ALLE Index-Abstaende zwischen den Labels sind identisch (konstanter Rhythmus, kein Sprung)");
  assertEq(ticks[0].idx,0,"Beginnt immer bei der ersten sichtbaren Kalenderwoche");
}

console.log("========== pickEvenStrideTicks: 12M zeigt IMMER alle sichtbaren Monate ==========");
{
  const months=[];
  for(let i=0;i<13;i++)months.push({ts:i,y:2025,m:i%12,d:1});
  const ticks=CR.pickEvenStrideTicks(months,13);
  assertEq(ticks.length,13,"12M mit Deckel 13: ALLE Monats-Buckets werden beschriftet, keine Ausduennung");
  assert(idxGaps(ticks).every(g=>g===1),"Lueckenlos: jeder Monat hat ein Label");
}

console.log("========== pickWeekAnchoredDayTicks (1M: Starttag + Montage) ==========");
function dayPoints(y,m,startD,endD){
  const out=[];
  for(let d=startD;d<=endD;d++)out.push({y,m,d,ts:new Date(y,m,d).getTime()});
  return out;
}
function tickLabels(ticks){return ticks.map(t=>t.d+"."+(t.m+1)+".");}
{
  // Voller Kalendermonat August 2026 (31 Tage, 01.08. ist ein Samstag) —
  // Montage im August 2026: 03./10./17./24./31.
  const pts=dayPoints(2026,7,1,31);
  const ticks=CR.pickWeekAnchoredDayTicks(pts);
  assertEq(pts.length,31,"August 2026: 31 Tagespositionen bleiben ALLE erhalten");
  assertEq(tickLabels(ticks).join(","),"1.8.,3.8.,10.8.,17.8.,24.8.,31.8.","August 2026: Starttag (01.08., kein Montag) + alle 5 Montage");
}
{
  // Rollierendes 1M-Fenster Do 04.08. - Mi 02.09.2026 (30 Tage, Aufgabenstellungs-Beispiel)
  const pts=dayPoints(2026,7,4,31).concat(dayPoints(2026,8,1,2));
  const ticks=CR.pickWeekAnchoredDayTicks(pts);
  assertEq(pts.length,30,"Rollierendes 1M-Fenster: 30 Tagespositionen bleiben ALLE erhalten");
  assertEq(tickLabels(ticks).join(","),"4.8.,10.8.,17.8.,24.8.,31.8.","Rollierendes 1M-Fenster: Starttag (04.08.) + Montage 10./17./24./31.08. (exakt das Aufgabenstellungs-Beispiel)");
}
{
  // Voller Kalendermonat, dessen 1. Tag SELBST ein Montag ist (Juni 2026)
  // -> darf nicht doppelt als Tick erscheinen
  const pts=dayPoints(2026,5,1,30);
  const ticks=CR.pickWeekAnchoredDayTicks(pts);
  assertEq(pts.length,30,"Juni 2026: 30 Tagespositionen bleiben ALLE erhalten");
  assertEq(tickLabels(ticks).join(","),"1.6.,8.6.,15.6.,22.6.,29.6.","Juni 2026 (01.06. ist bereits Montag): kein doppelter Tick fuer den Starttag");
}
{
  // Februar (Schaltjahr, 29 Tage) — 01.02.2024 ist ein Donnerstag
  const pts=dayPoints(2024,1,1,29);
  const ticks=CR.pickWeekAnchoredDayTicks(pts);
  assertEq(pts.length,29,"Februar 2024 (Schaltjahr): 29 Tagespositionen bleiben ALLE erhalten");
  assertEq(ticks[0].d,1,"Februar 2024: Starttag 01.02. immer als erster Tick");
  assertEq(ticks.every((t,i)=>i===0||new Date(t.y,t.m,t.d).getDay()===1),true,"Februar 2024: alle weiteren Ticks sind echte Montage");
}
{
  assertEq(CR.pickWeekAnchoredDayTicks([]).length,0,"Leeres Array: keine Ticks, kein Crash");
  const single=dayPoints(2026,7,15,15);
  assertEq(CR.pickWeekAnchoredDayTicks(single).length,1,"Einzelner Tag: genau ein Tick (der Starttag selbst)");
}

console.log("\n"+passed+" bestanden, "+failed+" fehlgeschlagen");
process.exit(failed>0?1:0);
