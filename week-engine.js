/* week-engine.js — reine Wochenlogik (Phase 2A des Migrationsplans).
   Physisch aus index.html ausgelagert, ohne Verhaltensaenderung
   (Funktionskoerper 1:1 uebernommen). Wird per normalem
   <script src="week-engine.js"> VOR dem <script type="text/babel">-App-Code
   geladen und ist dadurch global verfuegbar (keine ES-Module).

   Oeffentliche API (von den React-Komponenten VerlaufView/WeekDetailSheet
   verwendet):
     isDayLogged(x)
     buildWeekSlots(data,mSet,start,sy,sm)
     getWeekDayVisualState(day,dayGoalColorFn)
     buildIsoWeekSummary(slots,dayGoalColorFn,weekGoalColorFn)

   Keine JSX-Komponenten, keine React-Hooks, keine DOM-Zugriffe.
   Nutzt zur Laufzeit die globalen Funktionen dayData()/tdeeOf() sowie die
   Konstante KCAL_PER_KG aus index.html — die sind erst nach vollstaendigem
   Laden ALLER Skripte tatsaechlich aufgerufen (React-Render), daher spielt
   die Ladereihenfolge (dieses Skript vor index.html) dafuer keine Rolle. */

/* EINZIGE Quelle dafuer, ob ein Kalendertag als "geloggt" gilt. JEDE Stelle
   der App, die einen Tag als geloggt/nicht geloggt behandelt — Wochenkarte,
   Tagesbalken, "X/7 Tage geloggt", Bottom Sheet, Wochen-/Monatszusammen-
   fassungen, Ziel-Fortschritt, Kalender —, MUSS ausschliesslich diese
   Funktion aufrufen statt selbst auf x.logged zuzugreifen oder andere
   Kriterien (z.B. ob ein TDEE fuer den Monat vorhanden ist) hineinzumischen.
   So kann es nicht mehr passieren, dass derselbe Tag an zwei Stellen
   unterschiedlich dargestellt wird. */
function isDayLogged(x){return !!(x&&x.logged);}

/* EINZIGE Stelle, die die 7 echten Kalendertage einer ISO-Woche (Montag bis
   Sonntag, "start" = das Montags-Datum) aus den Live-Daten aufbaut — jeder
   Verbrauch dieser Struktur (Wochenkarte, Tagesbalken, "X/7 Tage geloggt",
   Bottom Sheet, Wochenzusammenfassungen) MUSS ausschliesslich ueber diese
   Funktion gehen statt eine eigene Kopie/eigenes Array zu bauen. Liest data/
   mSet direkt (keine Zwischenspeicherung), daher immer aktuell — auch fuer
   Tage aus einem Nachbarmonat inkl. deren eigenem TDEE. "sy"/"sm" bestimmen
   nur das "ext"-Flag (gehoert der Tag zum gerade angezeigten Monat), keine
   Datenquelle. */
function buildWeekSlots(data,mSet,start,sy,sm){
  return Array.from({length:7},(_,i)=>{
    const dt=new Date(start);dt.setDate(dt.getDate()+i);
    const y=dt.getFullYear(),m=dt.getMonth(),dNum=dt.getDate();
    const ext=!(y===sy&&m===sm);
    const x=dayData(data,y,m,dNum);
    return {...x,d:dNum,y,m,ext,tdee:tdeeOf(mSet,y,m)};
  });
}

