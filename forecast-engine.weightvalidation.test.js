const E = require("./forecast-engine.js");

let passed=0, failed=0;
function assertEq(actual, expected, label){
  const ok = actual===expected;
  if(ok){ passed++; } else { failed++; console.error("❌ FAIL:", label, "— erwartet:", expected, "erhalten:", actual); }
}

console.log("========== Akzeptanztests: validateWeightEntry ==========\n");

function v(weightKg, prevW, daysAgo){
  const now=new Date(2026,7,15);
  const prevDate = prevW==null ? null : new Date(now.getTime()-daysAgo*86400000);
  return E.validateWeightEntry({weightKg, date:now, previousValidWeight:prevW, previousValidDate:prevDate});
}

console.log("✓ 85 → 85,4 kg = valid");
assertEq(v(85.4, 85, 1).status, "valid", "85->85.4 (1 Tag)");

console.log("✓ 85 → 84,2 kg = valid");
assertEq(v(84.2, 85, 1).status, "valid", "85->84.2 (1 Tag)");

console.log("✓ 99 → 999 kg = invalid");
assertEq(v(999, 99, 1).status, "invalid", "99->999");

console.log("✓ 85 → 8 kg = invalid");
assertEq(v(8, 85, 1).status, "invalid", "85->8");

console.log("✓ 85 → 150 kg am naechsten Tag = suspicious");
assertEq(v(150, 85, 1).status, "suspicious", "85->150 (1 Tag)");

console.log("✓ 85 → 92 kg nach 3 Wochen = valid");
assertEq(v(92, 85, 21).status, "suspicious"===undefined?"x":E.validateWeightEntry({weightKg:92,date:new Date(2026,7,15),previousValidWeight:85,previousValidDate:new Date(2026,6,25)}).status, "placeholder");
// sauberer, expliziter Test:
{
  const now=new Date(2026,7,15);
  const prevDate=new Date(now); prevDate.setDate(prevDate.getDate()-21);
  const r=E.validateWeightEntry({weightKg:92,date:now,previousValidWeight:85,previousValidDate:prevDate});
  assertEq(r.status,"valid","85->92 nach 21 Tagen");
}

console.log("\n========== Zusaetzliche Grenzfaelle der Staffelung ==========\n");
{
  // Exakt an der Grenze: 3kg nach genau 3 Tagen -> noch valid (<=)
  const now=new Date(2026,7,15); const prev=new Date(now); prev.setDate(prev.getDate()-3);
  const r=E.validateWeightEntry({weightKg:88,date:now,previousValidWeight:85,previousValidDate:prev});
  assertEq(r.status,"valid","exakt 3kg nach 3 Tagen (Grenzwert inklusive)");
}
{
  // 3.1kg nach 3 Tagen -> suspicious
  const now=new Date(2026,7,15); const prev=new Date(now); prev.setDate(prev.getDate()-3);
  const r=E.validateWeightEntry({weightKg:88.1,date:now,previousValidWeight:85,previousValidDate:prev});
  assertEq(r.status,"suspicious","3.1kg nach 3 Tagen (knapp ueber der Grenze)");
}
{
  // 6kg nach 10 Tagen (4-14 Tage Bereich, Grenze 6) -> valid
  const now=new Date(2026,7,15); const prev=new Date(now); prev.setDate(prev.getDate()-10);
  const r=E.validateWeightEntry({weightKg:91,date:now,previousValidWeight:85,previousValidDate:prev});
  assertEq(r.status,"valid","6kg nach 10 Tagen");
}
{
  // 10kg nach 30 Tagen (15+, Grenze 10) -> valid; 10.5kg -> suspicious
  const now=new Date(2026,7,15); const prev=new Date(now); prev.setDate(prev.getDate()-30);
  const r1=E.validateWeightEntry({weightKg:95,date:now,previousValidWeight:85,previousValidDate:prev});
  assertEq(r1.status,"valid","10kg nach 30 Tagen (Grenzwert inklusive)");
  const r2=E.validateWeightEntry({weightKg:95.6,date:now,previousValidWeight:85,previousValidDate:prev});
  assertEq(r2.status,"suspicious","10.6kg nach 30 Tagen");
}

