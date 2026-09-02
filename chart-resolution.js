/* chart-resolution.js — zentrale Zeitraum-/Aggregations-Engine fuer die
   Statistik-Detailcharts (Koerpergewicht + Ernaehrung). Physisch analog zu
   den bestehenden *-engine.js-Dateien ausgelagert: reine, DOM-/React-
   unabhaengige Funktionen, per normalem <script src="chart-resolution.js">
   nach weight-engine.js/nutrition-engine.js und vor dem
   <script type="text/babel">-App-Code geladen. bucketDateLabel() und
   selDetailDateLabel() nutzen zur Laufzeit die globalen Konstanten MN/DS/
   WD_FULL sowie die Funktion detailDateRangeLabel() aus index.html — die
   sind erst beim tatsaechlichen React-Render aufgerufen (nicht beim Laden
   dieser Datei), daher spielt die Ladereihenfolge dafuer keine Rolle
   (identisches, bereits etabliertes Muster wie in weight-engine.js/
   NOW/MN).

   ZENTRALES ZEITRAUMSYSTEM: jede Zeitspanne (1W/1M/3M/6M/12M) nutzt eine
   FESTE, natuerliche Kalender-Granularitaet statt einer pro Metrik/Dichte
   adaptiven Wahl — dadurch repraesentiert z.B. "KW 32" bei Koerpergewicht
   UND allen vier Ernaehrungswerten immer exakt denselben Zeitraum (siehe
   statGranularityFor() unten, von StatDetailPage fuer alle fuenf Metriken
   gleichermassen aufgerufen):
     1W/1M -> Tag (jeder Kalendertag ein eigener Slot/Datenpunkt)
     3M/6M -> Woche (echte ISO-Kalenderwochen, Montag = Wochenbeginn)
     12M   -> Monat (jeder Kalendermonat ein eigener Slot)
     Max   -> siehe pickMaxGranularity(): einzige verbleibende Stelle, an
              der die Granularitaet von der tatsaechlichen Historienlaenge
              abhaengt (nicht vom gewaehlten Zeitraum, den es bei "Max"
              nicht gibt) — "Max" hat keine feste Groessenordnung.
   Datenpunkte/Zeit-Slots (welche Positionen ueberhaupt existieren),
   sichtbare X-Achsen-Beschriftungen (welche davon einen Text bekommen,
   siehe pickStrideTicks/pickEvenStrideTicks/pickWeekAnchoredDayTicks) und
   die Aggregation der Werte (bucketNutritionPoints/buildWeightSeries)
   bleiben bewusst getrennte Zustaendigkeiten.

   Oeffentliche API:
     bucketStartOf(y,m,d,granularity)
     bucketKeyOf(y,m,d,granularity)
     chartBucketEnd(y,m,d,granularity)
     fixedBucketSlots(startDate,endDate,granularity)
     bucketNutritionPoints(points,granularity)
     statGranularityFor(range,effStart,effEnd)
     pickMaxGranularity(effStart,effEnd)
     buildWeightSeries(points,granularity)
     pickStrideTicks(points,stride)
     pickEvenStrideTicks(points,maxCount)
     pickWeekAnchoredDayTicks(points)
     bucketDateLabel(y,m,d,granularity)
     selDetailDateLabel(p,granularity,isWeight) */

/* Start-Datum des Buckets, der den Tag (y,m,d) enthaelt — gemeinsame Basis
   fuer fixedBucketSlots() (Ernaehrung, feste Slots) UND buildWeightSeries()
   (Gewicht, nur echte Messungen), damit beide exakt dieselbe Bucket-
   Definition verwenden. "week" nutzt echte ISO-Kalenderwochen
   (weekStartDate = Montag der Woche, aus date-utils.js) — KEINE eigene,
   von einem beliebigen Epoch abhaengige "Alle-N-Tage"-Bucket-Logik. */
