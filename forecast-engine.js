/* ============================================================
   FORECAST ENGINE — eigenstaendiges, testbares Modul fuer die
   Live-Prognose (Monatsend-Gewichtsvorhersage).

   SOURCE OF TRUTH: Diese Datei ist die einzige Stelle, an der die
   Engine-LOGIK geaendert wird. index.html enthaelt eine automatisch
   synchronisierte Kopie — niemals direkt dort editieren. Nach jeder
   Aenderung hier: `python3 sync-engine.py` ausfuehren.
   ============================================================ */

const FORECAST_CONFIG = {
  modelVersion: 1,

  kcalPerKg: 7700,

  minForecastValidDays: 7,
  regularForecastValidDays: 14,
  maxRecentValidDays: 14,
  /* Wie viele Kalendertage rueckwaerts (ueber Monatsgrenzen hinweg)
     hoechstens durchsucht werden duerfen, um die letzten maxRecentValidDays
     gueltigen Ernaehrungstage zu finden — verhindert unbegrenztes
     Zurueckscannen bei sehr luckenhaftem Logging oder lange inaktiven
     Konten (siehe getRecentValidBalanceDays). */
  recentValidDaysSearchHorizonDays: 60,

  idealAnchorAgeDays: 7,
  maxAnchorAgeDays: 14,

  maxAbsoluteBalanceKcal: 1500,
  maxBalanceShareOfTdee: 0.40,

  minCalibrationLogDays: 14,
  minCalibrationCoverage: 0.60,
  minCalibrationWeightEntries: 4,
  minCalibrationQuality: 0.65,

  startWindowDays: 7,
  endWindowDays: 7,
  maxExpandedWeightWindowDays: 10,
  minWeightEntriesPerWindow: 2,

  minTheoreticalChangeKg: 0.5,

  minPersonalFactor: 0.60,
  maxPersonalFactor: 1.40,
  baseLearningRate: 0.20,

  maintenanceToleranceKg: 1.0,

  /* ===== Gewichtsvalidierung ===== */
  minimumWeightKg: 20,
  maximumWeightKg: 400,
  /* Erlaubte Aenderung zum letzten GUELTIGEN Gewicht, gestaffelt nach
     vergangener Zeit. Aufsteigend nach maxDays sortiert, der erste
     passende Eintrag (daysSincePrevious<=maxDays) gilt; der letzte Eintrag
     (maxDays:Infinity) faengt alles Laengere ab. */
  plausibleWeightChangeThresholds: [
    {maxDays: 3,        maxChangeKg: 3},
    {maxDays: 14,       maxChangeKg: 6},
    {maxDays: Infinity, maxChangeKg: 10}
  ],

  /* ===== Nutzungspause vs. reine Wiegepause ===== */
  minimumGapDaysForUsagePause: 14,
  maximumCoverageForUsagePause: 0.20,
  /* Zusaetzlicher Unsicherheits-Puffer direkt nach einer erkannten
     Nutzungspause, der sich mit jedem neuen gueltigen Log-Tag linear
     abbaut (siehe calculateForecastUncertainty). */
  usageGapPenaltyKg: 1.0,
  usageGapPenaltyDecayLogDays: 14,

  /* Sicherheitsobergrenze fuer runPendingMonthlyCalibrations() — verhindert
     unbegrenzte Ruecklaufzeit bei sehr alten/lange ungenutzten Konten. */
  maxCalibrationMonthsPerRun: 24,

  minimumMarginsKg: {
    unpersonalized: 1.5,
    early: 1.2,
    calibrated: 0.8,
    stable: 0.6
  }
};

/* ===== Rundung — intern immer voll genau rechnen, erst hier runden ===== */
function round1(v){ return v==null||!isFinite(v) ? null : Math.round(v*10)/10; }
function round2(v){ return v==null||!isFinite(v) ? null : Math.round(v*100)/100; }
function round4(v){ return v==null||!isFinite(v) ? null : Math.round(v*10000)/10000; }

/* ===== Zeit-/Monats-Hilfsfunktionen (lokale Zeitzone, nie UTC) ===== */
function monthIdOf(y, m0){ return y + "-" + String(m0+1).padStart(2,"0"); } // m0 = 0-indiziert
function dateToIso(d){ return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }
/* Parst ein reines Kalenderdatum (YYYY-MM-DD) IMMER als lokalen Tag.
   new Date("YYYY-MM-DD") wuerde als UTC-Mitternacht interpretiert und
   kann dadurch je nach Zeitzone auf den falschen lokalen Kalendertag
   fallen — diese Funktion muss ueberall verwendet werden, wo ein reiner
   Kalendertag (forecastDate, targetDate, goal.deadline, ...) geparst wird. */
function parseLocalIsoDate(value){
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month-1, day);
}
function dayKey(y,m0,d){ return y+"-"+m0+"-"+d; }
function addMonthsSimple(y,m0,delta){ const t=y*12+m0+delta; return {y:Math.floor(t/12), m:((t%12)+12)%12}; }
function startOfDay(d){ const x=new Date(d); x.setHours(0,0,0,0); return x; }
function daysBetween(a,b){ return Math.round((startOfDay(b)-startOfDay(a))/86400000); }

/* ===== 2. Fester Monatsbedarf ===== */
function getMonthlyTdee(year, month0, monthlySettings){
  const s = monthlySettings[monthIdOf(year,month0)];
  if(!s || !isFinite(s.tdee) || s.tdee<=0) return null;
  return s.tdee;
}

/* ===== 3. Einheitliche Tagesbilanz (Vorzeichenkonvention: negativ=Defizit) ===== */
function calculateDailyEnergyBalance(day, monthlyTdee){
  return (day.kcalIn||0) - monthlyTdee - (day.kcalBurned||0);
}

/* ===== 4. Gueltige Log-Tage ===== */
function isValidForecastDay(day, monthlyTdee){
  if(monthlyTdee==null || !isFinite(monthlyTdee) || monthlyTdee<=0) return false;
  if(!day || day.logged!==true) return false;
  if(!isFinite(day.kcalIn) || !(day.kcalIn>0)) return false;
  if(day.kcalBurned!=null && (!isFinite(day.kcalBurned) || day.kcalBurned<0)) return false;
  return true;
}

/* ===== 5. Plausibilisierung fuer die Prognose (Original bleibt unangetastet) ===== */
function sanitizeBalanceForForecast(balance, monthlyTdee, config){
  config = config || FORECAST_CONFIG;
  const maxAbs = Math.min(config.maxAbsoluteBalanceKcal, monthlyTdee*config.maxBalanceShareOfTdee);
  const clamped = Math.max(-maxAbs, Math.min(maxAbs, balance));
  return {
    originalBalance: balance,
    forecastBalance: clamped,
    wasClamped: clamped!==balance,
    clampReason: clamped!==balance ? (balance>0 ? "balance_too_high" : "balance_too_low") : null,
    maxAbsoluteForecastBalance: maxAbs
  };
}

/* ===== 6. Juengste gueltige Bilanztage (kalenderuebergreifend) =====
   Sucht rueckwaerts ab "now" nach den letzten gueltigen Ernaehrungstagen,
   OHNE an der Monatsgrenze zu stoppen — ein Tag Ende Juli zaehlt genauso
   wie ein Tag Anfang August, solange fuer SEINEN EIGENEN Kalendermonat ein
   gueltiger TDEE existiert (jeder Tag nutzt getMonthlyTdee() fuer sein
   eigenes Jahr/seinen eigenen Monat, nicht den TDEE von "now"). Fehlt fuer
   einen Monat der TDEE, wird NUR dieser Tag uebersprungen — die Suche geht
   mit aelteren Tagen weiter, statt komplett abzubrechen. Die Suche stoppt,
   sobald entweder maxDays gueltige Tage gefunden wurden ODER der maximale
   Suchhorizont (FORECAST_CONFIG.recentValidDaysSearchHorizonDays
   Kalendertage rueckwaerts) erreicht ist. */
