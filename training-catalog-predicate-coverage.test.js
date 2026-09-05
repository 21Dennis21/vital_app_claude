/* training-catalog-predicate-coverage.test.js — STEP 06.1 FINAL PREDICATE/
   CAPABILITY COVERAGE CORRECTION.

   Ziel (Aufgabentext Abschnitt 6): fuer JEDES Predicate, das in den 125
   echten ExerciseDefinitions (training-exercise-catalog.js) verwendet wird,
   automatisiert beweisen:
     (a) es ist kanonisch bekannt (resolvable — bereits in training-
         equipment.test.js separat geprueft, hier als Voraussetzung erneut
         mitgefuehrt),
     (b) sein physischer Fact-Typ ist auflösbar,
     (c) fuer ein passendes, UI-produzierbares Test-Inventory-Fixture kann
         die Domain denselben Fact erzeugen, den resolveSetupPredicate()
         erwartet (satisfied:true).

   "UI-produzierbar" heisst konkret: jedes Fixture in FIXTURE_FOR unten
   verwendet AUSSCHLIESSLICH Familien/Subtypes/Machine-Functional-Subtypes/
   Capability-Namespace-Werte, die auch die echte index.html-Equipment-UI
   (EquipmentPickerPanel/EquipmentTypeRow, equipmentCapabilityConfigFor)
   anbietet, und LoadProfileVersion-Formen, die applyEquipmentSelection/
   buildLoadProfileFieldsFor tatsaechlich erzeugen (keine erfundenen
   Zwischenformen, keine neuen IDs).

   Jedes Fixture ist bewusst ISOLIERT (nur die fuer GENAU dieses eine
   Predicate noetigen Fakten) statt eines einzigen "maximal ausgestatteten"
   Fixtures fuer alle 76 Tags gleichzeitig — das deckungsgleich mit der
   Aufgabenformulierung "fuer EINEN passenden Test-Inventory-Fixture" (pro
   Predicate, nicht global). Eine ergaenzende Cross-Family-Vielfalt-Pruefung
   (mehrere Locations gleichzeitig voll ausgestattet) existiert bereits als
   "Full commercial gym"-Fixture in training-equipment.test.js. */
/* training-equipment.js nutzt Registries aus training-domain.js (und
   training-exercise-catalog.js wiederum Funktionen aus training-
   equipment.js) als bare Identifier — deshalb wie in training-
   equipment.test.js per vm.runInThisContext() in denselben globalen
   Kontext laden, nicht nur per require(). */
const fs=require("fs");
const path=require("path");
const vm=require("vm");
vm.runInThisContext(fs.readFileSync(path.join(__dirname,"training-domain.js"),"utf8"),{filename:"training-domain.js"});
vm.runInThisContext(fs.readFileSync(path.join(__dirname,"training-volume-engine.js"),"utf8"),{filename:"training-volume-engine.js"});
vm.runInThisContext(fs.readFileSync(path.join(__dirname,"training-equipment.js"),"utf8"),{filename:"training-equipment.js"});
const TD=require("./training-domain.js");
const EQ=require("./training-equipment.js");
const EC=require("./training-exercise-catalog.js");

let passed=0,failed=0;
function assert(cond,label){if(cond){passed++;}else{failed++;console.error("❌ FAIL:",label);}}

function def(id,family,subtype,mfs){
  return TD.createEquipmentDefinitionVersion({id,version:1,canonical_name:id,family,subtype,machine_functional_subtype:mfs||null,status:"ACTIVE"});
}
function inst(id,defId,opts){
  opts=opts||{};
  return TD.createEquipmentInstance(Object.assign({id,location_id:"loc1",equipment_definition_version_id:defId,inventory_state:"PRESENT"},opts));
}
function cap(namespace,value){return TD.createCapabilityPredicate({namespace,operator:"EQ",value});}
/* Deckt exakt die LoadProfileVersion-Formen ab, die index.html's
   buildLoadProfileFieldsFor() fuer die jeweilige Familie/den jeweiligen
   Machine Functional Subtype tatsaechlich erzeugt — keine eigene
   Test-only-Form erfinden. */
