/* training-equipment.js — TRAINING SYSTEM v1.4.1, IMPLEMENTATION PACK
   06/14: Equipment / Locations / Feasibility / Support / Load Granularity.

   Quelle: 06_EQUIPMENT_LOCATIONS_FEASIBILITY_SUPPORT.md (wortgetreue
   v1.4.1-Auszuege, Primary Scope Master-Zeilen 1845-2009 = TEIL 9 (Load
   Granularity Engine, §9.1-§9.7) und Master-Zeilen 7067-7138 = §29.1-§29.6,
   plus die dort ausdruecklich referenzierten Dependency-Contract-Auszuege
   §0.2-0.5, §1.4, §6.2 (nur zur Einordnung, NICHT als Selection-Engine
   implementiert), §11.7/§11.8 (nur zur Einordnung bzw. reine
   Klassifikations-Hilfsfunktion), §15.3/§15.6 (nur zur Einordnung, NICHT
   implementiert), §19.1 (nur zur Einordnung), §20.2 (nur zur Einordnung),
   §23.0, §23.2, §29.11-§29.13).

   ABSICHTLICH NUR DIESER SCOPE:
   - §29.1-§29.3 Equipment Family/Subtype-, Machine-Functional-Subtype- und
     Capability-Registry: bereits in training-domain.js geschlossen (STEP06,
     analog zur STEP-05-Schliessung von movement_pattern) — dieses File
     nutzt sie als bare Identifier, definiert sie NICHT doppelt.
   - §29.4 Setup Predicate Language: vollstaendige, reine Aufloesung jedes
     normativen Kurzpraedikats gegen eine konkrete Location-Inventur
     (EquipmentInstance/AttachmentInstance-Listen), inklusive OR-of-AND
     EquipmentSetup-Satisfiability.
   - §9.2 resolve_steps(load_profile_version): reine Ableitung der
     verfuegbaren Laststufen AUSSCHLIESSLICH aus der gespeicherten
     LoadProfileVersion (keine erfundenen Zwischenstufen).
   - §29.5/§9.1 Load-Mechanism/Load-Profile-Semantik-Konsistenz
     (validateLoadProfileSemantics): PER_HAND/PER_SIDE/TOTAL/ORDINAL/
     LOWER_IS_MORE strukturell gegen die konkrete LoadProfileVersion eines
     Mechanismus geprueft — das war der in STEP05 als "PARTIAL" benannte,
     fehlende Laufzeit-Layer (LoadProfileVersion existierte dort noch
     nicht) und ist jetzt hier real gebaut.
   - Maschinen-Identitaet/Aequivalenz (§11.8/§29.2/INVARIANT P-3, LB-7):
     isLoadEquivalentInstance() beweist strukturell, dass Aequivalenz NIE
     aus machine_functional_subtype/family/subtype abgeleitet wird, nur aus
     einer expliziten uebereinstimmenden equivalence_group_id.
   - resolveMigrationTier(): reine Bedingungs-Klassifikation der 4 §11.8-
     Tiers (EXACT/EQUIVALENT_INSTANCE/SAME_EXERCISE_NEW_INSTANCE/
     DIFFERENT_EXERCISE) aus gegebenen Fakten — OHNE die dort ebenfalls
     genannten Calibration-/Progression-Konsequenzen umzusetzen (das
     verlangt die in diesem Pack ausdruecklich NICHT zu bauende Calibration-/
     Progression-Engine).
   - resolveSupportState(): reine Entscheidungsfunktion ueber die 4 §1.4-
     Support-States (FULLY_SUPPORTED/SUPPORTED_WITH_LIMITATIONS/
     GOAL_LIMITED/INFEASIBLE) — nimmt bereits berechnete, abstrakte Fakten
     entgegen (z.B. "ist jede harte Wochenanforderung erfuellbar?") und
     erzeugt daraus NUR die Klassifikation. Das eigentliche Berechnen dieser
     Fakten braucht Slot Generation/Exercise Selection/Volume Validation
     (§20.2) und wird hier NICHT gebaut (siehe "NICHT IMPLEMENTIERT" unten).

   NICHT IMPLEMENTIERT (spaetere Packs/out of scope, siehe Aufgabentext):
   - Slot Generation, Exercise Selection/Scoring, Prescription, Calibration,
     Load Recommendation, Progression, Fatigue, Substitution Engine,
     globale Plan Validation (§20.2 V01-V30 als Engine), neue UX.
   - Volle Hard-Filter-Engine F1-F11 (§6.2): NUR der strukturelle Kern von
     F1 (OR-of-AND EquipmentSetup-Satisfiability) ist hier gebaut. F2-F11
     brauchen Slot-Function/Session-State/Historie, die dieses Pack nicht
     einfuehrt.
   - Bindungswahl-Reihenfolge (§6.2, 6 Regeln): nur Regel 6 (lexikografischer
     Tie-Break) ist ohne Prescription/Progression/Historie ueberhaupt
     bestimmbar und wird hier implementiert (resolveDeterministicBinding).
     Regeln 1-5 (persistierte Bindung, Progressionspfad, Laststufung-
     Feinheit, Setup-/Transition-Kosten, eigene Historie) benoetigen Engines,
     die dieses Pack nicht baut — siehe Kommentar an resolveDeterministicBinding.
   - Vollstaendige §11.8 Migration-Tier-KONSEQUENZEN (Calibration/Performance/
     Progression-Spalten) — nur die Tier-KLASSIFIKATION selbst.
   - Support-State-BERECHNUNG aus einem echten Plan (braucht Slot Generation/
     Selection) — nur die Klassifikationsfunktion ueber gegebene Fakten. */