function getRecentValidBalanceDays(dailyData, now, monthlySettings, maxDays){
  maxDays = maxDays || FORECAST_CONFIG.maxRecentValidDays;
  const searchHorizonDays = FORECAST_CONFIG.recentValidDaysSearchHorizonDays;
  const out=[];
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let scannedDays = 0;
  while(out.length<maxDays && scannedDays<searchHorizonDays){
    const y=cursor.getFullYear(), m=cursor.getMonth();
    const monthlyTdee = getMonthlyTdee(y,m,monthlySettings); // jeder Tag nutzt SEINEN EIGENEN Monatsbedarf
    const day = dailyData[dayKey(y,m,cursor.getDate())];
    if(isValidForecastDay(day, monthlyTdee)){
      const originalBalance = calculateDailyEnergyBalance(day, monthlyTdee);
      const sanitized = sanitizeBalanceForForecast(originalBalance, monthlyTdee, FORECAST_CONFIG);
      out.push({
        date: new Date(cursor),
        ageDays: daysBetween(cursor, now),
        originalBalance,
        forecastBalance: sanitized.forecastBalance,
        wasClamped: sanitized.wasClamped,
        clampReason: sanitized.clampReason
      });
    }
    scannedDays++;
    cursor.setDate(cursor.getDate()-1);
  }
  return out.reverse(); // chronologisch aufsteigend
}

/* ===== TEMPORAERES DIAGNOSE-WERKZEUG (keine Fachlogik, nichts wird
   dauerhaft gespeichert) =====
   Durchlaeuft GENAU denselben Suchraum wie getRecentValidBalanceDays()
   (dieselbe dayKey()-Konvention, derselbe Suchhorizont), scannt aber IMMER
   den vollen Suchhorizont (statt bei maxDays gueltigen Tagen zu stoppen)
   und liefert fuer JEDEN geprueften Kalendertag ein vollstaendiges
   Diagnoseobjekt inkl. Ablehnungsgruenden. Dient ausschliesslich der
   Fehlersuche (z.B. ueber die Browser-Konsole) und veraendert kein
   Verhalten der eigentlichen Prognose. */
function debugRecentForecastDays({now, dailyData, monthlySettings, maxDays}){
  maxDays = maxDays || FORECAST_CONFIG.maxRecentValidDays;
  const searchHorizonDays = FORECAST_CONFIG.recentValidDaysSearchHorizonDays;
  const out=[];
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let validCount = 0;
  for(let scannedDays=0; scannedDays<searchHorizonDays; scannedDays++){
    const y=cursor.getFullYear(), m=cursor.getMonth(), d=cursor.getDate();
    const key = dayKey(y,m,d);
    const day = dailyData[key];
    const monthId = monthIdOf(y,m);
    const monthlyTdee = getMonthlyTdee(y,m,monthlySettings);
    const dayExists = !!day;
    const logged = dayExists && day.logged===true;
    const kcalIn = dayExists ? day.kcalIn : undefined;
    const kcalBurned = dayExists ? day.kcalBurned : undefined;
    const valid = isValidForecastDay(day, monthlyTdee);
    const rejectionReasons=[];
    if(!valid){
      if(!dayExists){
        rejectionReasons.push("missing_day");
      }else{
        if(!logged) rejectionReasons.push("not_logged");
        if(!(isFinite(kcalIn)&&kcalIn>0)) rejectionReasons.push("missing_or_invalid_kcal_in");
        if(kcalBurned!=null && (!isFinite(kcalBurned)||kcalBurned<0)) rejectionReasons.push("invalid_kcal_burned");
      }
      if(monthlyTdee==null) rejectionReasons.push("missing_monthly_tdee");
    }
    // Wuerde dieser (gueltige) Tag tatsaechlich in getRecentValidBalanceDays()
    // landen, oder ist er zwar gueltig, aber weil bereits maxDays neuere
    // gueltige Tage gefunden wurden, gar nicht mehr Teil der Stichprobe?
    const usedByForecast = valid && validCount<maxDays;
    if(valid) validCount++;
    out.push({
      date: new Date(cursor),
      dayKey: key,
      dayExists,
      logged,
      kcalIn: kcalIn==null?null:kcalIn,
      kcalBurned: kcalBurned==null?null:kcalBurned,
      monthId,
      monthlyTdee,
      valid,
      usedByForecast,
      rejectionReasons
    });
    cursor.setDate(cursor.getDate()-1);
  }
  return out.reverse(); // chronologisch aufsteigend
}

/* ===== 6. Robuster, zeitgewichteter Durchschnitt (Median + Winsorisierung) ===== */
function calculateRobustAverageBalance(validDays, config){
  config = config || FORECAST_CONFIG;
  if(!validDays || validDays.length===0){
    return {averageBalanceKcal:null, usedDays:0, excludedDays:0, clampedDays:0, weightingMethod:"none", medianBalanceKcal:null};
  }
  const sorted = validDays.map(d=>d.forecastBalance).slice().sort((a,b)=>a-b);
  const mid = Math.floor(sorted.length/2);
  const median = sorted.length%2!==0 ? sorted[mid] : (sorted[mid-1]+sorted[mid])/2;
  const absDevs = sorted.map(v=>Math.abs(v-median)).sort((a,b)=>a-b);
  const madMid = Math.floor(absDevs.length/2);
  const mad = absDevs.length%2!==0 ? absDevs[madMid] : (absDevs[madMid-1]+absDevs[madMid])/2;
  // Mindestradius verhindert, dass bei sehr gleichmaessigen Bilanzen (MAD~0)
  // schon kleinste natuerliche Schwankungen als "Ausreisser" gekappt werden.
  const winsorRadius = Math.max(mad*2, 150);
  let clampedDays = 0;
  const weighted = validDays.map(d=>{
    const winsorized = Math.max(median-winsorRadius, Math.min(median+winsorRadius, d.forecastBalance));
    if(winsorized!==d.forecastBalance) clampedDays++;
    const weight = d.ageDays<=6 ? 1.0 : (d.ageDays<=13 ? 0.65 : 0);
    return {value:winsorized, weight};
  }).filter(x=>x.weight>0);
  const totalWeight = weighted.reduce((s,x)=>s+x.weight,0);
  const averageBalanceKcal = totalWeight>0 ? weighted.reduce((s,x)=>s+x.value*x.weight,0)/totalWeight : null;
  return {
    averageBalanceKcal,
    usedDays: weighted.length,
    excludedDays: validDays.length-weighted.length,
    clampedDays,
    weightingMethod: "recency-tiered-with-winsorization",
    medianBalanceKcal: median
  };
}

/* ===== Kontextfunktion fuer Nutzungspause vs. reine Wiegepause =====
   Liefert den Datenkontext ZWISCHEN zwei Gewichtseintraegen — entscheidet
   NICHT selbst ueber gueltig/ungueltig, sondern liefert nur die Fakten,
   auf deren Basis validateWeightEntry() danach entscheidet. */
function evaluateWeightEntryContext({currentEntry, previousValidEntry, dailyData, monthlySettings, allWeightEntries, config}){
  config = config || FORECAST_CONFIG;
  if(!previousValidEntry){
    return {daysSincePreviousWeight:null, loggedNutritionDaysBetween:0, loggedActivityDaysBetween:0,
      weightEntriesBetween:0, coveredCalendarDays:0, dataCoverage:null,
      usageGapDetected:false, measurementGapOnly:false, shouldTreatAsNewAnchor:false};
  }
  const daysSincePreviousWeight = Math.max(0, daysBetween(previousValidEntry.date, currentEntry.date));
  // Zwischenzeitraum EXKLUSIVE beider Endpunkte (die Tage der Messungen
  // selbst sagen nichts darueber aus, ob DAZWISCHEN geloggt wurde).
  const start = new Date(previousValidEntry.date); start.setDate(start.getDate()+1);
  const end = new Date(currentEntry.date); end.setDate(end.getDate()-1);

  let loggedNutritionDaysBetween=0, loggedActivityDaysBetween=0, coveredCalendarDays=0;
  if(startOfDay(start)<=startOfDay(end)){
    const cursor=new Date(start);
    while(startOfDay(cursor)<=startOfDay(end)){
      coveredCalendarDays++;
      const y=cursor.getFullYear(), m=cursor.getMonth(), d=cursor.getDate();
      const monthlyTdee=getMonthlyTdee(y,m,monthlySettings);
      const day=dailyData[dayKey(y,m,d)];
      if(isValidForecastDay(day,monthlyTdee)) loggedNutritionDaysBetween++;
      if(day && day.kcalBurned>0) loggedActivityDaysBetween++;
      cursor.setDate(cursor.getDate()+1);
    }
  }
  const weightEntriesBetween = (allWeightEntries||[]).filter(e=>e && e.weight>0
    && startOfDay(e.date)>startOfDay(previousValidEntry.date) && startOfDay(e.date)<startOfDay(currentEntry.date)).length;
  const dataCoverage = coveredCalendarDays>0 ? loggedNutritionDaysBetween/coveredCalendarDays : (daysSincePreviousWeight<=1?1:0);

  const usageGapDetected = daysSincePreviousWeight>=config.minimumGapDaysForUsagePause
    && dataCoverage<config.maximumCoverageForUsagePause
    && weightEntriesBetween===0;
  const measurementGapOnly = !usageGapDetected
    && daysSincePreviousWeight>=config.minimumGapDaysForUsagePause
    && dataCoverage>=config.maximumCoverageForUsagePause;

  return {
    daysSincePreviousWeight, loggedNutritionDaysBetween, loggedActivityDaysBetween,
    weightEntriesBetween, coveredCalendarDays, dataCoverage: round4(dataCoverage),
    usageGapDetected, measurementGapOnly, shouldTreatAsNewAnchor: usageGapDetected
  };
}

