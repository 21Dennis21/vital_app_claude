const E = require("./forecast-engine.js");

let passed=0, failed=0;
function assertEq(actual, expected, label){
  const ok = actual===expected;
  if(ok){ passed++; } else { failed++; console.error("❌ FAIL:", label, "— erwartet:", expected, "erhalten:", actual); }
}
function assertTrue(cond, label){ if(cond){passed++;}else{failed++;console.error("❌ FAIL:",label);} }

function mkDailyData(entries){
  const out={};
  entries.forEach(e=>{ out[E.dayKey(e.y,e.m,e.d)] = {logged:true, kcalIn:e.kcalIn, kcalBurned:e.kcalBurned||0, weight:0}; });
  return out;
}

console.log("========== TEST 8: Kalibrierung erhält weightConfirmations ==========");
{
  const dailyEntries=[]; for(let d=1;d<=27;d++) dailyEntries.push({y:2026,m:6,d,kcalIn:2700-600});
  const dailyData=mkDailyData(dailyEntries);
  const monthlySettings={"2026-07":{tdee:2700}};
  const weightEntries=[
    {date:new Date(2026,6,1),weight:87.0,id:"weight_2026-07-01"},
    {date:new Date(2026,6,2),weight:86.9,id:"weight_2026-07-02"},
    {date:new Date(2026,6,3),weight:87.1,id:"weight_2026-07-03"},
    {date:new Date(2026,6,25),weight:84.9,id:"weight_2026-07-25"},
    {date:new Date(2026,6,26),weight:84.8,id:"weight_2026-07-26"},
    {date:new Date(2026,6,27),weight:84.7,id:"weight_2026-07-27"},
  ];
  // Ohne Bestaetigungen aufrufen -> sollte trotzdem normal kalibrieren (kein Sprung vorhanden)
  const withoutConfirmations = E.calculateCompletedMonthCalibration({year:2026,month:6,dailyData,monthlySettings,weightEntries,weightConfirmations:null});
  const withConfirmations = E.calculateCompletedMonthCalibration({year:2026,month:6,dailyData,monthlySettings,weightEntries,weightConfirmations:[]});
  assertEq(withoutConfirmations.usedForCalibration, true, "Test8: Kalibrierung funktioniert mit weightConfirmations=null");
  assertEq(withConfirmations.usedForCalibration, true, "Test8: Kalibrierung funktioniert mit weightConfirmations=[]");
  assertEq(withoutConfirmations.usedMonthlyFactor, withConfirmations.usedMonthlyFactor, "Test8: identisches Ergebnis unabhaengig vom Bestaetigungs-Parameter-Typ");
}

console.log("========== TEST 9+10: Bestätigter normaler Wert kalibrierbar, bestätigter Nutzungspausen-Anker NICHT ==========");
{
  // NUR Tage 25-31 geloggt — die Luecke zwischen den beiden Gewichts-
  // eintraegen (3.-24. Juli, exklusive der Endpunkte) hat dadurch echte
  // 0% Log-Abdeckung, unabhaengig davon, was die anderen Kalibrierungs-
  // Pruefungen sonst dazu sagen wuerden (der usage_gap-Check laeuft in
  // calculateCompletedMonthCalibration bewusst vor allen anderen).
  const dailyEntries=[];
  for(let d=25;d<=31;d++) dailyEntries.push({y:2026,m:6,d,kcalIn:2700-600});
  const dailyData=mkDailyData(dailyEntries);
  const monthlySettings={"2026-07":{tdee:2700}};
  const gapEntry={date:new Date(2026,6,25),weight:99,id:"weight_2026-07-25"};
  const weightEntries=[
    {date:new Date(2026,6,1),weight:85,id:"weight_2026-07-01"},
    {date:new Date(2026,6,2),weight:84.9,id:"weight_2026-07-02"},
    gapEntry,
    {date:new Date(2026,6,26),weight:98.8,id:"weight_2026-07-26"},
    {date:new Date(2026,6,31),weight:98.5,id:"weight_2026-07-31"},
  ];
  let confirmations = E.recordWeightConfirmation([], gapEntry, "large_change_after_usage_gap", new Date(2026,6,25));
  const result = E.calculateCompletedMonthCalibration({year:2026,month:6,dailyData,monthlySettings,weightEntries,weightConfirmations:confirmations});
  assertEq(result.usedForCalibration, false, "Test9+10: Monat mit Nutzungspause bleibt ausgeschlossen, auch wenn der neue Anker bestaetigt ist");
  assertEq(result.exclusionReason, "usage_gap", "Test9+10: Ausschlussgrund bleibt usage_gap");

  // Isolierter Nachweis: der klassifizierte Eintrag selbst ist "valid" (Anker-tauglich),
  // aber ausdruecklich NICHT usableForCalibration.
  const classified = E.classifyWeightEntries(weightEntries, dailyData, monthlySettings, confirmations, E.FORECAST_CONFIG);
  const classifiedGapEntry = classified.find(e=>e.id==="weight_2026-07-25");
  assertEq(classifiedGapEntry.validation.status, "valid", "Test9+10: bestaetigter Eintrag ist 'valid'");
  assertEq(classifiedGapEntry.validation.usableForForecast, true, "Test9+10: usableForForecast=true (Anker-tauglich)");
  assertEq(classifiedGapEntry.validation.usableForCalibration, false, "Test9+10: usableForCalibration=false (NICHT kalibrierungstauglich)");
}