function lpFor(id,family,mfs,pairSemantics,plateDisplay){
  if(mfs==="ASSISTED_PULLUP_DIP"){
    return TD.createLoadProfileVersion({id,equipment_instance_id:"n/a",version:1,load_unit:"ASSISTANCE_KG",display_semantics:"ASSISTANCE",direction:"LOWER_IS_MORE",pair_semantics:"N_A",per_side_semantics:"N_A",ratio_confidence:"NONE",effective_load_unknown:true,microloading_available:false});
  }
  if(family==="SELECTORIZED_MACHINE"){
    return TD.createLoadProfileVersion({id,equipment_instance_id:"n/a",version:1,load_unit:"DISPLAY_UNIT",display_semantics:"STACK_LABEL",direction:"HIGHER_IS_MORE",pair_semantics:"N_A",per_side_semantics:"N_A",ratio_confidence:"NONE",effective_load_unknown:true,microloading_available:false});
  }
  if(family==="PLATE_LOADED_MACHINE"){
    const ds=plateDisplay==="TOTAL_ADDED"?"TOTAL_ADDED":"PER_SIDE";
    return TD.createLoadProfileVersion({id,equipment_instance_id:"n/a",version:1,load_unit:"KG",display_semantics:ds,direction:"HIGHER_IS_MORE",pair_semantics:"N_A",per_side_semantics:ds==="PER_SIDE"?"PER_SIDE":"TOTAL",ratio_confidence:"NONE",effective_load_unknown:true,microloading_available:false});
  }
  // FREE_WEIGHT Dumbbell/Kettlebell
  return TD.createLoadProfileVersion({id,equipment_instance_id:"n/a",version:1,load_unit:"KG",display_semantics:"PER_HAND",direction:"HIGHER_IS_MORE",pair_semantics:pairSemantics==="PAIR_PER_HAND"?"PAIR_PER_HAND":"SINGLE",per_side_semantics:"N_A",ratio_confidence:"NONE",effective_load_unknown:true,microloading_available:false});
}
function viewOf(defs,instances,lps,attachments){
  return EQ.buildLocationInventoryView("loc1",instances,attachments||[],defs,lps||[]);
}

/* ============ FIXTURE_FOR: tag -> {view, expectSatisfied} ============
   Jede Fixture-Funktion baut EINEN isolierten View, der GENAU das fuer
   dieses Predicate normativ noetige physische Faktum enthaelt — und NUR
   dieses (kein zusaetzliches "damit's auch sicher klappt"-Beiwerk). */
const FIXTURE_FOR={};

// --- einfache Subtype-Presence (registrierter §29.1-Subtype = Predicate-Name selbst) ---
[
  ["AB_WHEEL","SUPPORT","AB_WHEEL"],["BOX_STEP","SUPPORT","BOX_STEP"],["DIP_STATION","BODYWEIGHT","DIP_STATION"],
  ["FIXED_SUPPORT","SUPPORT","FIXED_SUPPORT"],["FLOOR","BODYWEIGHT","FLOOR"],["GHD","SUPPORT","GHD"],
  ["LANDMINE","SPECIAL_CORE","LANDMINE"],["LONG_BAND","RESISTANCE_ACCESSORY","LONG_BAND"],
  ["PLATES","FREE_WEIGHT","PLATES"],["PREACHER_BENCH","SUPPORT","PREACHER_BENCH"],
  ["PULLUP_BAR","BODYWEIGHT","PULLUP_BAR"],["RINGS","BODYWEIGHT","RINGS"],["ROMAN_CHAIR","SUPPORT","ROMAN_CHAIR"],
  ["SLIDERS","SUPPORT","SLIDERS"],["SMITH_MACHINE","RACK_STATION","SMITH_MACHINE"],["WALK_SPACE","BODYWEIGHT","WALK_SPACE"],
].forEach(([tag,family,subtype])=>{
  FIXTURE_FOR[tag]=()=>viewOf([def("d1",family,subtype)],[inst("i1","d1")]);
});

// --- BODYWEIGHT: immer erfuellt, keine Inventur noetig ---
FIXTURE_FOR.BODYWEIGHT=()=>viewOf([],[]);

// --- Subtype-OR-Gruppen ---
FIXTURE_FOR.BENCH_OR_BOX=()=>viewOf([def("d1","SUPPORT","BOX_STEP")],[inst("i1","d1")]);
FIXTURE_FOR.DUAL_CABLE_OR_CROSSOVER=()=>viewOf([def("d1","CABLE","FUNCTIONAL_TRAINER")],[inst("i1","d1")]);

