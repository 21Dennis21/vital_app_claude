/* sport-engine.js — reine Sport-Aggregationslogik (Phase 2D des
   Migrationsplans). Physisch aus index.html ausgelagert, ohne
   Verhaltensaenderung (Funktionskoerper 1:1 uebernommen). Wird per
   normalem <script src="sport-engine.js"> vor calendar-engine.js,
   week-engine.js und dem <script type="text/babel">-App-Code geladen und
   ist dadurch global verfuegbar (keine ES-Module).

   Oeffentliche API (von computeGoalProgress, WeightTrendChart,
   VerlaufView (Sport-Segment) und StatsSheet verwendet):
     dayKm(x,type)
     dayGymMins(x)
     monthKm(data,type,y,m)
     gymMonthMins(data,y,m)

   Keine JSX-Komponenten, keine React-Hooks, keine DOM-Zugriffe.
   monthKm()/gymMonthMins() nutzen zur Laufzeit die globalen Funktionen
   daysIn() (date-utils.js), dayData() (calendar-engine.js) und
   isDayLogged() (week-engine.js) — deren tatsaechlicher Aufruf erfolgt
   erst beim React-Render, nachdem alle Skripte vollstaendig geladen
   sind, daher spielt die genaue Ladereihenfolge dieser Engines
   untereinander keine Rolle. */

/* km eines Tages — versteht neues (sports-Array) und altes (sportKm) Format */
function dayKm(x,type){
  if(x.sports&&x.sports.length>0)
    return x.sports.filter(s=>s.type!=="gym"&&(!type||s.type===type)).reduce((s,v)=>s+(v.km||0),0);
  if(x.sportKm>0&&(!type||x.sportType===type))return x.sportKm;
  return 0;
}
function dayGymMins(x){
  if(!x.sports)return 0;
  return x.sports.filter(s=>s.type==="gym").reduce((s,v)=>s+(parseFloat(v.hours)||0)*60+(parseFloat(v.minutes)||0),0);
}
function monthKm(data,type,y,m){
  let s=0;for(let d=1;d<=daysIn(y,m);d++){const x=dayData(data,y,m,d);if(isDayLogged(x))s+=dayKm(x,type);}return s;
}
function gymMonthMins(data,y,m){
  let s=0;for(let d=1;d<=daysIn(y,m);d++){const x=dayData(data,y,m,d);if(isDayLogged(x))s+=dayGymMins(x);}return s;
}
