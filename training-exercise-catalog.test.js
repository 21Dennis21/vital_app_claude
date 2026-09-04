/* training-exercise-catalog.test.js — Tests fuer training-exercise-catalog.js
   (TRAINING SYSTEM v1.4.1, IMPLEMENTATION PACK 05/14: Exercise Catalog /
   Movement & Muscle Taxonomy).

   Laedt training-domain.js UND training-volume-engine.js per
   vm.runInThisContext() in den globalen Kontext (wie training-plan-engine.
   test.js/training-volume-engine.test.js), weil training-exercise-catalog.js
   Funktionen/Enums aus BEIDEN als bare Identifier nutzt (movement_similarity
   braucht z.B. MOVEMENT_PATTERN_ID/isRegisteredMovementSubpatternId aus
   training-domain.js; validateCatalogLints braucht validateAnatomySubregionTag
   aus training-volume-engine.js). */
const fs=require("fs");
const path=require("path");
const vm=require("vm");
vm.runInThisContext(fs.readFileSync(path.join(__dirname,"training-domain.js"),"utf8"),{filename:"training-domain.js"});
vm.runInThisContext(fs.readFileSync(path.join(__dirname,"training-volume-engine.js"),"utf8"),{filename:"training-volume-engine.js"});
const EC=require("./training-exercise-catalog.js");
const TD=require("./training-domain.js");

let passed=0,failed=0;
function assert(cond,label){if(cond){passed++;}else{failed++;console.error("❌ FAIL:",label);}}
function assertEq(actual,expected,label){
  const ok=JSON.stringify(actual)===JSON.stringify(expected);
  if(ok){passed++;}else{failed++;console.error("❌ FAIL:",label,"— erwartet:",expected,"erhalten:",actual);}
}
function assertThrows(fn,label){
  try{fn();failed++;console.error("❌ FAIL:",label,"— hat NICHT geworfen");}
  catch(e){passed++;}
}

console.log("========== §5.1 Kanonische movement_pattern-Registry (25 IDs, geschlossen) ==========");
{
  const EXPECTED_PATTERNS=["HORIZONTAL_PRESS","VERTICAL_PRESS","HORIZONTAL_PULL","VERTICAL_PULL","KNEE_DOMINANT","KNEE_EXTENSION","HIP_HINGE","HIP_EXTENSION","KNEE_FLEXION","SHOULDER_LATERAL","SHOULDER_REAR","SHOULDER_ADDUCTION","SHOULDER_EXTENSION","SCAPULAR_PULL","ELBOW_FLEXION","ELBOW_EXTENSION","HIP_ABDUCTION","HIP_ADDUCTION","ANKLE_PLANTARFLEXION","FOREARM","TRUNK_FLEXION","TRUNK_ANTIEXTENSION","TRUNK_ANTIROTATION","TRUNK_ANTILATERALFLEXION","LOADED_CARRY"];
  assertEq(Object.keys(TD.MOVEMENT_PATTERN_ID).sort(),EXPECTED_PATTERNS.slice().sort(),"exakt die 25 in §5.1 genannten movement_pattern-IDs");
  EXPECTED_PATTERNS.forEach(p=>assert(TD.isRegisteredMovementPatternId(p),p+" ist registriert"));
  assert(!TD.isRegisteredMovementPatternId("HORIZONTAL_PUSH"),"nicht-kanonische ID (alter/erfundener Name) wird abgelehnt");
  assert(!TD.isRegisteredMovementPatternId(""),"leerer String wird abgelehnt");
}