// --- Bar+Plates-Verbund ---
FIXTURE_FOR.BARBELL_LOADABLE=()=>viewOf([def("d1","FREE_WEIGHT","OLYMPIC_BARBELL"),def("d2","FREE_WEIGHT","PLATES")],[inst("i1","d1"),inst("i2","d2")]);
FIXTURE_FOR.EZ_BAR_LOADABLE=()=>viewOf([def("d1","FREE_WEIGHT","EZ_CURL_BAR"),def("d2","FREE_WEIGHT","PLATES")],[inst("i1","d1"),inst("i2","d2")]);
FIXTURE_FOR.TRAP_BAR_LOADABLE=()=>viewOf([def("d1","FREE_WEIGHT","TRAP_BAR"),def("d2","FREE_WEIGHT","PLATES")],[inst("i1","d1"),inst("i2","d2")]);

// --- Dumbbell/Kettlebell Mengen-Semantik (LoadProfileVersion.pair_semantics) ---
FIXTURE_FOR.DUMBBELL_SINGLE=()=>{
  const d=def("d1","FREE_WEIGHT","FIXED_DUMBBELL");
  return viewOf([d],[inst("i1","d1",{load_profile_version_id:"lp1"})],[lpFor("lp1","FREE_WEIGHT",null,"SINGLE")]);
};
FIXTURE_FOR.DUMBBELL_PAIR=()=>{
  const d=def("d1","FREE_WEIGHT","FIXED_DUMBBELL");
  return viewOf([d],[inst("i1","d1",{load_profile_version_id:"lp1"})],[lpFor("lp1","FREE_WEIGHT",null,"PAIR_PER_HAND")]);
};
FIXTURE_FOR.DUMBBELL_SINGLE_OR_PAIR=()=>FIXTURE_FOR.DUMBBELL_PAIR();
FIXTURE_FOR.KETTLEBELL_SINGLE=()=>{
  const d=def("d1","FREE_WEIGHT","KETTLEBELL");
  return viewOf([d],[inst("i1","d1",{load_profile_version_id:"lp1"})],[lpFor("lp1","FREE_WEIGHT",null,"SINGLE")]);
};
FIXTURE_FOR.KETTLEBELL_PAIR=()=>{
  const d=def("d1","FREE_WEIGHT","KETTLEBELL");
  return viewOf([d],[inst("i1","d1",{load_profile_version_id:"lp1"})],[lpFor("lp1","FREE_WEIGHT",null,"PAIR_PER_HAND")]);
};

// --- Kompositfacts ---
FIXTURE_FOR.EXTERNAL_BODYWEIGHT_LOAD=()=>viewOf([def("d1","RESISTANCE_ACCESSORY","WEIGHT_VEST")],[inst("i1","d1")]);
FIXTURE_FOR.DIP_BELT=()=>viewOf(
  [def("d1","RESISTANCE_ACCESSORY","DIP_BELT"),def("d2","FREE_WEIGHT","PLATES")],
  [inst("i1","d1"),inst("i2","d2")]
);