console.log("========== TEST 11: Live-Prognose und Kalibrierung klassifizieren dieselbe Historie identisch ==========");
{
  const now=new Date(2026,7,15);
  const dailyData=mkDailyData([
    {y:2026,m:7,d:1,kcalIn:2700-500},{y:2026,m:7,d:5,kcalIn:2700-500},{y:2026,m:7,d:10,kcalIn:2700-500}
  ]);
  const monthlySettings={"2026-08":{tdee:2700}};
  const weightEntries=[{date:new Date(2026,7,1),weight:85,id:"weight_2026-08-01"},{date:now,weight:150,id:"weight_2026-08-15"}];
  const confirmations=[];
  // Anker-Suche (Live-Prognose-Pfad) und Kalibrierungs-Klassifizierung
  // (Kalibrierungs-Pfad) muessen fuer denselben Eintrag dasselbe Ergebnis liefern.
  const anchor = E.getLatestValidWeightEntry(weightEntries, now, E.FORECAST_CONFIG, dailyData, monthlySettings, confirmations);
  const classifiedForCalibration = E.classifyWeightEntries(weightEntries, dailyData, monthlySettings, confirmations, E.FORECAST_CONFIG);
  const sameEntryInCalibration = classifiedForCalibration.find(e=>e.weight===150);
  assertEq(anchor.weight, 85, "Test11: Live-Prognose-Anker faellt korrekt auf 85 zurueck (150 unbestaetigt)");
  assertEq(sameEntryInCalibration.validation.status, "suspicious", "Test11: Kalibrierungs-Klassifizierung bewertet denselben Eintrag identisch als suspicious");
}

console.log("========== TEST 16+17: Ein Snapshot pro Tag/Zieldatum, doppelter Aufruf erzeugt keinen zweiten ==========");
{
  const forecast={status:"ok", forecastDate:"2026-08-31", anchorWeightKg:85, averageDailyBalanceKcal:-500, personalEnergyFactor:1.0, forecastWeightKg:83, lowerBoundKg:82, upperBoundKg:84, validBalanceDays:14, calibrationStage:"early", modelVersion:1};
  const now=new Date(2026,7,15);
  let profile=E.DEFAULT_CALIBRATION_PROFILE();
  assertEq(E.hasSnapshotForToday(profile, forecast.forecastDate, now), false, "Test16: anfangs kein Snapshot vorhanden");
  const snap=E.buildForecastSnapshot(forecast, now);
  profile=E.storeForecastSnapshot(profile, snap);
  assertEq(profile.forecastSnapshots.length, 1, "Test16: genau ein Snapshot gespeichert");
  assertEq(E.hasSnapshotForToday(profile, forecast.forecastDate, now), true, "Test16: hasSnapshotForToday erkennt den gespeicherten Snapshot");
  // Zweiter "Render" am selben Tag mit demselben Zieldatum
  if(!E.hasSnapshotForToday(profile, forecast.forecastDate, now)){
    const snap2=E.buildForecastSnapshot(forecast, now);
    profile=E.storeForecastSnapshot(profile, snap2);
  }
  assertEq(profile.forecastSnapshots.length, 1, "Test17: doppelter Aufruf am selben Tag erzeugt KEINEN zweiten Snapshot");
}

