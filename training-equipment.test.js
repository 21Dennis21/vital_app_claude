/* training-equipment.test.js — Tests fuer training-equipment.js
   (TRAINING SYSTEM v1.4.1, IMPLEMENTATION PACK 06/14: Equipment/Locations/
   Feasibility/Support/Load Granularity).

   Laedt training-domain.js/training-volume-engine.js/training-equipment.js
   per vm.runInThisContext() in den globalen Kontext (wie training-exercise-
   catalog.test.js), weil training-equipment.js selbst Registries aus
   training-domain.js als bare Identifier nutzt UND training-exercise-
   catalog.js (Lint #16, hier ebenfalls fuer den Regressionscheck geladen)
   seinerseits Funktionen aus training-equipment.js als bare Identifier
   nutzt. */
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
function assertEq(actual,expected,label){
  const ok=JSON.stringify(actual)===JSON.stringify(expected);
  if(ok){passed++;}else{failed++;console.error("❌ FAIL:",label,"— erwartet:",expected,"erhalten:",actual);}
}
function assertThrows(fn,label){
  try{fn();failed++;console.error("❌ FAIL:",label,"— hat NICHT geworfen");}
  catch(e){passed++;}
}

function def(id,family,subtype,mfs){
  return TD.createEquipmentDefinitionVersion({id,version:1,canonical_name:id,family,subtype,machine_functional_subtype:mfs||null,status:"ACTIVE"});
}
function inst(id,defId,state,opts){
  opts=opts||{};
  return TD.createEquipmentInstance(Object.assign({id,location_id:"loc1",equipment_definition_version_id:defId,inventory_state:state},opts));
}
function cap(namespace,value){return TD.createCapabilityPredicate({namespace,operator:"EQ",value});}

console.log("========== §29.1 Equipment Family/Subtype Registry: unknown ID rejected ==========");
{
  assert(TD.isValidEquipmentFamily("FREE_WEIGHT"),"FREE_WEIGHT ist eine gueltige Familie");
  assert(!TD.isValidEquipmentFamily("NOT_A_FAMILY"),"unbekannte Familie wird abgelehnt");
  assert(TD.isValidEquipmentSubtype("FREE_WEIGHT","OLYMPIC_BARBELL"),"OLYMPIC_BARBELL ist gueltiger FREE_WEIGHT-Subtype");
  assert(!TD.isValidEquipmentSubtype("FREE_WEIGHT","NOT_A_SUBTYPE"),"unbekannter Subtype wird abgelehnt");
  assert(!TD.isValidEquipmentSubtype("FREE_WEIGHT","ADJUSTABLE_BENCH"),"Subtype aus anderer Familie wird fuer FREE_WEIGHT abgelehnt");
  assertThrows(()=>def("d1","NOT_A_FAMILY","X"),"createEquipmentDefinitionVersion wirft bei unbekannter family");
  assertThrows(()=>def("d1","FREE_WEIGHT","NOT_A_SUBTYPE"),"createEquipmentDefinitionVersion wirft bei unbekanntem subtype");
  assertThrows(()=>def("d1","SELECTORIZED_MACHINE","x"),"SELECTORIZED_MACHINE ohne machine_functional_subtype wirft");
  assertThrows(()=>def("d1","FREE_WEIGHT","OLYMPIC_BARBELL","CHEST_PRESS_FLAT"),"machine_functional_subtype bei Nicht-Machine-Familie wirft");
  assert(!!def("d1","SELECTORIZED_MACHINE","irgendein-freier-name","CHEST_PRESS_FLAT"),"SELECTORIZED_MACHINE mit gueltigem machine_functional_subtype akzeptiert freien subtype-String (§29.1: keine Subtype-Liste fuer diese Familie)");
  assertThrows(()=>def("d1","SELECTORIZED_MACHINE","x","NOT_A_MACHINE_SUBTYPE"),"unbekannter machine_functional_subtype wirft");
}

console.log("========== §29.2 Machine Functional Subtype Registry ==========");
{
  assertEq(TD.MACHINE_FUNCTIONAL_SUBTYPE_REGISTRY.length,28,"28 kanonische Machine-Functional-Subtypes");
  ["CHEST_PRESS_FLAT","LEG_PRESS_45","ASSISTED_PULLUP_DIP"].forEach(v=>assert(TD.MACHINE_FUNCTIONAL_SUBTYPE_REGISTRY.indexOf(v)!==-1,v+" ist registriert"));
}

console.log("========== §29.3 Capability Registry: unknown ID rejected ==========");
{
  assert(TD.isValidCapabilityNamespace("RACK"),"RACK ist ein gueltiger Namespace");
  assert(!TD.isValidCapabilityNamespace("NOT_A_NAMESPACE"),"unbekannter Namespace wird abgelehnt");
  assert(TD.isValidCapabilityValue("BENCH","DECLINE_CAPABLE"),"DECLINE_CAPABLE ist gueltiger BENCH-Wert");
  assert(!TD.isValidCapabilityValue("BENCH","NOT_A_VALUE"),"unbekannter Capability-Wert wird abgelehnt");
  assertThrows(()=>TD.createCapabilityPredicate({namespace:"NOT_A_NAMESPACE",operator:"EQ",value:"X"}),"createCapabilityPredicate wirft bei unbekanntem namespace");
  assertThrows(()=>TD.createCapabilityPredicate({namespace:"BENCH",operator:"EQ",value:"NOT_A_VALUE"}),"createCapabilityPredicate wirft bei unbekanntem value");
}

console.log("========== §9.1 LoadProfileVersion: Enum-Felder geschlossen ==========");
{
  const validLpv={id:"lpv1",equipment_instance_id:"ei1",version:1,load_unit:"KG",display_semantics:"TOTAL_LOAD",direction:"HIGHER_IS_MORE",pair_semantics:"SINGLE",per_side_semantics:"N_A",ratio_confidence:"NONE",effective_load_unknown:false,microloading_available:false};
  assert(!!TD.createLoadProfileVersion(validLpv),"gueltige LoadProfileVersion wird akzeptiert");
  assertThrows(()=>TD.createLoadProfileVersion({...validLpv,load_unit:"NOT_A_UNIT"}),"ungueltiger load_unit wirft");
  assertThrows(()=>TD.createLoadProfileVersion({...validLpv,display_semantics:"NOT_A_SEMANTIC"}),"ungueltige display_semantics wirft");
  assertThrows(()=>TD.createLoadProfileVersion({...validLpv,direction:"SIDEWAYS"}),"ungueltige direction wirft");
  assertThrows(()=>TD.createLoadProfileVersion({...validLpv,pair_semantics:"BOTH"}),"ungueltige pair_semantics wirft");
  assertThrows(()=>TD.createLoadProfileVersion({...validLpv,per_side_semantics:"HALF"}),"ungueltige per_side_semantics wirft");
  assertThrows(()=>TD.createLoadProfileVersion({...validLpv,ratio_confidence:"MAYBE"}),"ungueltige ratio_confidence wirft");
}

console.log("========== Alle 76 realen Catalog-Tags sind resolvable (Voraussetzung Catalog-Lint #16) ==========");
{
  const tags=new Set();
  EC.EXERCISE_CATALOG_RAW.forEach(e=>(e.equipment_setups||[]).forEach(b=>b.forEach(t=>tags.add(t))));
  const emptyView=EQ.buildLocationInventoryView("loc1",[],[],[]);
  let unresolved=[];
  tags.forEach(t=>{if(!EQ.resolveSetupPredicate(t,emptyView).resolvable)unresolved.push(t);});
  assertEq(unresolved,[],"kein realer Catalog-Tag ist strukturell unresolvable ("+tags.size+" geprueft)");
  assert(tags.size>=70,"realistische Tag-Vielfalt im Catalog erfasst (sanity, >=70 distinct)");
}

