/* chart-resolution.js — zentrale, adaptive Aggregations-/Aufloesungs-Engine
   fuer die Statistik-Detailcharts (Koerpergewicht + Ernaehrung). Physisch
   analog zu den bestehenden *-engine.js-Dateien ausgelagert: reine, DOM-/
   React-unabhaengige Funktionen, per normalem <script src="chart-
   resolution.js"> nach weight-engine.js/nutrition-engine.js und vor dem
   <script type="text/babel">-App-Code geladen. bucketDateLabel() und
   selDetailDateLabel() nutzen zur Laufzeit die globalen Konstanten MN/DS/
   WD_FULL sowie die Funktion detailDateRangeLabel() aus index.html — die
   sind erst beim tatsaechlichen React-Render aufgerufen (nicht beim Laden
   dieser Datei), daher spielt die Ladereihenfolge dafuer keine Rolle
   (identisches, bereits etabliertes Muster wie in weight-engine.js/
   NOW/MN).

   WARUM eine eigene, zentrale Engine statt sechs hartcodierter Regeln
   ("1W=Tag, 3M=Woche, 6M=Monat, 12M=Monat, ..."): die sichtbare
   Granularitaet haengt nicht NUR vom gewaehlten Zeitraum ab, sondern von
   Zeitraum + tatsaechlicher Datendichte + Metrik-Art (Balken mit festen
   Slots vs. Linie mit ausschliesslich echten Messpunkten) + verfuegbarer
   Chartbreite gemeinsam. Ein 5-Jahres-Zeitraum mit nur 20 Messungen soll
   weiterhin ALLE 20 echten Punkte einzeln zeigen (keine unnoetige
   Glaettung), waehrend taegliches Logging ueber 12 Monate sinnvoll
   verdichtet werden muss, um lesbar zu bleiben. Siehe getChartGranularity-
   Doku unten fuer die genaue Herleitung des Punktebudgets.

   Oeffentliche API:
     CHART_GRANULARITY_LADDER
     chartPointBudget(chartType)
     biweekStartDate(y,m,d)
     bucketStartOf(y,m,d,granularity)
     bucketKeyOf(y,m,d,granularity)
     chartBucketEnd(y,m,d,granularity)
     fixedBucketSlots(startDate,endDate,granularity)
     bucketNutritionPoints(points,granularity)
     countDistinctRealBuckets(points,granularity)
     pickGranularityByDensity(points,chartType)
     pickGranularityBySpan(startDate,endDate,chartType)
     buildWeightSeries(points,granularity)
     pickTimeTicks(points,maxCount)
     pickWeekAnchoredDayTicks(points)
     bucketDateLabel(y,m,d,granularity)
     selDetailDateLabel(p,granularity,isWeight) */

/* Granularitaets-Leiter von fein nach grob. "day" ist bewusst die feinste
   Stufe (nicht ein gesondertes "raw") — die Speicherung erlaubt ohnehin nur
   einen Gewichtswert pro Kalendertag (siehe saveWeightForDateRaw in
   index.html: data[key].weight wird bei einem erneuten Eintrag am selben
   Tag ueberschrieben, nie akkumuliert), eine separate "mehrere Messungen
   pro Tag zu einem Tageswert verdichten"-Vorstufe ist dadurch strukturell
   bereits ueberfluessig — "day" IST schon der repraesentative Tageswert. */
const CHART_GRANULARITY_LADDER=["day","week","biweek","month","quarter","year"];

/* Punktebudget: hergeleitet aus einer angenommenen Plot-Breite und einer
   metrik-/darstellungsabhaengigen Mindestbreite pro Punkt, NICHT eine frei
   erfundene Zahl. Balken brauchen mehr Platz pro Punkt als duenne
   Linienpunkte (sichtbare Luecken zwischen Balken, siehe die bewusst
   "massiven" Balken der Uebersichtskarten), daher ein hoeherer Mindestwert
   fuer "bar". CHART_PLOT_WIDTH_PX orientiert sich an der bereits
   bestehenden, geraeteunabhaengigen SVG-viewBox-Breite von StatDetailChart
   (Plot-Flaeche ca. 300 Einheiten, die per CSS-Skalierung auf jede reale
   Geraetebreite gestreckt wird) — das Budget ist deshalb bewusst NICHT von
   der tatsaechlichen Geraetebreite abhaengig (die Charts sind ohnehin
   ueberall gleich breit skaliert). Zusaetzlich hart gedeckelt auf 30
   (oberes Ende des in der Aufgabenstellung genannten Zielkorridors
   "12 bis 30 Datenpunkte"). */
