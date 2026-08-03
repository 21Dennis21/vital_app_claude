const E = require("./forecast-engine.js");

let passed=0, failed=0;
function assert(cond, label){
  if(cond){ passed++; }
  else { failed++; console.error("❌ FAIL:", label); }
}
function assertEq(actual, expected, label, tol){
  tol = tol==null ? 1e-6 : tol;
  const ok = typeof expected==="number" ? Math.abs(actual-expected)<=tol : actual===expected;
  if(ok){ passed++; }
  else { failed++; console.error("❌ FAIL:", label, "— erwartet:", expected, "erhalten:", actual); }
}

// ---- Testdaten-Helfer ----
function mkDailyData(entries){
  // entries: [{y,m,d,kcalIn,kcalBurned,logged,weight}]
  const out={};
  entries.forEach(e=>{
    out[E.dayKey(e.y,e.m,e.d)] = {logged: e.logged!==false, kcalIn: e.kcalIn, kcalBurned: e.kcalBurned||0, weight: e.weight||0};
  });
  return out;
}
function mkMonthlySettings(map){
  // map: {"2026-08": tdee}
  const out={};
  Object.keys(map).forEach(k=>{ out[k]={tdee:map[k]}; });
  return out;
}
function mkWeightEntries(list){
  // list: [{y,m,d,weight,savedAt}]
  return list.map(e=>({date:new Date(e.y,e.m,e.d), weight:e.weight, savedAt:e.savedAt||0}));
}
// Erzeugt N aufeinanderfolgende taegliche Eintraege endend bei "today" (inkl.)
function dailySeries(now, count, tdee, dailyBalance, opts){
  opts=opts||{};
  const entries=[];
  for(let i=0;i<count;i++){
    const d=new Date(now); d.setDate(d.getDate()-i);
    const kcalIn = tdee+dailyBalance+(opts.activity||0);
    entries.push({y:d.getFullYear(),m:d.getMonth(),d:d.getDate(),kcalIn,kcalBurned:opts.activity||0,logged:true});
  }
  return entries;
}

const NOW = new Date(2026,7,15); // 15. August 2026
const MID = E.monthIdOf(2026,7); // "2026-08"

console.log("========== TEST 1: Kein Monatsbedarf -> keine Prognose ==========");
{
  const dailyData = mkDailyData(dailySeries(NOW,10,2500,-500));
  const monthlySettings = {}; // absichtlich leer
  const weightEntries = mkWeightEntries([{y:2026,m:7,d:14,weight:84.2}]);
  const r = E.calculateCurrentMonthForecast({now:NOW,dailyData,monthlySettings,weightEntries});
  assertEq(r.status,"insufficient_data","Test1: status");
  assert(r.reasons.includes("no_monthly_tdee"),"Test1: reason");
}

console.log("========== TEST 2: Monatsbedarf vorhanden, keine Log-Tage ==========");
{
  const dailyData = {};
  const monthlySettings = mkMonthlySettings({[MID]:2700});
  const weightEntries = mkWeightEntries([{y:2026,m:7,d:14,weight:84.2}]);
  const r = E.calculateCurrentMonthForecast({now:NOW,dailyData,monthlySettings,weightEntries});
  assertEq(r.status,"insufficient_data","Test2: status");
  assert(r.reasons.includes("not_enough_valid_log_days"),"Test2: reason");
}

console.log("========== TEST 3: Nur 4 gueltige Tage -> keine Prognose ==========");
{
  const dailyData = mkDailyData(dailySeries(NOW,4,2700,-500));
  const monthlySettings = mkMonthlySettings({[MID]:2700});
  const weightEntries = mkWeightEntries([{y:2026,m:7,d:14,weight:84.2}]);
  const r = E.calculateCurrentMonthForecast({now:NOW,dailyData,monthlySettings,weightEntries});
  assertEq(r.status,"insufficient_data","Test3: status");
  assertEq(r.requirements.validDaysAvailable,4,"Test3: validDaysAvailable");
}

console.log("========== TEST 4: 7 gueltige Tage -> vorlaeufige Prognose ==========");
{
  const dailyData = mkDailyData(dailySeries(NOW,7,2700,-500));
  const monthlySettings = mkMonthlySettings({[MID]:2700});
  const weightEntries = mkWeightEntries([{y:2026,m:7,d:15,weight:84.2}]);
  const r = E.calculateCurrentMonthForecast({now:NOW,dailyData,monthlySettings,weightEntries});
  assertEq(r.status,"ok","Test4: status");
  assertEq(r.confidenceStage,"provisional","Test4: confidenceStage");
}