console.log("========== §5.1 Kanonische movement_subpattern-Registry (53 IDs, geschlossen) ==========");
{
  const EXPECTED_SUBPATTERNS=["ANTI_EXTENSION","BACK_EXTENSION","BENT_OVER_ROW","BILATERAL_SQUAT","CABLE_PRESS","CABLE_ROW","CALF_RAISE","CHEST_SUPPORTED_ROW","CHINUP","CURL","DEADLIFT","DIAGONAL_PRESS","DIP","FACE_PULL","FARMER_CARRY","FLAT_PRESS","FLOOR_PRESS","FLY","GLUTE_BRIDGE","GOOD_MORNING","HAMMER_CURL","HANGING_RAISE","HIP_THRUST","INCLINE_PRESS","INVERTED_ROW","LATERAL_RAISE","LEG_CURL","LOADED","LUNGE","MACHINE_ROW","NORDIC","OPEN_CHAIN_HIP_ABDUCTION","OPEN_CHAIN_HIP_ADDUCTION","OPEN_CHAIN_KNEE_EXTENSION","OVERHEAD_PRESS","PALLOF","PIKE_PRESS","PRESS_COMPOUND","PULLDOWN","PULLUP","PULL_THROUGH","PUSHUP","RDL","REAR_DELT_FLY","ROLLOUT","SIDE_PLANK","SLIDER","SPLIT_SQUAT","STEP_UP","STRAIGHT_ARM_PULL","SUPPORTED_KNEE_DOMINANT","TRICEPS_EXTENSION","TRUNK_FLEXION"];
  assertEq(Object.keys(TD.MOVEMENT_SUBPATTERN_ID).sort(),EXPECTED_SUBPATTERNS.slice().sort(),"exakt die 53 in §5.1 genannten movement_subpattern-IDs");
  EXPECTED_SUBPATTERNS.forEach(s=>assert(TD.isRegisteredMovementSubpatternId(s),s+" ist registriert"));
  assert(!TD.isRegisteredMovementSubpatternId("BOGUS_SUBPATTERN"),"nicht-kanonische Subpattern-ID wird abgelehnt");
}

console.log("========== Unbekannte IDs werden bei Entity-Konstruktion abgelehnt ==========");
{
  assertThrows(()=>TD.createSlotFunction({movement_pattern:"NOT_A_PATTERN",role:"PRIMARY",rep_character:"MODERATE"}),"createSlotFunction lehnt unbekannten movement_pattern ab");
  assertThrows(()=>TD.createSlotFunction({movement_pattern:"HORIZONTAL_PRESS",movement_subpattern:"NOT_A_SUBPATTERN",role:"PRIMARY",rep_character:"MODERATE"}),"createSlotFunction lehnt unbekannten movement_subpattern ab");
  assert(!!TD.createSlotFunction({movement_pattern:"HORIZONTAL_PRESS",movement_subpattern:"FLAT_PRESS",role:"PRIMARY",rep_character:"MODERATE"}),"createSlotFunction akzeptiert kanonisches Pattern+Subpattern");
}

console.log("========== Die 6 Grundmuster (§5.1) exakt ==========");
{
  assertEq(TD.FOUNDATIONAL_MOVEMENT_PATTERNS.slice().sort(),["HIP_HINGE","HORIZONTAL_PRESS","HORIZONTAL_PULL","KNEE_DOMINANT","VERTICAL_PRESS","VERTICAL_PULL"].sort(),"exakt die 6 in §5.1 genannten Grundmuster");
  assertEq(TD.FOUNDATIONAL_MOVEMENT_PATTERNS.length,6,"genau 6 Grundmuster");
}

console.log("========== §5.2 movement_similarity / Nachbarschaftsmatrix ==========");
{
  assertEq(EC.movementSimilarity({movement_pattern:"KNEE_DOMINANT",movement_subpattern:"BILATERAL_SQUAT"},{movement_pattern:"KNEE_DOMINANT",movement_subpattern:"BILATERAL_SQUAT"}),1.00,"identisches Pattern+Subpattern -> 1.00");
  assertEq(EC.movementSimilarity({movement_pattern:"KNEE_DOMINANT",movement_subpattern:"BILATERAL_SQUAT"},{movement_pattern:"KNEE_DOMINANT",movement_subpattern:"LUNGE"}),0.85,"identisches Pattern, verschiedene aber beide kanonische Subpatterns -> 0.85");
  assertEq(EC.movementSimilarity({movement_pattern:"KNEE_DOMINANT",movement_subpattern:null},{movement_pattern:"KNEE_DOMINANT",movement_subpattern:"LUNGE"}),0.00,"identisches Pattern, aber ein Subpattern fehlt (nicht 'beide kanonisch') -> 0.00, keine erfundene Zwischenstufe");
  assertEq(EC.movementSimilarity({movement_pattern:"HORIZONTAL_PRESS",movement_subpattern:"FLAT_PRESS"},{movement_pattern:"VERTICAL_PRESS",movement_subpattern:"OVERHEAD_PRESS"}),0.55,"definierter Nachbar HORIZONTAL_PRESS->VERTICAL_PRESS: 0.55");
  assertEq(EC.movementSimilarity({movement_pattern:"HORIZONTAL_PRESS",movement_subpattern:"FLAT_PRESS"},{movement_pattern:"SHOULDER_ADDUCTION",movement_subpattern:"FLY"}),0.70,"definierter Nachbar HORIZONTAL_PRESS->SHOULDER_ADDUCTION: 0.70");
  assertEq(EC.movementSimilarity({movement_pattern:"ELBOW_FLEXION",movement_subpattern:"CURL"},{movement_pattern:"ANKLE_PLANTARFLEXION",movement_subpattern:"CALF_RAISE"}),0.00,"nicht gelistetes Paar -> 0.00");
  // Asymmetrie exakt wie in der Quelltabelle (KEINE erfundene Symmetrisierung):
  assertEq(EC.movementSimilarity({movement_pattern:"KNEE_FLEXION",movement_subpattern:"LEG_CURL"},{movement_pattern:"HIP_HINGE",movement_subpattern:"DEADLIFT"}),0.55,"KNEE_FLEXION->HIP_HINGE ist in der Matrix explizit gelistet: 0.55");
  assertEq(EC.movementSimilarity({movement_pattern:"HIP_HINGE",movement_subpattern:"DEADLIFT"},{movement_pattern:"KNEE_FLEXION",movement_subpattern:"LEG_CURL"}),0.00,"HIP_HINGE->KNEE_FLEXION ist NICHT gelistet (Quelltabelle nennt nur die Gegenrichtung) -> 0.00, keine erfundene Symmetrie");
  assertThrows(()=>EC.movementSimilarity({movement_pattern:"NOT_A_PATTERN"},{movement_pattern:"HIP_HINGE"}),"movementSimilarity mit unbekanntem movement_pattern wirft");
}

