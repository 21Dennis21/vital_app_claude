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

console.log("========== TEST: Bestaetigung speichern ==========");
{
  const entry={date:new Date(2026,7,1), weight:99};
  let confirmations=[];
  confirmations=E.recordWeightConfirmation(confirmations, entry, "large_change_after_usage_gap", new Date(2026,7,1,12,0,0));
  assertEq(confirmations.length,1,"eine Bestaetigung gespeichert");
  assertEq(confirmations[0].weightEntryId, E.weightEntryConfirmationKey(entry), "richtige Entry-ID");
  assertEq(confirmations[0].confirmedByUser, true, "confirmedByUser=true");
  assertEq(confirmations[0].validationReason, "large_change_after_usage_gap", "validationReason korrekt");
  assertTrue(confirmations[0].confirmedAt.startsWith("2026-08-01"), "confirmedAt korrekt gesetzt");
}

console.log("========== TEST: 'App neu geladen' (Bestaetigung ueberlebt Simulation eines Reloads) ==========");
{
  const entry={date:new Date(2026,7,1), weight:99};
  let confirmations=E.recordWeightConfirmation([], entry, "large_change_after_usage_gap", new Date());
  // Simuliert einen Reload: JSON-Serialisierung + Deserialisierung wie bei localStorage
  const serialized=JSON.stringify(confirmations);
  const reloaded=JSON.parse(serialized).map(c=>({...c})); // Datum bleibt hier als String, wie localStorage es auch liefert
  assertEq(reloaded.length,1,"Bestaetigung bleibt nach Reload-Simulation erhalten");
  assertEq(reloaded[0].weightEntryId, E.weightEntryConfirmationKey(entry), "Entry-ID bleibt nach Reload identisch");
}

console.log("========== TEST: Bestaetigter Eintrag bleibt usableForForecast, aber weiterhin NICHT usableForCalibration (Nutzungspause) ==========");
{
  const now=new Date(2026,7,15);
  const prev=new Date(now); prev.setDate(prev.getDate()-60);
  const entry={date:now, weight:99};
  const confirmations=E.recordWeightConfirmation([], entry, "large_change_after_usage_gap", now);

  const weightEntries=[{date:prev,weight:85},{date:now,weight:99}];
  const anchor=E.getLatestValidWeightEntry(weightEntries, now, E.FORECAST_CONFIG, {}, {}, confirmations);
  assertEq(anchor.weight, 99, "bestaetigter Eintrag wird jetzt als Anker verwendet");
  assertEq(anchor.validation.usableForForecast, true, "usableForForecast=true");
  assertEq(anchor.validation.usableForCalibration, false, "weiterhin NICHT usableForCalibration");
  assertEq(anchor.validation.usageGapDetected, true, "usageGapDetected bleibt korrekt gesetzt");
}

console.log("========== TEST: Unbestaetigter Eintrag bleibt ausgeschlossen ==========");
{
  const now=new Date(2026,7,15);
  const prev=new Date(now); prev.setDate(prev.getDate()-60);
  const weightEntries=[{date:prev,weight:85},{date:now,weight:99}];
  const anchor=E.getLatestValidWeightEntry(weightEntries, now, E.FORECAST_CONFIG, {}, {}, []); // keine Bestaetigungen
  assertEq(anchor.weight, 85, "Anker faellt ohne Bestaetigung weiterhin auf den letzten gueltigen Wert zurueck");
}

console.log("========== TEST: Loeschen eines Gewichtseintrags entfernt auch dessen Bestaetigung ==========");
{
  const entry1={date:new Date(2026,7,1), weight:99};
  const entry2={date:new Date(2026,7,10), weight:97};
  let confirmations=[];
  confirmations=E.recordWeightConfirmation(confirmations, entry1, "large_change_after_usage_gap", new Date());
  confirmations=E.recordWeightConfirmation(confirmations, entry2, "implausible_weight_jump", new Date());
  assertEq(confirmations.length, 2, "zwei Bestaetigungen vorhanden");
  confirmations = E.removeWeightConfirmation(confirmations, entry1);
  assertEq(confirmations.length, 1, "nach Loeschen von entry1 nur noch eine Bestaetigung");
  assertEq(confirmations[0].weightEntryId, E.weightEntryConfirmationKey(entry2), "verbleibende Bestaetigung gehoert zu entry2");
}

console.log("\n================================");
console.log(passed+" bestanden, "+failed+" fehlgeschlagen (von "+(passed+failed)+")");
console.log("================================");
if(failed>0) process.exit(1);