// --- Capability-basierte Predicates (genau die Werte, die equipmentCapabilityConfigFor in index.html anbietet) ---
FIXTURE_FOR.BENCH_FLAT=()=>viewOf([def("d1","SUPPORT","ADJUSTABLE_BENCH")],[inst("i1","d1",{capability_values:[cap("BENCH","FLAT")]})]);
FIXTURE_FOR.BENCH_INCLINE=()=>viewOf([def("d1","SUPPORT","ADJUSTABLE_BENCH")],[inst("i1","d1",{capability_values:[cap("BENCH","INCLINE_ADJUSTABLE")]})]);
FIXTURE_FOR.BENCH_BACK_SUPPORT=()=>viewOf([def("d1","SUPPORT","ADJUSTABLE_BENCH")],[inst("i1","d1",{capability_values:[cap("SUPPORT","BACK_SUPPORTED")]})]);
FIXTURE_FOR.RACK_SQUAT_HEIGHT=()=>viewOf([def("d1","RACK_STATION","POWER_RACK")],[inst("i1","d1",{capability_values:[cap("RACK","SQUAT_HEIGHT")]})]);
FIXTURE_FOR.RACK_BENCH_HEIGHT=()=>viewOf([def("d1","RACK_STATION","POWER_RACK")],[inst("i1","d1",{capability_values:[cap("RACK","BENCH_HEIGHT")]})]);
FIXTURE_FOR.RACK_BAR_ROW_HEIGHT=()=>viewOf([def("d1","RACK_STATION","POWER_RACK")],[inst("i1","d1",{capability_values:[cap("RACK","ROW_HEIGHT")]})]);
FIXTURE_FOR.CABLE_HIGH=()=>viewOf([def("d1","CABLE","FUNCTIONAL_TRAINER")],[inst("i1","d1",{capability_values:[cap("PULLEY_POSITION","HIGH")]})]);
FIXTURE_FOR.CABLE_MID=()=>viewOf([def("d1","CABLE","FUNCTIONAL_TRAINER")],[inst("i1","d1",{capability_values:[cap("PULLEY_POSITION","MID")]})]);
FIXTURE_FOR.CABLE_LOW=()=>viewOf([def("d1","CABLE","FUNCTIONAL_TRAINER")],[inst("i1","d1",{capability_values:[cap("PULLEY_POSITION","LOW")]})]);
FIXTURE_FOR.CABLE_LOW_OR_MID=()=>viewOf([def("d1","CABLE","FUNCTIONAL_TRAINER")],[inst("i1","d1",{capability_values:[cap("PULLEY_POSITION","MID")]})]);
FIXTURE_FOR.CABLE_HIGH_OR_MID=()=>viewOf([def("d1","CABLE","FUNCTIONAL_TRAINER")],[inst("i1","d1",{capability_values:[cap("PULLEY_POSITION","HIGH")]})]);
FIXTURE_FOR.CABLE_HEIGHT_ADJUSTABLE=()=>viewOf([def("d1","CABLE","SINGLE_ADJUSTABLE_COLUMN")],[inst("i1","d1",{capability_values:[cap("PULLEY_POSITION","HEIGHT_ADJUSTABLE")]})]);
FIXTURE_FOR.LOWER_BODY_ANCHOR=()=>viewOf([def("d1","SUPPORT","GHD")],[inst("i1","d1",{capability_values:[cap("SUPPORT","LOWER_LEG_ANCHORED")]})]);
FIXTURE_FOR.ANCHOR_LOW=()=>viewOf([def("d1","RESISTANCE_ACCESSORY","ANCHOR_POINT")],[inst("i1","d1",{capability_values:[cap("ANCHOR","LOW")]})]);
FIXTURE_FOR.ANCHOR_MID=()=>viewOf([def("d1","RESISTANCE_ACCESSORY","ANCHOR_POINT")],[inst("i1","d1",{capability_values:[cap("ANCHOR","MID")]})]);
FIXTURE_FOR.ANCHOR_HIGH=()=>viewOf([def("d1","RESISTANCE_ACCESSORY","ANCHOR_POINT")],[inst("i1","d1",{capability_values:[cap("ANCHOR","HIGH")]})]);

// --- CABLE_ATTACHMENT-Shorthands: ueber die INTEGRIERTE Capability-Route
//     getestet (index.html's echte Equipment-UI setzt CABLE_ATTACHMENT als
//     Capability der Cable-Hauptinstanz — kein separates AttachmentInstance-
//     UI, aber laut resolveCableAttachment() ein normativ gleichwertiger
//     Weg: "eine PRESENT AttachmentInstance ODER eine identische integrierte
//     Capability"). Die separate-AttachmentInstance-Route ist bereits in
//     training-equipment.test.js domainseitig geprueft. */
Object.keys(EQ.CABLE_ATTACHMENT_SHORTHAND_MAP).forEach(tag=>{
  const firstValue=EQ.CABLE_ATTACHMENT_SHORTHAND_MAP[tag][0];
  FIXTURE_FOR[tag]=()=>viewOf([def("d1","CABLE","FUNCTIONAL_TRAINER")],[inst("i1","d1",{capability_values:[cap("CABLE_ATTACHMENT",firstValue)]})]);
});

// --- MACHINE(X): jeder im Catalog tatsaechlich verwendete Machine Functional
//     Subtype, ueber SELECTORIZED_MACHINE + der von buildLoadProfileFieldsFor
//     tatsaechlich erzeugten LoadProfileVersion (ASSISTED_PULLUP_DIP nutzt
//     die STEP06.1-Korrektur: ASSISTANCE/LOWER_IS_MORE statt STACK_LABEL). */
{
  const machineTags=new Set();
  EC.EXERCISE_CATALOG_RAW.forEach(e=>(e.equipment_setups||[]).forEach(b=>b.forEach(t=>{
    const m=/^MACHINE\(([A-Z0-9_]+)\)$/.exec(t);
    if(m)machineTags.add(m[1]);
  })));
  machineTags.forEach(mfs=>{
    const tag="MACHINE("+mfs+")";
    FIXTURE_FOR[tag]=()=>{
      const d=def("d1","SELECTORIZED_MACHINE","freier-name",mfs);
      return viewOf([d],[inst("i1","d1",{load_profile_version_id:"lp1"})],[lpFor("lp1","SELECTORIZED_MACHINE",mfs)]);
    };
  });
}