const CHART_PLOT_WIDTH_PX=300;
const CHART_MIN_PX_PER_POINT={bar:10,line:9};
const CHART_POINT_BUDGET_CAP=30;
function chartPointBudget(chartType){
  const minPx=CHART_MIN_PX_PER_POINT[chartType]||10;
  return Math.min(CHART_POINT_BUDGET_CAP,Math.floor(CHART_PLOT_WIDTH_PX/minPx));
}

/* Fester Referenz-Montag fuer stabile 14-Tage-Buckets — ohne einen
   gemeinsamen Anker wuerden sich Bucket-Grenzen verschieben, je nachdem
   welches Datum man zuerst betrachtet. Das konkrete Datum ist beliebig,
   muss nur immer dasselbe sein. */
const BIWEEK_EPOCH=new Date(2020,0,6); // ein Montag
function biweekStartDate(y,m,d){
  const ws=weekStartDate(y,m,d);
  const diffDays=Math.round((ws.getTime()-BIWEEK_EPOCH.getTime())/86400000);
  const biIndex=Math.floor(diffDays/14);
  const start=new Date(BIWEEK_EPOCH);
  start.setDate(start.getDate()+biIndex*14);
  return start;
}
/* Start-Datum des Buckets, der den Tag (y,m,d) enthaelt — gemeinsame Basis
   fuer fixedBucketSlots() (Ernaehrung, feste Slots) UND buildWeightSeries()
   (Gewicht, nur echte Messungen), damit beide exakt dieselbe Bucket-
   Definition verwenden. */
function bucketStartOf(y,m,d,granularity){
  if(granularity==="week"){const ws=weekStartDate(y,m,d);return {y:ws.getFullYear(),m:ws.getMonth(),d:ws.getDate()};}
  if(granularity==="biweek"){const bs=biweekStartDate(y,m,d);return {y:bs.getFullYear(),m:bs.getMonth(),d:bs.getDate()};}
  if(granularity==="month")return {y,m,d:1};
  if(granularity==="quarter")return {y,m:Math.floor(m/3)*3,d:1};
  if(granularity==="year")return {y,m:0,d:1};
  return {y,m,d};
}
function bucketKeyOf(y,m,d,granularity){
  const s=bucketStartOf(y,m,d,granularity);
  return granularity+":"+s.y+"-"+s.m+"-"+s.d;
}
/* Inklusives END-Datum eines Buckets, dessen START-Datum (y,m,d) bereits
   bekannt ist (aus bucketStartOf/fixedBucketSlots/buildWeightSeries) — fuer
   die "26. Aug – 1. Sep"-Bereichsanzeige beim Scrubbing (siehe
   selDetailDateLabel). */
function chartBucketEnd(y,m,d,granularity){
  if(granularity==="week"){const e=new Date(y,m,d);e.setDate(e.getDate()+6);return {y:e.getFullYear(),m:e.getMonth(),d:e.getDate()};}
  if(granularity==="biweek"){const e=new Date(y,m,d);e.setDate(e.getDate()+13);return {y:e.getFullYear(),m:e.getMonth(),d:e.getDate()};}
  if(granularity==="month")return {y,m,d:daysInMonthOf(y,m)};
  if(granularity==="quarter"){const lastM=m+2;return {y,m:lastM,d:daysInMonthOf(y,lastM)};}
  if(granularity==="year")return {y,m:11,d:31};
  return {y,m,d};
}
/* Feste Bucket-Slots ueber den gesamten Anzeigezeitraum (taeglich/
   woechentlich/zweiwoechentlich/monatlich/quartalsweise/jaehrlich je nach
   Granularitaet) — jeder Zeitabschnitt bleibt an seiner festen Position,
   auch ohne Daten (kein Balken statt verschobenem Balken). Wird sowohl fuer
   die eigentliche Bucket-Erzeugung (Ernaehrung) als auch NUR zum Zaehlen
   (siehe pickGranularityBySpan) verwendet. */
