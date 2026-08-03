/* date-utils.js — reine, UI-/DOM-/localStorage-unabhaengige Datumsfunktionen.
   Phase 1 des Migrationsplans: physisch aus index.html ausgelagert, ohne
   Verhaltensaenderung (Funktionskoerper 1:1 uebernommen). Wird per normalem
   <script src="date-utils.js"> VOR dem <script type="text/babel">-App-Code
   geladen und ist dadurch global verfuegbar (keine ES-Module).

   WICHTIG: monthIdOf, dateToIso, parseLocalIsoDate, dayKey, addMonthsSimple,
   startOfDay, daysBetween, round1/round2/round4 gehoeren NICHT hierher —
   sie liegen im sync-engine-verwalteten Forecast-Engine-Block von
   index.html (1:1 aus forecast-engine.js gespiegelt) und duerfen dort nicht
   manuell angefasst werden (siehe CLAUDE.md / sync-engine.py). */

function daysIn(y,m){return new Date(y,m+1,0).getDate();}
function firstDay(y,m){let d=new Date(y,m,1).getDay();return d===0?6:d-1;}
function isoWeek(y,m,d){
  const dt=new Date(y,m,d);
  dt.setDate(dt.getDate()+3-(dt.getDay()+6)%7);
  const y1=new Date(dt.getFullYear(),0,4);
  return 1+Math.round(((dt-y1)/86400000-3+(y1.getDay()+6)%7)/7);
}
/* Montag der Woche, die dieses Datum enthaelt — als echtes Datum statt nur
   einer Wochennummer. Wochennummern allein brechen am Jahreswechsel
   (KW1 des neuen Jahres ist zahlenmaessig kleiner als KW52 des alten,
   obwohl sie zeitlich danach liegt) — Sortierung erfolgt daher immer ueber
   dieses Datum, nie ueber die nackte Nummer. */
function weekStartDate(y,m,d){
  const dt=new Date(y,m,d);
  const wd=(dt.getDay()+6)%7; // 0=Montag
  dt.setDate(dt.getDate()-wd);
  dt.setHours(0,0,0,0);
  return dt;
}
/* Gruppiert Tage nach Kalenderwoche und sortiert die Gruppen ueber das
   tatsaechliche Wochen-Startdatum (nicht die Wochennummer) — funktioniert
   dadurch auch korrekt ueber Jahreswechsel hinweg. */
function groupByWeekSorted(daysArr,getYMD){
  const map={};
  daysArr.forEach(x=>{
    const {y,m,d}=getYMD(x);
    const start=weekStartDate(y,m,d).getTime();
    const kw=isoWeek(y,m,d);
    if(!map[start])map[start]={kw,start,items:[]};
    map[start].items.push(x);
  });
  return Object.values(map).sort((a,b)=>a.start-b.start);
}
function addMonths(y,m,delta){
  const total=y*12+m+delta;
  return {y:Math.floor(total/12),m:((total%12)+12)%12};
}
function daysInMonthOf(y,m){return new Date(y,m+1,0).getDate();}
