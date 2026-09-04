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
   - Bindungswahl-Reihenfolge (§6.2, 6 Regeln, KORRIGIERT): alle 6 Regeln
     sind jetzt als reiner deterministischer Comparator implementiert
     (resolveDeterministicBinding). Regeln 1-5 (persistierte Bindung,
     Progressionspfad, Laststufung-Feinheit, Setup-/Transition-Kosten,
     eigene Historie) benoetigen Informationen aus Engines, die dieses Pack
     nicht baut (Plan-/Progression-/Session-/Historie-Engine) — diese
     Informationen werden NICHT erfunden, sondern als explizite, optionale
     `options`-Annotationen konsumiert; fehlt eine Annotation, wird die
     jeweilige Regel uebersprungen. Regel 6 (lexikografisch) laeuft
     NIEMALS automatisch, sondern nur mit explizitem
     `options.allowLexicographicFallback=true`; ohne dieses Flag liefert
     die Funktion bei verbleibender Mehrdeutigkeit ein strukturiertes
     NEEDS_INPUT-Ergebnis statt einer falschen Produktionsauswahl — siehe
     Kommentar an resolveDeterministicBinding.
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
/* KORREKTUR (STEP-06-Spec-Conformance-Nacharbeit, Abschnitt 1):
   resolveSetupPredicate() lieferte zuvor nur ein satisfied-Boolean.
   §29.4 verlangt aber fuer DUMBBELL_SINGLE/DUMBBELL_PAIR/
   DUMBBELL_SINGLE_OR_PAIR/KETTLEBELL_SINGLE/KETTLEBELL_PAIR "ein konkretes
   diskretes LoadProfile in der ANGEGEBENEN STUECKZAHL" — SINGLE und PAIR
   duerfen NICHT identisch satisfiable sein, und `ResolvedSetupBinding.
   equipment_instance_ids[]` muss die tatsaechlich verwendeten Ressourcen
   enthalten. Jede match*-Funktion liefert daher jetzt die KONKRETEN
   matchenden EquipmentInstances (nicht nur ein Boolean), damit
   resolveSetupPredicate() sowohl korrekt pruefen als auch die tatsaechlich
   gebundenen Instanzen zurueckgeben kann. */
function matchSubtype(view,subtypes,familyFilter){
  return presentEquipmentInstances(view).filter(i=>{
    const d=definitionOf(view,i);
    if(!d)return false;
    if(familyFilter&&d.family!==familyFilter)return false;
    return subtypes.indexOf(d.subtype)!==-1;
  });
}
function matchSubtypeWithLoadProfile(view,subtypes,familyFilter){
  return matchSubtype(view,subtypes,familyFilter).filter(i=>i.load_profile_version_id!=null);
}
function matchCapability(view,namespace,values,familyFilter){
  return presentEquipmentInstances(view).filter(i=>{
    const d=definitionOf(view,i);
    if(familyFilter&&(!d||d.family!==familyFilter))return false;
    return values.some(v=>instanceHasCapability(i,namespace,v));
  });
}
function matchMachineFunctionalSubtype(view,machineFunctionalSubtype){
  return presentEquipmentInstances(view).filter(i=>{
    const d=definitionOf(view,i);
    return d&&(d.family==="SELECTORIZED_MACHINE"||d.family==="PLATE_LOADED_MACHINE")
      &&d.machine_functional_subtype===machineFunctionalSubtype&&i.load_profile_version_id!=null;
  });
}
function sortById(instances){return instances.slice().sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);}
function sortedIds(instances){return sortById(instances).map(i=>i.id);}
/* Deterministisches, generisches "genau einen Treffer waehlen"-Ergebnis
   (lexikografisch kleinste id) fuer alle einfachen Presence-/Capability-
   Praedikate, die genau EINE Ressource brauchen. */
function resultFromMatches(matches){
  if(!matches.length)return {resolvable:true,satisfied:false,equipmentInstanceIds:[],attachmentInstanceIds:[]};
  return {resolvable:true,satisfied:true,equipmentInstanceIds:[sortById(matches)[0].id],attachmentInstanceIds:[]};
}

