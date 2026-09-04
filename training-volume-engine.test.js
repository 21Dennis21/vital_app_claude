/* training-volume-engine.test.js — Tests fuer training-volume-engine.js
   (TRAINING SYSTEM v1.4.1, IMPLEMENTATION PACK 04/14: Volume Engine/
   Frequency/Weekly Distribution).

   Wie bei training-plan-engine.test.js (STEP 03): training-domain.js
   wird per vm.runInThisContext() in den globalen Kontext geladen, weil
   training-volume-engine.js dessen Funktionen/Enums als bare Identifier
   nutzt (kein require() im Engine-File selbst, um die im Browser-Test-
   Harness bekannte var-Redeclaration-Falle bei kombiniertem eval() zu
   vermeiden). */
const fs=require("fs");
const path=require("path");
const vm=require("vm");
vm.runInThisContext(fs.readFileSync(path.join(__dirname,"training-domain.js"),"utf8"),{filename:"training-domain.js"});
const TV=require("./training-volume-engine.js");
const TD=require("./training-domain.js");
const TP=require("./training-plan-engine.js");

let passed=0,failed=0;
function assert(cond,label){if(cond){passed++;}else{failed++;console.error("❌ FAIL:",label);}}
function assertEq(actual,expected,label){
  const ok=JSON.stringify(actual)===JSON.stringify(expected);
  if(ok){passed++;}else{failed++;console.error("❌ FAIL:",label,"— erwartet:",expected,"erhalten:",actual);}
}
function assertClose(actual,expected,label){
  const ok=Math.abs(actual-expected)<1e-9;
  if(ok){passed++;}else{failed++;console.error("❌ FAIL:",label,"— erwartet:",expected,"erhalten:",actual);}
}
function assertThrows(fn,label){
  try{fn();failed++;console.error("❌ FAIL:",label,"— hat NICHT geworfen");}
  catch(e){passed++;}
}

const ctx=TD.createEvaluationContext({evaluation_at:new Date(2026,7,15,12,0,0),user_timezone:"Europe/Berlin",config_version:1,catalog_version:1,source_event_revision:1});

console.log("========== §4.1 Contribution-Werte (MuscleContributionConfig v1.4.1) ==========");
{
  assertEq(TV.MUSCLE_CONTRIBUTION_CREDIT.PRIMARY_HIGH,1.00,"PRIMARY_HIGH -> 1.00");
  assertEq(TV.MUSCLE_CONTRIBUTION_CREDIT.PRIMARY_MODERATE,0.50,"PRIMARY_MODERATE -> 0.50");
  assertEq(TV.MUSCLE_CONTRIBUTION_CREDIT.SECONDARY,0.50,"SECONDARY -> 0.50");
  assertEq(TV.MUSCLE_CONTRIBUTION_CREDIT.STABILIZER,0.00,"STABILIZER -> 0.00");
  assertEq(TV.MUSCLE_CONTRIBUTION_CONFIG_VERSION,"v1.4.1","Config-Version dokumentiert (fuer historische VolumeSnapshots)");
}

console.log("========== §4.1 RIR-Credit-Regeln ==========");
{
  assertEq(TV.rirCreditFactor(0),1,"RIR 0 -> Faktor 1");
  assertEq(TV.rirCreditFactor(4),1,"RIR genau 4 -> Faktor 1 (Grenzwert inklusiv)");
  assertEq(TV.rirCreditFactor(5),0.5,"RIR 5 -> Faktor 0.5");
  assertEq(TV.rirCreditFactor(6),0.5,"RIR 6 -> Faktor 0.5");
  assertEq(TV.rirCreditFactor(7),0,"RIR 7 -> Faktor 0");
  assertEq(TV.rirCreditFactor(10),0,"RIR 10 -> Faktor 0");
  assertThrows(()=>TV.rirCreditFactor(null),"rirCreditFactor ohne RIR wirft");

  assertEq(TV.computeSetVolumeCredit({is_work_set:false,rir:0,contribution_band:"PRIMARY_HIGH"}),0,"Warm-up/Kalibriersatz (is_work_set=false) zaehlt IMMER 0, unabhaengig von RIR/Contribution");
  assertEq(TV.computeSetVolumeCredit({is_work_set:true,rir:2,contribution_band:"PRIMARY_HIGH"}),1.0,"Work-Set, RIR<=4, PRIMARY_HIGH -> 1.0*1=1.0");
  assertEq(TV.computeSetVolumeCredit({is_work_set:true,rir:5,contribution_band:"PRIMARY_HIGH"}),0.5,"Work-Set, RIR 5, PRIMARY_HIGH -> 1.0*0.5=0.5");
  assertEq(TV.computeSetVolumeCredit({is_work_set:true,rir:8,contribution_band:"PRIMARY_HIGH"}),0,"Work-Set, RIR>=7, PRIMARY_HIGH -> 1.0*0=0");
  assertEq(TV.computeSetVolumeCredit({is_work_set:true,rir:2,contribution_band:"SECONDARY"}),0.5,"Work-Set, RIR<=4, SECONDARY -> 0.5*1=0.5");
  assertEq(TV.computeSetVolumeCredit({is_work_set:true,rir:2,contribution_band:"STABILIZER"}),0,"Work-Set, RIR<=4, STABILIZER -> 0.0*1=0");
}