console.log("========== Unbekannter/erfundener Predicate-Tag ist NICHT resolvable (impossible branch) ==========");
{
  const emptyView=EQ.buildLocationInventoryView("loc1",[],[],[]);
  assertEq(EQ.resolveSetupPredicate("NOT_A_REAL_PREDICATE",emptyView).resolvable,false,"frei erfundener Tag ist nicht resolvable");
  const branch=EQ.resolveSetupBranchSatisfiability(["BODYWEIGHT","NOT_A_REAL_PREDICATE"],emptyView);
  assert(branch.impossible,"Branch mit einem unresolvable Tag ist als impossible markiert");
  assert(!branch.satisfied,"impossible Branch ist niemals satisfied — auch nicht mit leerem Inventar");
}

console.log("========== OR-of-AND EquipmentSetup Satisfiability ==========");
{
  const defs=[def("d_bar","FREE_WEIGHT","OLYMPIC_BARBELL"),def("d_rack","RACK_STATION","POWER_RACK"),def("d_db","FREE_WEIGHT","FIXED_DUMBBELL")];
  const instances=[
    inst("i_bar","d_bar","PRESENT",{load_profile_version_id:"lp1"}),
    inst("i_rack","d_rack","PRESENT",{capability_values:[cap("RACK","SQUAT_HEIGHT")]}),
  ];
  const view=EQ.buildLocationInventoryView("loc1",instances,[],defs);
  // Branch 1 (Barbell) satisfiable, Branch 2 (Dumbbell) nicht (keine DB PRESENT) — Gesamt-OR muss trotzdem satisfiable sein.
  const setups=[["BARBELL_LOADABLE","RACK_SQUAT_HEIGHT"],["DUMBBELL_SINGLE"]];
  const res=EQ.resolveEquipmentSetupSatisfiability(setups,view);
  assert(res.satisfiable,"OR: mindestens eine satisfiable Branch reicht");
  assertEq(res.satisfiableBranchIndices,[0],"genau Branch 0 (Barbell) ist satisfiable, Branch 1 (Dumbbell) nicht");
  const allImpossible=EQ.resolveEquipmentSetupSatisfiability([["DUMBBELL_SINGLE"]],view);
  assert(!allImpossible.satisfiable,"AND-Branch ohne erfuellte Praedikate ist nicht satisfiable, auch wenn resolvable");
}

console.log("========== PRESENT / NOT_PRESENT / UNKNOWN ==========");
{
  const defs=[def("d_bar","FREE_WEIGHT","OLYMPIC_BARBELL")];
  ["PRESENT","NOT_PRESENT","UNKNOWN"].forEach(state=>{
    const instances=[inst("i1","d_bar",state,{load_profile_version_id:"lp1"})];
    const view=EQ.buildLocationInventoryView("loc1",instances,[],defs);
    const satisfied=EQ.resolveSetupPredicate("BARBELL_LOADABLE",view).satisfied;
    assertEq(satisfied,state==="PRESENT","BARBELL_LOADABLE nur bei inventory_state=PRESENT erfuellt (state="+state+")");
  });
  assertThrows(()=>inst("i1","d_bar","MAYBE"),"createEquipmentInstance wirft bei ungueltigem inventory_state");
  assertThrows(()=>TD.createAttachmentInstance({id:"a1",location_id:"loc1",equipment_definition_version_id:"d_bar",inventory_state:"MAYBE"}),"createAttachmentInstance wirft bei ungueltigem inventory_state");
}

console.log("========== TEMPORARILY_UNAVAILABLE aendert Inventory NICHT (getrennte Achsen, §1.4) ==========");
{
  // AvailabilityEvent ist eine reine Session-/Zeitachse und veraendert
  // niemals inventory_state — dieses Pack modelliert keine eigene
  // "wirksame Verfuegbarkeit"-Aufloesungsfunktion (das ist Session-Scope,
  // out of scope), beweist aber strukturell: AvailabilityEvent traegt kein
  // inventory_state-Feld und EquipmentInstance.inventory_state bleibt beim
  // Erzeugen eines AvailabilityEvent unveraendert.
  const instance=inst("i1","d1_placeholder","PRESENT");
  const availabilityEvent=TD.createAvailabilityEvent({id:"ave1",equipment_instance_id:"i1",state:"TEMPORARILY_UNAVAILABLE",starts_at:"2026-09-04T00:00:00Z",reason:"in Wartung",recorded_at:"2026-09-04T00:00:00Z"});
  assertEq(instance.inventory_state,"PRESENT","EquipmentInstance.inventory_state bleibt PRESENT trotz TEMPORARILY_UNAVAILABLE-AvailabilityEvent");
  assert(!Object.prototype.hasOwnProperty.call(availabilityEvent,"inventory_state"),"AvailabilityEvent besitzt kein inventory_state-Feld (getrennte Achse)");
  assertThrows(()=>TD.createAvailabilityEvent({id:"ave1",equipment_instance_id:"i1",state:"SOMETHING_ELSE",starts_at:"2026-09-04T00:00:00Z",reason:"x",recorded_at:"2026-09-04T00:00:00Z"}),"AvailabilityEvent.state gegen AVAILABILITY_STATE geschlossen");
}

console.log("========== Attachment-Aufloesung (separate AttachmentInstance ODER integrierte Capability) ==========");
{
  const defs=[def("d_cable","CABLE","FUNCTIONAL_TRAINER"),def("d_rope","CABLE","FUNCTIONAL_TRAINER")];
  const attachment=TD.createAttachmentInstance({id:"att1",location_id:"loc1",equipment_definition_version_id:"d_rope",inventory_state:"PRESENT",capability_values:[cap("CABLE_ATTACHMENT","ROPE")]});
  const viewWithAttachment=EQ.buildLocationInventoryView("loc1",[inst("i_cable","d_cable","PRESENT")],[attachment],defs);
  assert(EQ.resolveSetupPredicate("ATTACHMENT_ROPE",viewWithAttachment).satisfied,"ATTACHMENT_ROPE erfuellt via separate PRESENT AttachmentInstance");

  const integratedInstance=inst("i_cable2","d_cable","PRESENT",{capability_values:[cap("CABLE_ATTACHMENT","ROPE")]});
  const viewIntegrated=EQ.buildLocationInventoryView("loc1",[integratedInstance],[],defs);
  assert(EQ.resolveSetupPredicate("ATTACHMENT_ROPE",viewIntegrated).satisfied,"ATTACHMENT_ROPE erfuellt via integrierte Capability auf der Haupt-EquipmentInstance");

  const emptyView=EQ.buildLocationInventoryView("loc1",[inst("i_cable3","d_cable","PRESENT")],[],defs);
  assert(!EQ.resolveSetupPredicate("ATTACHMENT_ROPE",emptyView).satisfied,"ATTACHMENT_ROPE NICHT erfuellt ohne jede Rope-Capability (keine implizite Ableitung)");

  assertEq(EQ.CABLE_ATTACHMENT_SHORTHAND_MAP.ATTACHMENT_BAR_OR_ROPE,["STRAIGHT_BAR","EZ_BAR","ROPE"],"ATTACHMENT_BAR_OR_ROPE-Mapping exakt aus §29.4");
}

