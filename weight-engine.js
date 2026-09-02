/* weight-engine.js — reine Gewichts-/BMR-Logik (Phase 2C des
   Migrationsplans). Physisch aus index.html ausgelagert, ohne
   Verhaltensaenderung (Funktionskoerper 1:1 uebernommen). Wird per
   normalem <script src="weight-engine.js"> VOR calendar-engine.js,
   week-engine.js und dem <script type="text/babel">-App-Code geladen und
   ist dadurch global verfuegbar (keine ES-Module).

   Oeffentliche API (von den React-Komponenten verwendet, u.a.
   WeightWidget, WeekGoalsWidget, CalorieBreakdownSheet, VerlaufView,
   ZieleView, GoalSheet, SetupSheet):
     leanMass(w,f)
     calcBMR(w,f)
     lastWeight(data)
     lastWeightEntry(data)
     weightRangeBounds(key,y,m,d)
     weightRangeLabel(key,b)
     navWeightRange(key,anchorY,anchorM,anchorD,dir)
     collectWeightPointsInRange(data,inRangeFn)
     inferWeightGoalDirection(goals,curW)
     weightDetailRangeStart(rangeKey,now)
     weightDetailInRangeFn(rangeKey,now)

   Keine JSX-Komponenten, keine React-Hooks, keine DOM-Zugriffe.
   Nutzt zur Laufzeit die globalen Funktionen dayData() (calendar-engine.js)
   sowie die globalen Konstanten NOW/MN aus index.html — die sind erst
   nach vollstaendigem Laden ALLER Skripte tatsaechlich aufgerufen
   (React-Render), daher spielt die Ladereihenfolge dafuer keine Rolle
   (gleiches Muster wie schon in Phase 2A/2B). */

/* Magermasse (Koerpergewicht ohne Fettanteil) — Basis fuer Grundumsatz UND
   fuer die Eiweiss-Zielmenge (siehe macroTargets() in index.html). */
function leanMass(w,f){
  if(!w)return 0;
  return w*(1-(parseFloat(f)||0)/100);
}
/* Katch-McArdle: 370 + 21,6 x Magermasse — identisch fuer alle Geschlechter */
function calcBMR(w,f){
  if(!w)return 0;
  return Math.round(370+21.6*leanMass(w,f));
}

/* Letztes eingetragenes Gewicht (bis 60 Tage zurueck) */
function lastWeight(data){
  const it=new Date(NOW);
  for(let i=0;i<60;i++){
    const x=dayData(data,it.getFullYear(),it.getMonth(),it.getDate());
    if(x.weight>0)return x.weight;
    it.setDate(it.getDate()-1);
  }
  return 0;
}
/* Wie lastWeight, liefert zusaetzlich das Datum der letzten Messung. */
function lastWeightEntry(data){
  const it=new Date(NOW);
  for(let i=0;i<60;i++){
    const x=dayData(data,it.getFullYear(),it.getMonth(),it.getDate());
    if(x.weight>0)return {weight:x.weight,date:new Date(it)};
    it.setDate(it.getDate()-1);
  }
  return null;
}

/* ===== ZEITRAUM-SYSTEM FUER DIE GEWICHTSANALYSE =====
   Zentrale Konfiguration + Hilfsfunktionen — bewusst an EINER Stelle, damit
   nichts zwischen Pill-Leiste, Navigation, Diagramm und Statistikleiste
   dupliziert wird. RANGE_STEP ist rein interne Implementierungsdetail von
   navWeightRange() (keine JSX-Darstellung) — anders als WEIGHT_RANGES/
   WEIGHT_STAT_DELTA_LABEL (sichtbare deutsche Beschriftungen), die deshalb
   in index.html bleiben. */
const RANGE_STEP={month:1,quarter:3,halfYear:6,year:12,all:0}; // "week" steppt separat in Tagen
/* Liefert IMMER vollstaendige Start-/End-TAGE (sy/sm/sd bis ey/em/ed) eines
   Zeitraums — nicht nur Monate. Fuer "Woche" zaehlt der Tag wirklich (Montag
   bis Sonntag), bei Monat/Quartal/Halbjahr/Jahr ist sd immer 1 und ed immer
   der letzte Tag des End-Monats. "all" hat keine feste Grenze -> null. */