console.log("========== TEST 18+19: Monatsende finalisiert mit robustem Endgewicht / kein erfundener Fehler ohne Daten ==========");
{
  const monthEnd=new Date(2026,6,31);
  const dailyData={};
  const monthlySettings={"2026-07":{tdee:2700}};
  const weightEntries=[
    {date:new Date(2026,6,25),weight:83.0,id:"weight_2026-07-25"},
    {date:new Date(2026,6,27),weight:82.9,id:"weight_2026-07-27"},
    {date:new Date(2026,6,29),weight:82.8,id:"weight_2026-07-29"},
  ];
  const result=E.getRobustActualMonthEndWeight({year:2026,month:6,weightEntries,dailyData,monthlySettings,weightConfirmations:[]});
  assertEq(result.status,"ok","Test18: robustes Endgewicht gefunden");
  assertTrue(result.weightKg>82&&result.weightKg<83.1,"Test18: Endgewicht liegt im plausiblen Bereich (Median der 3 Werte)");

  // Ohne jegliche Gewichtsdaten im Endfenster -> kein erfundener Wert
  const resultEmpty=E.getRobustActualMonthEndWeight({year:2026,month:6,weightEntries:[],dailyData,monthlySettings,weightConfirmations:[]});
  assertEq(resultEmpty.status,"insufficient_actual_weight_data","Test19: kein Endgewicht -> expliziter Status statt erfundenem Wert");
  assertEq(resultEmpty.weightKg,null,"Test19: kein erfundener Gewichtswert");
}

console.log("========== TEST 20: Range-Abdeckung wird korrekt aktualisiert ==========");
{
  let profile=E.DEFAULT_CALIBRATION_PROFILE();
  profile={...profile, forecastSnapshots:[
    {createdAt:"2026-07-01T00:00:00.000Z",targetDate:"2026-07-31",forecastWeightKg:85,lowerBoundKg:84,upperBoundKg:86,actualEndWeightKg:85.2,pointErrorKg:0.2,insideForecastRange:true},
    {createdAt:"2026-08-01T00:00:00.000Z",targetDate:"2026-08-31",forecastWeightKg:83,lowerBoundKg:82,upperBoundKg:84,actualEndWeightKg:87,pointErrorKg:4,insideForecastRange:false},
    {createdAt:"2026-09-01T00:00:00.000Z",targetDate:"2026-09-30",forecastWeightKg:81,lowerBoundKg:80,upperBoundKg:82,actualEndWeightKg:81.1,pointErrorKg:0.1,insideForecastRange:true},
  ]};
  const updated=E.updateForecastErrorStatistics(profile);
  assertEq(updated.finalizedSnapshots,3,"Test20: 3 finalisierte Snapshots gezaehlt");
  assertTrue(Math.abs(updated.rangeCoverage-(2/3))<0.001,"Test20: rangeCoverage korrekt (2 von 3 im Bereich = 0.667)");
  assertTrue(Math.abs(updated.averageAbsoluteErrorKg-1.433)<0.01,"Test20: averageAbsoluteErrorKg korrekt ((0.2+4+0.1)/3)");
}

console.log("========== TEST: finalizePendingSnapshots orchestriert korrekt (nur fällige Snapshots, keine erfundenen Werte) ==========");
{
  const now=new Date(2026,7,15); // 15. August — Juli ist vorbei, August noch nicht
  let profile=E.DEFAULT_CALIBRATION_PROFILE();
  profile={...profile, forecastSnapshots:[
    {createdAt:"2026-07-01T00:00:00.000Z",targetDate:"2026-07-31",forecastWeightKg:85,lowerBoundKg:84,upperBoundKg:86}, // fällig, hat Daten
    {createdAt:"2026-08-01T00:00:00.000Z",targetDate:"2026-08-31",forecastWeightKg:83,lowerBoundKg:82,upperBoundKg:84}, // noch NICHT fällig (Monat läuft noch)
  ]};
  const dailyData={};
  const monthlySettings={"2026-07":{tdee:2700},"2026-08":{tdee:2700}};
  const weightEntries=[
    {date:new Date(2026,6,25),weight:85.1,id:"weight_2026-07-25"},
    {date:new Date(2026,6,28),weight:85.0,id:"weight_2026-07-28"},
  ];
  const updated=E.finalizePendingSnapshots(profile, now, weightEntries, dailyData, monthlySettings, []);
  const julySnap=updated.forecastSnapshots.find(s=>s.targetDate==="2026-07-31");
  const augSnap=updated.forecastSnapshots.find(s=>s.targetDate==="2026-08-31");
  assertTrue(julySnap.actualEndWeightKg!=null,"Juli-Snapshot wurde finalisiert (Monat vorbei, Daten vorhanden)");
  assertEq(augSnap.actualEndWeightKg,undefined,"August-Snapshot bleibt offen (Monat noch nicht vorbei)");
}

console.log("\n================================");
console.log(passed+" bestanden, "+failed+" fehlgeschlagen (von "+(passed+failed)+")");
console.log("================================");
if(failed>0) process.exit(1);