console.log("\n========== Akzeptanztest: Suspicious-Gewicht wird NICHT als Anker verwendet ==========\n");
{
  const now=new Date(2026,7,15);
  const entries=[
    {date:new Date(2026,7,10),weight:85.0},
    {date:now,weight:150.0}, // Tippfehler, heute eingetragen
  ];
  const anchor=E.getLatestValidWeightEntry(entries, now);
  assertEq(anchor.weight,85.0,"Anker faellt auf letzten gueltigen Wert (85.0) zurueck, NICHT 150.0");
  assertEq(E.dateToIso(anchor.date),"2026-08-10","Anker-Datum entsprechend 10.8.");
}

console.log("\n========== Akzeptanztest: Suspicious-Gewicht beeinflusst KEINE Kalibrierung ==========\n");
{
  function mkDailyData(entries){const out={};entries.forEach(e=>{out[E.dayKey(e.y,e.m,e.d)]={logged:true,kcalIn:e.kcalIn,kcalBurned:0,weight:0};});return out;}
  const dailyEntries=[];
  for(let d=1;d<=27;d++) dailyEntries.push({y:2026,m:6,d,kcalIn:2700-600});
  const dailyData=mkDailyData(dailyEntries);
  const monthlySettings={"2026-07":{tdee:2700}};

  // Saubere Start-/Endwerte, ABER ein Tippfehler (250kg) mitten im Endfenster
  const weightEntries=[
    {date:new Date(2026,6,1),weight:87.0},{date:new Date(2026,6,2),weight:86.9},{date:new Date(2026,6,3),weight:87.1},
    {date:new Date(2026,6,25),weight:84.9},
    {date:new Date(2026,6,26),weight:250.0}, // Tippfehler!
    {date:new Date(2026,6,27),weight:84.7},
  ];
  const result=E.calculateCompletedMonthCalibration({year:2026,month:6,dailyData,monthlySettings,weightEntries});
  console.log("Endgewicht-Median trotz 250kg-Tippfehler im Fenster:",result.endWeightMedianKg,"kg");
  assertEq(result.endWeightMedianKg<90, true, "Median bleibt im plausiblen Bereich, 250kg beeinflusst ihn nicht");
  assertEq(result.usedForCalibration, true, "Monat trotzdem kalibrierbar (Tippfehler wurde einfach uebersprungen)");
}

console.log("\n========== Akzeptanztest: Invalid-Gewicht wird vollstaendig ignoriert ==========\n");
{
  const now=new Date(2026,7,15);
  const entries=[
    {date:new Date(2026,7,10),weight:85.0},
    {date:now,weight:-5}, // technisch unmoeglich
  ];
  const classified=E.classifyWeightEntries(entries);
  assertEq(classified[1].validation.status,"invalid","negativer Wert ist invalid");
  const anchor=E.getLatestValidWeightEntry(entries, now);
  assertEq(anchor.weight,85.0,"Anker ignoriert den invaliden Wert komplett, faellt auf 85.0 zurueck");
}

console.log("\n========== Rueckgabeformat-Check ==========\n");
{
  const r=E.validateWeightEntry({weightKg:150,date:new Date(2026,7,15),previousValidWeight:85,previousValidDate:new Date(2026,7,14)});
  assertEq(r.usableForForecast,false,"suspicious: usableForForecast=false");
  assertEq(r.usableForCalibration,false,"suspicious: usableForCalibration=false");
  assertEq(r.requiresConfirmation,true,"suspicious: requiresConfirmation=true");
  assertEq(r.reasons[0],"implausible_weight_jump","suspicious: reason korrekt");

  const rInvalid=E.validateWeightEntry({weightKg:999,date:new Date(2026,7,15),previousValidWeight:85,previousValidDate:new Date(2026,7,14)});
  assertEq(rInvalid.reasons[0],"weight_out_of_range","invalid: reason korrekt");

  const rValid=E.validateWeightEntry({weightKg:85.4,date:new Date(2026,7,15),previousValidWeight:85,previousValidDate:new Date(2026,7,14)});
  assertEq(rValid.usableForForecast,true,"valid: usableForForecast=true");
  assertEq(rValid.usableForCalibration,true,"valid: usableForCalibration=true");
  assertEq(JSON.stringify(rValid.reasons),"[]","valid: reasons leer");
}

console.log("\n================================");
console.log(passed+" bestanden, "+failed+" fehlgeschlagen (von "+(passed+failed)+")");
console.log("================================");
if(failed>0) process.exit(1);
