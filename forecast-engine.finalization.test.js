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

const NOW = new Date(2026,7,15); // 15. August 2026

console.log("========== PUNKT 1: Keine zukünftigen Gewichtseinträge ==========");
{
  const future = new Date(2026,7,20); // 5 Tage in der Zukunft
  const r = E.validateWeightEntry({weightKg:85, date:future, previousValidWeight:null, previousValidDate:null, now:NOW});
  assertEq(r.status,"invalid","Zukünftiges Datum -> invalid");
  assertEq(r.reasons[0],"future_weight_date_not_allowed","korrekter Reason-Code");
  assertEq(r.usableForForecast,false,"nicht für Forecast nutzbar");
  assertEq(r.usableForCalibration,false,"nicht für Kalibrierung nutzbar");

  // Heute selbst ist erlaubt (keine "Zukunft")
  const rToday = E.validateWeightEntry({weightKg:85, date:NOW, previousValidWeight:null, previousValidDate:null, now:NOW});
  assertEq(rToday.status,"valid","Heutiges Datum bleibt erlaubt");

  // Über classifyWeightEntries / getLatestValidWeightEntry: zukünftiger Eintrag
  // wird komplett ignoriert, Anker fällt auf den letzten echten Wert zurück
  const entries=[{date:new Date(2026,7,10),weight:85},{date:future,weight:80}];
  const anchor = E.getLatestValidWeightEntry(entries, NOW, E.FORECAST_CONFIG, {}, {});
  assertEq(anchor.weight,85,"Zukünftiger Eintrag wird nie als Anker verwendet");
}

console.log("========== PUNKT 2: Nutzungspause-Penalty nutzt echte Tage NACH dem Anker ==========");
{
  const profile={personalEnergyFactor:1.0, calibratedMonths:0, forecastSnapshots:[]};
  const qualityGood={stage:"good"};
  // 3 Tage nach dem Anker geloggt (validBalanceDaysSinceAnchor=3) sollte
  // eine GRÖSSERE Unsicherheit ergeben als wenn 10 Tage nach dem Anker
  // geloggt wurden — unabhängig davon, wie viele Tage insgesamt im Monat
  // (recentDays) vorliegen.
  const withFewDaysSinceAnchor = E.calculateForecastUncertainty({calibrationProfile:profile,futureDays:10,quality:qualityGood,anchorHadUsageGap:true,validBalanceDaysSinceAnchor:3});
  const withManyDaysSinceAnchor = E.calculateForecastUncertainty({calibrationProfile:profile,futureDays:10,quality:qualityGood,anchorHadUsageGap:true,validBalanceDaysSinceAnchor:14});
  assertTrue(withFewDaysSinceAnchor.usageGapPenaltyKg > withManyDaysSinceAnchor.usageGapPenaltyKg, "Wenige Tage seit Anker -> höherer Zuschlag als viele Tage seit Anker");
  assertEq(withManyDaysSinceAnchor.usageGapPenaltyKg, 0, "14 Tage seit Anker (= Decay-Grenze) -> Zuschlag vollständig abgebaut");
}

console.log("========== PUNKT 3: Snapshot wird erst NACH Ablauf des Zieltags finalisiert ==========");
{
  const targetDate="2026-08-31";
  const morningOfLastDay = new Date(2026,7,31); // Vormittag des 31.8. selbst
  const dayAfter = new Date(2026,8,1); // 1.9., Zieltag ist vorbei

  let profile={forecastSnapshots:[{createdAt:"2026-08-01T00:00:00.000Z",targetDate,forecastWeightKg:83,lowerBoundKg:82,upperBoundKg:84}]};
  const weightEntries=[{date:new Date(2026,7,28),weight:82.9},{date:new Date(2026,7,30),weight:82.8}];
  const dailyData={}; const monthlySettings={"2026-08":{tdee:2700}};

  const resultOnLastDay = E.finalizePendingSnapshots(profile, morningOfLastDay, weightEntries, dailyData, monthlySettings, []);
  assertEq(resultOnLastDay.forecastSnapshots[0].actualEndWeightKg, undefined, "Am 31.8. selbst NOCH NICHT finalisiert");

  const resultDayAfter = E.finalizePendingSnapshots(profile, dayAfter, weightEntries, dailyData, monthlySettings, []);
  assertTrue(resultDayAfter.forecastSnapshots[0].actualEndWeightKg!=null, "Am 1.9. (Zieltag vorbei) WIRD finalisiert");
}