/* ===== Zentrale Gewichtsvalidierung =====
   Entscheidet AUSSCHLIESSLICH darueber, ob ein Gewichtseintrag fuer Anker,
   Prognose oder Kalibrierung verwendet werden darf. Aendert und loescht
   NIE den gespeicherten Wert selbst — ein "suspicious"-Eintrag bleibt
   vollstaendig erhalten, er wird nur (noch) nicht fachlich verwendet.
   Ein grosser Sprung wird NIE allein wegen seiner Hoehe verworfen — der
   Kontext (Nutzungspause vs. reine Wiegepause) UND eine ausdrueckliche
   Nutzerbestaetigung fliessen mit ein. */
function validateWeightEntry({weightKg, date, previousValidWeight, previousValidDate, context, confirmedByUser, now}, config){
  config = config || FORECAST_CONFIG;
  // Zukuenftige Gewichtseintraege sind NIE erlaubt — diese Pruefung laeuft
  // bewusst als Allererstes, noch vor den harten Gewichtsgrenzen, da ein
  // zukuenftiges Datum unabhaengig vom Wert selbst grundsaetzlich ungueltig
  // ist. Kein Speichern, keine Bestaetigung, kein Forecast-Einfluss.
  if(now && date && startOfDay(date)>startOfDay(now)){
    return {status:"invalid", usableForForecast:false, usableForCalibration:false, reasons:["future_weight_date_not_allowed"]};
  }
  // Harte technische Grenzen gelten IMMER, unabhaengig von jedem Kontext
  // und auch nach einer Nutzerbestaetigung.
  if(weightKg==null || !isFinite(weightKg) || weightKg<=0){
    return {status:"invalid", usableForForecast:false, usableForCalibration:false, reasons:["weight_not_finite"]};
  }
  if(weightKg<config.minimumWeightKg || weightKg>config.maximumWeightKg){
    return {status:"invalid", usableForForecast:false, usableForCalibration:false, reasons:["weight_out_of_range"]};
  }
  if(previousValidWeight==null || previousValidDate==null){
    return {status:"valid", usableForForecast:true, usableForCalibration:true, reasons:[],
      usageGapDetected:false, measurementGapOnly:false, shouldTreatAsNewAnchor:false};
  }
  const deltaWeight = round2(weightKg-previousValidWeight);
  const daysSincePrevious = context ? context.daysSincePreviousWeight : Math.max(0, daysBetween(previousValidDate, date));
  const thresholds = config.plausibleWeightChangeThresholds.slice().sort((a,b)=>a.maxDays-b.maxDays);
  const threshold = thresholds.find(t=>daysSincePrevious<=t.maxDays) || thresholds[thresholds.length-1];
  const maxChangeKg = threshold.maxChangeKg;
  const withinPlausibleRange = Math.abs(deltaWeight)<=maxChangeKg;
  const debug = {previousValidWeight, weightKg, deltaWeight,
    deltaPercent: round4(previousValidWeight?(deltaWeight/previousValidWeight)*100:null),
    daysSincePrevious, maxPlausibleChangeKg:maxChangeKg, context: context||null};
  const usageGapDetected = context ? context.usageGapDetected : false;
  const measurementGapOnly = context ? context.measurementGapOnly : false;

  if(withinPlausibleRange){
    // Auch innerhalb der normalen Toleranz behalten wir den Kontext bei —
    // z.B. "85kg vor 60 Tagen, 88kg jetzt" nach einer Nutzungspause ist
    // technisch plausibel, markiert aber trotzdem einen sinnvollen neuen
    // Ankerpunkt (kein automatischer Neustart im Sinne von "Sprung",
    // aber die Luecke selbst bleibt eine Luecke fuer die Kalibrierung).
    return {status:"valid", usableForForecast:true, usableForCalibration:true, reasons:[],
      usageGapDetected, measurementGapOnly, shouldTreatAsNewAnchor:false, debug};
  }

  if(confirmedByUser){
    // Nutzer hat den ungewoehnlichen Wert ausdruecklich bestaetigt.
    // WICHTIG: Auch bestaetigt fliesst er NIE rueckwirkend in die
    // Kalibrierung ein — er wird nur als neuer Forecast-Anker akzeptiert.
    return {
      status:"valid", confirmedByUser:true,
      usageGapDetected, measurementGapOnly,
      shouldTreatAsNewAnchor: usageGapDetected,
      usableForForecast:true, usableForCalibration:false,
      reasons:[], debug
    };
  }

  return {
    status:"suspicious",
    usageGapDetected, measurementGapOnly,
    shouldTreatAsNewAnchor: usageGapDetected,
    usableForForecast:false, usableForCalibration:false, requiresConfirmation:true,
    reasons:[usageGapDetected?"large_change_after_usage_gap":"implausible_weight_jump"],
    debug
  };
}

/* Klassifiziert eine ganze Liste von Gewichtseintraegen chronologisch:
   jeder Eintrag wird gegen den letzten als GUELTIG erkannten Eintrag
   geprueft (nicht gegen den zeitlich letzten Eintrag ungeachtet seines
   Status) — ein suspicious/invalid Ausreisser "vergiftet" dadurch nicht
   die Bewertung der Eintraege danach. Baut fuer jeden Eintrag zusaetzlich
   den Nutzungspause-Kontext auf und beruecksichtigt gespeicherte
   Nutzerbestaetigungen (siehe isEntryConfirmed). */
function classifyWeightEntries(weightEntries, dailyData, monthlySettings, confirmations, config, now){
  config = config || FORECAST_CONFIG;
  dailyData = dailyData || {};
  monthlySettings = monthlySettings || {};
  const sorted = (weightEntries||[]).filter(e=>e && e.date).slice().sort((a,b)=>{
    const dd = startOfDay(a.date)-startOfDay(b.date);
    if(dd!==0) return dd;
    return (a.savedAt||0)-(b.savedAt||0);
  });
  let lastValid = null;
  return sorted.map(e=>{
    const context = lastValid ? evaluateWeightEntryContext({
      currentEntry:e, previousValidEntry:lastValid, dailyData, monthlySettings, allWeightEntries:weightEntries, config
    }) : null;
    const validation = validateWeightEntry({
      weightKg: e.weight, date: e.date,
      previousValidWeight: lastValid ? lastValid.weight : null,
      previousValidDate: lastValid ? lastValid.date : null,
      context,
      confirmedByUser: isEntryConfirmed(e, confirmations),
      now
    }, config);
    if(validation.status==="valid") lastValid = {weight:e.weight, date:e.date};
    return {...e, validation};
  });
}

/* Bestaetigungen werden dauerhaft (localStorage-seitig, siehe App-Code)
   ueber eine eindeutige Eintrags-ID gespeichert — hier nur das reine
   Nachschlagen anhand von Datum+Gewicht als stabiler Ersatz-Schluessel,
   falls keine explizite ID mitgegeben wird. */