/* ================= §29.4 Setup Predicate Language: Location-Inventur-View ================= */
/* Ein "LocationInventoryView" ist reine Sicht auf bereits geladene
   EquipmentInstance/AttachmentInstance/EquipmentDefinitionVersion-Daten fuer
   EINEN effektiven Ort — keine eigene Persistenz, keine Ableitung aus
   Location-Type oder Equipment-Family (INVARIANT: "physische Ausfuehrbarkeit
   niemals aus Geraetename/Location-Type/Family/Marketingname/Subtype
   allein"). */
function buildLocationInventoryView(locationId,equipmentInstances,attachmentInstances,equipmentDefinitionVersions){
  const definitionsById={};
  (equipmentDefinitionVersions||[]).forEach(d=>{definitionsById[d.id]=d;});
  return {
    location_id:locationId,
    equipmentInstances:(equipmentInstances||[]).filter(i=>i.location_id===locationId),
    attachmentInstances:(attachmentInstances||[]).filter(i=>i.location_id===locationId),
    definitionsById,
  };
}
function presentEquipmentInstances(view){
  return view.equipmentInstances.filter(i=>i.inventory_state==="PRESENT");
}
function presentAttachmentInstances(view){
  return view.attachmentInstances.filter(i=>i.inventory_state==="PRESENT");
}
function definitionOf(view,instance){
  return view.definitionsById[instance.equipment_definition_version_id]||null;
}
function instanceHasCapability(instance,namespace,value){
  return (instance.capability_values||[]).some(cp=>cp.namespace===namespace&&cp.value===value);
}
function hasPresentSubtype(view,subtypes,familyFilter){
  return presentEquipmentInstances(view).some(i=>{
    const d=definitionOf(view,i);
    if(!d)return false;
    if(familyFilter&&d.family!==familyFilter)return false;
    return subtypes.indexOf(d.subtype)!==-1;
  });
}
function hasPresentSubtypeWithLoadProfile(view,subtypes,familyFilter){
  return presentEquipmentInstances(view).some(i=>{
    const d=definitionOf(view,i);
    if(!d)return false;
    if(familyFilter&&d.family!==familyFilter)return false;
    return subtypes.indexOf(d.subtype)!==-1&&i.load_profile_version_id!=null;
  });
}
function hasPresentCapability(view,namespace,values,familyFilter){
  return presentEquipmentInstances(view).some(i=>{
    const d=definitionOf(view,i);
    if(familyFilter&&(!d||d.family!==familyFilter))return false;
    return values.some(v=>instanceHasCapability(i,namespace,v));
  });
}
function hasPresentMachineFunctionalSubtype(view,machineFunctionalSubtype){
  return presentEquipmentInstances(view).some(i=>{
    const d=definitionOf(view,i);
    return d&&(d.family==="SELECTORIZED_MACHINE"||d.family==="PLATE_LOADED_MACHINE")
      &&d.machine_functional_subtype===machineFunctionalSubtype&&i.load_profile_version_id!=null;
  });
}
/* Attachment-Shorthands: "Jeder Treffer benoetigt eine PRESENT
   AttachmentInstance ODER eine integrierte identische Capability" — daher
   wird sowohl die separate AttachmentInstance-Liste als auch
   capability_values der Haupt-EquipmentInstance selbst geprueft (z.B. eine
   Cable-Maschine mit integriertem Rope-Attachment ohne separate
   AttachmentInstance). */
