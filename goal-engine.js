/* goal-engine.js — reine Ziel-Fortschritts-/Bewertungslogik (Phase 2E des
   Migrationsplans). Physisch aus index.html ausgelagert, ohne
   Verhaltensaenderung (Funktionskoerper 1:1 uebernommen). Wird per
   normalem <script src="goal-engine.js"> nach week-engine.js und vor dem
   <script type="text/babel">-App-Code geladen und ist dadurch global
   verfuegbar (keine ES-Module).

   Oeffentliche API (von DashboardSection/Widgets, ZieleView und
   VerlaufView verwendet):
     periodRange(period)
     computeGoalProgress(g,data,mSet)
     goalStatusDisplay(goalEval,avgDef)

   Keine JSX-Komponenten, keine React-Hooks, keine DOM-Zugriffe.
   computeGoalProgress() nutzt zur Laufzeit die globalen Funktionen
   fmtNum()/fmtGym() (format.js), lastWeight()/settingsOf()/dayData()/
   isDayLogged()/tdeeOf()/dayGymMins()/dayKm() (Phase 2A-D-Engines) sowie
   die globalen Konstanten GOAL_TYPES/NOW aus index.html; goalStatusDisplay()
   nutzt die globale Konstante SEM aus index.html. Deren tatsaechlicher
   Aufruf erfolgt erst beim React-Render, nachdem alle Skripte vollstaendig
   geladen sind, daher spielt die Ladereihenfolge dafuer keine Rolle. */

/* Zeitraum-Grenzen (Start/Ende) fuer ein Ziel-Periode, bezogen auf "jetzt". */
function periodRange(period){
  const ps=new Date(),pe=new Date();
  if(period==="day"){ps.setHours(0,0,0,0);pe.setHours(23,59,59,999);}
  else if(period==="week"){const day=ps.getDay();const diff=day===0?6:day-1;ps.setDate(ps.getDate()-diff);ps.setHours(0,0,0,0);pe.setTime(ps.getTime());pe.setDate(pe.getDate()+6);}
  else if(period==="month"){ps.setDate(1);ps.setHours(0,0,0,0);pe.setMonth(pe.getMonth()+1,0);}
  else if(period==="year"){ps.setMonth(0,1);ps.setHours(0,0,0,0);pe.setMonth(11,31);}
  return {ps,pe};
}
/* Berechnet aktuellen Wert, Ziel-Fortschritt (0-100) und Anzeige-Text fuer
   ein einzelnes Ziel. Zentrale Stelle — Dashboard-Widget und Ziele-Tab
   nutzen exakt dieselbe Funktion, damit niemals unterschiedliche Zahlen
   an zwei Stellen der App auftauchen koennen. */