function weightEntryConfirmationKey(entry){
  return dateToIso(entry.date)+"_"+entry.weight;
}
function isEntryConfirmed(entry, confirmations){
  if(!confirmations || !confirmations.length) return false;
  const key = entry.id || weightEntryConfirmationKey(entry);
  return confirmations.some(c=>c.confirmedByUser && (c.weightEntryId===key));
}
/* Erstellt einen neuen Bestaetigungs-Datensatz im spezifizierten Format
   und haengt ihn (unveraendert-funktional, kein Mutieren) an die
   bestehende Liste an. Eine bereits vorhandene Bestaetigung fuer denselben
   Eintrag wird ersetzt statt dupliziert. */
function recordWeightConfirmation(confirmations, entry, validationReason, now){
  const key = entry.id || weightEntryConfirmationKey(entry);
  const record = {
    weightEntryId: key,
    confirmedByUser: true,
    confirmedAt: (now||new Date()).toISOString(),
    validationReason: validationReason||null
  };
  const withoutExisting = (confirmations||[]).filter(c=>c.weightEntryId!==key);
  return [...withoutExisting, record];
}
/* Entfernt die Bestaetigung eines geloeschten Gewichtseintrags — wird ein
   Eintrag geloescht, soll seine (jetzt gegenstandslose) Bestaetigung nicht
   dauerhaft in der Liste haengen bleiben. */
function removeWeightConfirmation(confirmations, entry){
  const key = entry.id || weightEntryConfirmationKey(entry);
  return (confirmations||[]).filter(c=>c.weightEntryId!==key);
}

/* ===== 7. Ausgangsgewicht (Anker) =====
   Liefert AUSSCHLIESSLICH Eintraege mit status="valid" (inkl. bestaetigter
   Eintraege nach einer Nutzungspause). Ist der zeitlich neueste Eintrag
   suspicious oder invalid, faellt der Anker automatisch auf den letzten
   tatsaechlich gueltigen Eintrag zurueck, statt den fragwuerdigen Wert
   ungeprueft zu uebernehmen. */
function getLatestValidWeightEntry(weightEntries, now, config, dailyData, monthlySettings, confirmations){
  const classified = classifyWeightEntries((weightEntries||[]).filter(e=>e && e.date<=now), dailyData, monthlySettings, confirmations, config, now);
  const validOnes = classified.filter(e=>e.validation.status==="valid");
  if(validOnes.length===0) return null;
  const last = validOnes[validOnes.length-1]; // classified ist bereits chronologisch sortiert
  return {date:last.date, weight:last.weight, savedAt:last.savedAt, validation:last.validation};
}

/* ===== 8. Tatsaechliche Bilanz seit dem Anker (Doppelzaehlung vermeiden) =====
   Regel (zentral, nie je nach Ansicht abweichend): der Ankertag SELBST wird
   nie erneut mitgezaehlt — es wird immer erst ab dem FOLGETAG des
   Gewichtseintrags gezaehlt, unabhaengig von der Uhrzeit des Eintrags. */
function calculateActualBalanceSinceAnchor(anchorDate, now, dailyData, monthlySettings){
  const start = new Date(anchorDate); start.setDate(start.getDate()+1);
  let sum=0, usedDays=0, skippedDays=0;
  const cursor = new Date(start);
  while(startOfDay(cursor)<=startOfDay(now)){
    const y=cursor.getFullYear(), m=cursor.getMonth(), d=cursor.getDate();
    const monthlyTdee = getMonthlyTdee(y,m,monthlySettings); // jeder Tag nutzt SEINEN EIGENEN Monatsbedarf
    const day = dailyData[dayKey(y,m,d)];
    if(isValidForecastDay(day, monthlyTdee)){
      const bal = calculateDailyEnergyBalance(day, monthlyTdee);
      const sanitized = sanitizeBalanceForForecast(bal, monthlyTdee, FORECAST_CONFIG);
      sum += sanitized.forecastBalance;
      usedDays++;
    } else {
      skippedDays++;
    }
    cursor.setDate(cursor.getDate()+1);
  }
  return {actualBalanceSinceAnchorKcal:sum, usedDays, skippedDays};
}

/* ===== 12. Robustes Start-/Endgewicht per Fenster-Median ===== */
function getWeightWindowMedian(entries, startDate, endDate){
  const inWindow = (entries||[]).filter(e=>e && e.weight>0 && isFinite(e.weight) && startOfDay(e.date)>=startOfDay(startDate) && startOfDay(e.date)<=startOfDay(endDate));
  if(inWindow.length===0) return {median:null, count:0};
  const vals = inWindow.map(e=>e.weight).sort((a,b)=>a-b);
  const mid = Math.floor(vals.length/2);
  const median = vals.length%2!==0 ? vals[mid] : (vals[mid-1]+vals[mid])/2;
  return {median, count:inWindow.length};
}

/* ===== 17. Reifegrad der Personalisierung ===== */
function getCalibrationStage(calibratedMonths){
  if(calibratedMonths>=6) return "stable";
  if(calibratedMonths>=3) return "calibrated";
  if(calibratedMonths>=1) return "early";
  return "unpersonalized";
}

/* ===== 18. Standard-Nutzerprofil ===== */
function DEFAULT_CALIBRATION_PROFILE(){
  return {
    version: 1,
    personalEnergyFactor: 1.0,
    calibratedMonths: 0,
    calibrationStage: "unpersonalized",
    averageAbsoluteErrorKg: null,
    medianAbsoluteErrorKg: null,
    weightNoiseKg: null,
    lastCalibrationMonth: null,
    updatedAt: null,
    processedMonthIds: [],
    monthlyHistory: [],
    forecastSnapshots: []
  };
}

/* ===== 22. Aktuelle Datenqualitaet =====
   Coverage = gueltige Tage / tatsaechlich betrachtetes Trendfenster (Spanne
   vom AELTESTEN gefundenen gueltigen Tag bis "now", inklusive). Bewusst
   NICHT mehr an "Tage seit Monatsanfang" gekoppelt: recentDays kann jetzt
   kalenderuebergreifend sein (siehe getRecentValidBalanceDays), daher
   wuerde eine Kopplung an den laufenden Monat die Qualitaet am
   Monatsanfang kuenstlich verschlechtern, obwohl dieselben Tage bei
   Betrachtung vom Vormonat aus voll gezaehlt haetten. */
function calculateCurrentDataQuality({recentDays, anchorAgeDays, calibrationProfile, now}){
  const windowSpanDays = recentDays.length>0 ? daysBetween(recentDays[0].date, now)+1 : 0;
  const coverage = windowSpanDays>0 ? recentDays.length/windowSpanDays : 0;
  let stage = "insufficient";
  if(recentDays.length>=FORECAST_CONFIG.regularForecastValidDays && coverage>=0.5){
    stage = (calibrationProfile.calibratedMonths||0)>=3 ? "personalized" : "good";
  } else if(recentDays.length>=FORECAST_CONFIG.minForecastValidDays){
    stage = "provisional";
  }
  const score = Math.min(1,
    (recentDays.length/FORECAST_CONFIG.regularForecastValidDays)*0.6
    + Math.min(1,coverage)*0.3
    + (anchorAgeDays<=FORECAST_CONFIG.idealAnchorAgeDays ? 0.1 : 0)
  );
  return {score:round4(score), stage, validDays:recentDays.length, coverage:round4(Math.min(1,coverage)), anchorAgeDays};
}

/* ===== 20/21. Prognose-Unsicherheit =====
   "usageGapPenaltyKg" ist der Aufschlag direkt nach einer erkannten
   Nutzungspause — baut sich linear mit jedem neuen gueltigen Log-Tag seit
   dem neuen Anker ab, bis er nach usageGapPenaltyDecayLogDays Tagen ganz
   verschwunden ist. */
