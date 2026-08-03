/* calendar-engine.js — reine Kalender-/Tagesdaten-Logik (Phase 2B des
   Migrationsplans). Physisch aus index.html ausgelagert, ohne
   Verhaltensaenderung (Funktionskoerper 1:1 uebernommen). Wird per
   normalem <script src="calendar-engine.js"> VOR week-engine.js und dem
   <script type="text/babel">-App-Code geladen und ist dadurch global
   verfuegbar (keine ES-Module).

   Oeffentliche API (von den React-Komponenten verwendet, u.a. App,
   DayDetailSheet, ActivitySheet, FoodSearchSheet, WeightWidget,
   CaloriesWidget, HeuteView, VerlaufView, StatsSheet, ProfilDetailPage):
     dk(y,m,d)
     dayData(data,y,m,d)
     settingsOf(mSet,y,m)
     tdeeOf(mSet,y,m)
     monthGridDays(y,m,data)

   Keine JSX-Komponenten, keine React-Hooks, keine DOM-Zugriffe.
   tdeeOf() nutzt zur Laufzeit die globale Funktion calcBMR() und die
   globale Konstante ACT aus index.html — die sind erst nach vollstaendigem
   Laden ALLER Skripte tatsaechlich aufgerufen (React-Render), daher spielt
   die Ladereihenfolge (dieses Skript vor index.html) dafuer keine Rolle
   (genau wie schon bei buildWeekSlots()/buildIsoWeekSummary() in
   week-engine.js, Phase 2A). */

const dk=(y,m,d)=>y+"-"+m+"-"+d;
function dayData(data,y,m,d){return data[dk(y,m,d)]||{};}

/* NEU: Monatseinstellungen werden aus dem letzten eingerichteten Monat uebernommen,
   Grundbedarf gilt nur fuer den Monat, in dem er eingetragen wurde
   (wie in der urspruenglichen App — jeder Monat wird eigens eingerichtet). */
function settingsOf(mSet,y,m){
  const s=mSet[y+"-"+m];
  return s?{...s}:null;
}
function tdeeOf(mSet,y,m){
  const s=settingsOf(mSet,y,m);
  return s?Math.round(calcBMR(s.weight,s.fat)*ACT[s.activityIdx].f):null;
}

/* Liefert alle Tage eines Monats als VOLLSTAENDIGE Montag-Sonntag-Wochen —
   Tage aus dem Vor-/Folgemonat werden mit "own:false" ergaenzt und in der
   Anzeige nur ausgegraut, statt den Kalender an Wochenraendern abzuschneiden. */
function monthGridDays(y,m,data){
  const dim=daysIn(y,m);
  const first=new Date(y,m,1);
  const last=new Date(y,m,dim);
  const startOffset=(first.getDay()+6)%7;      // Tage vom Vormonat davor
  const endOffset=6-((last.getDay()+6)%7);      // Tage vom Folgemonat danach
  const out=[];
  for(let i=startOffset;i>0;i--){
    const dt=new Date(y,m,1-i);
    out.push({own:false,d:dt.getDate(),...dayData(data,dt.getFullYear(),dt.getMonth(),dt.getDate())});
  }
  for(let d=1;d<=dim;d++)out.push({own:true,d,...dayData(data,y,m,d)});
  for(let i=1;i<=endOffset;i++){
    const dt=new Date(y,m,dim+i);
    out.push({own:false,d:dt.getDate(),...dayData(data,dt.getFullYear(),dt.getMonth(),dt.getDate())});
  }
  return out;
}
