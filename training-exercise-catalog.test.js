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

  // Lint #2: Catalog-Anzahl (< 125 durch kuenstliches Entfernen eines Records).
  assert(EC.validateCatalogLints(catalog.slice(1)).some(e=>e.indexOf("CAT-LINT-2")!==-1),"Lint #2 (Catalog-Anzahl exakt 125) schlaegt an, wenn ein Record kuenstlich entfernt wird");

  /* Lint #3: kanonisches movement_pattern/movement_subpattern. Wird NICHT in
     validateCatalogLints() erzwungen, sondern bereits eine Ebene tiefer beim
     Konstruieren jeder ExerciseDefinitionVersion (createExerciseDefinitionVersion
     -> TD.validateEnumValue gegen MOVEMENT_PATTERN_ID/MOVEMENT_SUBPATTERN_ID,
     training-domain.js) — siehe auch den bereits bestehenden Test-Block "keine
     freien Strings", der bestaetigt, dass ALLE 125 echten Records kanonisch
     sind. Hier wird zusaetzlich bewiesen, dass ein NICHT-kanonischer Wert bei
     der Konstruktion tatsaechlich abgelehnt wird (die eigentliche Lint-#3-
     Durchsetzung). */
  const rawTemplate=EC.EXERCISE_CATALOG_RAW.find(r=>r.exercise_id==="BULGARIAN_SPLIT_SQUAT");
  assertThrows(()=>TD.createExerciseDefinitionVersion(Object.assign({definition_version:1,status:"ACTIVE"},rawTemplate,{movement_pattern:"NOT_A_CANONICAL_PATTERN"})),"Lint #3 (kanonisches movement_pattern) schlaegt bei Entity-Konstruktion mit ungueltigem Pattern an");
  assertThrows(()=>TD.createExerciseDefinitionVersion(Object.assign({definition_version:1,status:"ACTIVE"},rawTemplate,{movement_subpattern:"NOT_A_CANONICAL_SUBPATTERN"})),"Lint #3 (kanonisches movement_subpattern) schlaegt bei Entity-Konstruktion mit ungueltigem Subpattern an");

  /* Lint #4 (Muskel-Teil): canonical_volume_muscle_id wird ebenfalls bereits
     bei der Entity-Konstruktion erzwungen (validateMuscleContributionBands ->
     TD.validateEnumValue gegen CANONICAL_VOLUME_MUSCLE_ID). Der Tag-Teil
     (anatomy_tags/subregion_tags) wird direkt in validateCatalogLints via
     validateAnatomySubregionTag geprueft. */
  assertThrows(()=>TD.createExerciseDefinitionVersion(Object.assign({definition_version:1,status:"ACTIVE"},rawTemplate,{primary_muscle_bands:[{canonical_volume_muscle_id:"NOT_A_MUSCLE",contribution_band:"PRIMARY_HIGH"}]})),"Lint #4 (Muskel-Teil: canonical_volume_muscle_id muss existieren) schlaegt bei Entity-Konstruktion mit unbekannter Muscle-ID an");
  const badTag=catalog.map(e=>Object.assign({},e));
  badTag[0]=Object.assign({},badTag[0],{anatomy_tags:["NOT_A_REGISTERED_TAG"]});
  assert(EC.validateCatalogLints(badTag).some(e=>e.indexOf("CAT-LINT-4")!==-1),"Lint #4 (Tag-Teil: anatomy_tags/subregion_tags muessen im §4.3-Registry existieren) schlaegt bei unbekanntem Tag an");

  // Lint #5 / CAT-CONTRIBUTION-UNIQUE: dieselbe Muscle-ID darf nicht gleichzeitig primary UND secondary sein.
  const dupMuscle=catalog.map(e=>Object.assign({},e));
  dupMuscle[0]=Object.assign({},dupMuscle[0],{
    primary_muscle_bands:[{canonical_volume_muscle_id:"QUADS",contribution_band:"PRIMARY_HIGH"}],
    secondary_muscle_bands:[{canonical_volume_muscle_id:"QUADS",contribution_band:"SECONDARY"}],
  });
  assert(EC.validateCatalogLints(dupMuscle).some(e=>e.indexOf("CAT-LINT-5")!==-1),"Lint #5 (CAT-CONTRIBUTION-UNIQUE) schlaegt an, wenn dieselbe Muscle-ID sowohl primary als auch secondary auftritt");

  // Lint #7: SETUP_DEFINED(...)-Load-Mechanismus-Aritaet muss zu equipment_setups-Branches passen.
  const bssIdx=catalog.findIndex(e=>e.exercise_id==="BULGARIAN_SPLIT_SQUAT");
  const badArity7=catalog.map(e=>Object.assign({},e));
  badArity7[bssIdx]=Object.assign({},badArity7[bssIdx],{equipment_setups:[["DUMBBELL_PAIR","BENCH_OR_BOX"]]}); // nur 1 Branch statt 2
  assert(EC.validateCatalogLints(badArity7).some(e=>e.indexOf("CAT-LINT-7")!==-1),"Lint #7 (Aritaet Load-Mechanismus <-> equipment_setups) schlaegt an, wenn eine Branch kuenstlich entfernt wird");

  // Lint #8 (Aritaet): calibration_mode-Komponenten weder 1 (broadcast) noch positionsgleich.
  const badArity8=catalog.map(e=>Object.assign({},e));
  badArity8[bssIdx]=Object.assign({},badArity8[bssIdx],{calibration_mode:"SETUP_DEFINED(STANDARD_CURVE/BODYWEIGHT_EFFECTIVE_LOAD/EXTRA_VALUE)"});
  assert(EC.validateCatalogLints(badArity8).some(e=>e.indexOf("CAT-LINT-8")!==-1),"Lint #8 (Aritaet calibration_mode) schlaegt an, wenn eine dritte, ueberzaehlige Komponente hinzugefuegt wird");

  // Lint #8 (Selbstkonsistenz): NON_REP_MANUAL_ONLY muss mit auto_selectable=false + MANUAL_ONLY_NON_REP-Flag uebereinstimmen.
  const plankIdx8=catalog.findIndex(e=>e.exercise_id==="PLANK");
  const badSelfConsist8=catalog.map(e=>Object.assign({},e));
  badSelfConsist8[plankIdx8]=Object.assign({},badSelfConsist8[plankIdx8],{progression_capabilities:["DURATION","VARIANT"]}); // MANUAL_ONLY_NON_REP-Flag entfernt
  assert(EC.validateCatalogLints(badSelfConsist8).some(e=>e.indexOf("CAT-LINT-8")!==-1),"Lint #8 (Selbstkonsistenz NON_REP_MANUAL_ONLY <-> progression_capabilities) schlaegt an, wenn das MANUAL_ONLY_NON_REP-Flag fehlt");

  // Lint #9 / LB-9: BODYWEIGHT_OR_REP_ONLY darf kein fiktives LOAD/STANDARD_CURVE exponieren.
  const pushupIdx=catalog.findIndex(e=>e.exercise_id==="PUSHUP");
  const badLB9Load=catalog.map(e=>Object.assign({},e));
  badLB9Load[pushupIdx]=Object.assign({},badLB9Load[pushupIdx],{progression_capabilities:["REPS","VARIANT","LOAD"]});
  assert(EC.validateCatalogLints(badLB9Load).some(e=>e.indexOf("CAT-LINT-9")!==-1),"Lint #9/LB-9 (kein fiktives LOAD) schlaegt an, wenn ein BODYWEIGHT_OR_REP_ONLY-Record LOAD exponiert");
  const badLB9Curve=catalog.map(e=>Object.assign({},e));
  badLB9Curve[pushupIdx]=Object.assign({},badLB9Curve[pushupIdx],{calibration_mode:"STANDARD_CURVE"});
  assert(EC.validateCatalogLints(badLB9Curve).some(e=>e.indexOf("CAT-LINT-9")!==-1),"Lint #9/LB-9 (kein STANDARD_CURVE) schlaegt an, wenn ein BODYWEIGHT_OR_REP_ONLY-Record STANDARD_CURVE nutzt");

  // Lint #12 (partiell): Assistance-Capability muss LOWER_IS_MORE-Richtung (ASSISTANCE_DECREASE) sein.
  const badAssist=catalog.map(e=>Object.assign({},e));
  badAssist[0]=Object.assign({},badAssist[0],{progression_capabilities:badAssist[0].progression_capabilities.concat(["ASSISTANCE_INCREASE"])});
  assert(EC.validateCatalogLints(badAssist).some(e=>e.indexOf("CAT-LINT-12")!==-1),"Lint #12 (Assistance-Richtung LOWER_IS_MORE) schlaegt an, wenn eine Capability 'ASSISTANCE_INCREASE' statt ASSISTANCE_DECREASE auftaucht");

  // Lint #14: doppelte Alias-Identitaet (Alias kollidiert mit bestehender exercise_id oder einem anderen Alias).
  const dupAlias=catalog.map(e=>Object.assign({},e));
  dupAlias[0]=Object.assign({},dupAlias[0],{aliases:[dupAlias[1].exercise_id]});
  assert(EC.validateCatalogLints(dupAlias).some(e=>e.indexOf("CAT-LINT-14")!==-1),"Lint #14 (keine doppelte Alias-Identitaet) schlaegt an, wenn ein Alias mit einer bestehenden exercise_id kollidiert");

  // Lint #16 (partiell): strukturell degenerierte EquipmentSetups (doppeltes Tag / doppelte Branch).
  const dupTagBranch=catalog.map(e=>Object.assign({},e));
  dupTagBranch[0]=Object.assign({},dupTagBranch[0],{equipment_setups:[["BARBELL_LOADABLE","BARBELL_LOADABLE"]]});
  assert(EC.validateCatalogLints(dupTagBranch).some(e=>e.indexOf("CAT-LINT-16")!==-1),"Lint #16 (keine degenerierte AND-Gruppe) schlaegt an, wenn ein Tag innerhalb einer Branch doppelt vorkommt");
  const dupBranch=catalog.map(e=>Object.assign({},e));
  dupBranch[0]=Object.assign({},dupBranch[0],{equipment_setups:[["BARBELL_LOADABLE"],["BARBELL_LOADABLE"]]});
  assert(EC.validateCatalogLints(dupBranch).some(e=>e.indexOf("CAT-LINT-16")!==-1),"Lint #16 (keine redundante doppelte OR-Branch) schlaegt an, wenn zwei equipment_setups-Branches identisch sind");

  // Lint #18: normative Identifier muessen durch bestehende Registries bzw. den Baseline-Wertevorrat aufloesen.
  const badGoal=catalog.map(e=>Object.assign({},e));
  badGoal[0]=Object.assign({},badGoal[0],{goal_compatibility:["NOT_A_GOAL"]});
  assert(EC.validateCatalogLints(badGoal).some(e=>e.indexOf("CAT-LINT-18")!==-1),"Lint #18 (goal_compatibility gegen TRAINING_GOAL) schlaegt bei unbekanntem Goal an");
  const badMech=catalog.map(e=>Object.assign({},e));
  badMech[0]=Object.assign({},badMech[0],{possible_load_mechanisms:["NOT_A_LOAD_MECHANISM"]});
  assert(EC.validateCatalogLints(badMech).some(e=>e.indexOf("CAT-LINT-18")!==-1),"Lint #18 (load-mechanism-Komponente gegen §9.1-Registry) schlaegt bei unbekanntem Mechanismus an");
  const badUnilateral=catalog.map(e=>Object.assign({},e));
  badUnilateral[0]=Object.assign({},badUnilateral[0],{unilateral_time_class:"NOT_A_CLASS"});
  assert(EC.validateCatalogLints(badUnilateral).some(e=>e.indexOf("CAT-LINT-18")!==-1),"Lint #18 (unilateral_time_class gegen §17.4) schlaegt bei unbekanntem Wert an");
  const badExClass=catalog.map(e=>Object.assign({},e));
  badExClass[0]=Object.assign({},badExClass[0],{exercise_class:"NOT_A_CLASS"});
  assert(EC.validateCatalogLints(badExClass).some(e=>e.indexOf("CAT-LINT-18")!==-1),"Lint #18 (exercise_class gegen den Baseline-abgeleiteten Wertevorrat) schlaegt bei unbekanntem Wert an");

  // Alle 18 Lints sind maschinenlesbar im Status-Objekt vertreten und behaupten NIRGENDS einen unehrlichen vollen PASS.
  for(let lintNo=1;lintNo<=18;lintNo++){
    assert(!!EC.CATALOG_LINT_STATUS[lintNo],"CATALOG_LINT_STATUS enthaelt einen Eintrag fuer Lint #"+lintNo);
    assert(["IMPLEMENTED","PARTIAL","NOT_TESTABLE"].indexOf(EC.CATALOG_LINT_STATUS[lintNo].status)!==-1,"Lint #"+lintNo+" hat einen der 3 zulaessigen Status-Werte");
  }
  assertEq(EC.CATALOG_LINT_STATUS[12].status,"PARTIAL","Lint #12 ist ehrlich als PARTIAL markiert (PER_HAND/PER_SIDE/TOTAL ist ein LoadProfileVersion-Laufzeitdatum, kein Catalog-Feld)");
  assertEq(EC.CATALOG_LINT_STATUS[15].status,"NOT_TESTABLE","Lint #15 ist ehrlich als NOT_TESTABLE markiert (Substitution-/Equipment-Matching-Engine existiert nicht)");
  assertEq(EC.CATALOG_LINT_STATUS[16].status,"PARTIAL","Lint #16 ist ehrlich als PARTIAL markiert (echte Unmoeglichkeit braucht eine Equipment-Mutual-Exclusivity-Registry)");
  const fullyImplemented=[1,2,3,4,5,6,7,8,9,10,11,13,14,17,18];
  fullyImplemented.forEach(n=>assertEq(EC.CATALOG_LINT_STATUS[n].status,"IMPLEMENTED","Lint #"+n+" ist als vollstaendig IMPLEMENTED markiert"));

  // Die REALE, unveraenderte 125-Record-Baseline muss bei alledem 0 Lint-Fehler haben (kein Fake-PASS: die neue, strengere Logik darf keine echten Regressionen uebersehen ODER faelschlich melden).
  assertEq(EC.validateCatalogLints(catalog),[],"die reale, unveraenderte 125-Record-Baseline besteht alle strukturell pruefbaren §29.13-Lints mit 0 Fehlern");
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