console.log("========== TEST 5: 14 gueltige Tage -> reguläre Prognose ==========");
{
  const dailyData = mkDailyData(dailySeries(NOW,14,2700,-500));
  const monthlySettings = mkMonthlySettings({[MID]:2700});
  const weightEntries = mkWeightEntries([{y:2026,m:7,d:15,weight:84.2}]);
  const r = E.calculateCurrentMonthForecast({now:NOW,dailyData,monthlySettings,weightEntries});
  assertEq(r.status,"ok","Test5: status");
  assertEq(r.confidenceStage,"regular","Test5: confidenceStage");
  assertEq(r.validBalanceDays,14,"Test5: validBalanceDays");
}

console.log("========== TEST 6: Leerer Tag (0 kcal) wird ausgeschlossen ==========");
{
  const entries = dailySeries(NOW,10,2700,-500);
  entries.push({y:2026,m:7,d:5,kcalIn:0,kcalBurned:0,logged:true}); // "leer", aber logged=true, kcalIn=0
  const dailyData = mkDailyData(entries);
  const monthlySettings = mkMonthlySettings({[MID]:2700});
  const day5 = dailyData[E.dayKey(2026,7,5)];
  assertEq(E.isValidForecastDay(day5,2700), false, "Test6: leerer Tag ist ungueltig");
}

console.log("========== TEST 7: Extremes Defizit -2800 kcal wird fuer die Prognose begrenzt ==========");
{
  const tdee=2700;
  const sanitized = E.sanitizeBalanceForForecast(-2800, tdee, E.FORECAST_CONFIG);
  assertEq(sanitized.originalBalance,-2800,"Test7: Original bleibt -2800");
  assert(sanitized.forecastBalance>-2800,"Test7: Prognosewert ist begrenzt (naeher an 0 als Original)");
  assertEq(sanitized.forecastBalance, -Math.min(1500,tdee*0.40), "Test7: exakter Clamp-Wert");
  assert(sanitized.wasClamped,"Test7: wasClamped=true");
}

console.log("========== TEST 8: Extremer Ueberschuss wird begrenzt ==========");
{
  const tdee=2700;
  const sanitized = E.sanitizeBalanceForForecast(3000, tdee, E.FORECAST_CONFIG);
  assertEq(sanitized.forecastBalance, Math.min(1500,tdee*0.40), "Test8: exakter Clamp-Wert (positiv)");
  assert(sanitized.wasClamped,"Test8: wasClamped=true");
}

console.log("========== TEST 9: Ankergewicht heute -> nur zukuenftige Tage prognostiziert ==========");
{
  const dailyData = mkDailyData(dailySeries(NOW,14,2700,-500));
  const monthlySettings = mkMonthlySettings({[MID]:2700});
  const weightEntries = mkWeightEntries([{y:2026,m:7,d:15,weight:84.2}]); // = NOW
  const r = E.calculateCurrentMonthForecast({now:NOW,dailyData,monthlySettings,weightEntries});
  assertEq(r.anchorDate,"2026-08-15","Test9: anchorDate = heute");
  // Bei Anker=heute darf actualBalanceSinceAnchor = 0 sein (Ankertag selbst zaehlt nicht mehr)
  assertEq(r.actualBalanceSinceAnchorKcal,0,"Test9: keine Vergangenheitsbilanz nach dem Anker");
}

console.log("========== TEST 10: Ankergewicht vor 5 Tagen -> tatsaechliche + projizierte Bilanz ==========");
{
  const dailyData = mkDailyData(dailySeries(NOW,14,2700,-500));
  const monthlySettings = mkMonthlySettings({[MID]:2700});
  const weightEntries = mkWeightEntries([{y:2026,m:7,d:10,weight:85.0}]); // 5 Tage vor NOW
  const r = E.calculateCurrentMonthForecast({now:NOW,dailyData,monthlySettings,weightEntries});
  assertEq(r.anchorDate,"2026-08-10","Test10: anchorDate korrekt");
  // 5 Tage seit Anker (11.-15.8) sollten je -500 kcal beitragen = -2500
  assertEq(r.actualBalanceSinceAnchorKcal,-2500,"Test10: tatsaechliche Bilanz seit Anker",5);
}