function calculateForecastUncertainty({calibrationProfile, futureDays, quality, anchorHadUsageGap, validBalanceDaysSinceAnchor}){
  const stage = getCalibrationStage(calibrationProfile.calibratedMonths||0);
  const baseMargin = FORECAST_CONFIG.minimumMarginsKg[stage];
  let historicalErrorMargin = baseMargin;
  const finalizedErrors = (calibrationProfile.forecastSnapshots||[])
    .filter(s=>isFinite(s.pointErrorKg)).map(s=>Math.abs(s.pointErrorKg));
  if(finalizedErrors.length>=3){
    const sorted = finalizedErrors.slice().sort((a,b)=>a-b);
    const mid = Math.floor(sorted.length/2);
    const medianErr = sorted.length%2!==0 ? sorted[mid] : (sorted[mid-1]+sorted[mid])/2;
    historicalErrorMargin = Math.max(baseMargin, medianErr);
  }
  const dataPenalty = quality.stage==="insufficient" ? 0.6 : quality.stage==="provisional" ? 0.3 : 0;
  const horizonPenalty = Math.min(0.5, futureDays*0.02);
  const usageGapPenaltyKg = anchorHadUsageGap
    ? Math.max(0, FORECAST_CONFIG.usageGapPenaltyKg * (1 - Math.min(1,(validBalanceDaysSinceAnchor||0)/FORECAST_CONFIG.usageGapPenaltyDecayLogDays)))
    : 0;
  const finalMarginKg = historicalErrorMargin + dataPenalty + horizonPenalty + usageGapPenaltyKg;
  return {historicalErrorMargin:round2(historicalErrorMargin), dataPenalty:round2(dataPenalty),
    horizonPenalty:round2(horizonPenalty), usageGapPenaltyKg:round2(usageGapPenaltyKg), finalMarginKg:round2(finalMarginKg)};
}

/* ===== 1/7/8/9/10. Zentrale Monatsend-Prognose ===== */
function calculateCurrentMonthForecast({now, dailyData, monthlySettings, weightEntries, calibrationProfile, weightConfirmations}){
  calibrationProfile = calibrationProfile || DEFAULT_CALIBRATION_PROFILE();
  const y=now.getFullYear(), m=now.getMonth();

  const monthlyTdee = getMonthlyTdee(y,m,monthlySettings);
  if(monthlyTdee==null){
    return {status:"insufficient_data", forecastWeightKg:null, reasons:["no_monthly_tdee"]};
  }

  const monthEnd = new Date(y,m+1,0);
  if(startOfDay(now)>startOfDay(monthEnd)){
    return {status:"insufficient_data", forecastWeightKg:null, reasons:["month_already_ended"]};
  }

  const anchor = getLatestValidWeightEntry(weightEntries, now, FORECAST_CONFIG, dailyData, monthlySettings, weightConfirmations);
  if(!anchor){
    return {status:"insufficient_data", forecastWeightKg:null, reasons:["missing_anchor_weight"]};
  }
  const anchorAgeDays = daysBetween(anchor.date, now);
  if(anchorAgeDays>FORECAST_CONFIG.maxAnchorAgeDays){
    return {status:"insufficient_data", forecastWeightKg:null, reasons:["anchor_weight_too_old"],
      requirements:{maxAnchorAgeDays:FORECAST_CONFIG.maxAnchorAgeDays, anchorAgeDays}};
  }

  const recentDays = getRecentValidBalanceDays(dailyData, now, monthlySettings, FORECAST_CONFIG.maxRecentValidDays);
  if(recentDays.length<FORECAST_CONFIG.minForecastValidDays){
    return {status:"insufficient_data", forecastWeightKg:null, reasons:["not_enough_valid_log_days"],
      requirements:{validDaysRequired:FORECAST_CONFIG.minForecastValidDays, validDaysAvailable:recentDays.length}};
  }

  const robust = calculateRobustAverageBalance(recentDays, FORECAST_CONFIG);
  const actualSinceAnchor = calculateActualBalanceSinceAnchor(anchor.date, now, dailyData, monthlySettings);
  const futureDays = Math.max(0, daysBetween(now, monthEnd)); // Tage NACH heute bis inkl. Monatsende
  const projectedFutureBalanceKcal = robust.averageBalanceKcal*futureDays;
  const totalProjectedBalanceFromAnchor = actualSinceAnchor.actualBalanceSinceAnchorKcal + projectedFutureBalanceKcal;
  const theoreticalWeightChangeKg = totalProjectedBalanceFromAnchor / FORECAST_CONFIG.kcalPerKg;

  const personalEnergyFactor = calibrationProfile.personalEnergyFactor || 1.0;
  const expectedChangeKg = theoreticalWeightChangeKg*personalEnergyFactor;
  const forecastWeightKg = anchor.weight+expectedChangeKg;

  const quality = calculateCurrentDataQuality({recentDays, anchorAgeDays, calibrationProfile, now});
  const anchorHadUsageGap = !!(anchor.validation && anchor.validation.usageGapDetected);
  /* WICHTIG: Fuer den Unsicherheitsabbau nach einer Nutzungspause zaehlen
     ausschliesslich gueltige Prognosetage NACH dem (neuen, bestaetigten)
     Anker — actualSinceAnchor.usedDays. recentDays.length waere fachlich
     falsch: das ist der Datenumfang fuer den robusten Bilanz-Durchschnitt
     ueber den GESAMTEN laufenden Monat, der auch Tage VOR dem neuen Anker
     enthalten kann und die Nutzungspause-Strafe dadurch zu frueh abbauen
     wuerde. */
  const uncertainty = calculateForecastUncertainty({calibrationProfile, futureDays, quality,
    anchorHadUsageGap, validBalanceDaysSinceAnchor: actualSinceAnchor.usedDays});
  const stage = getCalibrationStage(calibrationProfile.calibratedMonths||0);
  const confidenceStage = recentDays.length<FORECAST_CONFIG.regularForecastValidDays ? "provisional" : "regular";

  return {
    status: "ok",
    modelVersion: FORECAST_CONFIG.modelVersion,
    forecastDate: dateToIso(monthEnd),
    anchorDate: dateToIso(anchor.date),
    anchorWeightKg: round1(anchor.weight),
    anchorAfterUsageGap: anchorHadUsageGap,
    validBalanceDays: recentDays.length,
    averageDailyBalanceKcal: Math.round(robust.averageBalanceKcal),
    actualBalanceSinceAnchorKcal: Math.round(actualSinceAnchor.actualBalanceSinceAnchorKcal),
    projectedFutureBalanceKcal: Math.round(projectedFutureBalanceKcal),
    personalEnergyFactor: round4(personalEnergyFactor),
    expectedChangeKg: round2(expectedChangeKg),
    forecastWeightKg: round1(forecastWeightKg),
    lowerBoundKg: round1(forecastWeightKg-uncertainty.finalMarginKg),
    upperBoundKg: round1(forecastWeightKg+uncertainty.finalMarginKg),
    confidenceStage,
    calibrationStage: stage,
    calibratedMonths: calibrationProfile.calibratedMonths||0,
    dataQuality: quality,
    uncertainty,
    reasons: []
  };
}

/* ===== 15. Qualitaetsscore eines Kalibrierungsmonats ===== */
function calculateCalibrationQuality({loggingCoverage, weightMeasurementsCount, startCount, endCount, dailyData, monthlyTdee, year, month}){
  const loggingCoverageScore = Math.min(1, loggingCoverage);
  const weightFrequencyScore = Math.min(1, weightMeasurementsCount/20);
  const startEndWindowScore = Math.min(1, ((startCount+endCount)/2)/4);
  const monthStart=new Date(year,month,1), monthEnd=new Date(year,month+1,0);
  const balances=[];
  const cursor=new Date(monthStart);
  while(cursor<=monthEnd){
    const day = dailyData[dayKey(cursor.getFullYear(),cursor.getMonth(),cursor.getDate())];
    if(isValidForecastDay(day,monthlyTdee)) balances.push(calculateDailyEnergyBalance(day,monthlyTdee));
    cursor.setDate(cursor.getDate()+1);
  }
  let balanceConsistencyScore = 0.5;
  if(balances.length>1){
    const mean = balances.reduce((s,v)=>s+v,0)/balances.length;
    const variance = balances.reduce((s,v)=>s+(v-mean)*(v-mean),0)/balances.length;
    const sd = Math.sqrt(variance);
    balanceConsistencyScore = Math.max(0, Math.min(1, 1-(sd/1500)));
  }
  const dataIntegrityScore = 1; // durch isValidForecastDay bereits sichergestellt
  return 0.35*loggingCoverageScore + 0.25*weightFrequencyScore + 0.20*startEndWindowScore
    + 0.10*balanceConsistencyScore + 0.10*dataIntegrityScore;
}