function hasCableAttachment(view,values){
  const attachmentHit=presentAttachmentInstances(view).some(a=>values.some(v=>instanceHasCapability(a,"CABLE_ATTACHMENT",v)));
  if(attachmentHit)return true;
  return presentEquipmentInstances(view).some(i=>values.some(v=>instanceHasCapability(i,"CABLE_ATTACHMENT",v)));
}
const CABLE_ATTACHMENT_SHORTHAND_MAP=Object.freeze({
  ATTACHMENT_SINGLE_HANDLE:Object.freeze(["SINGLE_D_HANDLE"]),
  ATTACHMENT_PAIR_HANDLES:Object.freeze(["PAIR_D_HANDLES"]),
  ATTACHMENT_ROPE:Object.freeze(["ROPE"]),
  ATTACHMENT_BAR:Object.freeze(["STRAIGHT_BAR","EZ_BAR"]),
  ATTACHMENT_BAR_OR_ROPE:Object.freeze(["STRAIGHT_BAR","EZ_BAR","ROPE"]),
  ATTACHMENT_ROW_HANDLE:Object.freeze(["NEUTRAL_ROW_HANDLE"]),
  ATTACHMENT_WIDE_OR_NEUTRAL_BAR:Object.freeze(["WIDE_BAR","NEUTRAL_PULLDOWN_HANDLE"]),
});
/* BARBELL_LOADABLE/EZ_BAR_LOADABLE/TRAP_BAR_LOADABLE: "passende Bar +
   LoadProfile/Plates" — gelesen als (passende Bar-Instanz PRESENT mit
   eigenem LoadProfile) ODER (passende Bar-Instanz PRESENT UND zusaetzlich
   PLATES PRESENT). BARBELL_LOADABLE deckt bewusst NUR die beiden "einfachen"
   Barbell-Subtypes (OLYMPIC_BARBELL/STANDARD_BARBELL) ab: SAFETY_SQUAT_BAR
   und SWISS_MULTI_GRIP_BAR erhalten in §29.4 KEIN eigenes benanntes
   Shorthand, werden hier deshalb NICHT stillschweigend mit BARBELL_LOADABLE
   gleichgesetzt (G-D3) und bleiben nur ueber ihre eigene exakte
   Subtype-Presence adressierbar. */
function barOrPlatesSatisfied(view,subtypes){
  const barPresent=presentEquipmentInstances(view).some(i=>{
    const d=definitionOf(view,i);
    return d&&d.family==="FREE_WEIGHT"&&subtypes.indexOf(d.subtype)!==-1;
  });
  if(!barPresent)return false;
  const barHasOwnLoadProfile=presentEquipmentInstances(view).some(i=>{
    const d=definitionOf(view,i);
    return d&&d.family==="FREE_WEIGHT"&&subtypes.indexOf(d.subtype)!==-1&&i.load_profile_version_id!=null;
  });
  return barHasOwnLoadProfile||hasPresentSubtype(view,["PLATES"],"FREE_WEIGHT");
}
/* Der Katalog nutzt DUMBBELL_SINGLE/DUMBBELL_PAIR/DUMBBELL_SINGLE_OR_PAIR
   (bzw. KETTLEBELL_SINGLE/KETTLEBELL_PAIR) rein qualitativ ("gibt es
   Kurzhanteln/Kettlebells mit Laststufung hier"): dieses Pack fuehrt kein
   Stueckzahl-Inventarmodell ein (wie viele Paare welchen Gewichts im Rack
   stehen ist keine hier normativ gegebene Groesse) — alle drei Shorthands
   loesen daher strukturell identisch auf: mindestens eine PRESENT
   Dumbbell-/Kettlebell-Instanz mit aktivem LoadProfile. Eine erfundene
   Stueckzahl-Zaehlung waere eine nicht gestuetzte Ergaenzung (G-D3). */
const DUMBBELL_SUBTYPES=Object.freeze(["FIXED_DUMBBELL","ADJUSTABLE_DUMBBELL","LOADABLE_DUMBBELL"]);
const KETTLEBELL_SUBTYPES=Object.freeze(["KETTLEBELL"]);

/* Rueckwaertsindex: jeder als §29.1-Subtype registrierte Wert (ueber alle
   Familien) ist per se ein gueltiges Presence-Predicate (§29.4, erster
   Bullet). EXTENDED/SELECTORIZED_MACHINE/PLATE_LOADED_MACHINE fuehren
   keine eigene Subtype-Liste (siehe training-domain.js) und tragen daher
   nichts zu diesem Index bei. */
function allRegisteredSubtypes(){
  const out=[];
  Object.keys(EQUIPMENT_FAMILY_SUBTYPE_REGISTRY).forEach(family=>{
    const list=EQUIPMENT_FAMILY_SUBTYPE_REGISTRY[family];
    if(list)list.forEach(s=>out.push(s));
  });
  return out;
}