/* EINZIGE Funktion, die den vollstaendigen Anzeigezustand eines Wochentags
   bestimmt — Tagesbalken, Datumszahl, Bottom Sheet UND der X/7-Zaehler
   muessen ausschliesslich hierueber entscheiden, nie eigene Sonderlogik im
   JSX. "day" ist ein slot-Objekt aus buildWeekSlots() (enthaelt bereits
   logged/kcalIn/kcalBurned/tdee/ext). dayGoalColorFn(bilanz) liefert die
   fachliche Farbe (var(--good) bei unterstuetztem, var(--amber) bei nicht
   unterstuetztem Ziel) — dieselbe Funktion, die die Wochenbilanz-Zahl
   einfaerbt.
     Prinzip wie in der urspruenglichen Wochenkarte UND wie die Wochenbilanz
   (wd/wavg) es bereits vormacht: NUR DREI Zustaende — nicht geloggt (Grau),
   geloggt+Ziel unterstuetzt (Gruen), geloggt+Ziel nicht unterstuetzt
   (Orange). Es gibt bewusst KEINE vierte "geloggt, aber nicht bewertbar"-
   Sonderfarbe mehr: die Bilanz nutzt fuer ein fehlendes TDEE denselben
   "||0"-Fallback wie die Wochenbilanz weiter oben (wd-Berechnung), statt
   den Tag grau zu belassen — ein geloggter Tag ist IMMER farbig. Die
   Monatszugehoerigkeit (ext) veraendert NIEMALS die Farbe selbst, sondern
   ausschliesslich die Deckkraft (einheitlich fuer Grau/Gruen/Orange, genau
   wie frueher "opacity:x&&x.ext?.5:1"). Blau ist ausschliesslich
   UI-Akzentfarbe fuer Tabs/Navigation, nie fuer Tagesbalken. */
function getWeekDayVisualState(day,dayGoalColorFn){
  const logged=isDayLogged(day);
  const isExternalMonth=!!(day&&day.ext);
  if(!logged){
    return {logged:false,supportsGoal:null,isExternalMonth,
      background:"var(--day-muted)",opacity:isExternalMonth?0.5:1};
  }
  const bilanz=(day.kcalIn||0)-(day.tdee||0)-(day.kcalBurned||0);
  const background=dayGoalColorFn(bilanz);
  return {logged:true,supportsGoal:background==="var(--good)",isExternalMonth,
    background,opacity:isExternalMonth?0.5:1};
}

/* EINZIGE Quelle fuer die komplette Zusammenfassung EINER ISO-Woche —
   X/7-Zaehler, Ø kcal, Wochenbilanz, kg-Aequivalent, Farbe der
   Wochenbilanz, Tagesbalken UND Bottom Sheet lesen ausschliesslich aus
   diesem einen Ergebnis, nie aus einer eigenen/parallelen Berechnung.
   "slots" MUSS aus buildWeekSlots() kommen (alle 7 echten Kalendertage der
   Woche inkl. Tage aus einem Nachbarmonat, je mit EIGENEM TDEE) — niemals
   aus einer auf den angezeigten Monat gefilterten Teilmenge, sonst fehlen
   nachtraeglich geloggte Randtage in Bilanz/Durchschnitt/kg-Wert, obwohl
   Balken/Zaehler/Bottom Sheet (die bereits alle 7 slots nutzen) sie
   korrekt anzeigen. Nur tatsaechlich geloggte Tage fliessen in die
   Bilanz/den Durchschnitt ein — ein leerer Tag zaehlt nicht als 0 kcal. */
function buildIsoWeekSummary(slots,dayGoalColorFn,weekGoalColorFn){
  const dayStates=slots.map(x=>getWeekDayVisualState(x,dayGoalColorFn));
  const loggedDays=slots.filter(isDayLogged);
  const loggedDayCount=loggedDays.length;
  const totalBalanceKcal=loggedDays.reduce((s,x)=>s+(x.kcalIn||0)-(x.tdee||0)-(x.kcalBurned||0),0);
  const averageLoggedKcal=loggedDayCount?Math.round(loggedDays.reduce((s,x)=>s+(x.kcalIn||0),0)/loggedDayCount):0;
  const theoreticalWeightChangeKg=totalBalanceKcal/KCAL_PER_KG;
  const goalStatus=weekGoalColorFn(totalBalanceKcal,loggedDayCount,slots.length);
  return {days:slots,dayStates,loggedDays,loggedDayCount,totalBalanceKcal,averageLoggedKcal,theoreticalWeightChangeKg,goalStatus};
}