console.log("========== Cable-/Bench-/Rack-Capabilities werden NICHT erfunden (§29.3 DECISION) ==========");
{
  const defs=[def("d_cable_high_only","CABLE","SINGLE_ADJUSTABLE_COLUMN"),def("d_bench_plain","SUPPORT","ADJUSTABLE_BENCH")];
  const highOnlyCable=inst("i_cable","d_cable_high_only","PRESENT",{capability_values:[cap("PULLEY_POSITION","HIGH")]});
  const plainBench=inst("i_bench","d_bench_plain","PRESENT",{capability_values:[cap("BENCH","INCLINE_ADJUSTABLE")]});
  const view=EQ.buildLocationInventoryView("loc1",[highOnlyCable,plainBench],[],defs);
  assert(EQ.resolveSetupPredicate("CABLE_HIGH",view).satisfied,"High-only Cable erfuellt CABLE_HIGH");
  assert(!EQ.resolveSetupPredicate("CABLE_LOW",view).satisfied,"High-only Cable erfuellt KEIN CABLE_LOW (Aufgabentext-Beispiel)");
  assert(!EQ.resolveSetupPredicate("CABLE_MID",view).satisfied,"High-only Cable erfuellt KEIN CABLE_MID");
  assert(!EQ.resolveSetupPredicate("BENCH_FLAT",view).satisfied,"Adjustable Bench ohne FLAT-Capability erfuellt KEIN BENCH_FLAT");
  const declineBench=inst("i_bench2","d_bench_plain","PRESENT",{capability_values:[cap("BENCH","INCLINE_ADJUSTABLE")]});
  const view2=EQ.buildLocationInventoryView("loc1",[declineBench],[],defs);
  assert(!EQ.resolveSetupPredicate("BENCH_FLAT",view2).satisfied,"Adjustable Bench ohne DECLINE_CAPABLE erfuellt kein Decline/Flat-Predicate ohne explizite Capability (Aufgabentext-Beispiel)");
  const defsRack=[def("d_rack","RACK_STATION","POWER_RACK")];
  const rackSquatOnly=inst("i_rack","d_rack","PRESENT",{capability_values:[cap("RACK","SQUAT_HEIGHT")]});
  const viewRack=EQ.buildLocationInventoryView("loc1",[rackSquatOnly],[],defsRack);
  assert(EQ.resolveSetupPredicate("RACK_SQUAT_HEIGHT",viewRack).satisfied,"Rack mit SQUAT_HEIGHT-Capability erfuellt RACK_SQUAT_HEIGHT");
  assert(!EQ.resolveSetupPredicate("RACK_BENCH_HEIGHT",viewRack).satisfied,"RACK != automatisch PULLUP_BAR/BENCH_HEIGHT (Aufgabentext-Regel)");
}

console.log("========== MACHINE(X) ==========");
{
  const defs=[def("d_leg_press","PLATE_LOADED_MACHINE","irgendein-modell","LEG_PRESS_45")];
  const withLoadProfile=inst("i1","d_leg_press","PRESENT",{load_profile_version_id:"lp1"});
  const withoutLoadProfile=inst("i2","d_leg_press","PRESENT");
  assert(EQ.resolveSetupPredicate("MACHINE(LEG_PRESS_45)",EQ.buildLocationInventoryView("loc1",[withLoadProfile],[],defs)).satisfied,"MACHINE(LEG_PRESS_45) erfuellt mit PRESENT Instanz + aktivem LoadProfile");
  assert(!EQ.resolveSetupPredicate("MACHINE(LEG_PRESS_45)",EQ.buildLocationInventoryView("loc1",[withoutLoadProfile],[],defs)).satisfied,"MACHINE(X) NICHT erfuellt ohne aktives LoadProfile (§29.4 woertlich)");
  assert(!EQ.resolveSetupPredicate("MACHINE(HACK_SQUAT)",EQ.buildLocationInventoryView("loc1",[withLoadProfile],[],defs)).satisfied,"MACHINE(X) mit falschem machine_functional_subtype nicht erfuellt");
  assertEq(EQ.resolveSetupPredicate("MACHINE(NOT_A_SUBTYPE)",EQ.buildLocationInventoryView("loc1",[],[],[])).resolvable,false,"MACHINE(X) mit unbekanntem X ist unresolvable (impossible branch)");
}

console.log("========== BODYWEIGHT_ONLY erfindet KEIN Equipment (Aufgabentext-Kernregel) ==========");
{
  const defs=[def("d_floor","BODYWEIGHT","FLOOR")];
  const view=EQ.buildLocationInventoryView("loc1",[inst("i_floor","d_floor","PRESENT")],[],defs);
  assert(EQ.resolveSetupPredicate("BODYWEIGHT",view).satisfied,"BODYWEIGHT selbst ist immer erfuellt (kein Inventory noetig)");
  ["PULLUP_BAR","DIP_STATION","RINGS"].forEach(tag=>{
    assert(!EQ.resolveSetupPredicate(tag,view).satisfied,tag+" wird NICHT stillschweigend fuer BODYWEIGHT_ONLY angenommen (nur FLOOR ist PRESENT)");
  });
  const pushup=EC.EXERCISE_CATALOG_RAW.find(e=>e.exercise_id==="PUSHUP");
  const pullup=EC.EXERCISE_CATALOG_RAW.find(e=>e.exercise_id==="PULLUP");
  assert(EQ.resolveEquipmentSetupSatisfiability(pushup.equipment_setups,view).satisfiable,"PUSHUP satisfiable bei reinem Bodyweight-Inventar");
  assert(!EQ.resolveEquipmentSetupSatisfiability(pullup.equipment_setups,view).satisfiable,"PULLUP NICHT satisfiable ohne explizit PRESENT PULLUP_BAR (§29.11-Erwartung)");
}

console.log("========== effective_location_id (session override ?? geplanter Ort) ==========");
{
  assertEq(EQ.resolveEffectiveLocationId("locOverride","locPlanned"),"locOverride","Session-Override gewinnt");
  assertEq(EQ.resolveEffectiveLocationId(null,"locPlanned"),"locPlanned","ohne Override: geplanter Session-Ort");
  assertEq(EQ.resolveEffectiveLocationId(undefined,"locPlanned"),"locPlanned","undefined verhaelt sich wie kein Override");
}

console.log("========== konkrete ResolvedSetupBinding (keine abstrakte Family, wo eine Instanz noetig ist) ==========");
{
  const defs=[def("d_bar","FREE_WEIGHT","OLYMPIC_BARBELL"),def("d_rack","RACK_STATION","POWER_RACK")];
  const instances=[
    inst("i_bar_z","d_bar","PRESENT",{load_profile_version_id:"lp1"}),
    inst("i_bar_a","d_bar","PRESENT",{load_profile_version_id:"lp1"}),
    inst("i_rack","d_rack","PRESENT",{capability_values:[cap("RACK","SQUAT_HEIGHT")]}),
  ];
  const view=EQ.buildLocationInventoryView("loc1",instances,[],defs);
  const setups=[["BARBELL_LOADABLE","RACK_SQUAT_HEIGHT"]];
  const result=EQ.resolveDeterministicBinding(setups,view);
  assertEq(result.status,"RESOLVED","genau ein satisfiable Branch wird direkt aufgeloest (kein Regel-1-6-Bedarf)");
  assertEq(result.resolvedByRule,null,"keine Regel noetig, wenn nur ein Kandidat existiert");
  assertEq(result.binding.equipmentInstanceIds,["i_bar_a","i_rack"],"konkrete Instanz-IDs lexikografisch sortiert (genau 1 Bar + 1 Rack, keine ueberzaehlige zweite Bar-Instanz, keine abstrakte Family gespeichert)");
  const resolvedBinding=TD.createResolvedSetupBinding({
    id:"rsb1",exercise_setup_id:"es1",location_id:"loc1",
    equipment_instance_ids:result.binding.equipmentInstanceIds,
    capability_snapshot:{rack:"SQUAT_HEIGHT"},load_semantics_snapshot:{mechanism:"PLATE_LOADABLE_FREE_WEIGHT"},
    resolved_at:"2026-09-04T00:00:00Z",source_equipment_profile_version_id:"epv1",
  });
  assertEq(resolvedBinding.equipment_instance_ids,["i_bar_a","i_rack"],"ResolvedSetupBinding traegt die konkreten Instanz-IDs, nicht die abstrakte Family");
  const unsatisfiableResult=EQ.resolveDeterministicBinding([["DUMBBELL_SINGLE"]],view);
  assertEq(unsatisfiableResult,{status:"UNSATISFIABLE",binding:null},"UNSATISFIABLE-Ergebnis fuer eine unsatisfiable Branch, keine Bindung");
}