console.log("========== TEST 11: Ankergewicht aelter als 14 Tage -> keine reguläre Prognose ==========");
{
  const dailyData = mkDailyData(dailySeries(NOW,14,2700,-500));
  const monthlySettings = mkMonthlySettings({[MID]:2700});
  const weightEntries = mkWeightEntries([{y:2026,m:6,d:30,weight:86.0}]); // 16 Tage vor NOW
  const r = E.calculateCurrentMonthForecast({now:NOW,dailyData,monthlySettings,weightEntries});
  assertEq(r.status,"insufficient_data","Test11: status");
  assert(r.reasons.includes("anchor_weight_too_old"),"Test11: reason");
}

console.log("========== TEST 12: Defizit -> prognostiziertes Gewicht sinkt ==========");
{
  const dailyData = mkDailyData(dailySeries(NOW,14,2700,-600));
  const monthlySettings = mkMonthlySettings({[MID]:2700});
  const weightEntries = mkWeightEntries([{y:2026,m:7,d:15,weight:84.2}]);
  const r = E.calculateCurrentMonthForecast({now:NOW,dailyData,monthlySettings,weightEntries});
  assert(r.forecastWeightKg<84.2,"Test12: Prognose liegt unter Ankergewicht");
  assert(r.expectedChangeKg<0,"Test12: erwartete Aenderung negativ");
}

console.log("========== TEST 13: Ueberschuss -> prognostiziertes Gewicht steigt ==========");
{
  const dailyData = mkDailyData(dailySeries(NOW,14,2700,400));
  const monthlySettings = mkMonthlySettings({[MID]:2700});
  const weightEntries = mkWeightEntries([{y:2026,m:7,d:15,weight:84.2}]);
  const r = E.calculateCurrentMonthForecast({now:NOW,dailyData,monthlySettings,weightEntries});
  assert(r.forecastWeightKg>84.2,"Test13: Prognose liegt ueber Ankergewicht");
  assert(r.expectedChangeKg>0,"Test13: erwartete Aenderung positiv");
}

console.log("========== TEST 14: Bilanz null -> Gewicht bleibt ungefaehr gleich ==========");
{
  const dailyData = mkDailyData(dailySeries(NOW,14,2700,0));
  const monthlySettings = mkMonthlySettings({[MID]:2700});
  const weightEntries = mkWeightEntries([{y:2026,m:7,d:15,weight:84.2}]);
  const r = E.calculateCurrentMonthForecast({now:NOW,dailyData,monthlySettings,weightEntries});
  assertEq(r.forecastWeightKg,84.2,"Test14: Prognose ~ Ankergewicht",0.05);
}

console.log("========== TEST 15: Erster Kalibrierungsmonat -> Faktor aendert sich nur langsam ==========");
{
  const profile = E.DEFAULT_CALIBRATION_PROFILE();
  const monthCalibration = {usedForCalibration:true, month:"2026-07", usedMonthlyFactor:0.80, qualityScore:0.80};
  const updated = E.updatePersonalEnergyFactor(profile, monthCalibration);
  assert(updated.personalEnergyFactor>0.80 && updated.personalEnergyFactor<1.0,"Test15: Faktor bewegt sich nur teilweise Richtung 0.8");
  assertEq(updated.calibratedMonths,1,"Test15: calibratedMonths erhoeht");
}

console.log("========== TEST 16: Monatsfaktor 0.8, Qualitaet 0.8 -> exakte Lernraten-Rechnung ==========");
{
  const profile = {...E.DEFAULT_CALIBRATION_PROFILE(), personalEnergyFactor:1.0};
  const monthCalibration = {usedForCalibration:true, month:"2026-07", usedMonthlyFactor:0.80, qualityScore:0.80};
  const updated = E.updatePersonalEnergyFactor(profile, monthCalibration);
  // effektive Lernrate = 0.20*0.80 = 0.16; neuer Faktor = 1.0*0.84+0.8*0.16 = 0.968
  assertEq(updated.personalEnergyFactor,0.968,"Test16: exakter neuer Faktor",0.0005);
}