function fixedBucketSlots(startDate,endDate,granularity){
  const out=[];
  const seen=new Set();
  const it=new Date(startDate.getFullYear(),startDate.getMonth(),startDate.getDate());
  while(it.getTime()<=endDate.getTime()){
    const y=it.getFullYear(),m=it.getMonth(),d=it.getDate();
    const key=bucketKeyOf(y,m,d,granularity);
    if(!seen.has(key)){
      seen.add(key);
      const s=bucketStartOf(y,m,d,granularity);
      out.push({key,y:s.y,m:s.m,d:s.d,ts:new Date(s.y,s.m,s.d).getTime()});
    }
    it.setDate(it.getDate()+1);
  }
  return out;
}
/* Buendelt echte Tageswerte je Bucket zum DURCHSCHNITT (nicht zur Summe)
   der Tage mit echten Daten — nur so bleibt die Skala mit dem taeglichen
   Ziel (z.B. 2.400 kcal) vergleichbar, egal wie grob aggregiert wird (siehe
   Aufgabenstellung: "durchschnittlicher Tageswert pro Bucket, nicht Summe
   eines Monats"). Liefert ein einfaches Objekt keyed nach bucketKeyOf(). */
function bucketNutritionPoints(points,granularity){
  const map={};
  points.forEach(p=>{
    const key=bucketKeyOf(p.y,p.m,p.d,granularity);
    if(!map[key])map[key]={kcal:0,protein:0,carbs:0,fat:0,count:0};
    const b=map[key];
    b.kcal+=p.kcal;b.protein+=p.protein;b.carbs+=p.carbs;b.fat+=p.fat;b.count+=1;
  });
  const out={};
  Object.keys(map).forEach(key=>{
    const b=map[key];
    out[key]={kcal:b.kcal/b.count,protein:b.protein/b.count,carbs:b.carbs/b.count,fat:b.fat/b.count,count:b.count};
  });
  return out;
}
/* Anzahl UNTERSCHIEDLICHER Buckets, die tatsaechlich mindestens eine echte
   Messung enthalten — die massgebliche Dichte-Kennzahl fuer Koerpergewicht
   (dort gibt es KEINE festen Slots, jeder Punkt ist eine echte Messung).
   Ein duenn befuellter langer Zeitraum bleibt dadurch fein aufgeloest. */
function countDistinctRealBuckets(points,granularity){
  const seen=new Set();
  points.forEach(p=>seen.add(bucketKeyOf(p.y,p.m,p.d,granularity)));
  return seen.size;
}
/* Waehlt die FEINSTE Granularitaet, bei der die Anzahl BUCKETS MIT
   ECHTEN DATEN noch innerhalb des Punktebudgets liegt — fuer Metriken ohne
   feste Slots (Koerpergewicht/Linie). Massgeblich ist die Datendichte,
   nicht die Zeitspanne: 20 Messungen ueber 5 Jahre bleiben "day", taegliches
   Logging ueber 12 Monate wird sinnvoll verdichtet. */
function pickGranularityByDensity(points,chartType){
  const budget=chartPointBudget(chartType);
  for(const g of CHART_GRANULARITY_LADDER){
    if(countDistinctRealBuckets(points,g)<=budget)return g;
  }
  return CHART_GRANULARITY_LADDER[CHART_GRANULARITY_LADDER.length-1];
}
/* Waehlt die FEINSTE Granularitaet, bei der die Anzahl FESTER SLOTS ueber
   den sichtbaren Zeitraum noch innerhalb des Punktebudgets liegt — fuer
   Metriken mit festen Positionsslots (Ernaehrung/Balken, jeder Tag/jede
   Woche behaelt ihre Position, auch ohne Eintrag). Hier ist bewusst die
   ZEITSPANNE massgeblich (nicht die Datendichte): die Slot-Anzahl ergibt
   sich rein aus dem sichtbaren Fenster, unabhaengig davon, wie viele Slots
   tatsaechlich befuellt sind — sonst wuerden bei duennem Logging ueber
   einen langen Zeitraum trotzdem hunderte leere Tages-Slots entstehen. */