/* Attachment-Shorthands: "Jeder Treffer benoetigt eine PRESENT
   AttachmentInstance ODER eine integrierte identische Capability" — daher
   wird sowohl die separate AttachmentInstance-Liste als auch
   capability_values der Haupt-EquipmentInstance selbst geprueft (z.B. eine
   Cable-Maschine mit integriertem Rope-Attachment ohne separate
   AttachmentInstance). Separate AttachmentInstance hat Vorrang (deterministisch). */
function resolveCableAttachment(view,values){
  const attachments=presentAttachmentInstances(view).filter(a=>values.some(v=>instanceHasCapability(a,"CABLE_ATTACHMENT",v)));
  if(attachments.length){
    return {resolvable:true,satisfied:true,equipmentInstanceIds:[],attachmentInstanceIds:[sortById(attachments)[0].id]};
  }
  const integrated=presentEquipmentInstances(view).filter(i=>values.some(v=>instanceHasCapability(i,"CABLE_ATTACHMENT",v)));
  if(integrated.length){
    return {resolvable:true,satisfied:true,equipmentInstanceIds:[sortById(integrated)[0].id],attachmentInstanceIds:[]};
  }
  return {resolvable:true,satisfied:false,equipmentInstanceIds:[],attachmentInstanceIds:[]};
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
   PLATES PRESENT — dann sind BEIDE Ressourcen tatsaechlich gebunden).
   BARBELL_LOADABLE deckt bewusst NUR die beiden "einfachen" Barbell-
   Subtypes (OLYMPIC_BARBELL/STANDARD_BARBELL) ab: SAFETY_SQUAT_BAR und
   SWISS_MULTI_GRIP_BAR erhalten in §29.4 KEIN eigenes benanntes Shorthand,
   werden hier deshalb NICHT stillschweigend mit BARBELL_LOADABLE
   gleichgesetzt (G-D3) und bleiben nur ueber ihre eigene exakte
   Subtype-Presence adressierbar. */
function resolveBarOrPlates(view,subtypes){
  const bars=matchSubtype(view,subtypes,"FREE_WEIGHT");
  if(!bars.length)return {resolvable:true,satisfied:false,equipmentInstanceIds:[],attachmentInstanceIds:[]};
  const barsWithProfile=matchSubtypeWithLoadProfile(view,subtypes,"FREE_WEIGHT");
  if(barsWithProfile.length){
    return {resolvable:true,satisfied:true,equipmentInstanceIds:[sortById(barsWithProfile)[0].id],attachmentInstanceIds:[]};
  }
  const plates=matchSubtype(view,["PLATES"],"FREE_WEIGHT");
  if(plates.length){
    const ids=[sortById(bars)[0].id,sortById(plates)[0].id].sort();
    return {resolvable:true,satisfied:true,equipmentInstanceIds:ids,attachmentInstanceIds:[]};
  }
  return {resolvable:true,satisfied:false,equipmentInstanceIds:[],attachmentInstanceIds:[]};
}
const DUMBBELL_SUBTYPES=Object.freeze(["FIXED_DUMBBELL","ADJUSTABLE_DUMBBELL","LOADABLE_DUMBBELL"]);
const KETTLEBELL_SUBTYPES=Object.freeze(["KETTLEBELL"]);
/* §29.4: "ein konkretes diskretes LoadProfile in der ANGEGEBENEN
   STUECKZAHL". Zwei EquipmentInstances gelten hier als "kompatible
   Ressourcen" fuer eine PAIR-Anforderung, wenn sie DIESELBE
   equipment_definition_version_id teilen (die bereits bestehende
   Identitaets-Dimension des Datenmodells — keine neu erfundene
   Kompatibilitaets-Heuristik). Waehlt deterministisch die lexikografisch
   kleinste definition_version_id-Gruppe, die die geforderte Mindestanzahl
   `count` erreicht, und daraus die `count` lexikografisch kleinsten
   Instanz-IDs. Liefert null, wenn KEINE Gruppe `count` Mitglieder hat —
   eine einzelne reale EquipmentInstance kann damit strukturell NIE eine
   PAIR-Anforderung (count=2) erfuellen. */