console.log("========== §4.3-Registry (STEP 04, wiederverwendet): Anatomy/Subregion-Tag-Referenzen ==========");
{
  const catalog=EC.loadExerciseCatalog();
  const exWithAnatomy=catalog.find(e=>e.exercise_id==="BARBELL_DEADLIFT");
  assertEq(exWithAnatomy.anatomy_tags.slice().sort(),["ERECTORS","GRIP","TRAPS"],"BARBELL_DEADLIFT.anatomy_tags exakt aus Catalog A");
  exWithAnatomy.anatomy_tags.forEach(tag=>{
    assert(!!validateAnatomySubregionTag(tag),tag+" ist ein gueltiger §4.3-Registry-Eintrag (STEP04 wiederverwendet, nicht dupliziert)");
  });
}

console.log("========== keine freien Strings: Catalog-Werte sind ausschliesslich kanonisch ==========");
{
  const catalog=EC.loadExerciseCatalog();
  catalog.forEach(e=>{
    assert(TD.isRegisteredMovementPatternId(e.movement_pattern),e.exercise_id+": movement_pattern kanonisch");
    if(e.movement_subpattern!=null)assert(TD.isRegisteredMovementSubpatternId(e.movement_subpattern),e.exercise_id+": movement_subpattern kanonisch");
  });
}

console.log("========== Exercise-IDs eindeutig, Catalog-Anzahl/Reihenfolge exakt (§29.10/§29.13) ==========");
{
  const catalog=EC.loadExerciseCatalog();
  assertEq(catalog.length,125,"Catalog enthaelt exakt 125 ExerciseDefinitions (§29.10)");
  assertEq(EC.EXERCISE_CATALOG_RELEASE_COUNT,125,"EXERCISE_CATALOG_RELEASE_COUNT=125");
  const ids=catalog.map(e=>e.exercise_id);
  assertEq(new Set(ids).size,125,"alle 125 exercise_id sind eindeutig");
  assertEq(ids[0],"BARBELL_BACK_SQUAT","erste Catalog-A-Zeile exakt (Reihenfolge erhalten)");
  assertEq(ids[ids.length-1],"SINGLE_LEG_GLUTE_BRIDGE","letzte Catalog-A-Zeile exakt (Reihenfolge erhalten)");
  const autoSelectableCount=catalog.filter(e=>e.auto_selectable).length;
  assertEq(autoSelectableCount,EC.EXERCISE_CATALOG_AUTO_SELECTABLE_COUNT,"121 auto-selectable Records (Release-Gate v1.4.1)");
  assertEq(catalog.length-autoSelectableCount,4,"4 NON_REP-manual-only-Records (Release-Gate v1.4.1)");
}