/* ===== 11/12/13/14. Kalibrierung eines abgeschlossenen Monats ===== */
function calculateCompletedMonthCalibration({year, month, dailyData, monthlySettings, weightEntries, weightConfirmations, now}){
  const monthlyTdee = getMonthlyTdee(year,month,monthlySettings);
  if(monthlyTdee==null) return {usedForCalibration:false, exclusionReason:"no_monthly_tdee", month:monthIdOf(year,month)};

  const monthStart=new Date(year,month,1), monthEnd=new Date(year,month+1,0);
  const monthLabel = monthIdOf(year,month);

  /* Nutzungspausen-Erkennung laeuft ZUERST, noch vor der einfachen
     Log-Tage-/Coverage-Pruefung — eine Luecke ist der grundlegendere
     Ausschlussgrund. Klassifiziert die GESAMTE Gewichtshistorie (nicht nur
     diesen Monat), damit die Vergleichsbasis auch ueber Monatsgrenzen
     hinweg korrekt ist. weightConfirmations wird durchgereicht, damit
     Live-Prognose und Kalibrierung dieselbe Historie IDENTISCH
     klassifizieren — vorher bekam die Kalibrierung hier immer "null"
     statt der echten Bestaetigungen, was zu abweichenden Ergebnissen
     zwischen beiden Stellen fuehren konnte. */
  const classifiedWeights = classifyWeightEntries(weightEntries, dailyData, monthlySettings, weightConfirmations, FORECAST_CONFIG, now);
  const usageGapInMonth = classifiedWeights.some(e=>
    e.validation.usageGapDetected && startOfDay(e.date)>=monthStart && startOfDay(e.date)<=monthEnd);
  if(usageGapInMonth)
    return {usedForCalibration:false, exclusionReason:"usage_gap", month:monthLabel};

  const daysInMonth = monthEnd.getDate();
  let validLogDays=0, totalValidMonthlyBalanceKcal=0;
  const cursor=new Date(monthStart);
  while(cursor<=monthEnd){
    const day = dailyData[dayKey(cursor.getFullYear(),cursor.getMonth(),cursor.getDate())];
    if(isValidForecastDay(day,monthlyTdee)){
      const bal = calculateDailyEnergyBalance(day,monthlyTdee);
      const sanitized = sanitizeBalanceForForecast(bal,monthlyTdee,FORECAST_CONFIG);
      totalValidMonthlyBalanceKcal += sanitized.forecastBalance;
      validLogDays++;
    }
    cursor.setDate(cursor.getDate()+1);
  }
  const loggingCoverage = validLogDays/daysInMonth;
  if(validLogDays<FORECAST_CONFIG.minCalibrationLogDays)
    return {usedForCalibration:false, exclusionReason:"not_enough_log_days", month:monthLabel, validLogDays, loggingCoverage:round4(loggingCoverage)};
  if(loggingCoverage<FORECAST_CONFIG.minCalibrationCoverage)
    return {usedForCalibration:false, exclusionReason:"coverage_too_low", month:monthLabel, validLogDays, loggingCoverage:round4(loggingCoverage)};

  /* WICHTIG: Nicht mehr nur nach status==="valid" filtern, sondern
     ausdruecklich zusaetzlich usableForCalibration===true verlangen.
     Ein bestaetigter Wert nach einer Nutzungspause hat zwar status="valid"
     (er darf als Forecast-Anker dienen), aber usableForCalibration=false —
     ohne diese zusaetzliche Pruefung waere er hier faelschlich als
     normaler Start-/Endgewichts-Messpunkt eingeflossen. */
  const validWeightEntries = classifiedWeights
    .filter(e=>e.validation.status==="valid" && e.validation.usableForCalibration===true)
    .map(e=>({date:e.date, weight:e.weight}));

  const weightMeasurements = validWeightEntries.filter(e=>startOfDay(e.date)>=monthStart && startOfDay(e.date)<=monthEnd);
  if(weightMeasurements.length<FORECAST_CONFIG.minCalibrationWeightEntries)
    return {usedForCalibration:false, exclusionReason:"not_enough_weight_entries", month:monthLabel, validLogDays, loggingCoverage:round4(loggingCoverage), weightMeasurements:weightMeasurements.length};

  let startResult=null, endResult=null;
  for(let w=FORECAST_CONFIG.startWindowDays; w<=FORECAST_CONFIG.maxExpandedWeightWindowDays; w++){
    const r = getWeightWindowMedian(validWeightEntries, monthStart, new Date(year,month,w));
    if(r.count>=FORECAST_CONFIG.minWeightEntriesPerWindow){ startResult=r; break; }
  }
  for(let w=FORECAST_CONFIG.endWindowDays; w<=FORECAST_CONFIG.maxExpandedWeightWindowDays; w++){
    const r = getWeightWindowMedian(validWeightEntries, new Date(year,month,daysInMonth-w+1), monthEnd);
    if(r.count>=FORECAST_CONFIG.minWeightEntriesPerWindow){ endResult=r; break; }
  }
  if(!startResult || !endResult)
    return {usedForCalibration:false, exclusionReason:"insufficient_weight_window_data", month:monthLabel, validLogDays, loggingCoverage:round4(loggingCoverage)};

  const actualWeightChangeKg = endResult.median-startResult.median;
  const theoreticalWeightChangeKg = totalValidMonthlyBalanceKcal/FORECAST_CONFIG.kcalPerKg;
  const qualityScore = calculateCalibrationQuality({
    loggingCoverage, weightMeasurementsCount:weightMeasurements.length,
    startCount:startResult.count, endCount:endResult.count, dailyData, monthlyTdee, year, month
  });

  if(Math.abs(theoreticalWeightChangeKg)<FORECAST_CONFIG.minTheoreticalChangeKg)
    return {usedForCalibration:false, exclusionReason:"theoretical_change_too_small", month:monthLabel, validLogDays,
      loggingCoverage:round4(loggingCoverage), theoreticalWeightChangeKg:round2(theoreticalWeightChangeKg),
      actualWeightChangeKg:round2(actualWeightChangeKg), qualityScore:round4(qualityScore)};

  const sameDirection = (theoreticalWeightChangeKg<0 && actualWeightChangeKg<=0)
    || (theoreticalWeightChangeKg>0 && actualWeightChangeKg>=0);
  if(!sameDirection)
    return {usedForCalibration:false, exclusionReason:"direction_mismatch", month:monthLabel, validLogDays,
      loggingCoverage:round4(loggingCoverage), theoreticalWeightChangeKg:round2(theoreticalWeightChangeKg),
      actualWeightChangeKg:round2(actualWeightChangeKg), qualityScore:round4(qualityScore)};

  if(qualityScore<FORECAST_CONFIG.minCalibrationQuality)
    return {usedForCalibration:false, exclusionReason:"quality_too_low", month:monthLabel, validLogDays,
      loggingCoverage:round4(loggingCoverage), theoreticalWeightChangeKg:round2(theoreticalWeightChangeKg),
      actualWeightChangeKg:round2(actualWeightChangeKg), qualityScore:round4(qualityScore)};

  const rawMonthlyFactor = actualWeightChangeKg/theoreticalWeightChangeKg;
  const usedMonthlyFactor = Math.max(FORECAST_CONFIG.minPersonalFactor, Math.min(FORECAST_CONFIG.maxPersonalFactor, rawMonthlyFactor));

  return {
    usedForCalibration: true,
    exclusionReason: null,
    month: monthLabel,
    validLogDays,
    loggingCoverage: round4(loggingCoverage),
    weightMeasurements: weightMeasurements.length,
    startWeightMedianKg: round1(startResult.median),
    endWeightMedianKg: round1(endResult.median),
    actualWeightChangeKg: round2(actualWeightChangeKg),
    totalBalanceKcal: Math.round(totalValidMonthlyBalanceKcal),
    theoreticalWeightChangeKg: round2(theoreticalWeightChangeKg),
    rawMonthlyFactor: round4(rawMonthlyFactor),
    usedMonthlyFactor: round4(usedMonthlyFactor),
    qualityScore: round4(qualityScore)
  };
}

/* ===== 16. Langsames, stabiles Lernen ===== */
function updatePersonalEnergyFactor(profile, monthCalibration){
  if(!monthCalibration.usedForCalibration) return profile;
  const oldFactor = profile.personalEnergyFactor || 1.0;
  const effectiveLearningRate = FORECAST_CONFIG.baseLearningRate*monthCalibration.qualityScore;
  let newFactor = oldFactor*(1-effectiveLearningRate) + monthCalibration.usedMonthlyFactor*effectiveLearningRate;
  newFactor = Math.max(FORECAST_CONFIG.minPersonalFactor, Math.min(FORECAST_CONFIG.maxPersonalFactor, newFactor));
  const newCalibratedMonths = (profile.calibratedMonths||0)+1;
  return {
    ...profile,
    personalEnergyFactor: round4(newFactor),
    calibratedMonths: newCalibratedMonths,
    calibrationStage: getCalibrationStage(newCalibratedMonths),
    lastCalibrationMonth: monthCalibration.month,
    monthlyHistory: [...(profile.monthlyHistory||[]), monthCalibration]
  };
}