console.log("========== TEST 17: Theoretische Aenderung unter 0.5kg -> Monat nicht fuer Kalibrierung nutzbar ==========");
{
  // Sehr kleines Defizit ueber den Monat -> theoretische Aenderung < 0.5kg
  const entries=[];
  for(let d=1;d<=28;d++) entries.push({y:2026,m:6,d,kcalIn:2700-20,kcalBurned:0,logged:true}); // -20kcal/Tag * 28 = -560kcal = -0.07kg
  const dailyData = mkDailyData(entries);
  const monthlySettings = mkMonthlySettings({"2026-07":2700});
  const weightEntries = mkWeightEntries([
    {y:2026,m:6,d:2,weight:85.0},{y:2026,m:6,d:4,weight:85.0},
    {y:2026,m:6,d:25,weight:84.9},{y:2026,m:6,d:27,weight:84.9},
  ]);
  const r = E.calculateCompletedMonthCalibration({year:2026,month:6,dailyData,monthlySettings,weightEntries});
  assertEq(r.usedForCalibration,false,"Test17: nicht fuer Kalibrierung genutzt");
  assertEq(r.exclusionReason,"theoretical_change_too_small","Test17: Grund korrekt");
}

console.log("========== TEST 18: Theorie und Realitaet mit unterschiedlichem Vorzeichen -> inkonsistent ==========");
{
  // Theoretisch klares Defizit, aber Gewicht steigt real -> direction_mismatch
  const entries=[];
  for(let d=1;d<=28;d++) entries.push({y:2026,m:6,d,kcalIn:2700-600,kcalBurned:0,logged:true});
  const dailyData = mkDailyData(entries);
  const monthlySettings = mkMonthlySettings({"2026-07":2700});
  const weightEntries = mkWeightEntries([
    {y:2026,m:6,d:2,weight:84.0},{y:2026,m:6,d:4,weight:84.0},
    {y:2026,m:6,d:25,weight:85.5},{y:2026,m:6,d:27,weight:85.5}, // real gestiegen trotz theoretischem Defizit
  ]);
  const r = E.calculateCompletedMonthCalibration({year:2026,month:6,dailyData,monthlySettings,weightEntries});
  assertEq(r.usedForCalibration,false,"Test18: nicht fuer Kalibrierung genutzt");
  assertEq(r.exclusionReason,"direction_mismatch","Test18: Grund korrekt");
}

console.log("========== TEST 19: Faktor ausserhalb 0.6-1.4 wird begrenzt ==========");
{
  const profile = {...E.DEFAULT_CALIBRATION_PROFILE(), personalEnergyFactor:1.35};
  const monthCalibration = {usedForCalibration:true, month:"2026-07", usedMonthlyFactor:1.40, qualityScore:1.0};
  const updated = E.updatePersonalEnergyFactor(profile, monthCalibration);
  assert(updated.personalEnergyFactor<=E.FORECAST_CONFIG.maxPersonalFactor,"Test19: Faktor bleibt innerhalb der Grenze");
}

console.log("========== TEST 20: Start-/Endgewicht mit starkem Ausreisser -> Median schuetzt ==========");
{
  const startWindow = [{y:2026,m:6,d:1,weight:85.0},{y:2026,m:6,d:2,weight:120.0},{y:2026,m:6,d:3,weight:84.8}]; // 120 = Ausreisser/Fehleingabe
  const entries = E.getWeightWindowMedian(startWindow.map(e=>({date:new Date(e.y,e.m,e.d),weight:e.weight})), new Date(2026,6,1), new Date(2026,6,7));
  assertEq(entries.median,85.0,"Test20: Median ignoriert den Ausreisser weitgehend",1.0);
  assert(entries.median<100,"Test20: Median liegt nicht in der Naehe des Ausreissers");
}

console.log("========== TEST 21: Kalibrierung wird zweimal aufgerufen -> Monat fliesst nur einmal ein ==========");
{
  const entries=[];
  for(let d=1;d<=28;d++) entries.push({y:2026,m:6,d,kcalIn:2700-600,kcalBurned:0,logged:true});
  const dailyData = mkDailyData(entries);
  const monthlySettings = mkMonthlySettings({"2026-07":2700});
  const weightEntries = mkWeightEntries([
    {y:2026,m:6,d:2,weight:86.0},{y:2026,m:6,d:4,weight:86.0},
    {y:2026,m:6,d:25,weight:84.0},{y:2026,m:6,d:27,weight:84.0},
  ]);
  let profile = E.DEFAULT_CALIBRATION_PROFILE();
  const AUG1 = new Date(2026,7,1);
  profile = E.runPendingMonthlyCalibrations(AUG1, dailyData, monthlySettings, weightEntries, null, profile);
  const monthsAfterFirst = profile.calibratedMonths;
  profile = E.runPendingMonthlyCalibrations(AUG1, dailyData, monthlySettings, weightEntries, null, profile); // erneut aufgerufen
  assertEq(profile.calibratedMonths, monthsAfterFirst, "Test21: calibratedMonths bleibt gleich beim zweiten Aufruf (idempotent)");
  assertEq(profile.processedMonthIds.filter(id=>id==="2026-07").length,1,"Test21: Monat nur einmal in processedMonthIds");
}

