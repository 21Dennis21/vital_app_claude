const E = require("./forecast-engine.js");

let passed=0, failed=0;
function assertEq(actual, expected, label){
  const ok = actual===expected;
  if(ok){ passed++; } else { failed++; console.error("❌ FAIL:", label, "— erwartet:", expected, "erhalten:", actual); }
}
function assertTrue(cond, label){
  if(cond){ passed++; } else { failed++; console.error("❌ FAIL:", label); }
}

function mkDailyData(entries){
  const out={};
  entries.forEach(e=>{ out[E.dayKey(e.y,e.m,e.d)] = {logged: e.logged!==false, kcalIn: e.kcalIn, kcalBurned: e.kcalBurned||0, weight: e.weight||0}; });
  return out;
}
function daySeries(startDate, count, tdee, dailyBalance){
  const entries=[];
  for(let i=0;i<count;i++){
    const d=new Date(startDate); d.setDate(d.getDate()+i);
    entries.push({y:d.getFullYear(),m:d.getMonth(),d:d.getDate(),kcalIn:tdee+dailyBalance,kcalBurned:0});
  }
  return entries;
}

console.log("========== TEST 1: 85 -> 85,5 kg nach 2 Tagen = valid ==========");
{
  const now=new Date(2026,7,15); const prev=new Date(now); prev.setDate(prev.getDate()-2);
  const context=E.evaluateWeightEntryContext({currentEntry:{date:now,weight:85.5},previousValidEntry:{date:prev,weight:85},dailyData:{},monthlySettings:{},allWeightEntries:[]});
  const r=E.validateWeightEntry({weightKg:85.5,date:now,previousValidWeight:85,previousValidDate:prev,context});
  assertEq(r.status,"valid","Test1");
}

console.log("========== TEST 2: 85 -> 99 kg nach 1 Tag = suspicious, keine Forecast-Nutzung ==========");
{
  const now=new Date(2026,7,15); const prev=new Date(now); prev.setDate(prev.getDate()-1);
  const context=E.evaluateWeightEntryContext({currentEntry:{date:now,weight:99},previousValidEntry:{date:prev,weight:85},dailyData:{},monthlySettings:{},allWeightEntries:[]});
  const r=E.validateWeightEntry({weightKg:99,date:now,previousValidWeight:85,previousValidDate:prev,context});
  assertEq(r.status,"suspicious","Test2 status");
  assertEq(r.usableForForecast,false,"Test2 usableForForecast");
}

console.log("========== TEST 3: 85 -> 99 kg nach 60 Tagen OHNE Ernaehrung/Aktivitaet = usageGapDetected, neuer Anker nach Bestaetigung ==========");
{
  const now=new Date(2026,7,15); const prev=new Date(now); prev.setDate(prev.getDate()-60);
  const context=E.evaluateWeightEntryContext({currentEntry:{date:now,weight:99},previousValidEntry:{date:prev,weight:85},dailyData:{},monthlySettings:{},allWeightEntries:[]});
  assertTrue(context.usageGapDetected,"Test3 usageGapDetected");
  const r=E.validateWeightEntry({weightKg:99,date:now,previousValidWeight:85,previousValidDate:prev,context});
  assertEq(r.status,"suspicious","Test3 status vor Bestaetigung");
  assertEq(r.usageGapDetected,true,"Test3 usageGapDetected im Ergebnis");
  assertEq(r.shouldTreatAsNewAnchor,true,"Test3 shouldTreatAsNewAnchor");
}

console.log("========== TEST 4: 85 -> 99 kg nach 60 Tagen MIT vollstaendigen Ernaehrungseintraegen = measurementGapOnly ==========");
{
  const now=new Date(2026,7,15); const prev=new Date(now); prev.setDate(prev.getDate()-60);
  const dailyEntries=daySeries(prev,60,2700,-100); // jeden Tag dazwischen geloggt
  dailyEntries.shift(); // Ankertag selbst raus (Kontext zaehlt exklusiv der Endpunkte, aber schadet nicht)
  const dailyData=mkDailyData(dailyEntries);
  const monthlySettings={};
  for(let mm=prev.getMonth();;){ // grob alle beteiligten Monate abdecken
    monthlySettings[E.monthIdOf(prev.getFullYear(),mm)]={tdee:2700};
    if(mm===now.getMonth()&&prev.getFullYear()===now.getFullYear())break;
    mm++; if(mm>11){mm=0;}
    if(monthlySettings[E.monthIdOf(now.getFullYear(),now.getMonth())])break;
  }
  monthlySettings[E.monthIdOf(now.getFullYear(),now.getMonth())]={tdee:2700};
  const context=E.evaluateWeightEntryContext({currentEntry:{date:now,weight:99},previousValidEntry:{date:prev,weight:85},dailyData,monthlySettings,allWeightEntries:[]});
  assertEq(context.usageGapDetected,false,"Test4 KEINE Nutzungspause");
  assertTrue(context.measurementGapOnly,"Test4 measurementGapOnly");
}