console.log("========== INVARIANT V-3: direct_share zaehlt ausschliesslich PRIMARY_HIGH ==========");
{
  assertEq(TV.computeDirectShareSetCredit({is_work_set:true,rir:2,contribution_band:"PRIMARY_HIGH"}),1.0,"direct_share: PRIMARY_HIGH-Satz zaehlt voll");
  assertEq(TV.computeDirectShareSetCredit({is_work_set:true,rir:2,contribution_band:"PRIMARY_MODERATE"}),0,"direct_share: PRIMARY_MODERATE zaehlt NIE direct (obwohl 0.5 Volumen-Credit)");
  assertEq(TV.computeDirectShareSetCredit({is_work_set:true,rir:2,contribution_band:"SECONDARY"}),0,"direct_share: SECONDARY zaehlt NIE direct");
  assertEq(TV.computeDirectShareSetCredit({is_work_set:true,rir:2,contribution_band:"STABILIZER"}),0,"direct_share: STABILIZER zaehlt NIE direct");
}

console.log("========== Unilateral: Saetze pro Seite zaehlen einfach (keine Verdopplung) ==========");
{
  // 3 Saetze je Seite = 3 Saetze -> 3 einzelne computeSetVolumeCredit-Aufrufe
  // (je Ausfuehrung einer Seite), NICHT ein einziger Aufruf mit *2.
  const perSetCredit=TV.computeSetVolumeCredit({is_work_set:true,rir:2,contribution_band:"PRIMARY_HIGH"});
  const threeSetsPerSideTotal=perSetCredit*3; // 3 tatsaechlich ausgefuehrte Saetze (pro Seite je 1 Aufruf)
  assertEq(threeSetsPerSideTotal,3.0,"3 Saetze je Seite (3 einzelne Ausfuehrungen) summieren sich auf 3.0, nicht 6.0 (keine versteckte Verdopplung in der Formel selbst)");
}

console.log("========== Rollierendes 7-Tage-Fenster ==========");
{
  const evalMs=new Date(ctx.evaluation_at).getTime();
  const within=evalMs-3*24*60*60*1000;
  const exactlyAtEdge=evalMs-7*24*60*60*1000;
  const outside=evalMs-8*24*60*60*1000;
  assert(TV.isWithinRollingWindow(within,evalMs),"3 Tage zurueck liegt im 7-Tage-Fenster");
  assert(TV.isWithinRollingWindow(exactlyAtEdge,evalMs),"genau 7 Tage zurueck liegt noch im Fenster (Grenzwert inklusiv)");
  assert(!TV.isWithinRollingWindow(outside,evalMs),"8 Tage zurueck liegt AUSSERHALB des Fensters");

  const setInputs=[
    {muscle_id:"CHEST",contribution_band:"PRIMARY_HIGH",is_work_set:true,rir:2,performed_at_ms:within},
    {muscle_id:"CHEST",contribution_band:"SECONDARY",is_work_set:true,rir:2,performed_at_ms:within},
    {muscle_id:"CHEST",contribution_band:"PRIMARY_HIGH",is_work_set:true,rir:2,performed_at_ms:outside}, // ausserhalb -> zaehlt nicht
    {muscle_id:"LATS",contribution_band:"PRIMARY_HIGH",is_work_set:true,rir:2,performed_at_ms:within}, // anderer Muskel
  ];
  assertEq(TV.computeRollingMuscleVolumeCredit(setInputs,"CHEST",ctx),1.5,"rollierender Volumen-Credit: 1.0(PRIMARY_HIGH)+0.5(SECONDARY), das ausserhalb liegende und das andere-Muskel-Set zaehlen nicht");
  assertEq(TV.computeRollingDirectShareCredit(setInputs,"CHEST",ctx),1.0,"rollierender direct_share-Credit: nur das PRIMARY_HIGH-Set innerhalb des Fensters");
  assertThrows(()=>TV.computeRollingMuscleVolumeCredit(setInputs,"CHEST",{}),"rollierende Berechnung ohne evaluation_at wirft (kein verstecktes now())");
}

console.log("========== §4.2 Zielkorridore: alle Goal x Experience-Kombinationen woertlich ==========");
{
  const cases=[
    ["HYPERTROPHY","BEGINNER",{volume_floor:6,standard_min:8,standard_max:12,upper_bound:14}],
    ["HYPERTROPHY","INTERMEDIATE",{volume_floor:8,standard_min:12,standard_max:18,upper_bound:22}],
    ["HYPERTROPHY","ADVANCED",{volume_floor:10,standard_min:14,standard_max:20,upper_bound:26}],
    ["STRENGTH","BEGINNER",{volume_floor:5,standard_min:6,standard_max:10,upper_bound:12}],
    ["STRENGTH","INTERMEDIATE",{volume_floor:6,standard_min:9,standard_max:14,upper_bound:18}],
    ["STRENGTH","ADVANCED",{volume_floor:8,standard_min:10,standard_max:16,upper_bound:20}],
    ["GENERAL_FITNESS","BEGINNER",{volume_floor:4,standard_min:6,standard_max:10,upper_bound:12}],
    ["GENERAL_FITNESS","INTERMEDIATE",{volume_floor:4,standard_min:6,standard_max:10,upper_bound:12}],
    ["GENERAL_FITNESS","ADVANCED",{volume_floor:4,standard_min:6,standard_max:10,upper_bound:12}],
  ];
  cases.forEach(([goal,exp,expected])=>{
    const corridor=TV.resolveMuscleVolumeCorridor("CHEST",goal,exp);
    assert(corridor.has_corridor,goal+"/"+exp+": has_corridor=true");
    assertEq({volume_floor:corridor.volume_floor,standard_min:corridor.standard_min,standard_max:corridor.standard_max,upper_bound:corridor.upper_bound},expected,goal+"/"+exp+": Korridorwerte exakt nach §4.2");
  });
}