console.log("========== TEST 22: Historische Fehler innerhalb des Prognosebereichs -> insideForecastRange korrekt ==========");
{
  const snapshot = {createdAt:"2026-07-15T00:00:00.000Z", targetDate:"2026-07-31", forecastWeightKg:83.0, lowerBoundKg:82.0, upperBoundKg:84.0};
  const finalized = E.finalizeForecastSnapshot(snapshot, 83.5);
  assertEq(finalized.insideForecastRange,true,"Test22: 83.5 liegt innerhalb [82,84]");
  const finalized2 = E.finalizeForecastSnapshot(snapshot, 85.0);
  assertEq(finalized2.insideForecastRange,false,"Test22b: 85.0 liegt ausserhalb [82,84]");
}

console.log("========== TEST 23: Ziel Abnehmen ==========");
{
  const forecast = {status:"ok", anchorWeightKg:85, forecastWeightKg:79.5, anchorDate:"2026-08-01", forecastDate:"2026-08-31", expectedChangeKg:-5.5};
  const goal = {targetWeightKg:80.0};
  const evalR = E.evaluateForecastAgainstGoal({forecast, goal});
  assertEq(evalR.direction,"lose","Test23: Richtung automatisch als 'lose' erkannt");
  assertEq(evalR.goalReached,true,"Test23: Ziel erreicht (79.5<=80.0)");
  const forecast2 = {...forecast, forecastWeightKg:81.0, expectedChangeKg:-4.0};
  const evalR2 = E.evaluateForecastAgainstGoal({forecast:forecast2, goal});
  assertEq(evalR2.goalReached,false,"Test23b: Ziel nicht erreicht (81.0>80.0)");
}

console.log("========== TEST 24: Ziel Zunehmen ==========");
{
  const forecast = {status:"ok", anchorWeightKg:70, forecastWeightKg:76.0, anchorDate:"2026-08-01", forecastDate:"2026-08-31", expectedChangeKg:6.0};
  const goal = {targetWeightKg:75.0};
  const evalR = E.evaluateForecastAgainstGoal({forecast, goal});
  assertEq(evalR.direction,"gain","Test24: Richtung automatisch als 'gain' erkannt");
  assertEq(evalR.goalReached,true,"Test24: Ziel erreicht (76.0>=75.0)");
  const forecast2 = {...forecast, forecastWeightKg:74.0, expectedChangeKg:4.0};
  const evalR2 = E.evaluateForecastAgainstGoal({forecast:forecast2, goal});
  assertEq(evalR2.goalReached,false,"Test24b: Ziel nicht erreicht (74.0<75.0)");
}

console.log("========== TEST 25: Ziel Halten (Toleranzbereich) ==========");
{
  const goal = {targetWeightKg:80.0};
  const fWithin = {status:"ok", anchorWeightKg:80.1, forecastWeightKg:80.8, anchorDate:"2026-08-01", forecastDate:"2026-08-31", expectedChangeKg:0.7};
  const within = E.evaluateForecastAgainstGoal({forecast:fWithin, goal});
  assertEq(within.direction,"maintain","Test25: Richtung automatisch als 'maintain' erkannt");
  assertEq(within.goalReached,true,"Test25: 80.8 innerhalb ±1.0kg von 80.0");
  const fOutside = {status:"ok", anchorWeightKg:80.1, forecastWeightKg:81.5, anchorDate:"2026-08-01", forecastDate:"2026-08-31", expectedChangeKg:1.4};
  const outside = E.evaluateForecastAgainstGoal({forecast:fOutside, goal});
  assertEq(outside.goalReached,false,"Test25b: 81.5 ausserhalb ±1.0kg von 80.0");
}