console.log("========== PUNKT 4: parseLocalIsoDate parst ohne UTC-Verschiebung ==========");
{
  const d = E.parseLocalIsoDate("2026-08-31");
  assertEq(d.getFullYear(),2026,"Jahr korrekt");
  assertEq(d.getMonth(),7,"Monat korrekt (0-indiziert = August)");
  assertEq(d.getDate(),31,"Tag korrekt — insbesondere KEINE Verschiebung auf den 30. durch UTC-Interpretation");
  // Gegenprobe: new Date("YYYY-MM-DD") koennte in negativen UTC-Offsets
  // (z.B. USA) auf den Vortag zurueckfallen -- parseLocalIsoDate niemals.
  const d2 = E.parseLocalIsoDate("2026-01-01");
  assertEq(d2.getDate(),1,"Jahreswechsel-Datum korrekt geparst");
}

console.log("========== PUNKT 6: Leerzustand-Reason-Codes sind fachlich korrekt ==========");
{
  // no_monthly_tdee
  let r = E.calculateCurrentMonthForecast({now:NOW, dailyData:{}, monthlySettings:{}, weightEntries:[]});
  assertEq(r.reasons[0],"no_monthly_tdee","kein Monatsbedarf -> korrekter Reason");

  // missing_anchor_weight
  const dailyData2 = mkDailyData(Array.from({length:14},(_,i)=>({y:2026,m:7,d:i+1,kcalIn:2700-500})));
  r = E.calculateCurrentMonthForecast({now:NOW, dailyData:dailyData2, monthlySettings:{"2026-08":{tdee:2700}}, weightEntries:[]});
  assertEq(r.reasons[0],"missing_anchor_weight","kein Gewicht -> korrekter Reason");

  // Ein altes Ankergewicht (26 Tage) wird im einfachen Modell weiterhin verwendet — keine Alters-Grenze mehr.
  const oldWeight=[{date:new Date(2026,6,20),weight:85}]; // 26 Tage alt
  r = E.calculateCurrentMonthForecast({now:NOW, dailyData:dailyData2, monthlySettings:{"2026-08":{tdee:2700}}, weightEntries:oldWeight});
  assertEq(r.status,"ok","altes Gewicht wird weiterhin als Anker akzeptiert");
  assertEq(r.anchorWeightKg,85,"altes Gewicht wird tatsaechlich als Ankerwert uebernommen");

  // not_enough_valid_log_days (nur bei GAR KEINEN gueltigen Tagen)
  const fewDays = mkDailyData([{y:2026,m:7,d:14,kcalIn:2200},{y:2026,m:7,d:15,kcalIn:2200}]);
  r = E.calculateCurrentMonthForecast({now:NOW, dailyData:fewDays, monthlySettings:{"2026-08":{tdee:2700}}, weightEntries:[{date:NOW,weight:85}]});
  assertEq(r.status,"ok","2 gueltige Tage reichen im einfachen Modell fuer eine Prognose");
  assertEq(r.validBalanceDays,2,"Anzahl vorhandener Tage korrekt gezaehlt");

  const noDays = mkDailyData([]);
  r = E.calculateCurrentMonthForecast({now:NOW, dailyData:noDays, monthlySettings:{"2026-08":{tdee:2700}}, weightEntries:[{date:NOW,weight:85}]});
  assertEq(r.reasons[0],"not_enough_valid_log_days","gar keine gueltigen Tage -> korrekter Reason");
  assertEq(r.requirements.validDaysAvailable,0,"Anzahl vorhandener Tage korrekt für UI-Text nutzbar");
}