console.log("========== No-Floor-Muscles (FOREARM/ADDUCTORS/ABDUCTORS/OBLIQUES/LOWER_BACK) ==========");
{
  ["FOREARM","ADDUCTORS","ABDUCTORS","OBLIQUES","LOWER_BACK"].forEach(m=>{
    const corridor=TV.resolveMuscleVolumeCorridor(m,"HYPERTROPHY","INTERMEDIATE");
    assertEq(corridor.has_corridor,false,m+": kein Korridor (nur Obergrenze/Safety geprueft, kein VOLUME_FLOOR)");
  });
  assertEq(TV.NO_FLOOR_MUSCLES.slice().sort(),["ABDUCTORS","ADDUCTORS","FOREARM","LOWER_BACK","OBLIQUES"],"NO_FLOOR_MUSCLES exakt die 5 in §4.3 genannten Muskeln");
  // Kontrolle: ein Muskel MIT Korridor liefert has_corridor=true
  assert(TV.resolveMuscleVolumeCorridor("CHEST","HYPERTROPHY","INTERMEDIATE").has_corridor,"CHEST hat einen Korridor (Kontrollfall)");
}

console.log("========== §4.5 Priority Target ==========");
{
  const corridorHypInter=TV.resolveMuscleVolumeCorridor("CHEST","HYPERTROPHY","INTERMEDIATE"); // standard 12-18, upper 22
  // Mitte=(12+18)/2=15; *1.30=19.5; min(22,19.5)=19.5
  assertClose(TV.computePriorityMuscleTarget(corridorHypInter),19.5,"Priority Target = min(Obergrenze, Mitte*1.30) — Regelfall unter Obergrenze");
  const corridorGF=TV.resolveMuscleVolumeCorridor("CHEST","GENERAL_FITNESS","BEGINNER"); // standard 6-10, upper 12; mitte=8*1.3=10.4 < 12
  assertClose(TV.computePriorityMuscleTarget(corridorGF),10.4,"Priority Target GENERAL_FITNESS");
  // Konstruierter Fall, in dem Mitte*1.30 die Obergrenze uebersteigen wuerde
  const tightCorridor={has_corridor:true,volume_floor:4,standard_min:10,standard_max:12,upper_bound:13}; // mitte=11*1.3=14.3>13
  assertClose(TV.computePriorityMuscleTarget(tightCorridor),13,"Priority Target wird auf die Obergrenze geklemmt, wenn Mitte*1.30 sie ueberschreitet");
  assertThrows(()=>TV.computePriorityMuscleTarget({has_corridor:false}),"Priority Target fuer floorlosen Muskel wirft (nicht definierbar)");

  assertThrows(()=>TV.validatePriorityMuscleList(["CHEST","LATS","QUADS"]),"mehr als 2 Prioritaetsmuskeln wirft (§4.5: maximal 2)");
  TV.validatePriorityMuscleList(["CHEST","LATS"]); // wirft nicht
  passed++; // fuer den obigen erfolgreichen Aufruf ohne assert-Wrapper
}