console.log("========== §29.7 Completeness Contract: NON_REP manual-only Exceptions exakt ==========");
{
  const catalog=EC.loadExerciseCatalog();
  const nonAuto=catalog.filter(e=>!e.auto_selectable).map(e=>e.exercise_id).sort();
  assertEq(nonAuto,EC.NON_REP_MANUAL_ONLY_EXERCISE_IDS.slice().sort(),"auto_selectable=false betrifft exakt PLANK/SIDE_PLANK/SUITCASE_CARRY/FARMERS_CARRY (§29.7)");
  nonAuto.forEach(id=>{
    const e=catalog.find(x=>x.exercise_id===id);
    assertEq(e.metadata_completeness,"COMPLETE","NON_REP-Record "+id+" bleibt trotzdem vollstaendig spezifiziert (metadata_completeness=COMPLETE, §29.7)");
    assert(e.rep_band_classes.indexOf("NON_REP")!==-1,id+": rep_band_classes enthaelt NON_REP");
  });
}

console.log("========== keine doppelten Muscle-Contributions (CAT-CONTRIBUTION-UNIQUE / INVARIANT CAT-C1) ==========");
{
  assertThrows(()=>TD.createExerciseDefinitionVersion({exercise_id:"X",canonical_name:"X",definition_version:1,status:"ACTIVE",movement_pattern:"HORIZONTAL_PRESS",movement_subpattern:"FLAT_PRESS",primary_muscle_bands:[{canonical_volume_muscle_id:"CHEST",contribution_band:"PRIMARY_HIGH"},{canonical_volume_muscle_id:"CHEST",contribution_band:"SECONDARY"}],exercise_class:"COMPOUND",instance_relevance:"NONE",calibration_mode:"STANDARD_CURVE",technical_demand:1,stability_demand:1,mobility_demand:1,setup_complexity:1,fatigue_local:1,fatigue_systemic:1,setup_time_class:"SHORT",unilateral_time_class:"NONE",warmup_protocol_class:"STANDARD",progression_ceiling_behavior:"X",auto_selectable:true,metadata_completeness:"COMPLETE",goal_compatibility:["HYPERTROPHY"],supported_slot_roles:["PRIMARY"],rep_band_classes:["MODERATE_8_12"],equipment_setups:[["FLOOR"]]}),"CHEST doppelt INNERHALB einer einzigen Liste (primary_muscle_bands) wird bereits bei Konstruktion abgelehnt (validateMuscleContributionBands)");

  // Ein Duplikat UEBER primary+secondary hinweg wird von der Konstruktion
  // NICHT erkannt (validateMuscleContributionBands prueft jede Liste fuer
  // sich) — das ist genau der Fall, den validateCatalogLints() (Lint #5/
  // CAT-C1) zusaetzlich abdeckt.
  const crossListDuplicate=TD.createExerciseDefinitionVersion({exercise_id:"X",canonical_name:"X",definition_version:1,status:"ACTIVE",movement_pattern:"HORIZONTAL_PRESS",movement_subpattern:"FLAT_PRESS",primary_muscle_bands:[{canonical_volume_muscle_id:"CHEST",contribution_band:"PRIMARY_HIGH"}],secondary_muscle_bands:[{canonical_volume_muscle_id:"CHEST",contribution_band:"SECONDARY"}],exercise_class:"COMPOUND",instance_relevance:"NONE",calibration_mode:"STANDARD_CURVE",technical_demand:1,stability_demand:1,mobility_demand:1,setup_complexity:1,fatigue_local:1,fatigue_systemic:1,setup_time_class:"SHORT",unilateral_time_class:"NONE",warmup_protocol_class:"STANDARD",progression_ceiling_behavior:"X",auto_selectable:true,metadata_completeness:"COMPLETE",goal_compatibility:["HYPERTROPHY"],supported_slot_roles:["PRIMARY"],rep_band_classes:["MODERATE_8_12"],equipment_setups:[["FLOOR"]]});
  const crossListErrors=EC.validateCatalogLints([crossListDuplicate]);
  assert(crossListErrors.some(e=>e.indexOf("CAT-LINT-5")!==-1),"CHEST doppelt UEBER primary+secondary hinweg wird von validateCatalogLints() (Lint #5/CAT-C1) erkannt");

  const catalog=EC.loadExerciseCatalog();
  const lintErrors=EC.validateCatalogLints(catalog);
  assertEq(lintErrors,[],"validateCatalogLints() findet 0 Fehler im echten 125er-Baseline-Catalog (§29.13 Release Gate)");
}