/* Gruende, aus denen ein Monat AKTUELL nicht kalibriert werden konnte, die
   sich aber spaeter aendern koennen, wenn der Nutzer Daten nachtraegt.
   Diese Monate duerfen NICHT in processedMonthIds landen — sie muessen bei
   jedem folgenden Lauf erneut geprueft werden. Alle anderen Ausschluss-
   gruende (usage_gap, direction_mismatch, theoretical_change_too_small,
   quality_too_low, no_monthly_tdee) gelten als strukturell/dauerhaft und
   werden nach einmaliger Pruefung als abgeschlossen markiert. */
const TEMPORARY_CALIBRATION_EXCLUSION_REASONS = [
  "not_enough_log_days", "coverage_too_low", "not_enough_weight_entries", "insufficient_weight_window_data"
];
function isTemporaryCalibrationExclusion(reason){
  return TEMPORARY_CALIBRATION_EXCLUSION_REASONS.includes(reason);
}

/* ===== 26. Monatliche automatische Kalibrierung (idempotent) =====
   Prueft ALLE noch nicht endgueltig verarbeiteten, bereits abgeschlossenen
   Monate chronologisch (nicht mehr nur den unmittelbaren Vormonat) — sonst
   wuerden Monate uebersprungen, wenn die App laengere Zeit nicht geoeffnet
   war. Kandidatenmonate sind alle Monate mit einem hinterlegten
   Monatsbedarf, die vor dem aktuellen Monat liegen und noch nicht
   verarbeitet wurden; eine feste Obergrenze verhindert unbegrenzte
   Ruecklaufzeit bei sehr alten Konten. */
function runPendingMonthlyCalibrations(now, dailyData, monthlySettings, weightEntries, weightConfirmations, profile, config){
  config = config || FORECAST_CONFIG;
  profile = profile || DEFAULT_CALIBRATION_PROFILE();
  const processed = new Set(profile.processedMonthIds||[]);
  const currentMonthId = monthIdOf(now.getFullYear(), now.getMonth());

  const candidateMonthIds = Object.keys(monthlySettings||{})
    .filter(id=>id<currentMonthId) // "YYYY-MM" ist lexikographisch chronologisch sortierbar
    .filter(id=>!processed.has(id))
    .sort();

  const maxMonths = config.maxCalibrationMonthsPerRun || 24;
  const toProcess = candidateMonthIds.slice(0, maxMonths);
  if(toProcess.length===0) return profile; // nichts zu tun -> unveraenderte Referenz zurueckgeben

  let updated = profile;
  toProcess.forEach(monthId=>{
    const [y,m] = monthId.split("-").map(Number);
    const calibration = calculateCompletedMonthCalibration({
      year:y, month:m-1, dailyData, monthlySettings, weightEntries, weightConfirmations, now
    });
    if(calibration.usedForCalibration){
      updated = updatePersonalEnergyFactor(updated, calibration);
      updated = {...updated, processedMonthIds:[...(updated.processedMonthIds||[]), monthId]};
    } else if(isTemporaryCalibrationExclusion(calibration.exclusionReason)){
      // Temporaer: NICHT als verarbeitet markieren, spaeter erneut pruefbar.
      updated = {...updated, monthlyHistory:[...(updated.monthlyHistory||[]), calibration]};
    } else {
      // Dauerhaft/strukturell: einmal geprueft, gilt als abgeschlossen.
      updated = {...updated, monthlyHistory:[...(updated.monthlyHistory||[]), calibration], processedMonthIds:[...(updated.processedMonthIds||[]), monthId]};
    }
  });
  updated = {...updated, updatedAt: now.toISOString()};
  return updated;
}

/* ===== 25. Zielbewertung, getrennt von der neutralen Prognose =====
   EINZIGE Stelle, an der eine Prognose gegen ein Ziel bewertet wird — die
   UI darf hierfuer keine eigene Formel mehr besitzen (weder Zielrichtung
   noch "Tage bis Ziel" noch Deadline-Einschaetzung). Erwartet ein
   normalisiertes goal-Objekt {targetWeightKg, deadline?, maintenanceToleranceKg?}
   — die Umwandlung des jeweiligen App-Zielformats in diese Form ist reine
   Datenzuordnung (kein fachliches Rechnen) und bleibt daher Aufgabe des
   Aufrufers/Adapters. */
function evaluateForecastAgainstGoal({forecast, goal, now}){
  if(!forecast || forecast.status!=="ok" || !goal || goal.targetWeightKg==null || !isFinite(goal.targetWeightKg)){
    return {status:"not_applicable"};
  }
  now = now || new Date();
  const target = goal.targetWeightKg;
  const anchorW = forecast.anchorWeightKg;
  const fw = forecast.forecastWeightKg;
  const tol = goal.maintenanceToleranceKg!=null ? goal.maintenanceToleranceKg : FORECAST_CONFIG.maintenanceToleranceKg;

  /* Zielrichtung aus dem Ankergewicht relativ zum Ziel ableiten — dasselbe
     ±0,3kg-Toleranzband, das zuvor als inferWeightGoalDirection() separat
     in der UI existierte. */
  let direction;
  if(target < anchorW - 0.3) direction = "lose";
  else if(target > anchorW + 0.3) direction = "gain";
  else direction = "maintain";

  let goalReached, movingTowardGoal, distanceKg, remainingKg;
  if(direction==="lose"){
    goalReached = fw<=target;
    movingTowardGoal = fw < anchorW;
    distanceKg = round2(fw-target);
    remainingKg = anchorW-target;
  } else if(direction==="gain"){
    goalReached = fw>=target;
    movingTowardGoal = fw > anchorW;
    distanceKg = round2(target-fw);
    remainingKg = target-anchorW;
  } else {
    goalReached = Math.abs(fw-target)<=tol;
    movingTowardGoal = Math.abs(fw-target) <= Math.abs(anchorW-target);
    distanceKg = round2(Math.abs(fw-target)-tol);
    remainingKg = null;
  }

  let deadlineStatus, projectedGoalDate=null;
  if(goalReached){
    deadlineStatus="reached";
  } else if(!movingTowardGoal){
    deadlineStatus="not_moving_toward_goal";
  } else if(!goal.deadline){
    deadlineStatus="no_deadline";
  } else if(remainingKg!=null){
    const horizonDays = Math.max(1, daysBetween(parseLocalIsoDate(forecast.anchorDate), parseLocalIsoDate(forecast.forecastDate)));
    const kgPerDay = forecast.expectedChangeKg/horizonDays;
    if(Math.abs(kgPerDay)>1e-9){
      const daysToGoal = Math.abs(remainingKg/kgPerDay);
      const goalDate = new Date(now); goalDate.setDate(goalDate.getDate()+Math.ceil(daysToGoal));
      projectedGoalDate = dateToIso(goalDate);
      const deadline = parseLocalIsoDate(goal.deadline);
      const bufferDays = Math.max(0,(deadline-now)/86400000);
      if(startOfDay(goalDate)<=startOfDay(deadline)) deadlineStatus="on_track";
      else if(daysToGoal<=bufferDays*1.25) deadlineStatus="close";
      else deadlineStatus="off_track";
    } else {
      deadlineStatus="off_track";
    }
  } else {
    deadlineStatus="on_track"; // "maintain", bewegt sich Richtung Ziel, keine Deadline-Rechnung noetig
  }

  return {status:"ok", direction, goalReached, distanceKg, movingTowardGoal, projectedGoalDate, deadlineStatus};
}