console.log("========== §4.4 Toleranzbaender: alle Grenzen ==========");
{
  const corridor=TV.resolveMuscleVolumeCorridor("CHEST","HYPERTROPHY","INTERMEDIATE"); // floor 8, standard 12-18, upper 22
  assertEq(TV.evaluateVolumeTolerance(15,corridor).status,"OK","innerhalb Standardkorridor -> OK");
  assertEq(TV.evaluateVolumeTolerance(12,corridor).status,"OK","genau standard_min -> OK (Grenzwert inklusiv)");
  assertEq(TV.evaluateVolumeTolerance(18,corridor).status,"OK","genau standard_max -> OK (Grenzwert inklusiv)");

  // bis ±15% ausserhalb -> OK. standard_max=18 -> 15% davon=2.7 -> bis 20.7 OK
  assertEq(TV.evaluateVolumeTolerance(20.7,corridor).status,"OK","+15% ueber standard_max -> noch OK (Grenzwert)");
  assertEq(TV.evaluateVolumeTolerance(20.8,corridor).status,"WARNING","knapp ueber +15% -> WARNING");
  // standard_min=12 -> 15%=1.8 -> ab 10.2 noch OK
  assertEq(TV.evaluateVolumeTolerance(10.2,corridor).status,"OK","-15% unter standard_min -> noch OK (Grenzwert)");
  assertEq(TV.evaluateVolumeTolerance(10.1,corridor).status,"WARNING","knapp unter -15% -> WARNING");

  // 15-30% ausserhalb -> WARNING. standard_max=18 -> 30%=5.4 -> bis 23.4 WARNING (aber < upper_bound=22 wirkt zuerst!)
  assertEq(TV.evaluateVolumeTolerance(20.9,corridor).status,"WARNING","+16% ueber standard_max -> WARNING");
  // standard_min=12 -> 30%=3.6 -> bis 8.4 WARNING (volume_floor=8 liegt knapp darunter)
  assertEq(TV.evaluateVolumeTolerance(9,corridor).status,"WARNING","-25% unter standard_min (>=floor) -> WARNING");

  // >30% unter Standardkorridor, aber >= VOLUME_FLOOR: ERROR wenn reparierbare Kapazitaet existiert, sonst WARNING+Deficit
  assertEq(TV.evaluateVolumeTolerance(8,corridor,{hasRepairableCapacity:true}).status,"ERROR",">30% unter Standard, >=Floor, Kapazitaet vorhanden -> ERROR (waehrend GENERATED-Repair)");
  const belowStandardNoCapacity=TV.evaluateVolumeTolerance(8,corridor,{hasRepairableCapacity:false});
  assertEq(belowStandardNoCapacity.status,"WARNING",">30% unter Standard, >=Floor, KEINE Kapazitaet mehr -> WARNING+VolumeDeficit");
  assert(belowStandardNoCapacity.needsVolumeDeficit,"...und needsVolumeDeficit-Flag ist gesetzt");

  // unter VOLUME_FLOOR
  assertEq(TV.evaluateVolumeTolerance(7,corridor,{hasRepairableCapacity:true}).status,"ERROR","unter VOLUME_FLOOR, Kapazitaet vorhanden -> ERROR");
  assertEq(TV.evaluateVolumeTolerance(7,corridor,{hasRepairableCapacity:false}).status,"WARNING","unter VOLUME_FLOOR, keine Kapazitaet -> WARNING+VolumeDeficit");

  // >30%/50% ueber Obergrenze (upper_bound=22)
  assertEq(TV.evaluateVolumeTolerance(22*1.30,corridor).status,"WARNING","genau +30% ueber Obergrenze -> noch WARNING (Grenzwert exklusiv fuer ERROR)");
  assertEq(TV.evaluateVolumeTolerance(22*1.31,corridor).status,"WARNING",">30% ueber Obergrenze -> WARNING");
  assertEq(TV.evaluateVolumeTolerance(22*1.51,corridor).status,"ERROR",">50% ueber Obergrenze -> ERROR");

  // No-Floor-Muskel -> NOT_APPLICABLE (kein Korridor zur Klassifikation vorhanden)
  const noFloorCorridor=TV.resolveMuscleVolumeCorridor("FOREARM","HYPERTROPHY","INTERMEDIATE");
  assertEq(TV.evaluateVolumeTolerance(999,noFloorCorridor).status,"NOT_APPLICABLE","No-Floor-Muskel: Toleranzbewertung ist NOT_APPLICABLE (v1.4.1 nennt keinen Obergrenzen-Zahlenwert fuer diese 5 Muskeln)");
}

console.log("========== VolumeDeficit (bestehende training-domain.js-Fabrik, keine Parallelstruktur) ==========");
{
  const corridor=TV.resolveMuscleVolumeCorridor("CHEST","HYPERTROPHY","INTERMEDIATE"); // floor 8, standard_min 12
  const deficit=TV.buildVolumeDeficit("CHEST",6,corridor,"P3_TIME",ctx);
  assertEq(deficit.muscle_id,"CHEST","VolumeDeficit.muscle_id");
  assertEq(deficit.planned_credit,6,"VolumeDeficit.planned_credit");
  assertEq(deficit.standard_min,12,"VolumeDeficit.standard_min");
  assertEq(deficit.volume_floor,8,"VolumeDeficit.volume_floor");
  assertEq(deficit.deficit_to_floor,2,"VolumeDeficit.deficit_to_floor = volume_floor - planned_credit");
  assertEq(deficit.limiting_constraint,"P3_TIME","VolumeDeficit.limiting_constraint");
  assertEq(deficit.generated_at,ctx.evaluation_at,"VolumeDeficit.generated_at stammt aus dem EvaluationContext, nicht aus now()");
  assertThrows(()=>TV.buildVolumeDeficit("CHEST",6,corridor,"NOT_A_VALID_CONSTRAINT",ctx),"ungueltiger limiting_constraint wirft (Enum-Validierung in training-domain.js)");
  assertThrows(()=>TV.buildVolumeDeficit("CHEST",6,corridor,"P3_TIME",{}),"buildVolumeDeficit ohne evaluation_at wirft");
  // direkte Fabrik-Pruefung: training-domain.js validiert limiting_constraint jetzt gegen LIMITING_CONSTRAINT (STEP-04-Ergaenzung)
  assertThrows(()=>TD.createVolumeDeficit({muscle_id:"CHEST",planned_credit:6,standard_min:12,volume_floor:8,deficit_to_floor:2,limiting_constraint:"MADE_UP",generated_at:ctx.evaluation_at}),"training-domain.createVolumeDeficit validiert limiting_constraint gegen das LIMITING_CONSTRAINT-Enum");
}

console.log("========== §4.6 Frequency-Grenzen 10/20 ==========");
{
  assertEq(TV.computeIdealTargetFrequency(10,"HYPERTROPHY"),1,"wochenvolumen genau 10 -> Frequenz 1 (Grenzwert inklusiv)");
  assertEq(TV.computeIdealTargetFrequency(10.1,"HYPERTROPHY"),2,"wochenvolumen knapp ueber 10 -> Frequenz 2");
  assertEq(TV.computeIdealTargetFrequency(20,"HYPERTROPHY"),2,"wochenvolumen genau 20 -> Frequenz 2 (Grenzwert inklusiv)");
  assertEq(TV.computeIdealTargetFrequency(20.1,"HYPERTROPHY"),3,"wochenvolumen knapp ueber 20 -> Frequenz 3");
  assertEq(TV.computeIdealTargetFrequency(5,"GENERAL_FITNESS"),1,"GENERAL_FITNESS folgt derselben Formel");
  assertThrows(()=>TV.computeIdealTargetFrequency(15,"STRENGTH"),"computeIdealTargetFrequency fuer STRENGTH wirft (§4.6: STRENGTH hat keine Volumen-Ziel-Frequenz, nur P5-Exposure-Praeferenz)");

  assertEq(TV.clampFrequencyToSplit(3,2),2,"Frequenz wird auf die vom Split gebotene Frequenz geklemmt (2 < 3)");
  assertEq(TV.clampFrequencyToSplit(1,4),1,"Frequenz bleibt unveraendert, wenn der Split mehr bietet als noetig");
}