function pickGranularityBySpan(startDate,endDate,chartType){
  const budget=chartPointBudget(chartType);
  for(const g of CHART_GRANULARITY_LADDER){
    if(fixedBucketSlots(startDate,endDate,g).length<=budget)return g;
  }
  return CHART_GRANULARITY_LADDER[CHART_GRANULARITY_LADDER.length-1];
}
/* Baut die tatsaechlich gezeichneten Gewichts-Punkte fuer die gewaehlte
   Granularitaet. Bei "day" 1:1 Durchreichung der echten Messungen (keine
   Rundung/Glaettung). Ab "week" werden echte Messungen INNERHALB desselben
   Buckets zum Durchschnitt zusammengefasst — ausschliesslich aus
   tatsaechlich vorhandenen Werten. Buckets ohne jede echte Messung
   entstehen gar nicht erst (kein Nullwert, keine vorgetaeuschte
   Fortfuehrung) — die Linie hat an dieser Stelle eine echte Datenluecke,
   exakt wie bisher bei "day". "isAgg" markiert einen verdichteten
   Mehrfach-Punkt fuer die Scrubbing-Anzeige (Ø + Datumsbereich statt
   Einzeltag, siehe selDetailDateLabel). */
function buildWeightSeries(points,granularity){
  if(granularity==="day"){
    return points.map(p=>({ts:p.ts,y:p.y,m:p.m,d:p.d,value:p.w,isAgg:false,count:1}));
  }
  const map={};
  points.forEach(p=>{
    const key=bucketKeyOf(p.y,p.m,p.d,granularity);
    if(!map[key]){
      const s=bucketStartOf(p.y,p.m,p.d,granularity);
      map[key]={sum:0,count:0,y:s.y,m:s.m,d:s.d};
    }
    map[key].sum+=p.w;map[key].count+=1;
  });
  const out=Object.keys(map).map(key=>{
    const b=map[key];
    return {ts:new Date(b.y,b.m,b.d).getTime(),y:b.y,m:b.m,d:b.d,value:b.sum/b.count,isAgg:true,count:b.count};
  });
  out.sort((a,b)=>a.ts-b.ts);
  return out;
}
/* Waehlt bis zu "maxCount" X-Achsen-Beschriftungspositionen GLEICHMAESSIG
   ueber die Zeitachse verteilt — bewusst getrennt von der Anzahl der
   dargestellten Datenpunkte (26 Punkte koennen z.B. nur 6 Labels haben).
   Bei n<=maxCount werden einfach ALLE Punkte beschriftet (kein
   Interpolieren noetig — erhaelt z.B. "immer alle 7 Tage in 1W sichtbar").
   Jedes Label sitzt IMMER exakt ueber einem echten dargestellten Punkt
   (naechstgelegene Zeit), nie frei zwischen zwei Punkten. Funktioniert
   identisch fuer Balken- und Linien-Charts (beide Punktarten tragen
   bereits einen echten Zeitstempel "ts"). */
function pickTimeTicks(points,maxCount){
  const n=points.length;
  if(n===0)return [];
  if(n<=maxCount)return points.map((p,i)=>({idx:i,ts:p.ts,y:p.y,m:p.m,d:p.d}));
  const tsMin=points[0].ts,tsMax=points[n-1].ts;
  const out=[];
  for(let i=0;i<maxCount;i++){
    const targetTs=maxCount>1?tsMin+(tsMax-tsMin)*(i/(maxCount-1)):tsMin;
    let best=0,bestDist=Infinity;
    points.forEach((p,idx)=>{const dist=Math.abs(p.ts-targetTs);if(dist<bestDist){bestDist=dist;best=idx;}});
    if(!out.some(o=>o.idx===best))out.push({idx:best,ts:points[best].ts,y:points[best].y,m:points[best].m,d:points[best].d});
  }
  return out;
}
/* Spezielle Tick-Auswahl fuer taegliche Granularitaet ueber mehrere Wochen
   (aktuell nur fuer 1M relevant, siehe StatDetailPage: dort bleibt jeder
   Kalendertag ein eigener Punkt/Slot, aber nicht jeder Tag soll ein
   sichtbares Textlabel bekommen). Anders als pickTimeTicks() NICHT
   gleichmaessig ueber die Zeit verteilt, sondern an der echten
   Wochenstruktur ausgerichtet: der erste sichtbare Tag wird IMMER
   beschriftet (auch wenn er kein Montag ist — z.B. bei einem rollierenden
   Fenster, das an einem Donnerstag beginnt), danach jeder Montag im
   sichtbaren Zeitraum. Alle uebrigen Tage bleiben unabhaengig davon als
   eigene Punkte/Slots erhalten — diese Funktion waehlt ausschliesslich
   aus, WELCHE davon zusaetzlich ein sichtbares Textlabel bekommen. */