console.log("========== Single/Pair Quantity Semantics (§29.4: 'in der ANGEGEBENEN STUECKZAHL') ==========");
{
  const dbDef=def("d_db","FREE_WEIGHT","ADJUSTABLE_DUMBBELL");
  const kbDef=def("d_kb","FREE_WEIGHT","KETTLEBELL");
  const otherDbDef=def("d_db2","FREE_WEIGHT","ADJUSTABLE_DUMBBELL");

  // 1 DB -> SINGLE PASS, PAIR FAIL
  {
    const view=EQ.buildLocationInventoryView("loc1",[inst("db1","d_db","PRESENT",{load_profile_version_id:"lp1"})],[],[dbDef]);
    const single=EQ.resolveSetupPredicate("DUMBBELL_SINGLE",view);
    const pair=EQ.resolveSetupPredicate("DUMBBELL_PAIR",view);
    assertEq(single.satisfied,true,"1 PRESENT Dumbbell -> DUMBBELL_SINGLE PASS");
    assertEq(single.equipmentInstanceIds,["db1"],"DUMBBELL_SINGLE bindet genau 1 konkrete Instanz");
    assertEq(pair.satisfied,false,"1 PRESENT Dumbbell -> DUMBBELL_PAIR FAIL (eine einzelne Instanz erfuellt keine PAIR-Anforderung)");
    assertEq(pair.equipmentInstanceIds,[],"DUMBBELL_PAIR ohne Erfuellung bindet keine Instanzen");
  }
  // 2 kompatible DBs (gleiche equipment_definition_version_id) -> PAIR PASS
  {
    const view=EQ.buildLocationInventoryView("loc1",[
      inst("db1","d_db","PRESENT",{load_profile_version_id:"lp1"}),
      inst("db2","d_db","PRESENT",{load_profile_version_id:"lp1"}),
    ],[],[dbDef]);
    const pair=EQ.resolveSetupPredicate("DUMBBELL_PAIR",view);
    assertEq(pair.satisfied,true,"2 kompatible PRESENT Dumbbells -> DUMBBELL_PAIR PASS");
    assertEq(pair.equipmentInstanceIds,["db1","db2"],"DUMBBELL_PAIR bindet beide konkreten Instanzen (keine virtuelle zweite Hantel)");
  }
  // NOT_PRESENT/UNKNOWN zweite DB -> PAIR FAIL
  {
    ["NOT_PRESENT","UNKNOWN"].forEach(state=>{
      const view=EQ.buildLocationInventoryView("loc1",[
        inst("db1","d_db","PRESENT",{load_profile_version_id:"lp1"}),
        inst("db2","d_db",state,{load_profile_version_id:"lp1"}),
      ],[],[dbDef]);
      const pair=EQ.resolveSetupPredicate("DUMBBELL_PAIR",view);
      assertEq(pair.satisfied,false,"zweite Dumbbell-Instanz "+state+" -> DUMBBELL_PAIR FAIL (nur 1 tatsaechlich PRESENT)");
    });
  }
  // 2 PRESENT DBs, aber unterschiedliche equipment_definition_version_id -> nicht "kompatibel" genug fuer PAIR
  {
    const view=EQ.buildLocationInventoryView("loc1",[
      inst("db1","d_db","PRESENT",{load_profile_version_id:"lp1"}),
      inst("db2","d_db2","PRESENT",{load_profile_version_id:"lp1"}),
    ],[],[dbDef,otherDbDef]);
    const pair=EQ.resolveSetupPredicate("DUMBBELL_PAIR",view);
    assertEq(pair.satisfied,false,"2 PRESENT Dumbbells verschiedener EquipmentDefinitionVersion sind keine 'kompatible' PAIR-Ressource (bestehende Identitaets-Dimension, keine erfundene Heuristik)");
  }
  // analog Kettlebell
  {
    const oneKb=EQ.buildLocationInventoryView("loc1",[inst("kb1","d_kb","PRESENT",{load_profile_version_id:"lp1"})],[],[kbDef]);
    assertEq(EQ.resolveSetupPredicate("KETTLEBELL_SINGLE",oneKb).satisfied,true,"1 PRESENT Kettlebell -> KETTLEBELL_SINGLE PASS");
    assertEq(EQ.resolveSetupPredicate("KETTLEBELL_PAIR",oneKb).satisfied,false,"1 PRESENT Kettlebell -> KETTLEBELL_PAIR FAIL");
    const twoKb=EQ.buildLocationInventoryView("loc1",[
      inst("kb1","d_kb","PRESENT",{load_profile_version_id:"lp1"}),
      inst("kb2","d_kb","PRESENT",{load_profile_version_id:"lp1"}),
    ],[],[kbDef]);
    const kbPair=EQ.resolveSetupPredicate("KETTLEBELL_PAIR",twoKb);
    assertEq(kbPair.satisfied,true,"2 kompatible PRESENT Kettlebells -> KETTLEBELL_PAIR PASS");
    assertEq(kbPair.equipmentInstanceIds,["kb1","kb2"],"KETTLEBELL_PAIR bindet beide konkreten Instanzen");
  }
  // SINGLE_OR_PAIR: Minimum ist 1 (eine Instantiierung reicht)
  {
    const oneDb=EQ.buildLocationInventoryView("loc1",[inst("db1","d_db","PRESENT",{load_profile_version_id:"lp1"})],[],[dbDef]);
    const sop=EQ.resolveSetupPredicate("DUMBBELL_SINGLE_OR_PAIR",oneDb);
    assertEq(sop.satisfied,true,"1 PRESENT Dumbbell reicht fuer DUMBBELL_SINGLE_OR_PAIR (Minimum ist SINGLE)");
    assertEq(sop.equipmentInstanceIds,["db1"],"DUMBBELL_SINGLE_OR_PAIR bindet genau 1 Instanz als Minimum");
    const zeroDb=EQ.buildLocationInventoryView("loc1",[],[],[dbDef]);
    assertEq(EQ.resolveSetupPredicate("DUMBBELL_SINGLE_OR_PAIR",zeroDb).satisfied,false,"0 PRESENT Dumbbells -> DUMBBELL_SINGLE_OR_PAIR FAIL");
  }
  // Ganze Branch-Satisfiability respektiert die Quantity ebenfalls (nicht nur die isolierte Predicate-Pruefung).
  {
    const oneDbView=EQ.buildLocationInventoryView("loc1",[inst("db1","d_db","PRESENT",{load_profile_version_id:"lp1"})],[],[dbDef]);
    assertEq(EQ.resolveEquipmentSetupSatisfiability([["DUMBBELL_PAIR"]],oneDbView).satisfiable,false,"OR-of-AND-Ebene: Branch mit DUMBBELL_PAIR ist bei nur 1 PRESENT Dumbbell NICHT satisfiable");
  }
}