console.log("========== STRENGTH: >=2 Exposures nur P5-Praeferenz, nie ERROR/INFEASIBLE ==========");
{
  const meets=TV.evaluateStrengthExposurePreference(2);
  assertEq(meets.meetsPreference,true,"2 Exposures/Woche erfuellt die P5-Praeferenz");
  assertEq(meets.blocking,false,"P5-Praeferenz ist niemals blockierend");
  const oneExposure=TV.evaluateStrengthExposurePreference(1);
  assertEq(oneExposure.meetsPreference,false,"1 Exposure erfuellt die Praeferenz nicht");
  assertEq(oneExposure.blocking,false,"...aber erzeugt trotzdem KEINEN Blocker (§4.6: 1 Exposure bleibt gueltig, nie ERROR/INFEASIBLE)");
}

console.log("========== §4.7 Session-Caps ==========");
{
  assertEq(TV.evaluateMuscleSessionSetCap(10).status,"OK","genau 10 fraktionale Saetze/Muskel/Session -> OK (Grenzwert inklusiv, Warnschwelle erst DARUEBER)");
  assertEq(TV.evaluateMuscleSessionSetCap(10.5).status,"WARNING","knapp ueber 10 -> WARNING");
  assertEq(TV.evaluateMuscleSessionSetCap(12).status,"WARNING","genau 12 -> WARNING (Fehlerschwelle erst DARUEBER)");
  assertEq(TV.evaluateMuscleSessionSetCap(12.5).status,"ERROR","knapp ueber 12 -> ERROR");

  assertEq(TV.evaluateTotalSessionSetCap(20,20).status,"OK","genau max_working_sets -> OK");
  assertEq(TV.evaluateTotalSessionSetCap(21,20).status,"WARNING","knapp ueber max_working_sets -> WARNING");
  assertEq(TV.evaluateTotalSessionSetCap(25,20).status,"WARNING","genau max_working_sets*1.25 -> WARNING (Grenzwert inklusiv)");
  assertEq(TV.evaluateTotalSessionSetCap(25.1,20).status,"ERROR","knapp ueber max_working_sets*1.25 -> ERROR");

  // fatigue_load erzeugt NIE einen ERROR (nur OK/WARNING)
  const fatigueLoad=TV.computeFatigueLoad([{sets:5,fatigue_systemic:20},{sets:3,fatigue_systemic:10}]); // 100+30=130
  assertEq(fatigueLoad,130,"computeFatigueLoad = Summe(sets*fatigue_systemic)");
  assertEq(TV.classifyFatigueLoad(130,"BEGINNER").status,"WARNING","130 > Beginner-Schwelle 60 -> WARNING");
  assertEq(TV.classifyFatigueLoad(130,"ADVANCED").status,"WARNING","130 > Advanced-Schwelle 100 -> WARNING");
  assertEq(TV.classifyFatigueLoad(50,"BEGINNER").status,"OK","50 <= Beginner-Schwelle 60 -> OK");
  // Es gibt keine ERROR-Klassifikation ueberhaupt (Rueckgabewert kann nie "ERROR" sein)
  assert(TV.classifyFatigueLoad(99999,"ADVANCED").status!=="ERROR","fatigue_load kann laut §4.7 niemals ERROR sein, auch bei extremen Werten");
}

console.log("========== §4.8 Direktarbeits-Mindestanteil (Direct Share) ==========");
{
  assertEq(TV.evaluateDirectShare(3,10,10,"HYPERTROPHY").status,"OK","30% direct bei Ziel>=8 -> OK (Grenzwert inklusiv)");
  assertEq(TV.evaluateDirectShare(2,10,10,"HYPERTROPHY").status,"WARNING","20% direct -> WARNING (1-29%)");
  assertEq(TV.evaluateDirectShare(0.1,10,10,"HYPERTROPHY").status,"WARNING","1% direct -> WARNING");
  assertEq(TV.evaluateDirectShare(0,10,10,"HYPERTROPHY").status,"ERROR","0% direct bei Ziel>=8 -> ERROR");
  assertEq(TV.evaluateDirectShare(0,10,7,"HYPERTROPHY").status,"NOT_APPLICABLE","Wochenziel <8 -> Regel gilt nicht (§4.8: nur Ziel>=8)");
  assertEq(TV.evaluateDirectShare(0,10,10,"STRENGTH").status,"NOT_APPLICABLE","§4.8 gilt woertlich nur fuer Ziel HYPERTROPHY, nicht STRENGTH/GENERAL_FITNESS");
  assertEq(TV.evaluateDirectShare(0,10,10,"GENERAL_FITNESS").status,"NOT_APPLICABLE","§4.8 gilt woertlich nur fuer Ziel HYPERTROPHY");
}