console.log("========== §29.13 Catalog-Lints: einzeln erzwungen (mit absichtlich kaputten Fixtures) ==========");
{
  const catalog=EC.loadExerciseCatalog();
  const broken=catalog.map(e=>Object.assign({},e));
  broken[0]=Object.assign({},broken[0],{exercise_id:broken[1].exercise_id}); // Lint #1: Duplikat erzwingen
  assert(EC.validateCatalogLints(broken).some(e=>e.indexOf("CAT-LINT-1")!==-1),"Lint #1 (eindeutige exercise_id) schlaegt bei kuenstlichem Duplikat an");

  const missingGoals=catalog.map(e=>Object.assign({},e));
  missingGoals[0]=Object.assign({},missingGoals[0],{goal_compatibility:[]});
  assert(EC.validateCatalogLints(missingGoals).some(e=>e.indexOf("CAT-LINT-10")!==-1),"Lint #10 (non-empty goals) schlaegt bei leerem goal_compatibility an");

  const wrongMeta=catalog.map(e=>Object.assign({},e));
  wrongMeta[0]=Object.assign({},wrongMeta[0],{metadata_completeness:"PARTIAL"});
  assert(EC.validateCatalogLints(wrongMeta).some(e=>e.indexOf("CAT-LINT-13")!==-1),"Lint #13 (metadata COMPLETE) schlaegt bei PARTIAL an");

  const autoNonRep=catalog.map(e=>Object.assign({},e));
  const plankIdx=autoNonRep.findIndex(e=>e.exercise_id==="PLANK");
  autoNonRep[plankIdx]=Object.assign({},autoNonRep[plankIdx],{auto_selectable:true});
  assert(EC.validateCatalogLints(autoNonRep).some(e=>e.indexOf("CAT-LINT-17")!==-1),"Lint #17 (kein NON_REP auto-selectable) schlaegt an, wenn PLANK kuenstlich auto_selectable=true gesetzt wird");

  const outOfRange=catalog.map(e=>Object.assign({},e));
  outOfRange[0]=Object.assign({},outOfRange[0],{technical_demand:6});
  assert(EC.validateCatalogLints(outOfRange).some(e=>e.indexOf("CAT-LINT-11")!==-1),"Lint #11 (Ordinal-Bereich 1..5, §23.1) schlaegt bei 6 an");

  const noEquip=catalog.map(e=>Object.assign({},e));
  noEquip[0]=Object.assign({},noEquip[0],{equipment_setups:[]});
  assert(EC.validateCatalogLints(noEquip).some(e=>e.indexOf("CAT-LINT-6")!==-1),"Lint #6 (mind. 1 EquipmentSetup fuer auto-selectable) schlaegt bei leerem equipment_setups an");
}

console.log("========== Rep-Band Registry (§29.7) ==========");
{
  assertEq(EC.REP_BAND_REGISTRY.LOW_3_6,[3,6],"LOW_3_6=[3,6]");
  assertEq(EC.REP_BAND_REGISTRY.MODERATE_5_8,[5,8],"MODERATE_5_8=[5,8]");
  assertEq(EC.REP_BAND_REGISTRY.MODERATE_6_10,[6,10],"MODERATE_6_10=[6,10]");
  assertEq(EC.REP_BAND_REGISTRY.MODERATE_8_12,[8,12],"MODERATE_8_12=[8,12]");
  assertEq(EC.REP_BAND_REGISTRY.HIGH_10_15,[10,15],"HIGH_10_15=[10,15]");
  assertEq(EC.REP_BAND_REGISTRY.HIGH_12_20,[12,20],"HIGH_12_20=[12,20]");
  assertEq(EC.REP_BAND_REGISTRY.NON_REP,null,"NON_REP hat keinen Zahlenbereich");
}

console.log("========== §4.1-Contribution-Baender im Catalog: ausschliesslich die 4 kanonischen Werte ==========");
{
  const catalog=EC.loadExerciseCatalog();
  const VALID_BANDS=["PRIMARY_HIGH","PRIMARY_MODERATE","SECONDARY","STABILIZER"];
  catalog.forEach(e=>{
    (e.primary_muscle_bands||[]).concat(e.secondary_muscle_bands||[]).forEach(b=>{
      assert(VALID_BANDS.indexOf(b.contribution_band)!==-1,e.exercise_id+": contribution_band "+b.contribution_band+" ist einer der 4 kanonischen §4.1-Werte, kein freier Dezimalwert");
      assert(typeof b.contribution_band==="string"&&!/^[0-9.]+$/.test(b.contribution_band),e.exercise_id+": kein freier Dezimalwert im Catalog (§29.13-Anforderung)");
    });
  });
}

console.log("\n"+passed+" bestanden, "+failed+" fehlgeschlagen");
process.exit(failed>0?1:0);