/* resolveSetupPredicate(tag, view) -> {resolvable:bool, satisfied:bool}
   `resolvable=false` bedeutet: der Tag entspricht KEINEM in §29.4 benannten
   Shorthand und KEINEM registrierten §29.1-Subtype — ein solcher Tag kann
   durch KEINE denkbare Inventur jemals erfuellt werden (Catalog-Lint #16:
   "no impossible EquipmentSetup branch"). */
function resolveSetupPredicate(tag,view){
  const machineMatch=/^MACHINE\(([A-Z0-9_]+)\)$/.exec(tag);
  if(machineMatch){
    const subtype=machineMatch[1];
    if(MACHINE_FUNCTIONAL_SUBTYPE_REGISTRY.indexOf(subtype)===-1)return {resolvable:false,satisfied:false};
    return {resolvable:true,satisfied:hasPresentMachineFunctionalSubtype(view,subtype)};
  }
  if(CABLE_ATTACHMENT_SHORTHAND_MAP[tag]){
    return {resolvable:true,satisfied:hasCableAttachment(view,CABLE_ATTACHMENT_SHORTHAND_MAP[tag])};
  }
  switch(tag){
    case "BARBELL_LOADABLE": return {resolvable:true,satisfied:barOrPlatesSatisfied(view,["OLYMPIC_BARBELL","STANDARD_BARBELL"])};
    case "EZ_BAR_LOADABLE": return {resolvable:true,satisfied:barOrPlatesSatisfied(view,["EZ_CURL_BAR"])};
    case "TRAP_BAR_LOADABLE": return {resolvable:true,satisfied:barOrPlatesSatisfied(view,["TRAP_BAR"])};
    case "DUMBBELL_SINGLE": case "DUMBBELL_PAIR": case "DUMBBELL_SINGLE_OR_PAIR":
      return {resolvable:true,satisfied:hasPresentSubtypeWithLoadProfile(view,DUMBBELL_SUBTYPES,"FREE_WEIGHT")};
    case "KETTLEBELL_SINGLE": case "KETTLEBELL_PAIR":
      return {resolvable:true,satisfied:hasPresentSubtypeWithLoadProfile(view,KETTLEBELL_SUBTYPES,"FREE_WEIGHT")};
    case "BENCH_FLAT": return {resolvable:true,satisfied:hasPresentCapability(view,"BENCH",["FLAT"],"SUPPORT")};
    case "BENCH_INCLINE": return {resolvable:true,satisfied:hasPresentCapability(view,"BENCH",["INCLINE_ADJUSTABLE"],"SUPPORT")};
    case "BENCH_BACK_SUPPORT": return {resolvable:true,satisfied:hasPresentCapability(view,"SUPPORT",["BACK_SUPPORTED"],"SUPPORT")};
    case "BENCH_OR_BOX": return {resolvable:true,satisfied:hasPresentSubtype(view,["FLAT_BENCH","ADJUSTABLE_BENCH","BOX_STEP"],"SUPPORT")};
    case "PREACHER_BENCH": return {resolvable:true,satisfied:hasPresentSubtype(view,["PREACHER_BENCH"],"SUPPORT")};
    case "ROMAN_CHAIR": return {resolvable:true,satisfied:hasPresentSubtype(view,["ROMAN_CHAIR"],"SUPPORT")};
    case "GHD": return {resolvable:true,satisfied:hasPresentSubtype(view,["GHD"],"SUPPORT")};
    case "BOX_STEP": return {resolvable:true,satisfied:hasPresentSubtype(view,["BOX_STEP"],"SUPPORT")};
    case "FIXED_SUPPORT": return {resolvable:true,satisfied:hasPresentSubtype(view,["FIXED_SUPPORT"],"SUPPORT")};
    case "RACK_SQUAT_HEIGHT": return {resolvable:true,satisfied:hasPresentCapability(view,"RACK",["SQUAT_HEIGHT"],"RACK_STATION")};
    case "RACK_BENCH_HEIGHT": return {resolvable:true,satisfied:hasPresentCapability(view,"RACK",["BENCH_HEIGHT"],"RACK_STATION")};
    case "RACK_BAR_ROW_HEIGHT": return {resolvable:true,satisfied:hasPresentCapability(view,"RACK",["ROW_HEIGHT"],"RACK_STATION")};
    case "CABLE_HIGH": return {resolvable:true,satisfied:hasPresentCapability(view,"PULLEY_POSITION",["HIGH"],"CABLE")};
    case "CABLE_MID": return {resolvable:true,satisfied:hasPresentCapability(view,"PULLEY_POSITION",["MID"],"CABLE")};
    case "CABLE_LOW": return {resolvable:true,satisfied:hasPresentCapability(view,"PULLEY_POSITION",["LOW"],"CABLE")};
    case "CABLE_LOW_OR_MID": return {resolvable:true,satisfied:hasPresentCapability(view,"PULLEY_POSITION",["LOW","MID"],"CABLE")};
    case "CABLE_HIGH_OR_MID": return {resolvable:true,satisfied:hasPresentCapability(view,"PULLEY_POSITION",["HIGH","MID"],"CABLE")};
    case "CABLE_HEIGHT_ADJUSTABLE": return {resolvable:true,satisfied:hasPresentCapability(view,"PULLEY_POSITION",["HEIGHT_ADJUSTABLE"],"CABLE")};
    case "DUAL_CABLE_OR_CROSSOVER": return {resolvable:true,satisfied:hasPresentSubtype(view,["DUAL_ADJUSTABLE_PULLEY","CABLE_CROSSOVER","FUNCTIONAL_TRAINER"],"CABLE")};
    case "BODYWEIGHT":
      /* Repraesentiert "der eigene Koerper", keine Equipment-Inventur
         noetig — kein §29.1-Subtype, sondern die einzige Ausnahme, bei der
         die Praesenz per Definition immer gegeben ist. Explizit NICHT mit
         FLOOR/WALK_SPACE verwechselt (die physische Flaeche verlangen und
         PRESENT-gepflegt sein muessen). */
      return {resolvable:true,satisfied:true};
    case "FLOOR": return {resolvable:true,satisfied:hasPresentSubtype(view,["FLOOR"],"BODYWEIGHT")};
    case "PULLUP_BAR": return {resolvable:true,satisfied:hasPresentSubtype(view,["PULLUP_BAR"],"BODYWEIGHT")};
    case "DIP_STATION": return {resolvable:true,satisfied:hasPresentSubtype(view,["DIP_STATION"],"BODYWEIGHT")};
    case "RINGS": return {resolvable:true,satisfied:hasPresentSubtype(view,["RINGS"],"BODYWEIGHT")};
    case "WALK_SPACE": return {resolvable:true,satisfied:hasPresentSubtype(view,["WALK_SPACE"],"BODYWEIGHT")};
    case "SLIDERS": return {resolvable:true,satisfied:hasPresentSubtype(view,["SLIDERS"],"SUPPORT")};
    case "AB_WHEEL": return {resolvable:true,satisfied:hasPresentSubtype(view,["AB_WHEEL"],"SUPPORT")};
    case "LOWER_BODY_ANCHOR": return {resolvable:true,satisfied:hasPresentCapability(view,"SUPPORT",["LOWER_LEG_ANCHORED"],"SUPPORT")};
    case "ANCHOR_LOW": return {resolvable:true,satisfied:hasPresentCapability(view,"ANCHOR",["LOW"])};
    case "ANCHOR_MID": return {resolvable:true,satisfied:hasPresentCapability(view,"ANCHOR",["MID"])};
    case "ANCHOR_HIGH": return {resolvable:true,satisfied:hasPresentCapability(view,"ANCHOR",["HIGH"])};
    case "EXTERNAL_BODYWEIGHT_LOAD": return {resolvable:true,satisfied:hasPresentSubtype(view,["WEIGHT_VEST"],"RESISTANCE_ACCESSORY")||hasPresentSubtype(view,["PLATES"],"FREE_WEIGHT")};
    case "DIP_BELT": return {resolvable:true,satisfied:hasPresentSubtype(view,["DIP_BELT"],"RESISTANCE_ACCESSORY")&&hasPresentSubtype(view,["PLATES"],"FREE_WEIGHT")};
    default: break;
  }
  if(allRegisteredSubtypes().indexOf(tag)!==-1){
    return {resolvable:true,satisfied:hasPresentSubtype(view,[tag])};
  }
  return {resolvable:false,satisfied:false};
}