console.log("========== §4.3 Registry: gueltige/ungueltige Anatomy/Subregion-Tags ==========");
{
  const upperChest=TV.validateAnatomySubregionTag("UPPER_CHEST");
  assertEq(upperChest.type,"SUBREGION","UPPER_CHEST ist SUBREGION");
  assertEq(upperChest.mapping_to_volume_muscle,"CHEST","UPPER_CHEST mapped auf CHEST");
  const hipFlexors=TV.validateAnatomySubregionTag("HIP_FLEXORS");
  assertEq(hipFlexors.mapping_to_volume_muscle,null,"HIP_FLEXORS mapped auf NONE (kein Weekly-Volume-Credit)");
  assertThrows(()=>TV.validateAnatomySubregionTag("NOT_A_REAL_TAG"),"unbekannter Tag wirft (INVARIANT V-M1)");
  assertEq(Object.keys(TV.ANATOMY_SUBREGION_REGISTRY).length,15,"Registry enthaelt alle 15 in §4.3 gelisteten Tags");
  assert(TV.isCanonicalVolumeMuscleOrTag("CHEST"),"CHEST ist ein gueltiger canonical_volume_muscle_id");
  assert(TV.isCanonicalVolumeMuscleOrTag("TRAPS"),"TRAPS ist ein gueltiger anatomy Tag");
  assert(!TV.isCanonicalVolumeMuscleOrTag("BICEP_PEAK"),"frei erfundener String ist weder Muskel-ID noch Tag");
}

console.log("========== Phase 3: Allocation-Reihenfolge (resolveVolumeTargets) ==========");
{
  function planReq(overrides){
    return Object.assign({goal:"HYPERTROPHY",experience_level:"INTERMEDIATE",priority_muscles:[]},overrides||{});
  }

  // Sehr hohe Kapazitaet: jeder Muskel erreicht seine Obergrenze (Stufe 5 voll finanziert).
  const abundant=TV.resolveVolumeTargets({planRequirements:planReq(),targetMuscles:["CHEST","LATS"],weeklyDeliverableVolumeCapacity:10000,limitingConstraint:"P3_TIME",evaluationContext:ctx});
  assertEq(abundant.weeklyVolumeTargets.CHEST,22,"Bei unbegrenzter Kapazitaet erreicht ein Nicht-Prioritaets-Muskel seine Obergrenze (22 fuer HYP/INTERMEDIATE)");
  assertEq(abundant.deficits.length,0,"Bei unbegrenzter Kapazitaet entsteht kein Deficit");

  // Prioritaetsmuskel-Ziel ist FIX (Regel 1) und wird durch Kapazitaetsueberschuss NICHT weiter erhoeht.
  const withPriority=TV.resolveVolumeTargets({planRequirements:planReq({priority_muscles:["CHEST"]}),targetMuscles:["CHEST","LATS"],weeklyDeliverableVolumeCapacity:10000,limitingConstraint:"P3_TIME",evaluationContext:ctx});
  assertClose(withPriority.weeklyVolumeTargets.CHEST,19.5,"Prioritaetsmuskel CHEST bleibt exakt bei seinem §4.5-Zielwert (19.5), auch bei ueberschuessiger Kapazitaet");
  assertEq(withPriority.weeklyVolumeTargets.LATS,22,"Nicht-Prioritaetsmuskel LATS erreicht dennoch seine eigene Obergrenze");

  // INVARIANT V-1: Prioritaetsmuskel hat nie weniger Volumen als ein
  // vergleichbarer Nicht-Prioritaetsmuskel — hier bewusst mit knapper
  // Kapazitaet geprueft: Nicht-Prioritaet wird VOR Prioritaet Richtung
  // Floor abgesenkt (§4.5 Regel 4).
  // usedCapacity fuer CHEST(prio)=19.5 laesst 0.5 fuer LATS -> LATS faellt
  // weit unter seinen Floor (8), CHEST bleibt bei 19.5.
  const scarce=TV.resolveVolumeTargets({planRequirements:planReq({priority_muscles:["CHEST"]}),targetMuscles:["CHEST","LATS"],weeklyDeliverableVolumeCapacity:20,limitingConstraint:"P3_TIME",evaluationContext:ctx});
  assertClose(scarce.weeklyVolumeTargets.CHEST,19.5,"Prioritaetsmuskel-Ziel bleibt bei knapper Kapazitaet unangetastet (wird erst NACH allen Nicht-Prioritaets-Muskeln reduziert)");
  assert(scarce.weeklyVolumeTargets.LATS<scarce.weeklyVolumeTargets.CHEST,"INVARIANT V-1: Nicht-Prioritaetsmuskel LATS hat bei Knappheit weniger Volumen als der Prioritaetsmuskel CHEST");
  assert(scarce.deficits.some(d=>d.muscle_id==="LATS"),"LATS erhaelt einen VolumeDeficit, weil sein Floor bei dieser knappen Kapazitaet nicht erreichbar ist");

  // Proportionale Gleichverteilung innerhalb einer Stufe (dokumentierte,
  // nicht-normative Notwendigkeit, siehe Kopf-Kommentar L3): zwei
  // gleichrangige Nicht-Prioritaets-Muskeln mit identischem Korridor und
  // exakt halb ausreichender Floor-Kapazitaet bekommen exakt die HAELFTE
  // ihres Floors, nicht "einer volle, der andere nichts".
  const equalShare=TV.resolveVolumeTargets({planRequirements:planReq(),targetMuscles:["CHEST","LATS"],weeklyDeliverableVolumeCapacity:8,limitingConstraint:"P3_TIME",evaluationContext:ctx}); // beide floor=8, zusammen 16 noetig, nur 8 da -> je 4
  assertClose(equalShare.weeklyVolumeTargets.CHEST,4,"proportionale Gleichverteilung: CHEST bekommt die Haelfte des gemeinsam benoetigten Floor-Bedarfs");
  assertClose(equalShare.weeklyVolumeTargets.LATS,4,"proportionale Gleichverteilung: LATS bekommt ebenfalls die Haelfte (symmetrisch, keine Praeferenz)");

  assertThrows(()=>TV.resolveVolumeTargets({planRequirements:planReq(),targetMuscles:["CHEST"],weeklyDeliverableVolumeCapacity:null,evaluationContext:ctx}),"resolveVolumeTargets ohne weeklyDeliverableVolumeCapacity wirft (Pflicht-externer Input, siehe Kopf-Kommentar L2)");
  assertThrows(()=>TV.resolveVolumeTargets({planRequirements:planReq(),targetMuscles:["CHEST"],weeklyDeliverableVolumeCapacity:1,evaluationContext:ctx}),"resolveVolumeTargets OHNE limitingConstraint wirft, wenn tatsaechlich ein Deficit entsteht (Pflicht-externer Input, siehe Kopf-Kommentar L4)");
  assertThrows(()=>TV.resolveVolumeTargets({planRequirements:planReq({priority_muscles:["CHEST","LATS","QUADS"]}),targetMuscles:["CHEST"],weeklyDeliverableVolumeCapacity:100,limitingConstraint:"P3_TIME",evaluationContext:ctx}),"mehr als 2 Prioritaetsmuskeln wirft auch innerhalb resolveVolumeTargets");

  // hardRequirementFloors (Stufe 1, extern, geschuetzt) werden vollstaendig respektiert.
  const withHardReq=TV.resolveVolumeTargets({planRequirements:planReq(),targetMuscles:["CHEST"],weeklyDeliverableVolumeCapacity:100,hardRequirementFloors:{CHEST:5},limitingConstraint:"P3_TIME",evaluationContext:ctx});
  assert(withHardReq.usedCapacity>=5,"hardRequirementFloors fliessen in usedCapacity ein (Stufe 1 zuerst reserviert)");
}