console.log("========== Catalog-Predicate-Coverage: jedes reale Predicate hat ein UI-produzierbares, satisfied=true-Fixture ==========");
{
  const tags=new Set();
  EC.EXERCISE_CATALOG_RAW.forEach(e=>(e.equipment_setups||[]).forEach(b=>b.forEach(t=>tags.add(t))));
  assert(tags.size>=70,"realistische Tag-Vielfalt im Catalog erfasst (sanity, >=70 distinct, aktuell "+tags.size+")");

  let missingFixture=[];
  let unsatisfied=[];
  tags.forEach(tag=>{
    const build=FIXTURE_FOR[tag];
    if(!build){missingFixture.push(tag);return;}
    const view=build();
    const result=EQ.resolveSetupPredicate(tag,view);
    if(!result.resolvable||!result.satisfied)unsatisfied.push(tag+" (resolvable="+result.resolvable+", satisfied="+result.satisfied+", needsInput="+result.needsInput+")");
  });
  assert(missingFixture.length===0,"jedes reale Catalog-Predicate hat eine definierte Test-Fixture in FIXTURE_FOR — fehlend: "+missingFixture.join(", "));
  assert(unsatisfied.length===0,"jedes Fixture macht sein Predicate satisfied=true — nicht erfuellt: "+unsatisfied.join(", "));
  console.log("  ("+tags.size+" einzigartige Predicates geprueft, "+Object.keys(FIXTURE_FOR).length+" Fixtures definiert)");
}

console.log("========== Negativ-Proben: fehlender Fakt -> NICHT satisfied (keine stillschweigende Ableitung) ==========");
{
  // Cable ohne jegliches Attachment erfuellt KEIN ATTACHMENT_*-Predicate.
  const cableNoAttachment=viewOf([def("d1","CABLE","FUNCTIONAL_TRAINER")],[inst("i1","d1")]);
  Object.keys(EQ.CABLE_ATTACHMENT_SHORTHAND_MAP).forEach(tag=>{
    assert(!EQ.resolveSetupPredicate(tag,cableNoAttachment).satisfied,"Cable OHNE Attachment-Capability erfuellt "+tag+" NICHT");
  });

  // Rack ohne PULLUP_BAR-Capability begruendet keinen Pull-up-Fakt (die
  // eigentliche PULLUP_BAR-Praedikat-Aufloesung haengt NUR an der
  // eigenstaendigen BODYWEIGHT/PULLUP_BAR-Subtype-Praesenz, s.u. — hier
  // wird zusaetzlich explizit geprueft, dass ein Rack MIT allen anderen
  // RACK-Capabilities aber OHNE PULLUP_BAR trotzdem kein PULLUP_BAR-
  // Predicate erfuellt).
  const rackNoPullup=viewOf([def("d1","RACK_STATION","POWER_RACK")],[inst("i1","d1",{capability_values:[cap("RACK","SQUAT_HEIGHT"),cap("RACK","BENCH_HEIGHT"),cap("RACK","ROW_HEIGHT")]})]);
  assert(!EQ.resolveSetupPredicate("PULLUP_BAR",rackNoPullup).satisfied,"Rack mit SQUAT/BENCH/ROW-Height aber OHNE eigenstaendige PULLUP_BAR-Einheit erfuellt PULLUP_BAR NICHT (keine implizite Rack->Pullup-Ableitung)");

  // GHD ohne LOWER_LEG_ANCHORED-Capability erfuellt LOWER_BODY_ANCHOR nicht.
  const ghdNoAnchor=viewOf([def("d1","SUPPORT","GHD")],[inst("i1","d1")]);
  assert(!EQ.resolveSetupPredicate("LOWER_BODY_ANCHOR",ghdNoAnchor).satisfied,"GHD ohne angehaktes LOWER_LEG_ANCHORED erfuellt LOWER_BODY_ANCHOR NICHT");

  // ANCHOR_POINT ohne Hoehen-Capability erfuellt keine ANCHOR_*-Predicates.
  const anchorNoHeight=viewOf([def("d1","RESISTANCE_ACCESSORY","ANCHOR_POINT")],[inst("i1","d1")]);
  ["ANCHOR_LOW","ANCHOR_MID","ANCHOR_HIGH"].forEach(tag=>{
    assert(!EQ.resolveSetupPredicate(tag,anchorNoHeight).satisfied,"ANCHOR_POINT ohne Hoehen-Capability erfuellt "+tag+" NICHT");
  });

  // Assisted-Pullup/Dip-Maschine OHNE LoadProfileVersion erfuellt MACHINE(ASSISTED_PULLUP_DIP) nicht
  // (kein Fallback wie bei Barbell+Plates — exakt der STEP06.1-Grundbefund fuer alle Maschinen).
  const assistedNoProfile=viewOf([def("d1","SELECTORIZED_MACHINE","x","ASSISTED_PULLUP_DIP")],[inst("i1","d1")]);
  assert(!EQ.resolveSetupPredicate("MACHINE(ASSISTED_PULLUP_DIP)",assistedNoProfile).satisfied,"Assisted-Pullup/Dip-Maschine OHNE LoadProfileVersion erfuellt MACHINE(ASSISTED_PULLUP_DIP) NICHT");
}