console.log("========== ResolvedSetupBinding-Auswahl: Prioritaetsregeln 1-6 (§6.2) ==========");
{
  const defs=[def("d_bar","FREE_WEIGHT","OLYMPIC_BARBELL"),def("d_db","FREE_WEIGHT","ADJUSTABLE_DUMBBELL")];
  const instances=[
    inst("i_bar","d_bar","PRESENT",{load_profile_version_id:"lp1"}),
    inst("i_db","d_db","PRESENT",{load_profile_version_id:"lp2"}),
  ];
  const view=EQ.buildLocationInventoryView("loc1",instances,[],defs);
  // 2 satisfiable Branches: Branch 0 = Barbell, Branch 1 = Dumbbell.
  const setups=[["BARBELL_LOADABLE"],["DUMBBELL_SINGLE"]];

  // Ohne jede Annotation und ohne allowLexicographicFallback: NEEDS_INPUT statt falscher Auswahl.
  {
    const result=EQ.resolveDeterministicBinding(setups,view);
    assertEq(result.status,"NEEDS_INPUT","ohne Annotationen und ohne allowLexicographicFallback: NEEDS_INPUT statt stillschweigender Regel-6-Entscheidung");
    assertEq(result.remainingCandidates,[0,1],"beide Branches bleiben als offene Kandidaten gemeldet");
  }

  // Regel 1: persistierte Bindung gewinnt, wenn weiterhin satisfiable.
  {
    const result=EQ.resolveDeterministicBinding(setups,view,{persistedBindingBranchIndex:1});
    assertEq(result.status,"RESOLVED","Regel 1 loest auf, wenn eine persistierte Bindung weiterhin satisfiable ist");
    assertEq(result.resolvedByRule,1,"Regel 1 hat entschieden");
    assertEq(result.binding.branchIndex,1,"die persistierte Branch (1) wird gewaehlt, nicht die lexikografisch erste");
  }
  // Regel 1 mit nicht mehr satisfiabler persistierter Bindung faellt durch zur naechsten Regel.
  {
    const result=EQ.resolveDeterministicBinding(setups,view,{persistedBindingBranchIndex:5,progressionLimitedByBranch:{0:false,1:true}});
    assertEq(result.status,"RESOLVED","Regel 1 nicht anwendbar (Branch 5 existiert nicht als Kandidat) -> Regel 2 entscheidet");
    assertEq(result.resolvedByRule,2,"Regel 2 hat entschieden, nachdem Regel 1 nicht anwendbar war");
    assertEq(result.binding.branchIndex,0,"Branch 0 (progressionLimited=false) wird gegenueber Branch 1 (=true) bevorzugt");
  }

  // Regel 2: legaler Progressionspfad ohne PROGRESSION_LIMITED.
  {
    const result=EQ.resolveDeterministicBinding(setups,view,{progressionLimitedByBranch:{0:true,1:false}});
    assertEq(result.resolvedByRule,2,"Regel 2 entscheidet anhand PROGRESSION_LIMITED");
    assertEq(result.binding.branchIndex,1,"Branch 1 (nicht limitiert) gewinnt gegen Branch 0 (limitiert)");
  }
  // Regel 2 unvollstaendig annotiert (nur ein Kandidat) -> uebersprungen, faellt durch.
  {
    const result=EQ.resolveDeterministicBinding(setups,view,{progressionLimitedByBranch:{0:false},allowLexicographicFallback:true,exerciseSetupIdsByBranch:{0:"es_b",1:"es_a"}});
    assert(result.trace.some(t=>t.indexOf("Regel 2")!==-1&&t.indexOf("uebersprungen")!==-1),"Regel 2 mit unvollstaendiger Annotation (nur Branch 0 annotiert) wird uebersprungen, nicht unfair angewendet");
  }

  // Regel 3: feinere Laststufung (kleinerer Score gewinnt).
  {
    const result=EQ.resolveDeterministicBinding(setups,view,{stepFinenessByBranch:{0:2.5,1:5}});
    assertEq(result.resolvedByRule,3,"Regel 3 entscheidet anhand Laststufung-Feinheit");
    assertEq(result.binding.branchIndex,0,"Branch 0 (feiner, kleinerer Score) gewinnt");
  }

  // Regel 4: geringere Setup-/Transition-Kosten.
  {
    const result=EQ.resolveDeterministicBinding(setups,view,{transitionCostByBranch:{0:10,1:3}});
    assertEq(result.resolvedByRule,4,"Regel 4 entscheidet anhand Transition-Kosten");
    assertEq(result.binding.branchIndex,1,"Branch 1 (geringere Kosten) gewinnt");
  }

  // Regel 5: vorhandene eigene Historie.
  {
    const result=EQ.resolveDeterministicBinding(setups,view,{ownHistoryByBranch:{0:false,1:true}});
    assertEq(result.resolvedByRule,5,"Regel 5 entscheidet anhand vorhandener eigener Historie");
    assertEq(result.binding.branchIndex,1,"Branch 1 (eigene Historie vorhanden) gewinnt");
  }

  // Regel 6: NUR mit explizitem Opt-in, niemals automatisch.
  {
    const withoutFlag=EQ.resolveDeterministicBinding(setups,view,{exerciseSetupIdsByBranch:{0:"es_b",1:"es_a"}});
    assertEq(withoutFlag.status,"NEEDS_INPUT","ohne allowLexicographicFallback bleibt es NEEDS_INPUT, auch wenn exerciseSetupIdsByBranch gesetzt ist");
    const withFlag=EQ.resolveDeterministicBinding(setups,view,{exerciseSetupIdsByBranch:{0:"es_b",1:"es_a"},allowLexicographicFallback:true});
    assertEq(withFlag.status,"RESOLVED","mit allowLexicographicFallback=true wird Regel 6 als letzter Tie-Break verwendet");
    assertEq(withFlag.resolvedByRule,6,"Regel 6 hat entschieden");
    assertEq(withFlag.binding.branchIndex,1,"Branch 1 (exercise_setup_id='es_a', lexikografisch kleiner als 'es_b') gewinnt");
  }
  // Regel 6 ohne exerciseSetupIdsByBranch faellt auf equipment_instance_ids[] zurueck.
  {
    const result=EQ.resolveDeterministicBinding(setups,view,{allowLexicographicFallback:true});
    assertEq(result.resolvedByRule,6,"Regel 6 entscheidet auch ohne exerciseSetupIdsByBranch (Fallback auf equipment_instance_ids[])");
    assertEq(result.binding.branchIndex,0,"Branch 0 (equipmentInstanceIds=['i_bar'], lexikografisch kleiner als ['i_db']) gewinnt");
  }

  // Kaskade: hoehere Regel gewinnt gegen niedrigere, wenn beide annotiert sind.
  {
    const result=EQ.resolveDeterministicBinding(setups,view,{
      progressionLimitedByBranch:{0:false,1:false}, // Regel 2: unentschieden (beide gleich gut)
      stepFinenessByBranch:{0:5,1:2.5}, // Regel 3: Branch 1 gewinnt
      ownHistoryByBranch:{0:true,1:false}, // Regel 5: wuerde Branch 0 bevorzugen — darf NICHT mehr greifen, Regel 3 hat schon entschieden
    });
    assertEq(result.resolvedByRule,3,"Regel 3 entscheidet zuerst und verhindert, dass eine spaetere Regel (5) das Ergebnis noch aendert");
    assertEq(result.binding.branchIndex,1,"Branch 1 (feiner) gewinnt trotz Regel-5-Vorteil fuer Branch 0");
  }
}

console.log("========== §9.2 resolve_steps(load_profile_version) — INVARIANT L-1/L-2 ==========");
{
  const explicit=TD.createLoadProfileVersion({id:"lpv1",equipment_instance_id:"ei1",version:1,load_unit:"KG",display_semantics:"TOTAL_LOAD",direction:"HIGHER_IS_MORE",pair_semantics:"SINGLE",per_side_semantics:"N_A",ratio_confidence:"HIGH",effective_load_unknown:false,microloading_available:false,available_steps:[20,22.5,25,20]});
  assertEq(EQ.resolveLoadProfileSteps(explicit),[20,22.5,25],"available_steps[] wird dedupliziert+sortiert uebernommen, keine erfundenen Zwischenstufen");

  const platePairs=TD.createLoadProfileVersion({id:"lpv2",equipment_instance_id:"ei2",version:1,load_unit:"KG",display_semantics:"TOTAL_LOAD",direction:"HIGHER_IS_MORE",pair_semantics:"SINGLE",per_side_semantics:"N_A",ratio_confidence:"HIGH",effective_load_unknown:false,microloading_available:false,combination_rule:"PLATE_PAIRS",base_load:20});
  const steps=EQ.resolveLoadProfileSteps(platePairs,[10,5]);
  assertEq(steps,[20,30,40,50],"PLATE_PAIRS: alle legalen Kombinationen aus Base Load + Plate-Inventar (10er/5er, je Platte paarweise = 2x Gewicht)");

  const bodyweight=TD.createLoadProfileVersion({id:"lpv3",equipment_instance_id:"ei3",version:1,load_unit:"BODYWEIGHT_KG",display_semantics:"TOTAL_LOAD",direction:"HIGHER_IS_MORE",pair_semantics:"N_A",per_side_semantics:"N_A",ratio_confidence:"NONE",effective_load_unknown:true,microloading_available:false});
  assertEq(EQ.resolveLoadProfileSteps(bodyweight),null,"Bodyweight-Profile erzeugen KEINE fingierte kg-Liste (§9.2)");

  const bandOrdinal=TD.createLoadProfileVersion({id:"lpv4",equipment_instance_id:"ei4",version:1,load_unit:"BAND_LEVEL",display_semantics:"ORDINAL",direction:"HIGHER_IS_MORE",pair_semantics:"N_A",per_side_semantics:"N_A",ratio_confidence:"NONE",effective_load_unknown:true,microloading_available:false});
  assertEq(EQ.resolveLoadProfileSteps(bandOrdinal),null,"Band-ordinal-Profile erzeugen KEINE fingierte kg-Liste (§9.2)");

  const noData=TD.createLoadProfileVersion({id:"lpv5",equipment_instance_id:"ei5",version:1,load_unit:"KG",display_semantics:"STACK_LABEL",direction:"HIGHER_IS_MORE",pair_semantics:"N_A",per_side_semantics:"N_A",ratio_confidence:"NONE",effective_load_unknown:true,microloading_available:false});
  assertEq(EQ.resolveLoadProfileSteps(noData),null,"ohne available_steps[] und ohne PLATE_PAIRS-Inventar wird NICHTS erfunden (INVARIANT L-2)");
}