console.log("========== TEST 26: Monatswechsel in lokaler Zeitzone -> richtiger Monat/Bedarf ==========");
{
  const dailyData = mkDailyData(dailySeries(new Date(2026,7,1),14,2700,-500)); // Log-Tage enden am 1.8., reichen zurueck in den Juli
  const monthlySettings = mkMonthlySettings({"2026-07":2600, "2026-08":2700});
  const weightEntries = mkWeightEntries([{y:2026,m:7,d:1,weight:84.2}]);
  const r = E.calculateCurrentMonthForecast({now:new Date(2026,7,1),dailyData,monthlySettings,weightEntries});
  // getRecentValidBalanceDays ist bewusst auf den LAUFENDEN Kalendermonat begrenzt (Abschnitt 6) ->
  // am 1. August sollte nur der 1.August selbst als gueltiger Tag zaehlen.
  assertEq(r.status,"insufficient_data","Test26: am ersten Tag des Monats reicht 1 Tag nicht fuer 7 noetige");
}

console.log("========== TEST 27: Mehrere Gewichtseintraege am selben Tag -> letzter gueltiger wird verwendet ==========");
{
  const weightEntries = mkWeightEntries([
    {y:2026,m:7,d:10,weight:85.0,savedAt:1000},
    {y:2026,m:7,d:10,weight:84.7,savedAt:2000}, // spaeter gespeichert am selben Tag
  ]);
  const anchor = E.getLatestValidWeightEntry(weightEntries, new Date(2026,7,15));
  assertEq(anchor.weight,84.7,"Test27: zuletzt gespeicherter Eintrag desselben Tages gewinnt");
}

console.log("========== TEST 28: Nur eine Gewichtsmessung im Startfenster -> Fenster erweitert oder Monat ausgeschlossen ==========");
{
  const entries=[];
  for(let d=1;d<=28;d++) entries.push({y:2026,m:6,d,kcalIn:2700-600,kcalBurned:0,logged:true});
  const dailyData = mkDailyData(entries);
  const monthlySettings = mkMonthlySettings({"2026-07":2700});
  const weightEntries = mkWeightEntries([
    {y:2026,m:6,d:2,weight:86.0}, // nur 1 Eintrag in den ersten 7 Tagen
    {y:2026,m:6,d:9,weight:85.8}, // erst im erweiterten Fenster (Tag 8-10) der 2. Eintrag
    {y:2026,m:6,d:25,weight:84.0},{y:2026,m:6,d:27,weight:84.0},
  ]);
  const r = E.calculateCompletedMonthCalibration({year:2026,month:6,dailyData,monthlySettings,weightEntries});
  assertEq(r.usedForCalibration,true,"Test28: Fenster wurde erfolgreich erweitert, Monat nutzbar");
}

console.log("========== TEST 29: Alte/kaputte Profilversion -> sicherer Rueckfall ==========");
{
  const brokenProfile = {version:0, personalEnergyFactor:"invalid"};
  const safeFactor = (typeof brokenProfile.personalEnergyFactor==="number" && isFinite(brokenProfile.personalEnergyFactor))
    ? brokenProfile.personalEnergyFactor : E.DEFAULT_CALIBRATION_PROFILE().personalEnergyFactor;
  assertEq(safeFactor,1.0,"Test29: Rueckfall auf Standard-Faktor bei ungueltigem Profil");
}

console.log("========== TEST 30: Heute = letzter Tag des Monats -> keine doppelte Zukunftsberechnung ==========");
{
  const lastDay = new Date(2026,7,31); // 31. August (letzter Tag)
  const dailyData = mkDailyData(dailySeries(lastDay,14,2700,-500));
  const monthlySettings = mkMonthlySettings({[MID]:2700});
  const weightEntries = mkWeightEntries([{y:2026,m:7,d:31,weight:84.2}]);
  const r = E.calculateCurrentMonthForecast({now:lastDay,dailyData,monthlySettings,weightEntries});
  assertEq(r.status,"ok","Test30: Prognose funktioniert noch am letzten Tag");
  assertEq(r.projectedFutureBalanceKcal,0,"Test30: keine zukuenftigen Tage mehr, projizierte Bilanz = 0");
}

console.log("\n================================");
console.log(passed+" bestanden, "+failed+" fehlgeschlagen (von "+(passed+failed)+")");
console.log("================================");
if(failed>0) process.exit(1);