console.log("========== §9.1 ASSISTANCE_INVERSE-Korrektur: ASSISTED_PULLUP_DIP bekommt LOWER_IS_MORE/ASSISTANCE statt STACK_LABEL ==========");
{
  const exercise=EC.EXERCISE_CATALOG_RAW.find(e=>e.exercise_id==="ASSISTED_PULLUP_MACHINE");
  assert(!!exercise,"ASSISTED_PULLUP_MACHINE existiert im echten Catalog");
  assert(JSON.stringify(exercise.possible_load_mechanisms)===JSON.stringify(["ASSISTANCE_INVERSE"]),"Catalog deklariert ASSISTANCE_INVERSE als Load-Mechanismus (Voraussetzung fuer diesen Test)");
  const lpAssisted=lpFor("lp1","SELECTORIZED_MACHINE","ASSISTED_PULLUP_DIP");
  assertEqLocal(lpAssisted.display_semantics,"ASSISTANCE","buildLoadProfileFieldsFor-Nachbau: ASSISTED_PULLUP_DIP bekommt display_semantics=ASSISTANCE");
  assertEqLocal(lpAssisted.direction,"LOWER_IS_MORE","buildLoadProfileFieldsFor-Nachbau: ASSISTED_PULLUP_DIP bekommt direction=LOWER_IS_MORE");
  const errors=EQ.validateLoadProfileSemantics("ASSISTANCE_INVERSE",lpAssisted);
  assert(errors.length===0,"validateLoadProfileSemantics meldet KEINEN Fehler mehr fuer die korrigierte ASSISTED_PULLUP_DIP-LoadProfileVersion — vorher waere hier STACK_LABEL/HIGHER_IS_MORE fehlerhaft gewesen: "+errors.join("; "));

  // Gegenprobe: die ALTE (falsche) SELECTORIZED_MACHINE-Default-Form haette hier Fehler geworfen.
  const wrongLp=TD.createLoadProfileVersion({id:"lp_wrong",equipment_instance_id:"n/a",version:1,load_unit:"DISPLAY_UNIT",display_semantics:"STACK_LABEL",direction:"HIGHER_IS_MORE",pair_semantics:"N_A",per_side_semantics:"N_A",ratio_confidence:"NONE",effective_load_unknown:true,microloading_available:false});
  const wrongErrors=EQ.validateLoadProfileSemantics("ASSISTANCE_INVERSE",wrongLp);
  assert(wrongErrors.length>0,"Sanity: die alte generische SELECTORIZED_MACHINE-Form (STACK_LABEL/HIGHER_IS_MORE) WAERE fuer ASSISTANCE_INVERSE tatsaechlich fehlerhaft gewesen (beweist, dass die Korrektur einen echten Fehler behebt)");
}
function assertEqLocal(actual,expected,label){
  if(actual===expected){passed++;}else{failed++;console.error("❌ FAIL:",label,"— erwartet:",expected,"erhalten:",actual);}
}

console.log("\n"+passed+" bestanden, "+failed+" fehlgeschlagen");
process.exit(failed>0?1:0);