console.log("========== §29.5/§9.1 Load-Mechanism <-> LoadProfileVersion Semantik (Catalog-Lint #12) ==========");
{
  const dbCorrect=TD.createLoadProfileVersion({id:"l1",equipment_instance_id:"e1",version:1,load_unit:"KG",display_semantics:"PER_HAND",direction:"HIGHER_IS_MORE",pair_semantics:"PAIR_PER_HAND",per_side_semantics:"N_A",ratio_confidence:"HIGH",effective_load_unknown:false,microloading_available:false});
  assertEq(EQ.validateLoadProfileSemantics("DUMBBELL_DISCRETE",dbCorrect),[],"korrekte Dumbbell-Semantik (PER_HAND) hat 0 Verstoesse");
  const dbWrong=TD.createLoadProfileVersion({id:"l2",equipment_instance_id:"e2",version:1,load_unit:"KG",display_semantics:"TOTAL_LOAD",direction:"HIGHER_IS_MORE",pair_semantics:"SINGLE",per_side_semantics:"N_A",ratio_confidence:"HIGH",effective_load_unknown:false,microloading_available:false});
  assert(EQ.validateLoadProfileSemantics("DUMBBELL_DISCRETE",dbWrong).length>0,"Dumbbell mit TOTAL_LOAD statt PER_HAND wird als Verstoss erkannt");

  const plateCorrect=TD.createLoadProfileVersion({id:"l3",equipment_instance_id:"e3",version:1,load_unit:"KG",display_semantics:"PER_SIDE",direction:"HIGHER_IS_MORE",pair_semantics:"N_A",per_side_semantics:"PER_SIDE",ratio_confidence:"HIGH",effective_load_unknown:false,microloading_available:false});
  assertEq(EQ.validateLoadProfileSemantics("PLATE_LOADED_MACHINE",plateCorrect),[],"Plate-loaded Machine mit PER_SIDE hat 0 Verstoesse");
  const plateWrong=TD.createLoadProfileVersion({id:"l4",equipment_instance_id:"e4",version:1,load_unit:"KG",display_semantics:"STACK_LABEL",direction:"HIGHER_IS_MORE",pair_semantics:"N_A",per_side_semantics:"N_A",ratio_confidence:"HIGH",effective_load_unknown:false,microloading_available:false});
  assert(EQ.validateLoadProfileSemantics("PLATE_LOADED_MACHINE",plateWrong).length>0,"Plate-loaded Machine mit STACK_LABEL wird als Verstoss erkannt");

  const assistCorrect=TD.createLoadProfileVersion({id:"l5",equipment_instance_id:"e5",version:1,load_unit:"ASSISTANCE_KG",display_semantics:"ASSISTANCE",direction:"LOWER_IS_MORE",pair_semantics:"N_A",per_side_semantics:"N_A",ratio_confidence:"MEDIUM",effective_load_unknown:false,microloading_available:false});
  assertEq(EQ.validateLoadProfileSemantics("ASSISTANCE_INVERSE",assistCorrect),[],"Assistance mit LOWER_IS_MORE hat 0 Verstoesse");
  const assistWrong=TD.createLoadProfileVersion({id:"l6",equipment_instance_id:"e6",version:1,load_unit:"ASSISTANCE_KG",display_semantics:"ASSISTANCE",direction:"HIGHER_IS_MORE",pair_semantics:"N_A",per_side_semantics:"N_A",ratio_confidence:"MEDIUM",effective_load_unknown:false,microloading_available:false});
  assert(EQ.validateLoadProfileSemantics("ASSISTANCE_INVERSE",assistWrong).some(m=>m.indexOf("LOWER_IS_MORE")!==-1),"Assistance mit HIGHER_IS_MORE verletzt LOWER_IS_MORE (§9.1 woertlich)");

  const bandCorrect=TD.createLoadProfileVersion({id:"l7",equipment_instance_id:"e7",version:1,load_unit:"BAND_LEVEL",display_semantics:"ORDINAL",direction:"HIGHER_IS_MORE",pair_semantics:"N_A",per_side_semantics:"N_A",ratio_confidence:"NONE",effective_load_unknown:true,microloading_available:false});
  assertEq(EQ.validateLoadProfileSemantics("BAND_ORDINAL",bandCorrect),[],"Band mit ORDINAL hat 0 Verstoesse");
  const stackCorrect=TD.createLoadProfileVersion({id:"l8",equipment_instance_id:"e8",version:1,load_unit:"DISPLAY_UNIT",display_semantics:"STACK_LABEL",direction:"HIGHER_IS_MORE",pair_semantics:"N_A",per_side_semantics:"N_A",ratio_confidence:"NONE",effective_load_unknown:true,microloading_available:false});
  assertEq(EQ.validateLoadProfileSemantics("SELECTORIZED_STACK",stackCorrect),[],"Selectorized Stack mit STACK_LABEL hat 0 Verstoesse");
}

console.log("========== Maschinen-Identitaet: KEINE Aequivalenz aus Subtype (Catalog-Lint #15) ==========");
{
  const defs=[def("d_lp1","PLATE_LOADED_MACHINE","modell-a","LEG_PRESS_45"),def("d_lp2","PLATE_LOADED_MACHINE","modell-b","LEG_PRESS_45")];
  const sameSubtypeDifferentInstance1=inst("m1","d_lp1","PRESENT");
  const sameSubtypeDifferentInstance2=inst("m2","d_lp2","PRESENT");
  assert(!EQ.isLoadEquivalentInstance(sameSubtypeDifferentInstance1,sameSubtypeDifferentInstance2),"zwei Instanzen mit IDENTISCHEM machine_functional_subtype (LEG_PRESS_45) sind OHNE explizite equivalence_group_id NICHT aequivalent — keine Aequivalenz aus Subtype (INVARIANT P-3/LB-7)");
  const withGroup1=inst("m3","d_lp1","PRESENT",{equivalence_group_id:"grp_x"});
  const withGroup2=inst("m4","d_lp2","PRESENT",{equivalence_group_id:"grp_x"});
  assert(EQ.isLoadEquivalentInstance(withGroup1,withGroup2),"gleiche EXPLIZITE equivalence_group_id macht zwei Instanzen aequivalent");
  const differentGroup=inst("m5","d_lp1","PRESENT",{equivalence_group_id:"grp_y"});
  assert(!EQ.isLoadEquivalentInstance(withGroup1,differentGroup),"unterschiedliche equivalence_group_id -> keine Aequivalenz, trotz identischem Subtype");
  assert(EQ.isLoadEquivalentInstance(withGroup1,withGroup1),"eine Instanz ist zu sich selbst aequivalent (Reflexivitaet)");
  // Strukturbeweis: isLoadEquivalentInstance nimmt gar keinen family/subtype/manufacturer-Parameter entgegen.
  assertEq(EQ.isLoadEquivalentInstance.length,2,"isLoadEquivalentInstance(a,b) hat nur 2 Parameter — Subtype/Family/Manufacturer koennen strukturell gar nicht einfliessen");
}