function computeGoalProgress(g,data,mSet){
  const gt=GOAL_TYPES.find(t=>t.key===g.type)||GOAL_TYPES[GOAL_TYPES.length-1];
  const target=parseFloat(g.target)||0;
  if(gt.kind==="manual"){
    const cur=parseFloat(g.manualValue)||0;
    const prog=target>0?Math.min(100,Math.max(0,cur/target*100)):0;
    return {cur,target,unit:gt.unit,prog,done:prog>=100,
      label:fmtNum(cur,0)+" / "+fmtNum(target,0)+" "+gt.unit,manual:true};
  }
  if(gt.kind==="level"){
    const cur=lastWeight(data);
    const sv=parseFloat(g.startValue)||0;
    const total=Math.abs(sv-target),done=cur>0?Math.abs(sv-cur):0;
    const prog=total>0?Math.min(100,Math.max(0,done/total*100)):0;
    const remaining=cur>0?cur-target:0;
    return {cur,target,unit:gt.unit,prog,done:prog>=100,
      label:cur>0?(remaining>0?fmtNum(Math.abs(remaining))+" kg übrig":"Ziel erreicht"):"kein Gewicht geloggt"};
  }
  if(gt.kind==="bodyfatlevel"){
    const st=settingsOf(mSet,NOW.getFullYear(),NOW.getMonth());
    const cur=st?parseFloat(st.fat)||0:0;
    const sv=parseFloat(g.startValue)||cur;
    const total=Math.abs(sv-target),done=cur>0?Math.abs(sv-cur):0;
    const prog=total>0?Math.min(100,Math.max(0,done/total*100)):0;
    const remaining=cur-target;
    return {cur,target,unit:gt.unit,prog,done:prog>=100,
      label:cur>0?(remaining>0?fmtNum(Math.abs(remaining))+" % übrig":"Ziel erreicht"):"kein Grundbedarf eingerichtet"};
  }
  if(g.period==="total"){
    // Summentypen ohne Gesamtziel-Unterstuetzung (nur "level"/"bodyfatlevel" kennen "total")
    return {cur:0,target,unit:gt.unit,prog:0,done:false,label:"0 / "+target+" "+gt.unit};
  }
  const {ps,pe}=periodRange(g.period);
  let cur=0,days=0;
  const it=new Date(ps);
  while(it<=pe&&it<=NOW){
    const yy=it.getFullYear(),mm=it.getMonth(),dd2=it.getDate();
    const x=dayData(data,yy,mm,dd2);
    if(isDayLogged(x)){
      days++;
      if(gt.kind==="deficitsum"||gt.kind==="surplussum"){
        const t=tdeeOf(mSet,yy,mm);
        if(t){
          const def=(x.kcalIn||0)-t-(x.kcalBurned||0);
          if(gt.kind==="deficitsum")cur+=def<0?-def:0;
          else cur+=def>0?def:0;
        }
      }else if(gt.kind==="macrosum"){
        cur+=(gt.macroKey==="protein"?x.proteinIn:gt.macroKey==="carbs"?x.carbsIn:x.fatIn)||0;
      }else if(gt.kind==="sessioncount"){
        if(x.sports&&x.sports.some(s=>gt.sportType==="all"?true:s.type===gt.sportType))cur++;
      }else if(gt.kind==="trainmin"){
        cur+=dayGymMins(x);
      }else if(gt.kind==="kmsum"){
        cur+=dayKm(x,g.sportType&&g.sportType!=="all"?g.sportType:null);
      }
    }
    it.setDate(it.getDate()+1);
  }
  const prog=target>0?Math.min(100,Math.max(0,cur/target*100)):0;
  const label=gt.kind==="trainmin"?fmtGym(cur)+" / "+fmtGym(target):
    fmtNum(cur,gt.kind==="kmsum"?1:0)+" / "+fmtNum(target,gt.kind==="kmsum"?1:0)+" "+gt.unit;
  return {cur,target,unit:gt.unit,prog,done:prog>=100,label};
}

function goalStatusDisplay(goalEval,avgDef){
  if(!goalEval||goalEval.status!=="ok"){
    if(Math.abs(avgDef)<=100)return {emoji:"🟡",text:"Du hältst dein Gewicht aktuell stabil.",tone:SEM.warn};
    if(avgDef<0)return {emoji:"🟢",text:"Dein Trend entwickelt sich positiv.",tone:SEM.good};
    return {emoji:"🟡",text:"Dein Kalorienüberschuss könnte deinem Ziel entgegenwirken.",tone:SEM.warn};
  }
  switch(goalEval.deadlineStatus){
    case "reached": return {emoji:"🎉",text:"Glückwunsch! Dein Ziel wurde erreicht.",tone:SEM.good};
    case "not_moving_toward_goal": return {emoji:"🔴",text:"Mit deinem aktuellen Trend wirst du dein Ziel wahrscheinlich nicht erreichen. Passe dein Kaloriendefizit oder deine Aktivität etwas an.",tone:SEM.bad};
    case "on_track": return {emoji:"🟢",text:"Du liegst aktuell sehr gut im Plan. Halte deinen aktuellen Rhythmus bei.",tone:SEM.good};
    case "close": return {emoji:"🟡",text:"Dein Trend verlangsamt sich leicht gegenüber deinem Zeitplan. Schon kleine Anpassungen können deinen Trend wieder verbessern.",tone:SEM.warn};
    case "off_track": return {emoji:"🔴",text:"Mit deinem aktuellen Trend erreichst du dein Ziel wahrscheinlich nicht rechtzeitig. Passe dein Kaloriendefizit oder deine Aktivität etwas an.",tone:SEM.bad};
    case "no_deadline": return {emoji:"🟢",text:"Starker Trend – dein Ziel ist mit hoher Wahrscheinlichkeit erreichbar.",tone:SEM.good};
    default: return {emoji:"🟡",text:"Du hältst dein Gewicht aktuell stabil.",tone:SEM.warn};
  }
}