console.log("========== Determinismus (INVARIANT G-3) ==========");
{
  const input={planRequirements:{goal:"HYPERTROPHY",experience_level:"INTERMEDIATE",priority_muscles:["CHEST"]},targetMuscles:["CHEST","LATS","QUADS"],weeklyDeliverableVolumeCapacity:50,limitingConstraint:"P3_TIME",evaluationContext:ctx};
  const r1=TV.resolveVolumeTargets(input);
  const r2=TV.resolveVolumeTargets(input);
  assertEq(r1.weeklyVolumeTargets,r2.weeklyVolumeTargets,"identischer Input + identischer EvaluationContext -> identisches Ergebnis");
  assertEq(r1.deficits,r2.deficits,"identische Deficits bei wiederholtem Aufruf");
}

console.log("========== Phase 5: computeSessionVolumeTargets (Weekly Distribution) ==========");
{
  // Wiederverwendung derselben externen sessionTemplateSequence-Form wie
  // STEP 03 (training-plan-engine.js) — hier eine kleine, klar als
  // Test-Fixture gekennzeichnete 2-Template-Sequenz (UPPER/LOWER).
  const splitStructure={training_weekdays:[0,1,3,4]}; // 4 Sessions in der Woche
  const sessionTemplateSequence=[
    {name:"UPPER",muscles:["CHEST","LATS"]},
    {name:"LOWER",muscles:["QUADS"]},
  ];
  const weeklyVolumeTargets={CHEST:12,LATS:12,QUADS:8};
  const sessionTargets=TV.computeSessionVolumeTargets(weeklyVolumeTargets,splitStructure,sessionTemplateSequence);
  assertEq(sessionTargets.length,4,"eine SessionVolumeTargets-Eintrag je tatsaechlicher Session-Instanz (4 Trainingstage)");
  // Tage 0,2 (i%2==0) = UPPER, Tage 1,3 (i%2==1) = LOWER -> CHEST/LATS je 2x/Woche, QUADS 2x/Woche
  assertClose(sessionTargets[0].CHEST,6,"CHEST: 12 Wochensaetze / 2 Expositionen = 6 pro Session (dieselbe Rechnung wie STEP 03s weeklyTarget/frequency)");
  assertClose(sessionTargets[2].CHEST,6,"CHEST erhaelt in JEDER seiner Expositionen denselben Anteil (gleichmaessige Teilung, keine erfundene round-robin/Rest-Logik)");
  assertEq(sessionTargets[1].CHEST,undefined,"CHEST wird an LOWER-Tagen nicht trainiert -> kein Eintrag");
  assertClose(sessionTargets[1].QUADS,4,"QUADS: 8/2=4 pro LOWER-Session");
  assertThrows(()=>TV.computeSessionVolumeTargets(weeklyVolumeTargets,{training_weekdays:[0]},[]),"computeSessionVolumeTargets ohne sessionTemplateSequence wirft");
}