console.log("========== station_group_id != equivalence (rein physische Stationszugehoerigkeit) ==========");
{
  const defs=[def("d_lp","PLATE_LOADED_MACHINE","modell","LEG_PRESS_45")];
  const stationA=inst("s1","d_lp","PRESENT",{station_group_id:"station_1"});
  const stationB=inst("s2","d_lp","PRESENT",{station_group_id:"station_1"});
  assert(!EQ.isLoadEquivalentInstance(stationA,stationB),"gleiche station_group_id impliziert KEINE Load-Aequivalenz (nur equivalence_group_id zaehlt)");
}

console.log("========== §11.8 Migration Tier — reine Bedingungs-Klassifikation ==========");
{
  assertEq(EQ.resolveMigrationTier({sameExerciseId:false}),"DIFFERENT_EXERCISE","anderer exercise_id -> DIFFERENT_EXERCISE");
  assertEq(EQ.resolveMigrationTier({sameExerciseId:true,sameEquipmentInstanceId:true,compatibleSetupOrLoadProfileVersion:true}),"EXACT","gleiche exercise_id + gleiche Instanz + kompatible Version -> EXACT");
  assertEq(EQ.resolveMigrationTier({sameExerciseId:true,sameEquipmentInstanceId:false,compatibleSetupOrLoadProfileVersion:false,equivalenceGroupMatchWithCompatibleLoadSemantics:true}),"EQUIVALENT_INSTANCE","explizite kompatible equivalence_group_id -> EQUIVALENT_INSTANCE");
  assertEq(EQ.resolveMigrationTier({sameExerciseId:true,sameEquipmentInstanceId:false,compatibleSetupOrLoadProfileVersion:false,equivalenceGroupMatchWithCompatibleLoadSemantics:false}),"SAME_EXERCISE_NEW_INSTANCE","gleiche exercise_id, nicht aequivalente neue Instanz -> SAME_EXERCISE_NEW_INSTANCE");
}

console.log("========== Support States (§1.4 DECISION) — reine Klassifikation ==========");
{
  assertEq(EQ.resolveSupportState({anyHardFeasibilityRequirementUnresolvable:true,allHardWeeklyRequirementsResolvable:true,goalSpecificHardRequirementUnresolved:false,resilientCoreRolesHaveTwoPlusCandidates:true,anyRoleHasOnlyOneCandidateOrMaterialProgressionLimit:false}),EQ.SUPPORT_STATE.INFEASIBLE,"harte Feasibility-Anforderung ungeloest -> INFEASIBLE (hat Vorrang)");
  assertEq(EQ.resolveSupportState({anyHardFeasibilityRequirementUnresolvable:false,allHardWeeklyRequirementsResolvable:true,goalSpecificHardRequirementUnresolved:true,resilientCoreRolesHaveTwoPlusCandidates:true,anyRoleHasOnlyOneCandidateOrMaterialProgressionLimit:false}),EQ.SUPPORT_STATE.GOAL_LIMITED,"ungeloeste goal-spezifische Anforderung -> GOAL_LIMITED (kein Override eines P4-Gates)");
  assertEq(EQ.resolveSupportState({anyHardFeasibilityRequirementUnresolvable:false,allHardWeeklyRequirementsResolvable:false,goalSpecificHardRequirementUnresolved:false,resilientCoreRolesHaveTwoPlusCandidates:true,anyRoleHasOnlyOneCandidateOrMaterialProgressionLimit:false}),EQ.SUPPORT_STATE.INFEASIBLE,"nicht alle harten Wochenanforderungen erfuellbar -> INFEASIBLE");
  assertEq(EQ.resolveSupportState({anyHardFeasibilityRequirementUnresolvable:false,allHardWeeklyRequirementsResolvable:true,goalSpecificHardRequirementUnresolved:false,resilientCoreRolesHaveTwoPlusCandidates:true,anyRoleHasOnlyOneCandidateOrMaterialProgressionLimit:false}),EQ.SUPPORT_STATE.FULLY_SUPPORTED,"alles erfuellbar + resiliente Kernrollen mit >=2 Kandidaten -> FULLY_SUPPORTED");
  assertEq(EQ.resolveSupportState({anyHardFeasibilityRequirementUnresolvable:false,allHardWeeklyRequirementsResolvable:true,goalSpecificHardRequirementUnresolved:false,resilientCoreRolesHaveTwoPlusCandidates:true,anyRoleHasOnlyOneCandidateOrMaterialProgressionLimit:true}),EQ.SUPPORT_STATE.SUPPORTED_WITH_LIMITATIONS,"harte Anforderungen erfuellbar, aber eine Rolle mit nur 1 Kandidat -> SUPPORTED_WITH_LIMITATIONS");
}

console.log("========== §29.11 Environment-Fixtures (Auszug, gegen den echten 125er-Catalog) ==========");
{
  const catalog=EC.EXERCISE_CATALOG_RAW;
  function satisfiableCount(view){return catalog.filter(e=>EQ.resolveEquipmentSetupSatisfiability(e.equipment_setups,view).satisfiable).length;}

  // "Dumbbells only": nur Kurzhanteln + Boden — kein Barbell, kein Rack, keine Machines.
  const dbDefs=[def("d_db","FREE_WEIGHT","FIXED_DUMBBELL"),def("d_floor","BODYWEIGHT","FLOOR")];
  const dbInstances=[inst("i_db","d_db","PRESENT",{load_profile_version_id:"lp1"}),inst("i_floor","d_floor","PRESENT")];
  const dbView=EQ.buildLocationInventoryView("loc1",dbInstances,[],dbDefs);
  const goblet=catalog.find(e=>e.exercise_id==="GOBLET_SQUAT");
  const barbellSquat=catalog.find(e=>e.exercise_id==="BARBELL_BACK_SQUAT");
  assert(EQ.resolveEquipmentSetupSatisfiability(goblet.equipment_setups,dbView).satisfiable,"'Dumbbells only': GOBLET_SQUAT (DUMBBELL_SINGLE-Branch) satisfiable");
  assert(!EQ.resolveEquipmentSetupSatisfiability(barbellSquat.equipment_setups,dbView).satisfiable,"'Dumbbells only': BARBELL_BACK_SQUAT NICHT satisfiable (§29.11: kein Barbell-Pfad)");

  // "Bodyweight only (floor/bodyweight only)": nur FLOOR.
  const bwDefs=[def("d_floor2","BODYWEIGHT","FLOOR")];
  const bwView=EQ.buildLocationInventoryView("loc1",[inst("i_floor2","d_floor2","PRESENT")],[],bwDefs);
  const pullup=catalog.find(e=>e.exercise_id==="PULLUP");
  const pushup=catalog.find(e=>e.exercise_id==="PUSHUP");
  assert(EQ.resolveEquipmentSetupSatisfiability(pushup.equipment_setups,bwView).satisfiable,"'Bodyweight only': PUSHUP satisfiable");
  assert(!EQ.resolveEquipmentSetupSatisfiability(pullup.equipment_setups,bwView).satisfiable,"'Bodyweight only': PULLUP NICHT satisfiable (§29.11: vertical-pull hard requirement unresolved)");

  // Full commercial gym fixture (rack/bench/barbell/DB + cable high/mid/low + pull-up path + common lower machine).
  const fullDefs=[
    def("d_bar","FREE_WEIGHT","OLYMPIC_BARBELL"),def("d_plates","FREE_WEIGHT","PLATES"),
    def("d_rack","RACK_STATION","POWER_RACK"),def("d_bench","SUPPORT","ADJUSTABLE_BENCH"),
    def("d_db","FREE_WEIGHT","FIXED_DUMBBELL"),def("d_cable","CABLE","FUNCTIONAL_TRAINER"),
    def("d_pullupbar","BODYWEIGHT","PULLUP_BAR"),def("d_floor3","BODYWEIGHT","FLOOR"),
    def("d_legpress","PLATE_LOADED_MACHINE","modell","LEG_PRESS_45"),
  ];
  const fullInstances=[
    inst("f_bar","d_bar","PRESENT",{load_profile_version_id:"lp1"}),
    inst("f_plates","d_plates","PRESENT"),
    inst("f_rack","d_rack","PRESENT",{capability_values:[cap("RACK","SQUAT_HEIGHT"),cap("RACK","BENCH_HEIGHT"),cap("RACK","ROW_HEIGHT")]}),
    inst("f_bench","d_bench","PRESENT",{capability_values:[cap("BENCH","FLAT"),cap("BENCH","INCLINE_ADJUSTABLE"),cap("SUPPORT","BACK_SUPPORTED")]}),
    inst("f_db","d_db","PRESENT",{load_profile_version_id:"lp2"}),
    inst("f_cable","d_cable","PRESENT",{capability_values:[cap("PULLEY_POSITION","HIGH"),cap("PULLEY_POSITION","MID"),cap("PULLEY_POSITION","LOW"),cap("CABLE_ATTACHMENT","ROPE"),cap("CABLE_ATTACHMENT","STRAIGHT_BAR"),cap("CABLE_ATTACHMENT","SINGLE_D_HANDLE"),cap("CABLE_ATTACHMENT","PAIR_D_HANDLES"),cap("CABLE_ATTACHMENT","NEUTRAL_ROW_HANDLE"),cap("CABLE_ATTACHMENT","WIDE_BAR")]}),
    inst("f_pullupbar","d_pullupbar","PRESENT"),
    inst("f_floor","d_floor3","PRESENT"),
    inst("f_legpress","d_legpress","PRESENT",{load_profile_version_id:"lp3"}),
  ];
  const fullView=EQ.buildLocationInventoryView("loc1",fullInstances,[],fullDefs);
  assert(EQ.resolveEquipmentSetupSatisfiability(barbellSquat.equipment_setups,fullView).satisfiable,"Full commercial gym: BARBELL_BACK_SQUAT satisfiable");
  assert(EQ.resolveEquipmentSetupSatisfiability(pullup.equipment_setups,fullView).satisfiable,"Full commercial gym: PULLUP satisfiable");
  const legPress=catalog.find(e=>e.exercise_id==="LEG_PRESS_45"||e.exercise_id==="LEG_PRESS");
  if(legPress)assert(EQ.resolveEquipmentSetupSatisfiability(legPress.equipment_setups,fullView).satisfiable,"Full commercial gym: Leg-Press-Record satisfiable");
  assert(satisfiableCount(fullView)>satisfiableCount(bwView),"Full commercial gym deckt strikt mehr Records ab als reines Bodyweight (Sanity)");
}

