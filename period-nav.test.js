/* period-nav.test.js — Fixture-basierte Tests der Zeitraum-Navigations-
   Engine (period-nav.js): rollierendes "bis heute"-Fenster bei
   periodOffset 0, abgeschlossene Kalenderperioden ab periodOffset>=1.
   Deckt gezielt die in der Aufgabenstellung genannten Randfaelle ab:
   Monatsanfang/-ende, Jahreswechsel, Februar (Schaltjahr/kein Schaltjahr),
   Kalenderwochen ueber den Jahreswechsel hinweg, Monate mit 28/29/30/31
   Tagen, 1. Januar, 31. Dezember.

   date-utils.js und weight-engine.js definieren ihre Hilfsfunktionen als
   globale Browser-Funktionen (kein CommonJS-Modul) — fuer den Node-Test
   werden sie per vm.runInThisContext() in den globalen Kontext geladen,
   exakt wie sie im Browser via <script> verfuegbar waeren (period-nav.js
   nutzt zur Laufzeit weekStartDate/addMonths/daysInMonthOf sowie
   weightDetailRangeStart/WEIGHT_DETAIL_RANGE_DAYS daraus). */
const fs=require("fs");
const path=require("path");
const vm=require("vm");
vm.runInThisContext(fs.readFileSync(path.join(__dirname,"date-utils.js"),"utf8"),{filename:"date-utils.js"});
vm.runInThisContext(fs.readFileSync(path.join(__dirname,"weight-engine.js"),"utf8"),{filename:"weight-engine.js"});
const PN=require("./period-nav.js");

let passed=0,failed=0;
function assertEq(actual,expected,label){
  const ok=actual===expected;
  if(ok){passed++;}
  else{failed++;console.error("❌ FAIL:",label,"— erwartet:",expected,"erhalten:",actual);}
}
function d(y,m,day){return new Date(y,m,day);}
function assertWindow(win,ey,em,ed,fy,fm,fd,label){
  assertEq(win.start.getFullYear(),ey,label+" (Start-Jahr)");
  assertEq(win.start.getMonth(),em,label+" (Start-Monat)");
  assertEq(win.start.getDate(),ed,label+" (Start-Tag)");
  assertEq(win.end.getFullYear(),fy,label+" (Ende-Jahr)");
  assertEq(win.end.getMonth(),fm,label+" (Ende-Monat)");
  assertEq(win.end.getDate(),fd,label+" (Ende-Tag)");
}

console.log("========== 1W: Mittwoch 2. September 2026 (Aufgabenstellungs-Beispiel) ==========");
{
  const today=d(2026,8,2); // 2. September 2026 (Mittwoch)
  const w0=PN.statPeriodWindow("1W",0,today);
  assertEq(w0.isCurrent,true,"1W offset 0: rollierend");
  assertWindow(w0,2026,7,27,2026,8,2,"1W offset 0: 27. Aug – 2. Sept (7 Tage bis heute)");

  const w1=PN.statPeriodWindow("1W",1,today);
  assertEq(w1.isCurrent,false,"1W offset 1: kein rollierendes Fenster mehr");
  assertEq(w1.unit,"week","1W offset 1: Kalenderwoche");
  // Aktuelle Kalenderwoche (Mo-So), die "heute" enthaelt: 31.08.-06.09.2026
  // (noch nicht abgeschlossen) -> "einmal zurueck" = die unmittelbar davor
  // liegende, bereits vollstaendig abgeschlossene Kalenderwoche.
  assertWindow(w1,2026,7,24,2026,7,30,"1W offset 1: letzte VOLLSTAENDIGE Kalenderwoche (Mo 24.08.-So 30.08.)");

  const w2=PN.statPeriodWindow("1W",2,today);
  assertWindow(w2,2026,7,17,2026,7,23,"1W offset 2: die Kalenderwoche davor (Mo 17.08.-So 23.08.)");
}

