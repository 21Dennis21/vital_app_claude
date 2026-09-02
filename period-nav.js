/* period-nav.js — zentrale Zeitraum-Navigations-Engine fuer ALLE
   Statistik-Detailcharts (StatDetailPage: Koerpergewicht + die vier
   Ernaehrungswerte). Physisch getrennt von chart-resolution.js: dort geht
   es AUSSCHLIESSLICH um die Aggregation/Granularitaet INNERHALB eines
   bereits feststehenden Fensters (Tag/Woche/Monat-Buckets), hier
   AUSSCHLIESSLICH darum, WELCHES Kalenderfenster ueberhaupt sichtbar ist.
   Diese Trennung ("Zeitraum ungleich Aggregation") bleibt bewusst
   bestehen — chart-resolution.js wird von diesem Modul weder aufgerufen
   noch veraendert, es bekommt nur andere start/end-Werte als bisher.

   Zentrale UX-Regel:
     periodOffset===0 (GANZ VORNE) -> IMMER ein rollierendes Fenster der
     letzten N Kalendertage bis einschliesslich heute (identisch zur
     bisherigen WEIGHT_DETAIL_RANGE_DAYS/weightDetailRangeStart-Logik,
     unveraendert).
     periodOffset>=1 (EINMAL/WEITER ZURUECK) -> abgeschlossene, natuerliche
     Kalenderperioden: 1W = Montag-Sonntag-Kalenderwochen, 1M = volle
     Kalendermonate, 3M = Kalenderquartale, 6M = Kalenderhalbjahre,
     12M = volle Kalenderjahre. periodOffset=1 ist dabei IMMER die Periode
     unmittelbar VOR derjenigen, die "heute" enthaelt (also die letzte
     bereits vollstaendig abgeschlossene Periode), periodOffset=2 die
     Periode davor usw. — nie eine in die Zukunft reichende Periode.
     "Max" kennt diesen zweiten Modus nicht (bleibt immer der komplette
     Verlauf, periodOffset wird dort von den Aufrufern gar nicht erst
     hochgezaehlt).

   Entscheidung 3M/6M (siehe Aufgabenstellung: "nicht einfach raten,
   recherchieren/vergleichen"): STANDARD-Kalendergrenzen (Kalenderquartal
   Jan-Mär/Apr-Jun/Jul-Sep/Okt-Dez bzw. Kalenderhalbjahr Jan-Jun/Jul-Dez)
   statt rollierender 3-/6-Monats-Bloecke. Begruendung: (1) setzt exakt das
   bei 1M/12M bereits etablierte Muster fort (feste, sofort erkennbare
   Kalendergrenzen statt eines vom heutigen Datum abhaengigen
   "schwimmenden" Blocks); (2) Kalenderquartale/-halbjahre sind die in
   Health-/Fitness- sowie Analytics-Apps ueblichste, sofort wiedererkenn-
   und benennbare Einteilung ("Q2 2026", "1. Halbjahr 2026") — ein
   rollierender Block ohne festen Namen waere fuer Nutzer schwerer
   einzuordnen; (3) bestaetigt sich am von der Aufgabenstellung selbst
   genannten Beispiel fuer 3M ("April – Juni 2026" = exakt Kalenderquartal
   Q2, kein rollierender Block). */

const STAT_PERIOD_CALENDAR_UNIT={"1W":"week","1M":"month","3M":"quarter","6M":"halfYear","12M":"year"};

/* Montag-Sonntag-Kalenderwoche, periodOffset Wochen vor der Woche, die
   "todayStart" enthaelt. */
function statPeriodWeekAt(todayStart,periodOffset){
  const curStart=weekStartDate(todayStart.getFullYear(),todayStart.getMonth(),todayStart.getDate());
  const start=new Date(curStart);start.setDate(start.getDate()-7*periodOffset);
  const end=new Date(start);end.setDate(end.getDate()+6);
  return {start,end};
}
/* Voller Kalendermonat, periodOffset Monate vor dem Monat, der
   "todayStart" enthaelt. */
function statPeriodMonthAt(todayStart,periodOffset){
  const r=addMonths(todayStart.getFullYear(),todayStart.getMonth(),-periodOffset);
  return {start:new Date(r.y,r.m,1),end:new Date(r.y,r.m,daysInMonthOf(r.y,r.m))};
}
/* Fester Kalenderblock aus "blockSize" Monaten (3 = Quartal, 6 =
   Halbjahr), an den echten Kalendergrenzen ausgerichtet (z.B. Quartale
   IMMER Jan-Mär/Apr-Jun/Jul-Sep/Okt-Dez, nie an einem beliebigen Monat
   beginnend) — periodOffset Bloecke vor dem Block, der "todayStart"
   enthaelt. */
function statPeriodBlockAt(todayStart,periodOffset,blockSize){
  const curBlockStartMonth=Math.floor(todayStart.getMonth()/blockSize)*blockSize;
  const r=addMonths(todayStart.getFullYear(),curBlockStartMonth,-blockSize*periodOffset);
  const start=new Date(r.y,r.m,1);
  const endM=addMonths(r.y,r.m,blockSize-1);
  const end=new Date(endM.y,endM.m,daysInMonthOf(endM.y,endM.m));
  return {start,end};
}
/* Volles Kalenderjahr, periodOffset Jahre vor dem Jahr von "todayStart". */
function statPeriodYearAt(todayStart,periodOffset){
  const y=todayStart.getFullYear()-periodOffset;
  return {start:new Date(y,0,1),end:new Date(y,11,31)};
}

/* Liefert das sichtbare Fenster fuer (rangeKey, periodOffset, now) als
   {start,end,isCurrent,unit}. start/end sind bereits auf Mitternacht
   normalisierte Date-Objekte (start<=end, nie in der Zukunft). "Max" und
   periodOffset===0 liefern IMMER isCurrent:true und delegieren start an
   die unveraenderte weightDetailRangeStart()-Logik (start bleibt fuer
   "Max" bewusst null — das behandeln die Aufrufer bereits heute ueber den
   Fallback auf den ersten echten Datenpunkt). */
function statPeriodWindow(rangeKey,periodOffset,now){
  const todayStart=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  if(rangeKey==="Max"||!periodOffset){
    return {start:weightDetailRangeStart(rangeKey,todayStart),end:todayStart,isCurrent:true,unit:null};
  }
  const unit=STAT_PERIOD_CALENDAR_UNIT[rangeKey];
  let b;
  if(unit==="week")b=statPeriodWeekAt(todayStart,periodOffset);
  else if(unit==="month")b=statPeriodMonthAt(todayStart,periodOffset);
  else if(unit==="quarter")b=statPeriodBlockAt(todayStart,periodOffset,3);
  else if(unit==="halfYear")b=statPeriodBlockAt(todayStart,periodOffset,6);
  else b=statPeriodYearAt(todayStart,periodOffset);
  return {start:b.start,end:b.end,isCurrent:false,unit};
}

/* Node-Testzugriff (analog forecast-engine.js/chart-resolution.js) — rein
   additiv, aendert nichts am Browser-Verhalten (dort existiert "module"
   nicht). */
if(typeof module!=="undefined" && module.exports){
  module.exports={
    STAT_PERIOD_CALENDAR_UNIT,
    statPeriodWeekAt,
    statPeriodMonthAt,
    statPeriodBlockAt,
    statPeriodYearAt,
    statPeriodWindow,
  };
}