console.log("========== STEP 05 Blocker Recheck: Catalog-Lints #12/#15/#16 sind nach STEP06 vollstaendig testbar ==========");
{
  // #15: no machine equivalence inferred from subtype — bereits oben strukturell bewiesen
  // (isLoadEquivalentInstance nimmt gar keinen subtype-Parameter entgegen). Hier zusaetzlich:
  // KEIN Record im echten Catalog behauptet MACHINE(X)-Aequivalenz zwischen zwei
  // verschiedenen X-Werten — jede MACHINE(X)-Aufloesung ist an genau EIN X gebunden.
  const catalog=EC.EXERCISE_CATALOG_RAW;
  const machineTags=new Set();
  catalog.forEach(e=>(e.equipment_setups||[]).forEach(b=>b.forEach(t=>{const m=/^MACHINE\(([A-Z0-9_]+)\)$/.exec(t);if(m)machineTags.add(m[1]);})));
  machineTags.forEach(t=>assert(TD.MACHINE_FUNCTIONAL_SUBTYPE_REGISTRY.indexOf(t)!==-1,"MACHINE("+t+") referenziert einen registrierten §29.2-Subtype, keine erfundene Aequivalenz"));

  // #16: no impossible EquipmentSetup branch — jetzt gegen die ECHTE Predicate-Semantik geprueft
  // (nicht nur strukturelle Degenerationsfaelle wie zuvor in STEP05).
  const emptyView=EQ.buildLocationInventoryView("loc1",[],[],[]);
  let anyImpossible=false;
  catalog.forEach(e=>(e.equipment_setups||[]).forEach(branch=>{
    if(EQ.resolveSetupBranchSatisfiability(branch,emptyView).impossible)anyImpossible=true;
  }));
  assert(!anyImpossible,"kein einziger EquipmentSetup-Branch im echten 125er-Catalog ist gegen die reale §29.4-Predicate-Semantik impossible");

  // #12: PER_HAND/PER_SIDE/TOTAL-Semantik ist jetzt via validateLoadProfileSemantics() real pruefbar
  // (der in STEP05 fehlende LoadProfileVersion-Laufzeit-Layer existiert jetzt).
  const dbProfile=TD.createLoadProfileVersion({id:"chk1",equipment_instance_id:"e1",version:1,load_unit:"KG",display_semantics:"PER_HAND",direction:"HIGHER_IS_MORE",pair_semantics:"PAIR_PER_HAND",per_side_semantics:"N_A",ratio_confidence:"HIGH",effective_load_unknown:false,microloading_available:false});
  assertEq(EQ.validateLoadProfileSemantics("DUMBBELL_DISCRETE",dbProfile).length,0,"#12 jetzt konkret pruefbar: korrektes DUMBBELL_DISCRETE-LoadProfile besteht");

  /* #16-Nacharbeit nach der Quantity-Korrektur: eine Setup-Branch, deren
     Mengenanforderung (DUMBBELL_PAIR/KETTLEBELL_PAIR) physisch nicht
     erfuellbar ist, darf auf der SATISFIABILITY-Ebene (nicht der rein
     strukturellen Resolvability-Ebene von Lint #16 selbst) nicht als
     satisfiable gelten — gegen echte 125er-Catalog-Records geprueft. */
  const dbPairDef=TD.createEquipmentDefinitionVersion({id:"chk_db_def",version:1,canonical_name:"DB",family:"FREE_WEIGHT",subtype:"ADJUSTABLE_DUMBBELL",status:"ACTIVE"});
  const dbSplitSquat=catalog.find(e=>e.exercise_id==="DB_SPLIT_SQUAT");
  const oneDbView=EQ.buildLocationInventoryView("loc1",[TD.createEquipmentInstance({id:"chk_db1",location_id:"loc1",equipment_definition_version_id:"chk_db_def",inventory_state:"PRESENT",load_profile_version_id:"lp1"})],[],[dbPairDef]);
  const twoDbView=EQ.buildLocationInventoryView("loc1",[
    TD.createEquipmentInstance({id:"chk_db1",location_id:"loc1",equipment_definition_version_id:"chk_db_def",inventory_state:"PRESENT",load_profile_version_id:"lp1"}),
    TD.createEquipmentInstance({id:"chk_db2",location_id:"loc1",equipment_definition_version_id:"chk_db_def",inventory_state:"PRESENT",load_profile_version_id:"lp1"}),
  ],[],[dbPairDef]);
  assert(!EQ.resolveEquipmentSetupSatisfiability(dbSplitSquat.equipment_setups,oneDbView).satisfiable,"#16-Recheck: DB_SPLIT_SQUAT (DUMBBELL_PAIR) ist bei nur 1 PRESENT Dumbbell-Instanz NICHT satisfiable — die Mengenanforderung ist physisch nicht erfuellbar");
  assert(EQ.resolveEquipmentSetupSatisfiability(dbSplitSquat.equipment_setups,twoDbView).satisfiable,"#16-Recheck: DB_SPLIT_SQUAT (DUMBBELL_PAIR) ist bei 2 kompatiblen PRESENT Dumbbell-Instanzen satisfiable");
}

console.log("========== Bestehende STEP01-05 Registries bleiben unveraendert nutzbar (Regressionscheck) ==========");
{
  assert(TD.isRegisteredMovementPatternId("KNEE_DOMINANT"),"§5.1 movement_pattern-Registry weiterhin intakt");
  assertEq(EC.loadExerciseCatalog().length,125,"125er-Catalog laedt weiterhin vollstaendig");
  assertEq(EC.validateCatalogLints(EC.loadExerciseCatalog()),[],"alle bisherigen §29.13-Catalog-Lints bestehen weiterhin mit 0 Fehlern");
}

console.log("\n"+passed+" bestanden, "+failed+" fehlgeschlagen");
process.exit(failed>0?1:0);