console.log("========== TEST 5: 85 -> 99 kg nach 60 Tagen ohne Logs, BESTAETIGT = valid, usableForForecast, shouldTreatAsNewAnchor, NICHT fuer Kalibrierung ==========");
{
  const now=new Date(2026,7,15); const prev=new Date(now); prev.setDate(prev.getDate()-60);
  const context=E.evaluateWeightEntryContext({currentEntry:{date:now,weight:99},previousValidEntry:{date:prev,weight:85},dailyData:{},monthlySettings:{},allWeightEntries:[]});
  const r=E.validateWeightEntry({weightKg:99,date:now,previousValidWeight:85,previousValidDate:prev,context,confirmedByUser:true});
  assertEq(r.status,"valid","Test5 status");
  assertEq(r.usableForForecast,true,"Test5 usableForForecast");
  assertEq(r.shouldTreatAsNewAnchor,true,"Test5 shouldTreatAsNewAnchor");
  assertEq(r.usableForCalibration,false,"Test5 NICHT fuer Kalibrierung, auch bestaetigt nicht");
}

console.log("========== TEST 6: 85 -> 99 kg nach 60 Tagen ohne Logs, NICHT bestaetigt = nicht als Anker verwenden ==========");
{
  const now=new Date(2026,7,15);
  const entries=[{date:new Date(2026,5,16),weight:85},{date:now,weight:99}]; // 60 Tage zurueck
  const anchor=E.getLatestValidWeightEntry(entries, now, E.FORECAST_CONFIG, {}, {});
  assertEq(anchor.weight,85,"Test6: Anker faellt auf 85 zurueck, 99 wird NICHT als Anker verwendet");
}

console.log("========== TEST 7: 85 -> 999 kg nach 60 Tagen = invalid wegen harter Grenze ==========");
{
  const now=new Date(2026,7,15); const prev=new Date(now); prev.setDate(prev.getDate()-60);
  const context=E.evaluateWeightEntryContext({currentEntry:{date:now,weight:999},previousValidEntry:{date:prev,weight:85},dailyData:{},monthlySettings:{},allWeightEntries:[]});
  const r=E.validateWeightEntry({weightKg:999,date:now,previousValidWeight:85,previousValidDate:prev,context});
  assertEq(r.status,"invalid","Test7 status");
  assertEq(r.reasons[0],"weight_out_of_range","Test7 reason");
}

console.log("========== TEST 8: Zwei Monate keine App-Nutzung, neuer plausibler Wert -> neuer Prognose-Anker, keine Kalibrierung der Luecke ==========");
{
  const now=new Date(2026,7,15); const prev=new Date(now); prev.setDate(prev.getDate()-60);
  const context=E.evaluateWeightEntryContext({currentEntry:{date:now,weight:80},previousValidEntry:{date:prev,weight:85},dailyData:{},monthlySettings:{},allWeightEntries:[]});
  assertTrue(context.usageGapDetected,"Test8: Nutzungspause erkannt (auch bei nur 5kg Aenderung, wenn 60 Tage + keine Daten)");
}

console.log("========== TEST 9: Zwei Monate keine Gewichtsmessung, ABER vollstaendige Ernaehrungstage -> KEINE Nutzungspause ==========");
{
  const now=new Date(2026,7,15); const prev=new Date(now); prev.setDate(prev.getDate()-60);
  const dailyEntries=daySeries(prev,61,2700,-100);
  const dailyData=mkDailyData(dailyEntries);
  const monthlySettings={};
  ["2026-06","2026-07","2026-08"].forEach(k=>monthlySettings[k]={tdee:2700});
  const context=E.evaluateWeightEntryContext({currentEntry:{date:now,weight:80},previousValidEntry:{date:prev,weight:85},dailyData,monthlySettings,allWeightEntries:[]});
  assertEq(context.usageGapDetected,false,"Test9: keine Nutzungspause trotz 60 Tagen ohne Gewicht, da durchgehend geloggt");
}

console.log("========== TEST 10: Alter persoenlicher Faktor bleibt nach Nutzungspause erhalten, Unsicherheit steigt ==========");
{
  const profile={personalEnergyFactor:0.88, calibratedMonths:4, forecastSnapshots:[]};
  const qualityGood={stage:"good"};
  const withoutGap=E.calculateForecastUncertainty({calibrationProfile:profile,futureDays:10,quality:qualityGood,anchorHadUsageGap:false,validBalanceDaysSinceAnchor:14});
  const withGap=E.calculateForecastUncertainty({calibrationProfile:profile,futureDays:10,quality:qualityGood,anchorHadUsageGap:true,validBalanceDaysSinceAnchor:0});
  assertEq(profile.personalEnergyFactor,0.88,"Test10: Faktor selbst bleibt unangetastet (Funktion aendert das Profil nicht)");
  assertTrue(withGap.finalMarginKg>withoutGap.finalMarginKg,"Test10: Unsicherheit ist nach Nutzungspause groesser");
  assertTrue(withGap.usageGapPenaltyKg>0,"Test10: usageGapPenaltyKg > 0 direkt nach der Pause");
}