function bucketStartOf(y,m,d,granularity){
  if(granularity==="week"){const ws=weekStartDate(y,m,d);return {y:ws.getFullYear(),m:ws.getMonth(),d:ws.getDate()};}
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
  if(granularity==="month")return {y,m,d:daysInMonthOf(y,m)};
  if(granularity==="quarter"){const lastM=m+2;return {y,m:lastM,d:daysInMonthOf(y,lastM)};}
  if(granularity==="year")return {y,m:11,d:31};
  return {y,m,d};
}
/* Feste Bucket-Slots ueber den gesamten Anzeigezeitraum (taeglich/
   woechentlich/monatlich/quartalsweise/jaehrlich je nach Granularitaet) —
   jeder Zeitabschnitt bleibt an seiner festen Position, auch ohne Daten
   (kein Balken statt verschobenem Balken). Traegt die eigentliche Bucket-
   Erzeugung fuer Ernaehrung (siehe StatDetailPage). */
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
/* "Max" kennt keinen festen Zeitraum — die Granularitaet richtet sich hier
   als einzige Ausnahme nach der TATSAECHLICHEN HISTORIENLAENGE (nicht nach
   Datendichte oder Metrik-Art, siehe Aufgabenstellung: "so viel zeitliche
   Information wie sinnvoll, aber keine unlesbare X-Achse"):
     bis ~4 Monate  -> Woche
     bis ~2 Jahre   -> Monat
     bis ~7 Jahre   -> Quartal
     darueber       -> Jahr
   Bewusst kein "day": bei "Max" sollen laut Aufgabenstellung auch bei
   kurzer Historie mindestens Wochen gezeigt werden, nie einzelne Tage
   (das bleibt 1W/1M vorbehalten). */
const MAX_GRANULARITY_THRESHOLDS=[
  {maxDays:120,granularity:"week"},
  {maxDays:730,granularity:"month"},
  {maxDays:2555,granularity:"quarter"},
];
function pickMaxGranularity(effStart,effEnd){
  const days=Math.round((effEnd.getTime()-effStart.getTime())/86400000)+1;
  for(const t of MAX_GRANULARITY_THRESHOLDS){
    if(days<=t.maxDays)return t.granularity;
  }
  return "year";
}
/* Zentrale Granularitaets-Wahl fuer die Statistik-Detailcharts — von
   StatDetailPage fuer Koerpergewicht UND alle vier Ernaehrungswerte
   GLEICHERMASSEN aufgerufen, damit z.B. "KW 32" bei jeder Metrik exakt
   denselben Zeitraum meint (statt wie frueher pro Metrik unabhaengig
   ermittelt zu werden). Feste, natuerliche Kalenderstufe je Zeitraum statt
   einer pro Datenlage adaptiven Wahl (siehe Aufgabenstellung: "das soll
   sich wie echtes Zoomen durch die Zeit anfuehlen" — Tag -> Woche -> Monat
   -> Jahr). */