/* ================= EquipmentSetup OR-of-AND Satisfiability (§29.4/§6.2 F1-Kern) ================= */
/* Branch = AND, equipment_setups[] = OR (wortgetreu). Ein Tag, der zu
   keinem Praedikat aufloest (resolvable=false), macht die Branch fuer JEDE
   denkbare Inventur unerfuellbar — das ist exakt Catalog-Lint #16 ("no
   impossible EquipmentSetup branch"). */
function resolveSetupBranchSatisfiability(branch,view){
  const results=(branch||[]).map(tag=>({tag,...resolveSetupPredicate(tag,view)}));
  const impossible=results.some(r=>!r.resolvable);
  const satisfied=!impossible&&results.every(r=>r.satisfied);
  return {satisfied,impossible,results};
}
function resolveEquipmentSetupSatisfiability(equipmentSetups,view){
  const branchResults=(equipmentSetups||[]).map((branch,index)=>({index,branch,...resolveSetupBranchSatisfiability(branch,view)}));
  const satisfiableBranches=branchResults.filter(b=>b.satisfied);
  return {
    satisfiable:satisfiableBranches.length>0,
    satisfiableBranchIndices:satisfiableBranches.map(b=>b.index),
    branchResults,
  };
}

/* ================= Bindungswahl (§6.2, NUR Regel 6) ================= */
/* Die volle 6-stufige Bindungswahl-Reihenfolge aus §6.2 braucht:
   (1) persistierte Bindungen — Plan-Engine (nicht gebaut);
   (2) "legaler Progressionspfad ohne PROGRESSION_LIMITED" — Progression-
       Engine (nicht gebaut);
   (3) "feinere verfuegbare Laststufung" — vergleicht resolve_steps()
       mehrerer Kandidaten UNTER Beruecksichtigung einer Zielaufloesung, die
       erst die Prescription-Engine kennt (nicht gebaut);
   (4) "geringere Setup-/Transition-Kosten" — Session-/Logistik-Modell
       (nicht gebaut);
   (5) "vorhandene eigene Historie auf der relevanten Load-Identitaet" —
       WorkoutLog-Historie-Aggregation (nicht gebaut).
   Nur Regel 6 (lexikografisch exercise_setup_id, danach
   equipment_instance_id[]) ist eine reine, kontextfreie Funktion der
   bereits vorhandenen Daten und wird hier IMPLEMENTIERT — als bewusst
   partieller, ehrlich dokumentierter Tie-Break fuer den Fall, dass mehrere
   Branches gleichzeitig satisfiable sind und keine der Regeln 1-5
   anwendbar ist (weil ihre Engines nicht existieren). */