/* ===== 27. Prognose-Snapshots fuer Backtesting ===== */
function storeForecastSnapshot(profile, snapshot){
  const today = snapshot.createdAt.slice(0,10);
  // hoechstens ein Snapshot pro Tag UND Zielzeitpunkt
  const existing = (profile.forecastSnapshots||[]).filter(s=>!(s.createdAt.slice(0,10)===today && s.targetDate===snapshot.targetDate));
  return {...profile, forecastSnapshots:[...existing, snapshot]};
}
/* Baut aus einem "ok"-Forecast-Ergebnis + aktuellem Datum genau die
   Snapshot-Struktur, die 1x/Tag+Zieldatum gespeichert werden soll. Reine
   Funktion — der Aufrufer entscheidet in einem kontrollierten Effekt, OB
   und WANN gespeichert wird, nicht diese Funktion selbst. */
function buildForecastSnapshot(forecast, now){
  if(!forecast || forecast.status!=="ok") return null;
  return {
    createdAt: (now||new Date()).toISOString(),
    targetDate: forecast.forecastDate,
    anchorWeightKg: forecast.anchorWeightKg,
    averageBalanceKcal: forecast.averageDailyBalanceKcal,
    personalEnergyFactor: forecast.personalEnergyFactor,
    forecastWeightKg: forecast.forecastWeightKg,
    lowerBoundKg: forecast.lowerBoundKg,
    upperBoundKg: forecast.upperBoundKg,
    validDays: forecast.validBalanceDays,
    calibrationStage: forecast.calibrationStage,
    modelVersion: forecast.modelVersion
  };
}
/* Ist fuer HEUTE (now) und das gegebene Zieldatum bereits ein Snapshot
   vorhanden? Reine Pruef-Funktion, kein Seiteneffekt — der Aufrufer nutzt
   das, um in einem useEffect zu entscheiden, ob storeForecastSnapshot()
   ueberhaupt noetig ist. */
function hasSnapshotForToday(profile, targetDate, now){
  const today = dateToIso(now||new Date());
  return (profile.forecastSnapshots||[]).some(s=>s.createdAt.slice(0,10)===today && s.targetDate===targetDate);
}
function finalizeForecastSnapshot(snapshot, actualEndWeightKg){
  const pointErrorKg = round2(actualEndWeightKg-snapshot.forecastWeightKg);
  const insideForecastRange = actualEndWeightKg>=snapshot.lowerBoundKg && actualEndWeightKg<=snapshot.upperBoundKg;
  return {...snapshot, actualEndWeightKg:round1(actualEndWeightKg), pointErrorKg, insideForecastRange};
}

/* ===== 10. Robustes TATSAECHLICHES Monatsendgewicht fuer Backtesting =====
   Dieselbe robuste Logik wie bei der Kalibrierung: Median im Endfenster,
   ausschliesslich usableForCalibration===true. Ein bestaetigter neuer
   Anker nach einer Nutzungspause darf NICHT als rueckwirkendes Endgewicht
   fuer die Luecke davor herhalten — genau das verhindert die
   usableForCalibration-Pruefung hier automatisch mit. */
function getRobustActualMonthEndWeight({year, month, weightEntries, dailyData, monthlySettings, weightConfirmations, now}){
  const monthEnd = new Date(year, month+1, 0);
  const daysInMonth = monthEnd.getDate();
  const classified = classifyWeightEntries(weightEntries, dailyData, monthlySettings, weightConfirmations, FORECAST_CONFIG, now);
  const usable = classified
    .filter(e=>e.validation.status==="valid" && e.validation.usableForCalibration===true)
    .map(e=>({date:e.date, weight:e.weight}));
  for(let w=FORECAST_CONFIG.endWindowDays; w<=FORECAST_CONFIG.maxExpandedWeightWindowDays; w++){
    const r = getWeightWindowMedian(usable, new Date(year,month,daysInMonth-w+1), monthEnd);
    if(r.count>=FORECAST_CONFIG.minWeightEntriesPerWindow) return {status:"ok", weightKg:r.median};
  }
  return {status:"insufficient_actual_weight_data", weightKg:null};
}

/* ===== 11. Historische Fehlerstatistik aus finalisierten Snapshots ===== */
function updateForecastErrorStatistics(profile){
  const finalized = (profile.forecastSnapshots||[]).filter(s=>isFinite(s.pointErrorKg));
  if(finalized.length===0){
    return {...profile, finalizedSnapshots:0, rangeCoverage:null, averageAbsoluteErrorKg:null, medianAbsoluteErrorKg:null};
  }
  const absErrors = finalized.map(s=>Math.abs(s.pointErrorKg)).sort((a,b)=>a-b);
  const avg = absErrors.reduce((s,v)=>s+v,0)/absErrors.length;
  const mid = Math.floor(absErrors.length/2);
  const median = absErrors.length%2!==0 ? absErrors[mid] : (absErrors[mid-1]+absErrors[mid])/2;
  const inRangeCount = finalized.filter(s=>s.insideForecastRange).length;
  return {
    ...profile,
    finalizedSnapshots: finalized.length,
    rangeCoverage: round4(inRangeCount/finalized.length),
    averageAbsoluteErrorKg: round2(avg),
    medianAbsoluteErrorKg: round2(median)
  };
}

/* ===== 9. Orchestriert das Finalisieren aller faelligen offenen Snapshots =====
   Ein Snapshot ist erst "faellig", wenn sein Zieldatum (Monatsende)
   ECHT VORBEI ist (targetDate < heutiger Tag, NICHT <=) — am Morgen des
   letzten Monatstags selbst darf noch kein Snapshot abgeschlossen werden,
   der Nutzer soll bis Tagesende noch ein korrektes Gewicht eintragen
   koennen. Findet sich danach kein belastbares Endgewicht, wird KEIN
   Fehlerwert erfunden — der Snapshot bekommt stattdessen einen expliziten
   finalizationStatus und bleibt fuer einen spaeteren erneuten Versuch
   offen (kein actualEndWeightKg gesetzt). Reine Funktion — wann sie
   aufgerufen wird, entscheidet ein kontrollierter Effekt im App-Code. */
function finalizePendingSnapshots(profile, now, weightEntries, dailyData, monthlySettings, weightConfirmations){
  const snapshots = (profile.forecastSnapshots||[]);
  const openDue = snapshots.filter(s=>s.actualEndWeightKg==null && startOfDay(parseLocalIsoDate(s.targetDate))<startOfDay(now));
  if(openDue.length===0) return profile;

  const nextSnapshots = snapshots.map(s=>{
    if(s.actualEndWeightKg!=null || startOfDay(parseLocalIsoDate(s.targetDate))>=startOfDay(now)) return s;
    const targetDate = parseLocalIsoDate(s.targetDate);
    const result = getRobustActualMonthEndWeight({
      year:targetDate.getFullYear(), month:targetDate.getMonth(),
      weightEntries, dailyData, monthlySettings, weightConfirmations, now
    });
    if(result.status==="ok") return finalizeForecastSnapshot(s, result.weightKg);
    return {...s, finalizationStatus:"insufficient_actual_weight_data"};
  });

  return updateForecastErrorStatistics({...profile, forecastSnapshots: nextSnapshots});
}

/* ===== Node/CommonJS-Export fuer Tests; im Browser einfach globale Funktionen ===== */
if(typeof module!=="undefined" && module.exports){
  module.exports = {
    FORECAST_CONFIG, round1, round2, round4, monthIdOf, dateToIso, parseLocalIsoDate, dayKey, addMonthsSimple,
    getMonthlyTdee, calculateDailyEnergyBalance, isValidForecastDay, sanitizeBalanceForForecast,
    getRecentValidBalanceDays, debugRecentForecastDays, calculateRobustAverageBalance,
    validateWeightEntry, evaluateWeightEntryContext, classifyWeightEntries,
    weightEntryConfirmationKey, isEntryConfirmed, recordWeightConfirmation, removeWeightConfirmation,
    getLatestValidWeightEntry,
    calculateActualBalanceSinceAnchor, getWeightWindowMedian, getCalibrationStage,
    DEFAULT_CALIBRATION_PROFILE, calculateCurrentDataQuality, calculateForecastUncertainty,
    calculateCurrentMonthForecast, calculateCalibrationQuality, calculateCompletedMonthCalibration,
    updatePersonalEnergyFactor, isTemporaryCalibrationExclusion, runPendingMonthlyCalibrations, evaluateForecastAgainstGoal,
    storeForecastSnapshot, buildForecastSnapshot, hasSnapshotForToday, finalizeForecastSnapshot,
    getRobustActualMonthEndWeight, updateForecastErrorStatistics, finalizePendingSnapshots
  };
}