function weightRangeBounds(key,y,m,d){
  if(key==="week"){
    const start=weekStartDate(y,m,d||1);
    const end=new Date(start);end.setDate(end.getDate()+6);
    return {sy:start.getFullYear(),sm:start.getMonth(),sd:start.getDate(),ey:end.getFullYear(),em:end.getMonth(),ed:end.getDate()};
  }
  if(key==="month")return {sy:y,sm:m,sd:1,ey:y,em:m,ed:daysInMonthOf(y,m)};
  if(key==="quarter"){const q=Math.floor(m/3)*3;const e=addMonths(y,q,2);return {sy:y,sm:q,sd:1,ey:e.y,em:e.m,ed:daysInMonthOf(e.y,e.m)};}
  if(key==="halfYear"){const h=m<6?0:6;const e=addMonths(y,h,5);return {sy:y,sm:h,sd:1,ey:e.y,em:e.m,ed:daysInMonthOf(e.y,e.m)};}
  if(key==="year")return {sy:y,sm:0,sd:1,ey:y,em:11,ed:31};
  return null;
}
function weightRangeLabel(key,b){
  if(key==="week")return "KW "+isoWeek(b.sy,b.sm,b.sd)+" · "+b.sy;
  if(key==="month")return MN[b.sm]+" "+b.sy;
  if(key==="quarter")return (Math.floor(b.sm/3)+1)+". Quartal "+b.sy;
  if(key==="halfYear")return (b.sm<6?1:2)+". Halbjahr "+b.sy;
  if(key==="year")return String(b.sy);
  return "Gesamter Verlauf";
}
/* Springt bei Vor/Zurueck immer um eine VOLLE Periode weiter. "Woche"
   steppt in echten 7-Tage-Schritten (kann daher auch mitten im Monat
   wechseln), alle anderen Zeitraeume weiterhin monatsweise ausgehend vom
   Start der aktuell sichtbaren Periode — verhindert Drift. Gibt IMMER
   {y,m,d} zurueck, damit der Anker fuer jeden Zeitraum-Typ einheitlich ist. */
function navWeightRange(key,anchorY,anchorM,anchorD,dir){
  const b=weightRangeBounds(key,anchorY,anchorM,anchorD);
  if(key==="week"){
    const dt=new Date(b.sy,b.sm,b.sd);dt.setDate(dt.getDate()+dir*7);
    return {y:dt.getFullYear(),m:dt.getMonth(),d:dt.getDate()};
  }
  const r=addMonths(b.sy,b.sm,dir*RANGE_STEP[key]);
  return {y:r.y,m:r.m,d:1};
}
/* Sammelt ausschliesslich TATSAECHLICH vorhandene Gewichtseintraege
   innerhalb eines Datumsfilters — nie erfundene Zwischenwerte. Liest
   direkt die Tages-Keys von "data", statt Tag fuer Tag durchzuzaehlen —
   bleibt dadurch auch bei "Gesamt" ueber mehrere Jahre performant. */
function collectWeightPointsInRange(data,inRangeFn){
  const out=[];
  Object.keys(data).forEach(k=>{
    const x=data[k];
    if(x&&x.weight>0){
      const parts=k.split("-").map(Number);
      const y=parts[0],m=parts[1],d=parts[2];
      if(inRangeFn(y,m,d)){
        out.push({y,m,d,w:x.weight,ts:new Date(y,m,d).getTime()});
      }
    }
  });
  out.sort((a,b)=>a.ts-b.ts);
  return out;
}
/* Leitet aus den aktiven Zielen ab, ob es gerade ums Abnehmen, Zunehmen
   oder Halten geht — zentral an einer Stelle, damit Dashboard-Gewichts-
   karte UND Live-Prognose exakt dieselbe Einschaetzung verwenden. Ohne
   erkennbares Ziel bewusst "halten" als neutraler Standard. */
function inferWeightGoalDirection(goals,curW){
  const weightGoal=goals.find(g=>g.type==="weight"&&g.active!==false);
  if(weightGoal){
    const target=parseFloat(weightGoal.target)||0;
    if(target<curW-0.3)return "abnehmen";
    if(target>curW+0.3)return "zunehmen";
    return "halten";
  }
  if(goals.some(g=>g.type==="deficit"&&g.active!==false))return "abnehmen";
  if(goals.some(g=>g.type==="surplus"&&g.active!==false))return "zunehmen";
  return "halten";
}

/* ===== ZEITRAUM-SYSTEM FUER DIE GEWICHT-DETAILANSICHT (Verlauf -> Gewicht) =====
   Eigenstaendig vom aelteren RANGE_STEP-System oben (Woche/Monat/Quartal/
   Halbjahr/Jahr/Gesamt, dort per Pfeil zu vergangenen Perioden navigierbar).
   1W/1M/3M/6M/12M sind stattdessen IMMER rollierende Fenster der letzten N
   Kalendertage bis EINSCHLIESSLICH heute (kein Navigieren zu vergangenen
   Perioden) — "Max" hat keine Untergrenze (kompletter Verlauf). */
const WEIGHT_DETAIL_RANGE_DAYS={"1W":7,"1M":30,"3M":90,"6M":180,"12M":365,"Max":null};
function weightDetailRangeStart(rangeKey,now){
  const days=WEIGHT_DETAIL_RANGE_DAYS[rangeKey];
  if(days==null)return null;
  const start=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  start.setDate(start.getDate()-(days-1));
  return start;
}
function weightDetailInRangeFn(rangeKey,now){
  const start=weightDetailRangeStart(rangeKey,now);
  if(!start)return ()=>true;
  const startTs=start.getTime();
  const endTs=new Date(now.getFullYear(),now.getMonth(),now.getDate()).getTime();
  return (y,m,d)=>{
    const ts=new Date(y,m,d).getTime();
    return ts>=startTs&&ts<=endTs;
  };
}