function resolveDeterministicBinding(equipmentSetups,view){
  const res=resolveEquipmentSetupSatisfiability(equipmentSetups,view);
  if(!res.satisfiable)return null;
  const branchIndex=res.satisfiableBranchIndices[0]; // niedrigster Index = "lexikografisch erste" Branch
  const branch=equipmentSetups[branchIndex];
  const instanceIds=[];
  branch.forEach(tag=>{
    const matched=presentEquipmentInstances(view).filter(i=>{
      const d=definitionOf(view,i);
      if(!d)return false;
      const r=resolveSetupPredicate(tag,view);
      if(!r.satisfied)return false;
      // grobe Ruecksicherung: nur Instanzen, die zu diesem konkreten Tag passen (Subtype-Praedikate)
      return allRegisteredSubtypes().indexOf(tag)===-1||d.subtype===tag;
    }).map(i=>i.id).sort();
    matched.forEach(id=>{if(instanceIds.indexOf(id)===-1)instanceIds.push(id);});
  });
  instanceIds.sort();
  return {branchIndex,branch,equipmentInstanceIds:instanceIds};
}

/* ================= effective_location_id (§1.4 DECISION) ================= */
/* "session override ?? geplanter Session-Ort". Reine Null-Coalescing-
   Ableitung, keine eigene Persistenz. */
function resolveEffectiveLocationId(sessionLocationOverrideId,plannedSessionLocationId){
  return sessionLocationOverrideId!=null?sessionLocationOverrideId:plannedSessionLocationId;
}

/* ================= §9.2 resolve_steps(load_profile_version) ================= */
/* Wortgetreu: nur aus der gespeicherten Profildefinition, keine erfundenen
   Zwischenstufen. Bodyweight-/Rep-only-/Band-ordinal-Profile liefern
   bewusst KEINE fingierte kg-Liste (return null). */
function resolveLoadProfileSteps(loadProfileVersion,plateInventoryKg){
  if(loadProfileVersion.load_unit==="BODYWEIGHT_KG"||loadProfileVersion.display_semantics==="ORDINAL"){
    return null; // Bodyweight-/Rep-only-/Band-ordinal: keine fingierte Liste (§9.2)
  }
  if(Array.isArray(loadProfileVersion.available_steps)){
    return dedupSortedSteps(loadProfileVersion.available_steps);
  }
  if(loadProfileVersion.combination_rule==="PLATE_PAIRS"){
    const base=loadProfileVersion.base_load||0;
    const plates=(plateInventoryKg||[]).slice().sort((a,b)=>a-b);
    const combos=new Set([base]);
    // Alle legalen Kombinationen aus Base Load + Plate-Inventar (Paar-Ladung: jede Platte 2x, symmetrisch).
    function enumerate(startIdx,currentSum){
      combos.add(currentSum);
      for(let i=startIdx;i<plates.length;i++){
        enumerate(i+1,currentSum+2*plates[i]);
      }
    }
    enumerate(0,base);
    return dedupSortedSteps(Array.from(combos));
  }
  return null; // kein available_steps[], kein PLATE_PAIRS-Inventar -> keine Ableitung erfunden (INVARIANT L-2)
}
function dedupSortedSteps(values){
  const sorted=Array.from(new Set(values.map(v=>Math.round(v*1000)/1000))).sort((a,b)=>a-b);
  return sorted;
}