function pickWeekAnchoredDayTicks(points){
  const n=points.length;
  if(n===0)return [];
  const out=[{idx:0,ts:points[0].ts,y:points[0].y,m:points[0].m,d:points[0].d}];
  for(let i=1;i<n;i++){
    const p=points[i];
    if(new Date(p.y,p.m,p.d).getDay()===1)out.push({idx:i,ts:p.ts,y:p.y,m:p.m,d:p.d});
  }
  return out;
}
/* Kompakte X-Achsen-Beschriftung je Granularitaet — zweizeilig fuer Tag
   (Wochentag/Datum) und Monat/Quartal/Jahr (Monat/Jahr), einzeilig fuer
   Woche/2 Wochen (Datum des Bucket-Beginns). */
function bucketDateLabel(y,m,d,granularity){
  if(granularity==="day")return {l1:DS[(new Date(y,m,d).getDay()+6)%7],l2:String(d)};
  if(granularity==="week"||granularity==="biweek")return {l1:d+". "+MN[m].slice(0,3),l2:""};
  if(granularity==="year")return {l1:String(y),l2:""};
  return {l1:MN[m].slice(0,3),l2:String(y)};
}
/* Ausgeschriebene Datumsbeschriftung fuer den festen Scrubbing-Infobereich
   (StatDetailChart) — mit vollem Wochentag/Monatsnamen, passend zur
   jeweils gewaehlten Granularitaet, damit z.B. bei einem Wochen-Bucket
   nicht faelschlich ein einzelner Wochentag suggeriert wird. Ab Woche
   zeigt sie den echten Datumsbereich des Buckets ("26. Aug – 1. Sep"),
   ab Monat den Monatsnamen (niemand sagt "1.–31. August"). Fuer
   Koerpergewicht bleibt der Tages-Fall bewusst ohne Wochentag (bereits
   bestehende Konvention: "31. August 2026" statt "Montag, 31. August"). */
function selDetailDateLabel(p,granularity,isWeight){
  if(granularity==="day"){
    if(isWeight)return p.d+". "+MN[p.m]+" "+p.y;
    const dt=new Date(p.y,p.m,p.d);
    return WD_FULL[(dt.getDay()+6)%7]+", "+p.d+". "+MN[p.m];
  }
  if(granularity==="week"||granularity==="biweek"){
    const end=chartBucketEnd(p.y,p.m,p.d,granularity);
    return detailDateRangeLabel(p.y,p.m,p.d,end.y,end.m,end.d);
  }
  if(granularity==="month"||granularity==="quarter")return MN[p.m]+" "+p.y;
  return String(p.y);
}

/* Node-Testzugriff (analog forecast-engine.js) — rein additiv, aendert
   nichts am Browser-Verhalten (dort existiert "module" nicht). Exportiert
   bewusst NUR die DOM-/Konstanten-unabhaengigen Funktionen; bucketDateLabel/
   selDetailDateLabel brauchen MN/DS/WD_FULL/detailDateRangeLabel aus
   index.html und werden bereits ueber die bestehende browser-*.test.js-
   Suite (kompletter App-Code) abgedeckt. */
if(typeof module!=="undefined" && module.exports){
  module.exports={
    CHART_GRANULARITY_LADDER,
    chartPointBudget,
    biweekStartDate,
    bucketStartOf,
    bucketKeyOf,
    chartBucketEnd,
    fixedBucketSlots,
    bucketNutritionPoints,
    countDistinctRealBuckets,
    pickGranularityByDensity,
    pickGranularityBySpan,
    buildWeightSeries,
    pickTimeTicks,
    pickWeekAnchoredDayTicks,
  };
}