function selectCompatibleQuantityGroup(view,subtypes,familyFilter,count){
  const matching=matchSubtypeWithLoadProfile(view,subtypes,familyFilter);
  const groups={};
  matching.forEach(i=>{(groups[i.equipment_definition_version_id]=groups[i.equipment_definition_version_id]||[]).push(i);});
  const eligibleDefIds=Object.keys(groups).filter(defId=>groups[defId].length>=count).sort();
  if(!eligibleDefIds.length)return null;
  return sortById(groups[eligibleDefIds[0]]).slice(0,count);
}
function resolveDiscreteQuantityPredicate(view,subtypes,count){
  const chosen=selectCompatibleQuantityGroup(view,subtypes,"FREE_WEIGHT",count);
  if(!chosen)return {resolvable:true,satisfied:false,equipmentInstanceIds:[],attachmentInstanceIds:[]};
  return {resolvable:true,satisfied:true,equipmentInstanceIds:chosen.map(i=>i.id).sort(),attachmentInstanceIds:[]};
}

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

/* resolveSetupPredicate(tag, view) -> {resolvable, satisfied,
   equipmentInstanceIds[], attachmentInstanceIds[]}. `resolvable=false`
   bedeutet: der Tag entspricht KEINEM in §29.4 benannten Shorthand und
   KEINEM registrierten §29.1-Subtype — ein solcher Tag kann durch KEINE
   denkbare Inventur jemals erfuellt werden (Catalog-Lint #16: "no
   impossible EquipmentSetup branch"). Bei satisfied=true enthalten
   equipmentInstanceIds/attachmentInstanceIds die TATSAECHLICH zur
   Erfuellung herangezogenen, konkreten Ressourcen (deterministisch
   lexikografisch gewaehlt) — nie eine abstrakte Family. */