/* ================= §29.5/§9.1 Load-Mechanism <-> LoadProfileVersion Semantik ================= */
/* Wortgetreue Tabelle aus §9.1/§29.5:
   "Alle Dumbbell-Lasten: PER_HAND." "Plate-loaded Machines: explizit
   PER_SIDE oder TOTAL_ADDED." "Selectorized/Cable: Instanzlabel."
   "Assistance: LOWER_IS_MORE." "Bands: ordinal, sofern kein validiertes
   Messmodell existiert." Diese Funktion ist der in STEP05 fehlende
   Laufzeit-Layer, der Catalog-Lint #12 (PER_HAND/PER_SIDE/TOTAL-Semantik)
   jetzt tatsaechlich strukturell pruefbar macht. */
function validateLoadProfileSemantics(loadMechanism,loadProfileVersion){
  const errors=[];
  if(loadMechanism==="DUMBBELL_DISCRETE"){
    if(loadProfileVersion.display_semantics!=="PER_HAND")errors.push("DUMBBELL_DISCRETE erfordert display_semantics=PER_HAND (§9.1: 'Alle Dumbbell-Lasten: PER_HAND'), erhalten: "+loadProfileVersion.display_semantics);
    if(loadProfileVersion.pair_semantics==="TOTAL")errors.push("DUMBBELL_DISCRETE darf keine ambige Paar-Gesamtlast fuehren (pair_semantics=TOTAL nicht erlaubt)");
  }
  if(loadMechanism==="PLATE_LOADED_MACHINE"){
    if(["PER_SIDE","TOTAL_ADDED"].indexOf(loadProfileVersion.display_semantics)===-1)errors.push("PLATE_LOADED_MACHINE erfordert display_semantics=PER_SIDE oder TOTAL_ADDED (§9.1), erhalten: "+loadProfileVersion.display_semantics);
  }
  if(loadMechanism==="SELECTORIZED_STACK"||loadMechanism==="CABLE_STACK"){
    if(loadProfileVersion.display_semantics!=="STACK_LABEL")errors.push(loadMechanism+" erfordert display_semantics=STACK_LABEL (§9.1: 'Selectorized/Cable: Instanzlabel'), erhalten: "+loadProfileVersion.display_semantics);
  }
  if(loadMechanism==="ASSISTANCE_INVERSE"){
    if(loadProfileVersion.direction!=="LOWER_IS_MORE")errors.push("ASSISTANCE_INVERSE erfordert direction=LOWER_IS_MORE (§9.1: 'Assistance verwendet LOWER_IS_MORE')");
    if(loadProfileVersion.display_semantics!=="ASSISTANCE")errors.push("ASSISTANCE_INVERSE erfordert display_semantics=ASSISTANCE, erhalten: "+loadProfileVersion.display_semantics);
  }
  if(loadMechanism==="BAND_ORDINAL"||loadMechanism==="BAND_ASSISTANCE"){
    if(loadProfileVersion.display_semantics!=="ORDINAL")errors.push(loadMechanism+" erfordert display_semantics=ORDINAL (§9.1: 'Bands bleiben ordinal'), erhalten: "+loadProfileVersion.display_semantics);
  }
  if(loadMechanism==="SMITH_PLATE"){
    if(loadProfileVersion.display_semantics==="ADDED_LOAD"&&loadProfileVersion.ratio_confidence==null)errors.push("SMITH_PLATE mit ADDED_LOAD erfordert eine gesetzte ratio_confidence (§9.1: 'sonst ADDED_LOAD + niedrige Base-Confidence')");
  }
  return errors;
}

/* ================= Maschinen-Identitaet / Aequivalenz (§11.8, §29.2, INVARIANT P-3/LB-7) ================= */
/* "Gleicher Machine Functional Subtype != gleiche Load-Identitaet."
   "Keine Equivalence aus Subtype, Name, Hersteller oder Funktion ableiten."
   Diese Funktion nimmt ABSICHTLICH nur equivalence_group_id als Kriterium
   entgegen — sie besitzt nicht einmal einen Parameter fuer subtype/family/
   manufacturer, damit eine Aequivalenz aus diesen Feldern strukturell gar
   nicht herleitbar ist (das macht Catalog-Lint #15 jetzt vollstaendig
   testbar: siehe training-equipment.test.js). station_group_id druckt NUR
   physische Stationszugehoerigkeit aus, niemals Lastaequivalenz. */