console.log("========== PUNKT 7+8: Ausstehende Monate — alle prüfen, temporär vs. dauerhaft ==========");
{
  // Zwei aufeinanderfolgende Monate mit Daten, BEIDE noch nie kalibriert.
  // Ein einziger Lauf (aktuell: September) soll BEIDE prüfen, nicht nur Juli.
  const dailyEntries=[];
  for(let d=1;d<=27;d++){ dailyEntries.push({y:2026,m:6,d,kcalIn:2700-600}); dailyEntries.push({y:2026,m:7,d,kcalIn:2700-600}); }
  const dailyData=mkDailyData(dailyEntries);
  const monthlySettings={"2026-07":{tdee:2700},"2026-08":{tdee:2700}};
  const weightEntries=[
    {date:new Date(2026,6,1),weight:90},{date:new Date(2026,6,2),weight:89.9},{date:new Date(2026,6,3),weight:90.1},
    {date:new Date(2026,6,26),weight:87},{date:new Date(2026,6,27),weight:86.9},
    {date:new Date(2026,7,1),weight:86.8},{date:new Date(2026,7,2),weight:86.9},
    {date:new Date(2026,7,26),weight:84},{date:new Date(2026,7,27),weight:83.9},
  ];
  const SEPT1 = new Date(2026,8,1);
  let profile = E.DEFAULT_CALIBRATION_PROFILE();
  profile = E.runPendingMonthlyCalibrations(SEPT1, dailyData, monthlySettings, weightEntries, [], profile);
  assertTrue(profile.processedMonthIds.includes("2026-07"), "Juli wurde in EINEM Lauf mitverarbeitet");
  assertTrue(profile.processedMonthIds.includes("2026-08"), "August wurde im SELBEN Lauf mitverarbeitet (nicht nur der 'letzte' Monat)");
  assertEq(profile.calibratedMonths,2,"Beide Monate sind in calibratedMonths eingeflossen");

  // Erneuter Aufruf am selben Tag -> keine doppelte Verarbeitung
  const before=profile.calibratedMonths;
  profile = E.runPendingMonthlyCalibrations(SEPT1, dailyData, monthlySettings, weightEntries, [], profile);
  assertEq(profile.calibratedMonths, before, "Idempotenz bleibt erhalten — kein Monat fließt zweimal ein");

  // Temporärer Ausschluss: ein Monat mit zu wenig Log-Tagen darf NICHT in
  // processedMonthIds landen und muss beim nächsten Lauf erneut geprüft werden.
  const sparseData = mkDailyData([{y:2026,m:6,d:1,kcalIn:2700-600}]); // nur 1 Tag
  const sparseSettings={"2026-07":{tdee:2700}};
  let profile2 = E.DEFAULT_CALIBRATION_PROFILE();
  profile2 = E.runPendingMonthlyCalibrations(new Date(2026,7,1), sparseData, sparseSettings, [], [], profile2);
  assertTrue(!profile2.processedMonthIds.includes("2026-07"), "Monat mit zu wenig Daten bleibt NICHT dauerhaft ausgeschlossen");
  assertEq(profile2.monthlyHistory[0].exclusionReason,"not_enough_log_days","korrekter temporärer Ausschlussgrund");

  // Trägt der Nutzer spaeter genug Daten nach, wird der Monat beim naechsten
  // Lauf erneut geprueft und kann dann erfolgreich kalibrieren.
  const fullData = mkDailyData(Array.from({length:27},(_,i)=>({y:2026,m:6,d:i+1,kcalIn:2700-600})));
  const fullWeights=[
    {date:new Date(2026,6,1),weight:90},{date:new Date(2026,6,2),weight:89.9},{date:new Date(2026,6,3),weight:90.1},
    {date:new Date(2026,6,26),weight:87},{date:new Date(2026,6,27),weight:86.9},
  ];
  profile2 = E.runPendingMonthlyCalibrations(new Date(2026,7,1), fullData, sparseSettings, fullWeights, [], profile2);
  assertTrue(profile2.processedMonthIds.includes("2026-07"), "Nach Datennachtrag wird der Monat beim nächsten Lauf erfolgreich verarbeitet");
  assertEq(profile2.calibratedMonths,1,"Monat ist jetzt tatsächlich kalibriert");

  // Direkter Test der Klassifizierungsfunktion
  assertEq(E.isTemporaryCalibrationExclusion("not_enough_log_days"),true,"not_enough_log_days ist temporär");
  assertEq(E.isTemporaryCalibrationExclusion("coverage_too_low"),true,"coverage_too_low ist temporär");
  assertEq(E.isTemporaryCalibrationExclusion("not_enough_weight_entries"),true,"not_enough_weight_entries ist temporär");
  assertEq(E.isTemporaryCalibrationExclusion("insufficient_weight_window_data"),true,"insufficient_weight_window_data ist temporär");
  assertEq(E.isTemporaryCalibrationExclusion("usage_gap"),false,"usage_gap ist dauerhaft");
  assertEq(E.isTemporaryCalibrationExclusion("direction_mismatch"),false,"direction_mismatch ist dauerhaft");
}

console.log("\n================================");
console.log(passed+" bestanden, "+failed+" fehlgeschlagen (von "+(passed+failed)+")");
console.log("================================");
if(failed>0) process.exit(1);