console.log("========== 1M: Aufgabenstellungs-Beispiel (4. Aug - 2. Sept, dann August/Juli/Juni) ==========");
{
  const today=d(2026,8,2);
  const w0=PN.statPeriodWindow("1M",0,today);
  assertWindow(w0,2026,7,4,2026,8,2,"1M offset 0: rollierende 30 Tage (4. Aug - 2. Sept)");

  const w1=PN.statPeriodWindow("1M",1,today);
  assertEq(w1.unit,"month","1M offset 1: Kalendermonat");
  assertWindow(w1,2026,7,1,2026,7,31,"1M offset 1: kompletter August (01.-31.08.)");

  const w2=PN.statPeriodWindow("1M",2,today);
  assertWindow(w2,2026,6,1,2026,6,31,"1M offset 2: kompletter Juli (01.-31.07.)");

  const w3=PN.statPeriodWindow("1M",3,today);
  assertWindow(w3,2026,5,1,2026,5,30,"1M offset 3: kompletter Juni (01.-30.06., 30 Tage)");
}

console.log("========== 3M: Kalenderquartal (Aufgabenstellungs-Beispiel 'April - Juni 2026') ==========");
{
  const today=d(2026,8,2); // liegt in Q3 (Jul-Sep)
  const w0=PN.statPeriodWindow("3M",0,today);
  assertEq(w0.isCurrent,true,"3M offset 0: rollierend");

  const w1=PN.statPeriodWindow("3M",1,today);
  assertEq(w1.unit,"quarter","3M offset 1: Kalenderquartal");
  assertWindow(w1,2026,3,1,2026,5,30,"3M offset 1: voriges Quartal (April - Juni 2026)");

  const w2=PN.statPeriodWindow("3M",2,today);
  assertWindow(w2,2026,0,1,2026,2,31,"3M offset 2: Quartal davor (Januar - Maerz 2026)");

  const w3=PN.statPeriodWindow("3M",3,today);
  assertWindow(w3,2025,9,1,2025,11,31,"3M offset 3: Jahreswechsel (Oktober - Dezember 2025)");
}

console.log("========== 6M: Kalenderhalbjahr ==========");
{
  const today=d(2026,8,2); // liegt in H2 (Jul-Dez)
  const w1=PN.statPeriodWindow("6M",1,today);
  assertEq(w1.unit,"halfYear","6M offset 1: Kalenderhalbjahr");
  assertWindow(w1,2026,0,1,2026,5,30,"6M offset 1: 1. Halbjahr 2026 (Januar - Juni)");

  const w2=PN.statPeriodWindow("6M",2,today);
  assertWindow(w2,2025,6,1,2025,11,31,"6M offset 2: Jahreswechsel (Juli - Dezember 2025)");
}

console.log("========== 12M: volle Kalenderjahre ==========");
{
  const today=d(2026,8,2);
  const w1=PN.statPeriodWindow("12M",1,today);
  assertEq(w1.unit,"year","12M offset 1: Kalenderjahr");
  assertWindow(w1,2025,0,1,2025,11,31,"12M offset 1: komplettes Jahr 2025");

  const w2=PN.statPeriodWindow("12M",2,today);
  assertWindow(w2,2024,0,1,2024,11,31,"12M offset 2: Kalenderjahr davor (2024)");
}

console.log("========== Max: kein zweiter Modus ==========");
{
  const today=d(2026,8,2);
  const w0=PN.statPeriodWindow("Max",0,today);
  assertEq(w0.isCurrent,true,"Max: immer isCurrent");
  assertEq(w0.start,null,"Max: kein fester Start (Fallback beim Aufrufer auf ersten echten Datenpunkt)");
  const w1=PN.statPeriodWindow("Max",5,today); // Aufrufer duerfen Max-Offsets ignorieren -> muss trotzdem stabil bleiben
  assertEq(w1.isCurrent,true,"Max ignoriert periodOffset komplett (kein Navigieren zu 'Max-Bloecken')");
  assertEq(w1.start,null,"Max mit hohem Offset liefert dennoch start:null");
}