function isLoadEquivalentInstance(instanceA,instanceB){
  if(instanceA.id===instanceB.id)return true;
  if(instanceA.equivalence_group_id==null||instanceB.equivalence_group_id==null)return false;
  return instanceA.equivalence_group_id===instanceB.equivalence_group_id;
}

/* ================= §11.8 Migration Tier — reine Bedingungs-Klassifikation ================= */
/* Nur die 4 Tier-NAMEN als Funktion der gegebenen Fakten (Bedingungsspalte
   der §11.8-Tabelle) — NICHT die Calibration-/Performance-/Progression-
   KONSEQUENZEN (die brauchen die hier nicht gebaute Calibration-/
   Progression-Engine). `criteria`: {sameExerciseId, sameEquipmentInstanceId,
   compatibleSetupOrLoadProfileVersion, equivalenceGroupMatchWithCompatibleLoadSemantics}. */
const MIGRATION_TIER=Object.freeze({
  EXACT:"EXACT",EQUIVALENT_INSTANCE:"EQUIVALENT_INSTANCE",
  SAME_EXERCISE_NEW_INSTANCE:"SAME_EXERCISE_NEW_INSTANCE",DIFFERENT_EXERCISE:"DIFFERENT_EXERCISE",
});
function resolveMigrationTier(criteria){
  if(!criteria.sameExerciseId)return MIGRATION_TIER.DIFFERENT_EXERCISE;
  if(criteria.sameEquipmentInstanceId&&criteria.compatibleSetupOrLoadProfileVersion)return MIGRATION_TIER.EXACT;
  if(criteria.equivalenceGroupMatchWithCompatibleLoadSemantics)return MIGRATION_TIER.EQUIVALENT_INSTANCE;
  return MIGRATION_TIER.SAME_EXERCISE_NEW_INSTANCE;
}

/* ================= Support State (§1.4 DECISION) — reine Klassifikation ================= */
/* Nimmt bereits berechnete, abstrakte Fakten entgegen (siehe Dateikopf-
   Kommentar: das BERECHNEN dieser Fakten braucht Slot Generation/Exercise
   Selection/§20.2-Validation, die dieses Pack nicht baut). facts:
   {allHardWeeklyRequirementsResolvable, resilientCoreRolesHaveTwoPlusCandidates,
    anyRoleHasOnlyOneCandidateOrMaterialProgressionLimit,
    goalSpecificHardRequirementUnresolved, anyHardFeasibilityRequirementUnresolvable}. */
const SUPPORT_STATE=Object.freeze({
  FULLY_SUPPORTED:"FULLY_SUPPORTED",SUPPORTED_WITH_LIMITATIONS:"SUPPORTED_WITH_LIMITATIONS",
  GOAL_LIMITED:"GOAL_LIMITED",INFEASIBLE:"INFEASIBLE",
});
function resolveSupportState(facts){
  if(facts.anyHardFeasibilityRequirementUnresolvable)return SUPPORT_STATE.INFEASIBLE;
  if(facts.goalSpecificHardRequirementUnresolved)return SUPPORT_STATE.GOAL_LIMITED;
  if(!facts.allHardWeeklyRequirementsResolvable)return SUPPORT_STATE.INFEASIBLE;
  if(facts.resilientCoreRolesHaveTwoPlusCandidates&&!facts.anyRoleHasOnlyOneCandidateOrMaterialProgressionLimit)return SUPPORT_STATE.FULLY_SUPPORTED;
  return SUPPORT_STATE.SUPPORTED_WITH_LIMITATIONS;
}

if(typeof module!=="undefined"&&module.exports){
  module.exports={
    resolveEffectiveLocationId,
    buildLocationInventoryView,presentEquipmentInstances,presentAttachmentInstances,definitionOf,
    instanceHasCapability,resolveSetupPredicate,resolveSetupBranchSatisfiability,
    resolveEquipmentSetupSatisfiability,resolveDeterministicBinding,
    resolveLoadProfileSteps,validateLoadProfileSemantics,
    isLoadEquivalentInstance,MIGRATION_TIER,resolveMigrationTier,
    SUPPORT_STATE,resolveSupportState,
    CABLE_ATTACHMENT_SHORTHAND_MAP,allRegisteredSubtypes,
  };
}