console.log("========== TEST 11: Nach Nutzungspause erst 4 neue Log-Tage -> keine reguläre Prognose ==========");
{
  const now=new Date(2026,7,15);
  const monthlySettings={"2026-08":{tdee:2700}};
  const dailyData=mkDailyData(daySeries(new Date(2026,7,12),4,2700,-500)); // nur 4 Tage
  const weightEntries=[{date:now,weight:84}];
  const f=E.calculateCurrentMonthForecast({now,dailyData,monthlySettings,weightEntries});
  assertEq(f.status,"insufficient_data","Test11: keine reguläre Prognose bei nur 4 Tagen");
}

console.log("========== TEST 12: Nach Nutzungspause 10 neue Log-Tage -> vorlaeufige Prognose mit breiterem Bereich ==========");
{
  const now=new Date(2026,7,15);
  const monthlySettings={"2026-08":{tdee:2700}};
  const dailyData=mkDailyData(daySeries(new Date(2026,7,6),10,2700,-500));
  const weightEntries=[{date:now,weight:84}];
  const f=E.calculateCurrentMonthForecast({now,dailyData,monthlySettings,weightEntries});
  assertEq(f.status,"ok","Test12 status ok");
  assertEq(f.confidenceStage,"provisional","Test12: vorlaeufige Prognose bei 10 Tagen");
}

console.log("========== TEST 13: Nach Nutzungspause 14 neue Log-Tage -> normale Prognoselogik ==========");
{
  const now=new Date(2026,7,15);
  const monthlySettings={"2026-08":{tdee:2700}};
  const dailyData=mkDailyData(daySeries(new Date(2026,7,2),14,2700,-500));
  const weightEntries=[{date:now,weight:84}];
  const f=E.calculateCurrentMonthForecast({now,dailyData,monthlySettings,weightEntries});
  assertEq(f.confidenceStage,"regular","Test13: normale Prognoselogik bei 14 Tagen");
}

console.log("========== TEST 14: Kalibrierung eines Monats mit grosser Datenluecke -> Monat ausgeschlossen ==========");
{
  // Juli: Tage 1-3 geloggt (rund um die erste Gewichtsmessung), dann
  // TAGE 4-28 KOMPLETT LEER (echte Nutzungspause, 0% Abdeckung darin),
  // dann Tage 29-31 wieder geloggt (rund um die zweite Messung).
  const dailyEntries=[];
  for(let d=1;d<=3;d++) dailyEntries.push({y:2026,m:6,d,kcalIn:2700-600,kcalBurned:0});
  for(let d=29;d<=31;d++) dailyEntries.push({y:2026,m:6,d,kcalIn:2700-600,kcalBurned:0});
  const dailyData=mkDailyData(dailyEntries);
  const monthlySettings={"2026-07":{tdee:2700}};
  const weightEntries=[
    {date:new Date(2026,6,1),weight:87.0},{date:new Date(2026,6,2),weight:86.9},{date:new Date(2026,6,3),weight:87.1},
    {date:new Date(2026,6,29),weight:84.0},{date:new Date(2026,6,30),weight:83.9},{date:new Date(2026,6,31),weight:83.8},
  ];
  // Mechanismus zuerst isoliert pruefen: erkennt classifyWeightEntries die Luecke ueberhaupt korrekt?
  const classified=E.classifyWeightEntries(weightEntries, dailyData, monthlySettings, null, E.FORECAST_CONFIG);
  const gapEntry=classified.find(e=>e.date.getTime()===new Date(2026,6,29).getTime());
  assertTrue(gapEntry.validation.usageGapDetected===true || gapEntry.validation.status==="valid", "Test14-Vorpruefung: 29.7. wird als Luecken-Ende oder unproblematisch (kleine Aenderung) erkannt");

  const result=E.calculateCompletedMonthCalibration({year:2026,month:6,dailyData,monthlySettings,weightEntries});
  assertEq(result.usedForCalibration,false,"Test14: Monat mit Nutzungspause wird nicht kalibriert");
  assertEq(result.exclusionReason,"usage_gap","Test14: korrekter Ausschlussgrund");
}

console.log("========== TEST 15: Historischer auffaelliger Wert ohne Bestaetigung -> nicht fuer Prognose/Kalibrierung verwenden ==========");
{
  const now=new Date(2026,7,15);
  const entries=[
    {date:new Date(2026,7,1),weight:85},
    {date:new Date(2026,7,5),weight:150}, // historischer Ausreisser, nie bestaetigt
    {date:new Date(2026,7,10),weight:84.5},
  ];
  const classified=E.classifyWeightEntries(entries,{},{},null,E.FORECAST_CONFIG);
  const outlier=classified.find(e=>e.weight===150);
  assertEq(outlier.validation.status,"suspicious","Test15: historischer Ausreisser bleibt suspicious ohne Bestaetigung");
  const anchor=E.getLatestValidWeightEntry(entries, now, E.FORECAST_CONFIG, {}, {});
  assertEq(anchor.weight,84.5,"Test15: Anker ignoriert den unbestaetigten Ausreisser komplett");
}

console.log("\n================================");
console.log(passed+" bestanden, "+failed+" fehlgeschlagen (von "+(passed+failed)+")");
console.log("================================");
if(failed>0) process.exit(1);