console.log("========== Jahreswechsel: heute = 1. Januar 2026 ==========");
{
  const today=d(2026,0,1); // 1. Januar 2026 (Donnerstag)
  const w1m=PN.statPeriodWindow("1M",1,today);
  assertWindow(w1m,2025,11,1,2025,11,31,"1M offset 1 an Neujahr: Dezember des Vorjahres");

  const w1y=PN.statPeriodWindow("12M",1,today);
  assertWindow(w1y,2025,0,1,2025,11,31,"12M offset 1 an Neujahr: komplettes Vorjahr 2025");

  const w1q=PN.statPeriodWindow("3M",1,today);
  assertWindow(w1q,2025,9,1,2025,11,31,"3M offset 1 an Neujahr: Q4 des Vorjahres (Okt-Dez 2025)");

  const w1h=PN.statPeriodWindow("6M",1,today);
  assertWindow(w1h,2025,6,1,2025,11,31,"6M offset 1 an Neujahr: 2. Halbjahr des Vorjahres (Jul-Dez 2025)");
}

console.log("========== Kalenderwoche ueber den Jahreswechsel hinweg ==========");
{
  // 9. Januar 2026 ist ein Freitag -> aktuelle Woche Mo 05.-So 11.01.2026,
  // "einmal zurueck" faellt exakt auf die Woche, die den Jahreswechsel
  // enthaelt: Mo 29.12.2025 - So 04.01.2026.
  const today=d(2026,0,9);
  const w1=PN.statPeriodWindow("1W",1,today);
  assertWindow(w1,2025,11,29,2026,0,4,"1W offset 1 ueber Jahreswechsel: Mo 29.12.2025 - So 04.01.2026");
}

console.log("========== Februar: Schaltjahr vs. kein Schaltjahr ==========");
{
  const todayLeap=d(2024,2,15); // 15. Maerz 2024 (2024 = Schaltjahr)
  const wLeap=PN.statPeriodWindow("1M",1,todayLeap);
  assertWindow(wLeap,2024,1,1,2024,1,29,"1M offset 1 im Maerz 2024: Februar mit 29 Tagen (Schaltjahr)");

  const todayNonLeap=d(2025,2,15); // 15. Maerz 2025 (kein Schaltjahr)
  const wNonLeap=PN.statPeriodWindow("1M",1,todayNonLeap);
  assertWindow(wNonLeap,2025,1,1,2025,1,28,"1M offset 1 im Maerz 2025: Februar mit 28 Tagen (kein Schaltjahr)");
}

console.log("========== 31. Dezember als 'heute' ==========");
{
  const today=d(2026,11,31); // 31. Dezember 2026
  const w1m=PN.statPeriodWindow("1M",1,today);
  assertWindow(w1m,2026,10,1,2026,10,30,"1M offset 1 an Silvester: kompletter November (30 Tage)");
  const w0=PN.statPeriodWindow("1M",0,today);
  assertEq(w0.end.getFullYear(),2026,"1M offset 0 an Silvester: Ende bleibt heute (kein Ueberlauf ins naechste Jahr)");
  assertEq(w0.end.getMonth(),11,"1M offset 0 an Silvester: Ende-Monat Dezember");
  assertEq(w0.end.getDate(),31,"1M offset 0 an Silvester: Ende-Tag 31");
}

console.log("========== Weitere Navigation: nie in die Zukunft, Vor/Zurueck symmetrisch ==========");
{
  const today=d(2026,8,2);
  ["1W","1M","3M","6M","12M"].forEach(range=>{
    for(let off=1;off<=4;off++){
      const w=PN.statPeriodWindow(range,off,today);
      const wPrev=PN.statPeriodWindow(range,off-1,today);
      // Jede Periode muss VOR (oder an) dem Start der naechst-vorderen Periode enden (nie in die Zukunft ragen)
      if(off===1){
        // offset 1 muss vollstaendig vor dem rollierenden "heute"-Ende liegen
        assertEq(w.end.getTime()<today.getTime(),true,range+" offset 1 endet vor heute");
      }
      assertEq(w.end.getTime()<wPrev.start.getTime()||w.end.getTime()<wPrev.end.getTime(),true,range+" offset "+off+" liegt zeitlich vor offset "+(off-1));
      assertEq(w.start.getTime()<=w.end.getTime(),true,range+" offset "+off+": Start <= Ende");
    }
  });
}

console.log("\n"+passed+" bestanden, "+failed+" fehlgeschlagen");
process.exit(failed>0?1:0);