console.log("========== STEP-03-Integration mit echten VolumeTargets ==========");
{
  // Reale VolumeTargets aus resolveVolumeTargets() (nicht hartkodiert)
  // werden direkt in TP.selectSplit() (STEP 03) eingespeist. Die
  // STEP-03-eigenen offenen Inputs (minViableSessionSlotsBySplit,
  // sessionTemplateSequenceBySplit, PPL_UL_HYBRID-Frequenz) bleiben exakt
  // das, was sie in STEP 03 waren: klar gekennzeichnete Test-Fixtures,
  // KEINE neuen Produktions-Defaults (Aufgabenstellung: "STEP-03 offene
  // Inputs — nur setzen, wenn Pack 04 selbst einen normativen Wert
  // liefert" — das tut Pack 04 nicht, also bleiben es Fixtures).
  const planRequirements={user_id:"u1",goal:"HYPERTROPHY",experience_level:"INTERMEDIATE",user_skill_level:2,
    training_days_per_week:4,session_time_budget_min:60,actual_session_duration_factor:1.0,
    priority_muscles:["CHEST"],preferred_split:null,rest_preference:"STANDARD",uses_rir:false,
    primary_location_id:"loc1",training_weekdays:[0,1,3,4]};
  const sessionCapacityResult=TP.resolveSessionCapacity({session_time_budget_min:60,reserve_s:0,goal:"HYPERTROPHY",actual_session_duration_factor:1.0});
  const sessionCapacity=sessionCapacityResult.sessionCapacity;

  const volumeResult=TV.resolveVolumeTargets({
    planRequirements,
    targetMuscles:["CHEST","LATS","QUADS","HAMSTRINGS","GLUTES","TRICEPS","BICEPS","UPPER_BACK","FRONT_DELT","SIDE_DELT","REAR_DELT","CALVES","ABS"],
    weeklyDeliverableVolumeCapacity:200, // Test-Fixture, siehe Kopf-Kommentar L2 — kein Produktions-Default
    limitingConstraint:"P3_TIME",
    evaluationContext:ctx,
  });
  assert(Object.keys(volumeResult.weeklyVolumeTargets).length>0,"resolveVolumeTargets liefert echte VolumeTargets");

  const ALL=Object.keys(TD.CANONICAL_VOLUME_MUSCLE_ID);
  const fixCov={};Object.keys(TP.SPLIT_CANDIDATES).forEach(k=>fixCov[k]=1.0);
  const minSlotsFixture={FULL_BODY:5,UPPER_LOWER:5,UPPER_LOWER_FULL:6,PUSH_PULL:5,PPL:7,PPL_X2:5,PPL_UL_HYBRID:6,UPPER_LOWER_X3:5,BODY_PART_SPLIT:6}; // STEP-03-Fixture, unveraendert
  const tmpl=(name,muscles)=>({name,muscles});
  const A=["CHEST","FRONT_DELT","TRICEPS"],B=["LATS","UPPER_BACK","BICEPS"],C=["QUADS","HAMSTRINGS","GLUTES"];
  const sessionTemplatesFixture={
    FULL_BODY:[tmpl("FULL",ALL)],UPPER_LOWER:[tmpl("UPPER",A.concat(B)),tmpl("LOWER",C)],
    UPPER_LOWER_FULL:[tmpl("UPPER",A.concat(B)),tmpl("LOWER",C),tmpl("FULL",ALL)],
    PUSH_PULL:[tmpl("PUSH",A),tmpl("PULL",B)],PPL:[tmpl("PUSH",A),tmpl("PULL",B),tmpl("LEGS",C)],
    PPL_X2:[tmpl("PUSH",A),tmpl("PULL",B),tmpl("LEGS",C)],
    PPL_UL_HYBRID:[tmpl("PUSH",A),tmpl("PULL",B),tmpl("LEGS",C),tmpl("UPPER",A.concat(B)),tmpl("LOWER",C)],
    UPPER_LOWER_X3:[tmpl("UPPER",A.concat(B)),tmpl("LOWER",C)],
    BODY_PART_SPLIT:[tmpl("PART_A",A),tmpl("PART_B",B),tmpl("PART_C",C),tmpl("PART_D",["ABS"]),tmpl("PART_E",["CALVES"])],
  }; // STEP-03-Fixture, unveraendert (Pack 04 liefert keinen normativen Wert dafuer)

  const splitResult=TP.selectSplit(planRequirements,volumeResult.weeklyVolumeTargets,sessionCapacity,{
    equipmentCoverageBySplit:fixCov,minViableSessionSlotsBySplit:minSlotsFixture,
    sessionTemplateSequenceBySplit:sessionTemplatesFixture,frequencyOverrides:{PPL_UL_HYBRID:1.8},
  });
  assert(splitResult.status==="OK"||splitResult.status==="NEEDS_VOLUME_ADJUSTMENT",splitResult.status,"STEP-03-Split-Engine akzeptiert die von Pack 04 berechneten echten VolumeTargets end-to-end (Status: "+splitResult.status+")");

  if(splitResult.status==="OK"){
    const sessionTargets=TV.computeSessionVolumeTargets(volumeResult.weeklyVolumeTargets,splitResult.splitStructure,sessionTemplatesFixture[splitResult.splitStructure.split_type]);
    assertEq(sessionTargets.length,splitResult.splitStructure.training_weekdays.length,"Phase 5 (SessionVolumeTargets) laesst sich direkt an das STEP-03-Ergebnis anschliessen — ein Eintrag je Session-Instanz");
  }
}

console.log("\n"+passed+" bestanden, "+failed+" fehlgeschlagen");
process.exit(failed>0?1:0);