function statGranularityFor(range,effStart,effEnd){
  if(range==="1W"||range==="1M")return "day";
  if(range==="3M"||range==="6M")return "week";
  if(range==="12M")return "month";
  return pickMaxGranularity(effStart,effEnd);
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
/* Waehlt X-Achsen-Beschriftungspositionen mit KONSTANTEM Abstand (jeder
   "stride"-te Punkt, beginnend beim ersten sichtbaren Punkt) — bewusst
   getrennt von der Anzahl der dargestellten Datenpunkte selbst (z.B.
   koennen 26 Wochen-Datenpunkte nur jede 2. beschriftet bekommen, KW11/13/
   15/... bleiben trotzdem echte, anwaehlbare Punkte). Ein reiner
   Konstant-Schritt statt einer "naechster Punkt zu gleichmaessig verteilten
   Zeitpunkten"-Auswahl, weil letztere bei nicht glatt teilbaren Punktzahlen
   UNGLEICHMAESSIGE Abstaende erzeugt (z.B. "KW23,25,27,29,32,34,36" — der
   Sprung von 29 auf 32 wirkt wie eine fehlende KW31, siehe Aufgaben-
   stellung). Mit konstantem Schritt ist der zeitliche Abstand zwischen
   zwei sichtbaren Labels IMMER gleich. */
function pickStrideTicks(points,stride){
  const n=points.length;
  if(n===0)return [];
  const out=[];
  for(let i=0;i<n;i+=stride)out.push({idx:i,ts:points[i].ts,y:points[i].y,m:points[i].m,d:points[i].d});
  return out;
}
/* Wie pickStrideTicks, waehlt aber die Schrittweite selbst so, dass
   hoechstens "maxCount" Labels entstehen — bei n<=maxCount ergibt das
   automatisch Schritt 1 (ALLE Punkte beschriftet, kein Ausduennen noetig,
   z.B. "immer alle 7 Tage in 1W" oder "immer alle Monate in 12M"
   sichtbar). Faellt die Punktzahl darueber, wird IMMER noch ein
   gleichmaessiger Rhythmus verwendet (z.B. 15 Wochen bei maxCount 7 ->
   jede 2. Woche), nie eine unregelmaessige Folge. */
function pickEvenStrideTicks(points,maxCount){
  const n=points.length;
  if(n===0)return [];
  if(n<=maxCount)return pickStrideTicks(points,1);
  return pickStrideTicks(points,Math.ceil(n/maxCount));
}
/* Spezielle Tick-Auswahl fuer taegliche Granularitaet ueber mehrere Wochen
   (aktuell nur fuer 1M relevant, siehe StatDetailPage: dort bleibt jeder
   Kalendertag ein eigener Punkt/Slot, aber nicht jeder Tag soll ein
   sichtbares Textlabel bekommen). Anders als pickStrideTicks() NICHT
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
   (Wochentag/Datum) und Monat/Quartal (Monat/Jahr), einzeilig fuer Woche
   ("KWn" OHNE Leerzeichen, echte ISO-Kalenderwochennummer) und Jahr. Das
   fehlende Leerzeichen bei "week" ist bewusst: bei 3M sollen nach
   Moeglichkeit ALLE ca. 13 Kalenderwochen nebeneinander passen (siehe
   Aufgabenstellung "Platz responsiv nutzen") — "KW35" statt "KW 35" spart
   genau das eine Zeichen, das dafuer oft den Ausschlag gibt. Die
   ausfuehrlichere Form mit Leerzeichen bleibt dem groesseren, nicht
   platzkritischen Scrubbing-Infobereich vorbehalten (siehe
   selDetailDateLabel). */
function bucketDateLabel(y,m,d,granularity){
  if(granularity==="day")return {l1:DS[(new Date(y,m,d).getDay()+6)%7],l2:String(d)};
  if(granularity==="week")return {l1:"KW"+isoWeek(y,m,d),l2:""};
  if(granularity==="year")return {l1:String(y),l2:""};
  return {l1:MN[m].slice(0,3),l2:String(y)};
}
/* "24. – 30. August" statt zweimal "August" (detailDateRangeLabel dedupliziert
   nur das Jahr, nicht den Monat) — ausschliesslich fuer die kompakte
   Wochen-Scrubbing-Zeile (selDetailDateLabel) gedacht, wo der Platz knapp
   ist und der Monat bei einer einzelnen Kalenderwoche fast immer gleich
   bleibt. Faellt bei einem Monats-/Jahreswechsel innerhalb der Woche auf
   die vollstaendige Form zurueck (inkl. beider Monate bzw. beider Jahre). */
function weekRangeCompactLabel(sy,sm,sd,ey,em,ed){
  if(sy===ey&&sm===em)return sd+". – "+ed+". "+MN[sm];
  if(sy===ey)return sd+". "+MN[sm]+" – "+ed+". "+MN[em];
  return detailDateRangeLabel(sy,sm,sd,ey,em,ed);
}
/* Ausgeschriebene Datumsbeschriftung fuer den festen Scrubbing-Infobereich
   (StatDetailChart) — mit vollem Wochentag/Monatsnamen, passend zur
   jeweils gewaehlten Granularitaet, damit der Nutzer sofort erkennt, ob er
   gerade einen Tag, eine Kalenderwoche oder einen Monat betrachtet (siehe
   Aufgabenstellung "Information beim Scrubbing"):
     Tag     -> "Montag, 31. August" (Ernaehrung) bzw. "31. August 2026"
                (Koerpergewicht, bereits bestehende Konvention ohne
                Wochentag)
     Woche   -> "KW 35 · 24. – 30. August" (KW-Nummer + Datumsbereich in
                EINER Zeile, damit die bestehende zweizeilige Infobox aus
                Label+Wert unveraendert bleibt)
     Monat   -> "August 2026"
     Quartal -> "Juli – September 2026" (nur bei "Max" erreichbar, sonst
                nicht von Bedeutung — unterscheidet einen Quartals- klar
                von einem Monats-Bucket)
     Jahr    -> "2026" */
function selDetailDateLabel(p,granularity,isWeight){
  if(granularity==="day"){
    if(isWeight)return p.d+". "+MN[p.m]+" "+p.y;
    const dt=new Date(p.y,p.m,p.d);
    return WD_FULL[(dt.getDay()+6)%7]+", "+p.d+". "+MN[p.m];
  }
  if(granularity==="week"){
    const end=chartBucketEnd(p.y,p.m,p.d,granularity);
    return "KW "+isoWeek(p.y,p.m,p.d)+" · "+weekRangeCompactLabel(p.y,p.m,p.d,end.y,end.m,end.d);
  }
  if(granularity==="quarter"){
    const end=chartBucketEnd(p.y,p.m,p.d,granularity);
    return MN[p.m]+" – "+MN[end.m]+" "+p.y;
  }
  if(granularity==="month")return MN[p.m]+" "+p.y;
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
    bucketStartOf,
    bucketKeyOf,
    chartBucketEnd,
    fixedBucketSlots,
    bucketNutritionPoints,
    statGranularityFor,
    pickMaxGranularity,
    buildWeightSeries,
    pickStrideTicks,
    pickEvenStrideTicks,
    pickWeekAnchoredDayTicks,
  };
}