function resolveSetupPredicate(tag,view){
  const machineMatch=/^MACHINE\(([A-Z0-9_]+)\)$/.exec(tag);
  if(machineMatch){
    const subtype=machineMatch[1];
    if(MACHINE_FUNCTIONAL_SUBTYPE_REGISTRY.indexOf(subtype)===-1)return {resolvable:false,satisfied:false,equipmentInstanceIds:[],attachmentInstanceIds:[]};
    return resultFromMatches(matchMachineFunctionalSubtype(view,subtype));
  }
  if(CABLE_ATTACHMENT_SHORTHAND_MAP[tag]){
    return resolveCableAttachment(view,CABLE_ATTACHMENT_SHORTHAND_MAP[tag]);
  }
  switch(tag){
    case "BARBELL_LOADABLE": return resolveBarOrPlates(view,["OLYMPIC_BARBELL","STANDARD_BARBELL"]);
    case "EZ_BAR_LOADABLE": return resolveBarOrPlates(view,["EZ_CURL_BAR"]);
    case "TRAP_BAR_LOADABLE": return resolveBarOrPlates(view,["TRAP_BAR"]);
    case "DUMBBELL_SINGLE": case "DUMBBELL_SINGLE_OR_PAIR":
      /* SINGLE_OR_PAIR: die Mindestanforderung fuer JEDE Instantiierung
         (einhaendig ODER beidhaendig) ist 1 Stueck — genau wie SINGLE. */
      return resolveDiscreteQuantityPredicate(view,DUMBBELL_SUBTYPES,1);
    case "DUMBBELL_PAIR": return resolveDiscreteQuantityPredicate(view,DUMBBELL_SUBTYPES,2);
    case "KETTLEBELL_SINGLE": return resolveDiscreteQuantityPredicate(view,KETTLEBELL_SUBTYPES,1);
    case "KETTLEBELL_PAIR": return resolveDiscreteQuantityPredicate(view,KETTLEBELL_SUBTYPES,2);
    case "BENCH_FLAT": return resultFromMatches(matchCapability(view,"BENCH",["FLAT"],"SUPPORT"));
    case "BENCH_INCLINE": return resultFromMatches(matchCapability(view,"BENCH",["INCLINE_ADJUSTABLE"],"SUPPORT"));
    case "BENCH_BACK_SUPPORT": return resultFromMatches(matchCapability(view,"SUPPORT",["BACK_SUPPORTED"],"SUPPORT"));
    case "BENCH_OR_BOX": return resultFromMatches(matchSubtype(view,["FLAT_BENCH","ADJUSTABLE_BENCH","BOX_STEP"],"SUPPORT"));
    case "PREACHER_BENCH": return resultFromMatches(matchSubtype(view,["PREACHER_BENCH"],"SUPPORT"));
    case "ROMAN_CHAIR": return resultFromMatches(matchSubtype(view,["ROMAN_CHAIR"],"SUPPORT"));
    case "GHD": return resultFromMatches(matchSubtype(view,["GHD"],"SUPPORT"));
    case "BOX_STEP": return resultFromMatches(matchSubtype(view,["BOX_STEP"],"SUPPORT"));
    case "FIXED_SUPPORT": return resultFromMatches(matchSubtype(view,["FIXED_SUPPORT"],"SUPPORT"));
    case "RACK_SQUAT_HEIGHT": return resultFromMatches(matchCapability(view,"RACK",["SQUAT_HEIGHT"],"RACK_STATION"));
    case "RACK_BENCH_HEIGHT": return resultFromMatches(matchCapability(view,"RACK",["BENCH_HEIGHT"],"RACK_STATION"));
    case "RACK_BAR_ROW_HEIGHT": return resultFromMatches(matchCapability(view,"RACK",["ROW_HEIGHT"],"RACK_STATION"));
    case "CABLE_HIGH": return resultFromMatches(matchCapability(view,"PULLEY_POSITION",["HIGH"],"CABLE"));
    case "CABLE_MID": return resultFromMatches(matchCapability(view,"PULLEY_POSITION",["MID"],"CABLE"));
    case "CABLE_LOW": return resultFromMatches(matchCapability(view,"PULLEY_POSITION",["LOW"],"CABLE"));
    case "CABLE_LOW_OR_MID": return resultFromMatches(matchCapability(view,"PULLEY_POSITION",["LOW","MID"],"CABLE"));
    case "CABLE_HIGH_OR_MID": return resultFromMatches(matchCapability(view,"PULLEY_POSITION",["HIGH","MID"],"CABLE"));
    case "CABLE_HEIGHT_ADJUSTABLE": return resultFromMatches(matchCapability(view,"PULLEY_POSITION",["HEIGHT_ADJUSTABLE"],"CABLE"));
    case "DUAL_CABLE_OR_CROSSOVER": return resultFromMatches(matchSubtype(view,["DUAL_ADJUSTABLE_PULLEY","CABLE_CROSSOVER","FUNCTIONAL_TRAINER"],"CABLE"));
    case "BODYWEIGHT":
      /* Repraesentiert "der eigene Koerper", keine Equipment-Inventur
         noetig — kein §29.1-Subtype, sondern die einzige Ausnahme, bei der
         die Praesenz per Definition immer gegeben ist. Explizit NICHT mit
         FLOOR/WALK_SPACE verwechselt (die physische Flaeche verlangen und
         PRESENT-gepflegt sein muessen). */
      return {resolvable:true,satisfied:true,equipmentInstanceIds:[],attachmentInstanceIds:[]};
    case "FLOOR": return resultFromMatches(matchSubtype(view,["FLOOR"],"BODYWEIGHT"));
    case "PULLUP_BAR": return resultFromMatches(matchSubtype(view,["PULLUP_BAR"],"BODYWEIGHT"));
    case "DIP_STATION": return resultFromMatches(matchSubtype(view,["DIP_STATION"],"BODYWEIGHT"));
    case "RINGS": return resultFromMatches(matchSubtype(view,["RINGS"],"BODYWEIGHT"));
    case "WALK_SPACE": return resultFromMatches(matchSubtype(view,["WALK_SPACE"],"BODYWEIGHT"));
    case "SLIDERS": return resultFromMatches(matchSubtype(view,["SLIDERS"],"SUPPORT"));
    case "AB_WHEEL": return resultFromMatches(matchSubtype(view,["AB_WHEEL"],"SUPPORT"));
    case "LOWER_BODY_ANCHOR": return resultFromMatches(matchCapability(view,"SUPPORT",["LOWER_LEG_ANCHORED"],"SUPPORT"));
    case "ANCHOR_LOW": return resultFromMatches(matchCapability(view,"ANCHOR",["LOW"]));
    case "ANCHOR_MID": return resultFromMatches(matchCapability(view,"ANCHOR",["MID"]));
    case "ANCHOR_HIGH": return resultFromMatches(matchCapability(view,"ANCHOR",["HIGH"]));
    case "EXTERNAL_BODYWEIGHT_LOAD": {
      const vests=matchSubtype(view,["WEIGHT_VEST"],"RESISTANCE_ACCESSORY");
      if(vests.length)return resultFromMatches(vests);
      return resultFromMatches(matchSubtype(view,["PLATES"],"FREE_WEIGHT"));
    }
    case "DIP_BELT": {
      const belts=matchSubtype(view,["DIP_BELT"],"RESISTANCE_ACCESSORY");
      const plates=matchSubtype(view,["PLATES"],"FREE_WEIGHT");
      if(!belts.length||!plates.length)return {resolvable:true,satisfied:false,equipmentInstanceIds:[],attachmentInstanceIds:[]};
      return {resolvable:true,satisfied:true,equipmentInstanceIds:[sortById(belts)[0].id,sortById(plates)[0].id].sort(),attachmentInstanceIds:[]};
    }
    default: break;
  }
  if(allRegisteredSubtypes().indexOf(tag)!==-1){
    return resultFromMatches(matchSubtype(view,[tag]));
  }
  return {resolvable:false,satisfied:false,equipmentInstanceIds:[],attachmentInstanceIds:[]};
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

/* ================= Bindungswahl (§6.2, Regeln 1-6, reiner Comparator) =================
   KORREKTUR (STEP-06-Spec-Conformance-Nacharbeit, Abschnitt 2): die
   vorherige Fassung wandte NUR Regel 6 an und behandelte damit jede
   fehlende Information aus den Regeln 1-5 stillschweigend wie "gleich" —
   das ist als finale Produktionsauswahl nicht spec-konform. §6.2 verlangt
   exakt diese Reihenfolge:
     1. persistierte Bindung weiterverwenden, wenn weiterhin satisfiable;
     2. legaler Progressionspfad ohne PROGRESSION_LIMITED;
     3. feinere verfuegbare Laststufung;
     4. geringere Setup-/Transition-Kosten;
     5. vorhandene eigene Historie auf der relevanten Load-Identitaet;
     6. lexikografisch exercise_setup_id, danach equipment_instance_id[].
   Regeln 1-5 brauchen Informationen aus Engines, die dieses Pack NICHT baut
   (Plan-/Progression-/Session-/Historie-Engine) — dieses Pack ERFINDET
   diese Information NICHT, sondern konsumiert sie als EXPLIZITE, optionale
   Annotationen ueber `options`. Fehlt eine Annotation VOLLSTAENDIG, wird
   die betroffene Regel uebersprungen (naechste Regel greift). Ist eine
   Annotation nur fuer EINEN TEIL der verbleibenden Kandidaten vorhanden,
   wird die Regel ebenfalls uebersprungen statt eine unfaire Teil-Anwendung
   vorzunehmen. Regel 6 (lexikografischer Tie-Break) wird NIEMALS
   automatisch als Ausweg genutzt: sie lauft nur, wenn der Aufrufer sie via
   `options.allowLexicographicFallback=true` explizit als finale
   Produktionsauswahl anfordert. Ohne dieses Flag liefert die Funktion bei
   verbleibender Mehrdeutigkeit ein strukturiertes NEEDS_INPUT-Ergebnis
   statt einer falschen lexikografischen Auswahl.
   Rueckgabeformen:
     {status:"UNSATISFIABLE",binding:null}
     {status:"RESOLVED",resolvedByRule:1..6|null,binding:{branchIndex,branch,
       equipmentInstanceIds[],attachmentInstanceIds[]},trace:[...]}
     {status:"NEEDS_INPUT",binding:null,remainingCandidates:[branchIndex...],trace:[...]}
   `options` (alle optional):
     persistedBindingBranchIndex: number|null      // Regel 1
     progressionLimitedByBranch: {[branchIndex]:bool}   // Regel 2 (true=PROGRESSION_LIMITED, wird nicht bevorzugt)
     stepFinenessByBranch: {[branchIndex]:number}       // Regel 3 (kleiner=feiner=bevorzugt)
     transitionCostByBranch: {[branchIndex]:number}     // Regel 4 (kleiner=bevorzugt)
     ownHistoryByBranch: {[branchIndex]:bool}           // Regel 5 (true=bevorzugt)
     exerciseSetupIdsByBranch: {[branchIndex]:string}   // Regel 6 (lexikografischer Primaerschluessel)
     allowLexicographicFallback: bool                   // Regel 6 nur mit explizitem Opt-in */
function materializeBinding(equipmentSetups,res,branchIndex){
  const branch=equipmentSetups[branchIndex];
  const branchResult=res.branchResults.find(b=>b.index===branchIndex);
  const equipmentInstanceIds=[];
  const attachmentInstanceIds=[];
  branchResult.results.forEach(r=>{
    (r.equipmentInstanceIds||[]).forEach(id=>{if(equipmentInstanceIds.indexOf(id)===-1)equipmentInstanceIds.push(id);});
    (r.attachmentInstanceIds||[]).forEach(id=>{if(attachmentInstanceIds.indexOf(id)===-1)attachmentInstanceIds.push(id);});
  });
  equipmentInstanceIds.sort();attachmentInstanceIds.sort();
  return {branchIndex,branch,equipmentInstanceIds,attachmentInstanceIds};
}
function filterByAnnotatedRule(candidates,annotationByBranch,scoreFn,ruleNumber,ruleLabel,trace){
  if(!annotationByBranch){
    trace.push("Regel "+ruleNumber+" ("+ruleLabel+"): keine Annotation uebergeben -> uebersprungen");
    return candidates;
  }
  const allAnnotated=candidates.every(c=>annotationByBranch[c]!==undefined);
  if(!allAnnotated){
    trace.push("Regel "+ruleNumber+" ("+ruleLabel+"): unvollstaendige Annotation fuer die verbleibenden Kandidaten -> uebersprungen (keine unfaire Teil-Anwendung)");
    return candidates;
  }
  const scored=candidates.map(c=>({c,score:scoreFn(annotationByBranch[c])}));
  const bestScore=Math.min.apply(null,scored.map(s=>s.score));
  const winners=scored.filter(s=>s.score===bestScore).map(s=>s.c);
  trace.push("Regel "+ruleNumber+" ("+ruleLabel+"): "+candidates.length+" -> "+winners.length+" Kandidaten");
  return winners;
}
function resolveDeterministicBinding(equipmentSetups,view,options){
  options=options||{};
  const res=resolveEquipmentSetupSatisfiability(equipmentSetups,view);
  if(!res.satisfiable)return {status:"UNSATISFIABLE",binding:null};
  let candidates=res.satisfiableBranchIndices.slice();
  const trace=[];

  if(candidates.length===1){
    return {status:"RESOLVED",resolvedByRule:null,binding:materializeBinding(equipmentSetups,res,candidates[0]),trace:["genau ein satisfiable Branch — keine Auswahl noetig"]};
  }

  // Regel 1: persistierte Bindung weiterverwenden, wenn weiterhin satisfiable.
  if(options.persistedBindingBranchIndex!=null){
    if(candidates.indexOf(options.persistedBindingBranchIndex)!==-1){
      trace.push("Regel 1 (persistierte Bindung): Branch "+options.persistedBindingBranchIndex+" weiterhin satisfiable -> gewaehlt");
      return {status:"RESOLVED",resolvedByRule:1,binding:materializeBinding(equipmentSetups,res,options.persistedBindingBranchIndex),trace};
    }
    trace.push("Regel 1 (persistierte Bindung): Branch "+options.persistedBindingBranchIndex+" nicht mehr satisfiable -> naechste Regel");
  }else{
    trace.push("Regel 1 (persistierte Bindung): keine Annotation uebergeben -> uebersprungen");
  }

  // Regel 2: legaler Progressionspfad ohne PROGRESSION_LIMITED (true=limitiert, score 1 = schlechter).
  candidates=filterByAnnotatedRule(candidates,options.progressionLimitedByBranch,v=>v?1:0,2,"kein PROGRESSION_LIMITED",trace);
  if(candidates.length===1)return {status:"RESOLVED",resolvedByRule:2,binding:materializeBinding(equipmentSetups,res,candidates[0]),trace};

  // Regel 3: feinere verfuegbare Laststufung (kleinerer Score = feiner = bevorzugt).
  candidates=filterByAnnotatedRule(candidates,options.stepFinenessByBranch,v=>v,3,"feinere Laststufung",trace);
  if(candidates.length===1)return {status:"RESOLVED",resolvedByRule:3,binding:materializeBinding(equipmentSetups,res,candidates[0]),trace};

  // Regel 4: geringere Setup-/Transition-Kosten.
  candidates=filterByAnnotatedRule(candidates,options.transitionCostByBranch,v=>v,4,"geringere Setup-/Transition-Kosten",trace);
  if(candidates.length===1)return {status:"RESOLVED",resolvedByRule:4,binding:materializeBinding(equipmentSetups,res,candidates[0]),trace};

  // Regel 5: vorhandene eigene Historie auf der relevanten Load-Identitaet (true=bevorzugt, score 0).
  candidates=filterByAnnotatedRule(candidates,options.ownHistoryByBranch,v=>v?0:1,5,"eigene Historie vorhanden",trace);
  if(candidates.length===1)return {status:"RESOLVED",resolvedByRule:5,binding:materializeBinding(equipmentSetups,res,candidates[0]),trace};

  // Regel 6: NUR als expliziter letzter Tie-Break, niemals automatisch.
  if(options.allowLexicographicFallback){
    const idsByBranch=options.exerciseSetupIdsByBranch||{};
    const sorted=candidates.slice().sort((a,b)=>{
      const idA=idsByBranch[a],idB=idsByBranch[b];
      if(idA!==undefined&&idB!==undefined&&idA!==idB)return idA<idB?-1:1;
      const eqA=materializeBinding(equipmentSetups,res,a).equipmentInstanceIds.join(",");
      const eqB=materializeBinding(equipmentSetups,res,b).equipmentInstanceIds.join(",");
      if(eqA!==eqB)return eqA<eqB?-1:1;
      return a-b;
    });
    trace.push("Regel 6 (lexikografisch): explizit angefordert (allowLexicographicFallback) -> Branch "+sorted[0]+" gewaehlt");
    return {status:"RESOLVED",resolvedByRule:6,binding:materializeBinding(equipmentSetups,res,sorted[0]),trace};
  }

  trace.push("Regeln 1-5 lassen "+candidates.length+" Kandidaten uebrig; Regel 6 nicht angefordert (allowLexicographicFallback fehlt) -> NEEDS_INPUT statt falscher Produktionsauswahl");
  return {status:"NEEDS_INPUT",binding:null,remainingCandidates:candidates,trace};
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
