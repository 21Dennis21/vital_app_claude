/* training-domain.js — TRAINING SYSTEM v1.4.1, IMPLEMENTATION PACK 01/14:
   Foundation / Core Types / Datenmodell / Determinismus.

   Quelle: 01_FOUNDATION_CORE_TYPES_DATA_MODEL.md (wortgetreue v1.4.1-
   Auszuege, Primary Scope Master-Zeilen 1-376 und 5016-5280, plus die
   dort ausdruecklich referenzierten Dependency-Contract-Auszuege §5.5,
   §8.5, §9.1, §10.10, §20.2, §21.6, §22 — aus denen NUR die fuer den
   Primary Scope technisch noetigen Datentypen/Ableitungsregeln uebernommen
   wurden, NICHT deren Engine-/Entscheidungslogik).

   ABSICHTLICH NUR FOUNDATION: dieses File enthaelt reine, deterministische
   Datentypen (Factory-Funktionen fuer alle in TEIL 23 definierten
   Entities), den P0-P7-Prioritaetsrahmen (0.2), das EvaluationContext-/
   Determinismus-Fundament (0.3), das Confidence-Modell (0.4) und die
   Rundungsregeln (0.5). KEINE Split-/Volume-/Slot-/Selection-/
   Prescription-/Time-/Calibration-/Progression-/Validation-/Adaptation-
   Engine — jene folgen in spaeteren Packs (siehe "NICHT IMPLEMENTIERT"
   unten). Wo eine Entity ein Feld traegt, dessen konkrete Berechnung
   spaeter erfolgt (z.B. LoadRecommendation.weight_selected), bildet
   dieses File NUR die Datenstruktur ab, nie einen erfundenen Wert.

   Physisch nach demselben Muster wie die uebrigen *-engine.js-Dateien
   ausgelagert: reine, DOM-/React-unabhaengige Funktionen, per normalem
   <script src="training-domain.js"> geladen (keine ES-Module). Persistenz
   (localStorage-Bindung, Migration) liegt bewusst getrennt in
   training-storage.js — dieses File ist ohne jeden Browser-/Storage-
   Zugriff pur testbar.

   WICHTIGE ABGRENZUNGEN (siehe Aufgabenstellung):
   - GENERATED und USER_COMPOSED (Plan.plan_origin) sind gleichrangige,
     saubere Werte desselben Enums — USER_COMPOSED ist keine zweite Engine.
   - AUTOMATIC | RECOMMENDATION | MANUAL (ControlAuthority) ist eine reine
     Decision-Authority-Ebene, kein ProgressionState.phase-Wert.
   - COMPARABLE_END_LOAD wird nirgends als persistenter Progression-/
     Session-State modelliert (siehe §8.5-Dependency: sie ist explizit
     KEIN Catch-up-Signal, nicht Teil des Datenmodells in TEIL 23).
   - Viele Enum-WERTELISTEN (z.B. movement_pattern, goal, primary_muscle_
     bands, experience_level) werden in diesem Pack NICHT aufgezaehlt, weil
     Paket 01 sie nicht enthaelt (kanonische Registries/Katalog stehen laut
     Quelle in TEIL 29, außerhalb dieses Packs). Diese Felder bleiben daher
     bewusst offene, dokumentierte String-Felder statt erfundener Enums —
     eigene freie Wertelisten wuerden genau die "keine konkurrierenden
     Domain-Typen"-Regel verletzen.

   Oeffentliche API (Auswahl, siehe Abschnitte unten fuer die vollstaendige
   Liste): genTrainingId, PRIORITY_LEVELS/PRIORITY_ORDER/comparePriority,
   createEvaluationContext, compareEventOrder, CONFIDENCE_LEVELS,
   roundVolumeToHalfSet/roundToAvailableSteps/roundTimeSpanMinutes,
   loadAxisClass, createFailureResult, create<Entity>() fuer alle TEIL-23-
   Entities, projectEffectiveWorkoutLog, resolveBodyweightAtPerformedAt. */

const TRAINING_DOMAIN_SCHEMA_VERSION=1;

/* ================= ID-Erzeugung ================= */
/* Bewusst KEIN Aufruf von now()/Date.now() als versteckter Input einer
   fachlichen Berechnung (INVARIANT G-D1) — hier geht es ausschliesslich um
   die EINMALIGE Vergabe eines opaken, stabilen Identifiers bei Erzeugung.
   Einmal vergeben, aendert sich eine ID nie wieder; sie ist kein
   Berechnungsergebnis, das bei Replay reproduzierbar sein muesste (das
   betrifft nur ABGELEITETE Werte, siehe INVARIANT G-4). Kollisionssicher
   genug fuer eine Single-User-localStorage-App (Zeitstempel + Zufallsteil),
   im selben einfachen Stil wie die bestehenden "prefix+Date.now()"-IDs in
   index.html (z.B. Ziele/Presets), nur zusaetzlich kollisionssicher bei
   mehreren Erzeugungen innerhalb derselben Millisekunde (z.B. mehrere
   PlanSlots in einer Schleife). */
function genTrainingId(prefix){
  return prefix+"_"+Date.now().toString(36)+Math.random().toString(36).slice(2,10);
}

function requireFields(obj,names){
  const missing=names.filter(n=>obj[n]===undefined||obj[n]===null);
  if(missing.length)throw new Error("training-domain: Pflichtfelder fehlen ("+(obj&&obj.__type__||"?")+"): "+missing.join(", "));
}

/* ================= 0.2 Globale Prioritaetshierarchie ================= */
/* Wortgetreue Abbildung der Tabelle aus 0.2. Diese Foundation implementiert
   KEINE Konfliktloesung selbst (das ist Aufgabe jeder einzelnen spaeteren
   Engine) — sie stellt nur die kanonische Rangfolge + Vergleichsfunktion
   bereit, gegen die spaetere Engines ihre eigenen Entscheidungen ordnen. */
const PRIORITY_LEVELS=Object.freeze({
  P0:Object.freeze({level:0,area:"Safety: medizinische Flags, CAUTION-Muster, Lastsprung-Obergrenzen, Pausen-Untergrenze",violable:"Nie"}),
  P1:Object.freeze({level:1,area:"Explizite harte Nutzerausschluesse (HARD_EXCLUDED)",violable:"Nie"}),
  P2:Object.freeze({level:2,area:"Physische Ausfuehrbarkeit: Equipment am Ort, Lastbereich, Skill-Untergrenze",violable:"Nie"}),
  P3:Object.freeze({level:3,area:"Zeitliche Durchfuehrbarkeit: Session passt ins Zeitbudget",violable:"Nur mit Nutzerbestaetigung"}),
  P4:Object.freeze({level:4,area:"Slot-Funktion: Bewegungsmuster + Primaermuskel des Slots",violable:"Nur mit Nutzerbestaetigung"}),
  P5:Object.freeze({level:5,area:"Trainingsziel-Konformitaet: Rep-Bereich, Progressierbarkeit, Belastungsprofil",violable:"Automatisch anpassbar"}),
  P6:Object.freeze({level:6,area:"Volumenziele und Balance",violable:"Automatisch anpassbar"}),
  P7:Object.freeze({level:7,area:"Weiche Nutzerpraeferenzen, Komfort, Variation",violable:"Ja, mit Hinweis"}),
});
const PRIORITY_ORDER=Object.freeze(["P0","P1","P2","P3","P4","P5","P6","P7"]);
/* P3 (Zeit) steht ausdruecklich ueber P4 (Slot-Funktion) und P6 (Volumen) —
   das ist bereits durch die Reihenfolge oben abgebildet (0.2 DECISION). */
function comparePriority(a,b){return PRIORITY_ORDER.indexOf(a)-PRIORITY_ORDER.indexOf(b);}
/* INVARIANT G-1/G-2 (Foundation-Ebene): P0-P2 sind hier als "Nie
   verletzbar" deklariert; keine Funktion in diesem File bietet einen
   Codepfad an, der P0-P2 umgeht. Das tatsaechliche DURCHSETZEN (Validation/
   Adaptation Engine) folgt in spaeteren Packs. */
const UNVIOLABLE_PRIORITIES=Object.freeze(["P0","P1","P2"]);
function isUnviolablePriority(p){return UNVIOLABLE_PRIORITIES.indexOf(p)!==-1;}

/* ================= 0.3 Determinismus / EvaluationContext ================= */
/* Jeder Core-Aufruf (spaeterer Engines) bekommt EINEN expliziten
   EvaluationContext; kein Core-Modul liest die Systemuhr implizit
   (INVARIANT G-D1). "evaluation_at" muss vom Aufrufer explizit uebergeben
   werden (z.B. aus dem bereits vorhandenen globalen NOW in index.html) —
   diese Fabrik erzeugt evaluation_at NIEMALS selbst. */
function createEvaluationContext(f){
  f=f||{};
  requireFields({...f,__type__:"EvaluationContext"},["evaluation_at","user_timezone","config_version","catalog_version","source_event_revision"]);
  return {
    evaluation_at:f.evaluation_at,
    user_timezone:f.user_timezone,
    config_version:f.config_version,
    catalog_version:f.catalog_version,
    source_event_revision:f.source_event_revision,
    plan_version_id:f.plan_version_id!==undefined?f.plan_version_id:null,
    equipment_profile_versions:f.equipment_profile_versions||[],
  };
}
function toComparableTime(v){
  if(v instanceof Date)return v.getTime();
  if(typeof v==="number")return v;
  if(typeof v==="string")return new Date(v).getTime();
  return NaN;
}
/* Kanonische Ereignisreihenfolge (0.3): 1. effective_at/performed_at,
   2. recorded_at, 3. unveraenderliche event_id lexikografisch
   (INVARIANT G-D2: Einfuegereihenfolge in der Datenbank beeinflusst kein
   Ergebnis). "e" traegt effective_at ODER performed_at (mind. eines),
   recorded_at und event_id. */
function compareEventOrder(a,b){
  const aEff=toComparableTime(a.effective_at!=null?a.effective_at:a.performed_at);
  const bEff=toComparableTime(b.effective_at!=null?b.effective_at:b.performed_at);
  if(aEff!==bEff)return aEff-bEff;
  const aRec=toComparableTime(a.recorded_at),bRec=toComparableTime(b.recorded_at);
  if(aRec!==bRec)return aRec-bRec;
  if(a.event_id<b.event_id)return -1;
  if(a.event_id>b.event_id)return 1;
  return 0;
}
function sortByCanonicalEventOrder(events){return [...events].sort(compareEventOrder);}

/* ================= 0.4 Systemweites Confidence-Modell ================= */
const CONFIDENCE_LEVELS=Object.freeze({NONE:"NONE",LOW:"LOW",MEDIUM:"MEDIUM",HIGH:"HIGH"});
const CONFIDENCE_ORDER=Object.freeze(["NONE","LOW","MEDIUM","HIGH"]);
function compareConfidence(a,b){return CONFIDENCE_ORDER.indexOf(a)-CONFIDENCE_ORDER.indexOf(b);}

/* ================= 0.5 Keine falsche Praezision ================= */
/* Reine Rundungs-PRIMITIVE ohne jede Richtungs-/Konservativitaets-
   Entscheidung — WELCHE Stufe/Richtung "konservativ" ist, entscheidet die
   spaetere Load-Recommendation-/Time-Engine (nicht Foundation), deshalb
   nimmt roundToAvailableSteps den Modus explizit als Parameter entgegen
   statt selbst eine Vorauswahl zu treffen. */
function roundVolumeToHalfSet(value){return Math.round(value*2)/2;}
function roundToAvailableSteps(value,availableSteps,mode){
  if(!Array.isArray(availableSteps)||availableSteps.length===0)return value;
  const sorted=[...availableSteps].sort((a,b)=>a-b);
  if(mode==="down"){
    const below=sorted.filter(s=>s<=value);
    return below.length?below[below.length-1]:sorted[0];
  }
  if(mode==="up"){
    const above=sorted.filter(s=>s>=value);
    return above.length?above[0]:sorted[sorted.length-1];
  }
  let best=sorted[0],bestDist=Math.abs(sorted[0]-value);
  sorted.forEach(s=>{const d=Math.abs(s-value);if(d<bestDist){bestDist=d;best=s;}});
  return best;
}
/* Zeitspanne als +-uncertaintyPct auf stepMinutes gerundet (0.5: "Spanne
   +-12% (+-20% bei unvollstaendigen Metadaten) auf 5 Minuten gerundet"). */
function roundTimeSpanMinutes(centerMinutes,uncertaintyPct,stepMinutes){
  stepMinutes=stepMinutes||5;
  const roundTo=v=>Math.round(v/stepMinutes)*stepMinutes;
  return {lo:roundTo(centerMinutes*(1-uncertaintyPct)),hi:roundTo(centerMinutes*(1+uncertaintyPct))};
}

/* ================= §9.1 Load-Mechanismus / load_axis_class ================= */
/* KORREKTUR (STEP-05-Catalog-Lint-Nacharbeit): §9.1s woertlich zitierte
   "Load-Mechanism Registry" (Dependency-Exzerpt, 13 Werte) nennt
   "INSTANCE_DEFINED_MACHINE" NICHT — Pack 05s eigene, ebenfalls woertlich
   uebernommene Baseline Catalog B (§29.9, PRIMARY SCOPE dieses Packs)
   verwendet diesen Wert aber durchgaengig fuer Maschinen mit
   instanzspezifischer (nicht plattenbasierter) numerischer Last (z.B.
   HACK_SQUAT_MACHINE, LEG_PRESS_45, MACHINE_ROW). Das ist ein echter
   Wortlaut-Konflikt zwischen einem Dependency-Exzerpt und dem Primary-
   Scope-Katalog DESSELBEN Packs. Da §29.9 als Primary Scope dieses Packs
   die spezifischere, tatsaechlich verwendete Datenquelle ist, wird die
   Registry hier um genau diesen einen, im Katalog belegten Wert erweitert
   — keine erfundene Ergaenzung, sondern eine dokumentierte Angleichung an
   die woertlichen Katalogdaten (siehe training-exercise-catalog.js,
   Catalog-Lint #18). */
const LOAD_MECHANISM_REGISTRY=Object.freeze([
  "PLATE_LOADABLE_FREE_WEIGHT","DUMBBELL_DISCRETE","KETTLEBELL_DISCRETE","SELECTORIZED_STACK",
  "PLATE_LOADED_MACHINE","CABLE_STACK","SMITH_PLATE","BODYWEIGHT_OR_REP_ONLY",
  "BODYWEIGHT_PLUS_EXTERNAL","ASSISTANCE_INVERSE","BAND_ASSISTANCE","BAND_ORDINAL","NO_EXTERNAL_LOAD",
  "INSTANCE_DEFINED_MACHINE",
]);
const LOAD_AXIS_CLASS=Object.freeze({
  NUMERIC_EXTERNAL_LOAD:"NUMERIC_EXTERNAL_LOAD",ASSISTANCE_INVERSE:"ASSISTANCE_INVERSE",
  BODYWEIGHT_PLUS_EXTERNAL:"BODYWEIGHT_PLUS_EXTERNAL",BAND_ORDINAL:"BAND_ORDINAL",
  VARIANT_PROGRESSIVE:"VARIANT_PROGRESSIVE",BODYWEIGHT_REP_ONLY:"BODYWEIGHT_REP_ONLY",NON_REP:"NON_REP",
});
/* INSTANCE_DEFINED_MACHINE hier ebenfalls als NUMERIC_EXTERNAL_LOAD
   eingeordnet (siehe Korrektur oben): alle Catalog-B-Zeilen mit diesem
   Mechanismus haben calibration_mode=STANDARD_CURVE und
   progression_capabilities enthaelt LOAD — dieselbe Semantik wie
   PLATE_LOADED_MACHINE, nur an einer konkreten Geraete-Instanz statt an
   diskreten Gewichtsplatten gemessen. */
const NUMERIC_EXTERNAL_LOAD_MECHANISMS=Object.freeze(["PLATE_LOADABLE_FREE_WEIGHT","DUMBBELL_DISCRETE","KETTLEBELL_DISCRETE","SELECTORIZED_STACK","PLATE_LOADED_MACHINE","CABLE_STACK","SMITH_PLATE","INSTANCE_DEFINED_MACHINE"]);
/* Deterministische Ableitung exakt nach §9.1-Tabelle. hasVariantChain =
   "eine kanonische variant_chain fuer das Exercise existiert" (Katalogdaten
   aus Teil 29, hier nur als Boolean-Parameter durchgereicht). */
function loadAxisClass(loadMechanism,hasVariantChain){
  if(NUMERIC_EXTERNAL_LOAD_MECHANISMS.indexOf(loadMechanism)!==-1)return LOAD_AXIS_CLASS.NUMERIC_EXTERNAL_LOAD;
  if(loadMechanism==="ASSISTANCE_INVERSE")return LOAD_AXIS_CLASS.ASSISTANCE_INVERSE;
  if(loadMechanism==="BODYWEIGHT_PLUS_EXTERNAL")return LOAD_AXIS_CLASS.BODYWEIGHT_PLUS_EXTERNAL;
  if(loadMechanism==="BAND_ORDINAL"||loadMechanism==="BAND_ASSISTANCE")return LOAD_AXIS_CLASS.BAND_ORDINAL;
  if(loadMechanism==="BODYWEIGHT_OR_REP_ONLY")return hasVariantChain?LOAD_AXIS_CLASS.VARIANT_PROGRESSIVE:LOAD_AXIS_CLASS.BODYWEIGHT_REP_ONLY;
  return LOAD_AXIS_CLASS.NON_REP;
}

/* ================= §29.1 Equipment Family / Subtype Registry (STEP 06) =================
   Woertlich aus §29.1. STEP01 liess EquipmentDefinitionVersion.family/
   .subtype bewusst als offene Strings (siehe Datei-Kopfkommentar: "viele
   Enum-Wertelisten ... werden in diesem Pack NICHT aufgezaehlt, weil Paket
   01 sie nicht enthaelt"); STEP06 schliesst sie jetzt hier, analog zur
   STEP-05-Schliessung von movement_pattern.
   Fuer SELECTORIZED_MACHINE/PLATE_LOADED_MACHINE nennt §29.1 KEINE
   Subtype-Liste ("machine_functional_subtype required") — die eigentliche
   Differenzierung liegt dort in §29.2 (MACHINE_FUNCTIONAL_SUBTYPE_REGISTRY),
   nicht in einer Subtype-Liste dieser Registry. EXTENDED nennt §29.1
   woertlich "specialty implements not required for baseline feasibility"
   und definiert explizit KEINE Subtype-Liste. Fuer diese 3 Familien wird
   daher KEIN Subtype-Wertevorrat erfunden (isValidEquipmentSubtype lässt
   dort jeden nicht-leeren String zu); alle anderen 7 Familien sind ein
   geschlossener Wertevorrat exakt nach §29.1. */
const EQUIPMENT_FAMILY_SUBTYPE_REGISTRY=Object.freeze({
  FREE_WEIGHT:Object.freeze(["OLYMPIC_BARBELL","STANDARD_BARBELL","EZ_CURL_BAR","TRAP_BAR","SAFETY_SQUAT_BAR","SWISS_MULTI_GRIP_BAR","FIXED_DUMBBELL","ADJUSTABLE_DUMBBELL","LOADABLE_DUMBBELL","KETTLEBELL","PLATES","MICROPLATES"]),
  SUPPORT:Object.freeze(["FLAT_BENCH","ADJUSTABLE_BENCH","PREACHER_BENCH","ROMAN_CHAIR","GHD","NORDIC_BENCH","BOX_STEP","PAD_SUPPORT","FIXED_SUPPORT","SLIDERS","AB_WHEEL"]),
  RACK_STATION:Object.freeze(["POWER_RACK","HALF_RACK","SQUAT_STAND","BENCH_RACK","SMITH_MACHINE","GUIDED_BAR"]),
  CABLE:Object.freeze(["SINGLE_FIXED_PULLEY","SINGLE_ADJUSTABLE_COLUMN","DUAL_ADJUSTABLE_PULLEY","FUNCTIONAL_TRAINER","CABLE_CROSSOVER","LAT_PULLDOWN_STATION","SEATED_ROW_STATION","COMBO_PULLDOWN_ROW"]),
  SELECTORIZED_MACHINE:null,
  PLATE_LOADED_MACHINE:null,
  BODYWEIGHT:Object.freeze(["FLOOR","PULLUP_BAR","DIP_STATION","PARALLEL_BARS","RINGS","SUSPENSION_TRAINER","WALK_SPACE"]),
  RESISTANCE_ACCESSORY:Object.freeze(["LOOP_BAND","TUBE_BAND","LONG_BAND","DIP_BELT","WEIGHT_VEST","ANKLE_WEIGHT","ANCHOR_POINT"]),
  SPECIAL_CORE:Object.freeze(["LANDMINE","BELT_SQUAT","SLED"]),
  EXTENDED:null,
});
const EQUIPMENT_FAMILIES_REQUIRING_MACHINE_FUNCTIONAL_SUBTYPE=Object.freeze(["SELECTORIZED_MACHINE","PLATE_LOADED_MACHINE"]);
function isValidEquipmentFamily(family){
  return Object.prototype.hasOwnProperty.call(EQUIPMENT_FAMILY_SUBTYPE_REGISTRY,family);
}
function isValidEquipmentSubtype(family,subtype){
  if(!isValidEquipmentFamily(family))return false;
  const list=EQUIPMENT_FAMILY_SUBTYPE_REGISTRY[family];
  if(list===null)return typeof subtype==="string"&&subtype.length>0;
  return list.indexOf(subtype)!==-1;
}
/* ================= §29.2 Machine Functional Subtype Registry (STEP 06) ================= */
const MACHINE_FUNCTIONAL_SUBTYPE_REGISTRY=Object.freeze([
  "CHEST_PRESS_FLAT","CHEST_PRESS_INCLINE","SHOULDER_PRESS","PECTORAL_FLY","REVERSE_FLY","LATERAL_RAISE",
  "PULLDOWN","ROW","PULLOVER","BICEPS_CURL","TRICEPS_EXTENSION","TRICEPS_PRESS","LEG_PRESS_45",
  "LEG_PRESS_HORIZONTAL","HACK_SQUAT","PENDULUM_SQUAT","BELT_SQUAT","LEG_EXTENSION","LEG_CURL_SEATED",
  "LEG_CURL_LYING","HIP_ABDUCTION","HIP_ADDUCTION","HIP_EXTENSION_GLUTE","HIP_THRUST","CALF_RAISE",
  "ABDOMINAL_FLEXION","BACK_EXTENSION","ASSISTED_PULLUP_DIP",
]);
/* ================= §29.3 Capability Registry (STEP 06) =================
   Namespaced: CapabilityPredicate{namespace,operator,value} validiert
   namespace+value gegen dieses Registry. `operator` besitzt in den fuer
   dieses Pack verfuegbaren Quellen (§29.3 selbst, §1.4) keinen woertlich
   genannten geschlossenen Wertevorrat (der lebt laut STEP05-Filequelle in
   §23.1, ausdruecklich "nur zur Einordnung, NICHT implementiert") — hier
   daher bewusst NICHT erfunden, `operator` bleibt ein Pflichtfeld ohne
   Enum-Pruefung (siehe createCapabilityPredicate). */
const CAPABILITY_REGISTRY=Object.freeze({
  PATH:Object.freeze(["FREE","GUIDED_LINEAR","GUIDED_ARC","CONVERGING","DIVERGING","USER_DEFINED_CABLE"]),
  PULLEY_POSITION:Object.freeze(["HIGH","MID","LOW","HEIGHT_ADJUSTABLE"]),
  LATERALITY:Object.freeze(["BILATERAL_DEPENDENT","BILATERAL_INDEPENDENT","UNILATERAL_SUPPORTED"]),
  SUPPORT:Object.freeze(["CHEST_SUPPORTED","BACK_SUPPORTED","SEATED","STANDING","PRONE","SUPINE","LOWER_LEG_ANCHORED"]),
  BENCH:Object.freeze(["FLAT","INCLINE_ADJUSTABLE","DECLINE_CAPABLE"]),
  RACK:Object.freeze(["SQUAT_HEIGHT","BENCH_HEIGHT","SAFETY_ARMS","PULLUP_BAR","ROW_HEIGHT"]),
  BODYWEIGHT:Object.freeze(["PULLUP","DIP","ROW","SUSPENSION","EXTERNAL_LOAD_ATTACHABLE","WALK_SPACE"]),
  ASSISTANCE:Object.freeze(["COUNTERWEIGHT_ASSISTANCE","BAND_ASSISTANCE"]),
  CABLE_ATTACHMENT:Object.freeze(["SINGLE_D_HANDLE","PAIR_D_HANDLES","ROPE","STRAIGHT_BAR","EZ_BAR","WIDE_BAR","NEUTRAL_PULLDOWN_HANDLE","NEUTRAL_ROW_HANDLE","ANKLE_STRAP"]),
  LOADABLE:Object.freeze(["PLATE_LOADABLE","STACK_SELECTABLE","DUMBBELL_SELECTABLE","BAND_RESISTANCE","BODYWEIGHT_PLUS_LOAD"]),
  ANCHOR:Object.freeze(["LOW","MID","HIGH"]),
});
function isValidCapabilityNamespace(namespace){
  return Object.prototype.hasOwnProperty.call(CAPABILITY_REGISTRY,namespace);
}
function isValidCapabilityValue(namespace,value){
  return isValidCapabilityNamespace(namespace)&&CAPABILITY_REGISTRY[namespace].indexOf(value)!==-1;
}
/* ================= §9.1 LoadProfileVersion — Enum-Wertevorraete (STEP 06) =================
   Woertlich aus §9.1. STEP01 hatte createLoadProfileVersion bereits als
   Pflichtfeld-Struktur angelegt, aber ohne Enum-Pruefung der einzelnen
   Wertelisten (freie Strings) — wird hier, als Primary-Scope TEIL 9 dieses
   Packs, geschlossen. */
const LOAD_UNIT=Object.freeze({KG:"KG",LB:"LB",BAND_LEVEL:"BAND_LEVEL",BODYWEIGHT_KG:"BODYWEIGHT_KG",ASSISTANCE_KG:"ASSISTANCE_KG",DISPLAY_UNIT:"DISPLAY_UNIT"});
const DISPLAY_SEMANTICS=Object.freeze({TOTAL_LOAD:"TOTAL_LOAD",PER_HAND:"PER_HAND",PER_SIDE:"PER_SIDE",TOTAL_ADDED:"TOTAL_ADDED",STACK_LABEL:"STACK_LABEL",ADDED_LOAD:"ADDED_LOAD",ASSISTANCE:"ASSISTANCE",ORDINAL:"ORDINAL"});
const LOAD_DIRECTION=Object.freeze({HIGHER_IS_MORE:"HIGHER_IS_MORE",LOWER_IS_MORE:"LOWER_IS_MORE"});
const PAIR_SEMANTICS=Object.freeze({SINGLE:"SINGLE",PAIR_PER_HAND:"PAIR_PER_HAND",N_A:"N_A"});
const PER_SIDE_SEMANTICS=Object.freeze({PER_SIDE:"PER_SIDE",TOTAL:"TOTAL",N_A:"N_A"});
const RATIO_CONFIDENCE=Object.freeze({NONE:"NONE",LOW:"LOW",MEDIUM:"MEDIUM",HIGH:"HIGH"});

/* ================= Kanonische fachliche Enums (Korrektur nach STEP-01-Review) =================
   Pack 01 selbst wiederholt die Master-v1.4.1-Registries nicht vollstaendig
   (viele Wertelisten stehen erst in Teil 29 bzw. anderen Packs). Fuer die
   Werte, die als Teil dieser Korrektur explizit als kanonisch benannt
   wurden, gilt aber ab sofort: KEINE frei erfundenen/dauerhaft offenen
   Strings mehr — Validierung erfolgt in den betroffenen Entity-Fabriken
   unten (validateEnumValue/validateEnumArray wirft bei jedem Wert
   ausserhalb der Liste). */
function validateEnumValue(value,enumObj,fieldLabel){
  if(Object.values(enumObj).indexOf(value)===-1){
    throw new Error("training-domain: ungueltiger Wert fuer "+fieldLabel+": "+JSON.stringify(value)+" (erlaubt: "+Object.values(enumObj).join(", ")+")");
  }
}
function validateEnumArray(values,enumObj,fieldLabel){
  (values||[]).forEach(v=>validateEnumValue(v,enumObj,fieldLabel));
}
const TRAINING_GOAL=Object.freeze({HYPERTROPHY:"HYPERTROPHY",STRENGTH:"STRENGTH",GENERAL_FITNESS:"GENERAL_FITNESS"});
const EXPERIENCE_SELF=Object.freeze({NEW:"NEW",SOME:"SOME",EXPERIENCED:"EXPERIENCED"});
const EXPERIENCE_LEVEL=Object.freeze({BEGINNER:"BEGINNER",INTERMEDIATE:"INTERMEDIATE",ADVANCED:"ADVANCED"});
/* MuscleContributionBand: in den bisher bereitgestellten TEIL-23-Feldern
   (siehe unten) taucht bislang KEIN Feld auf, das explizit vom Typ
   MuscleContributionBand ist — der Enum wird trotzdem bereits jetzt
   kanonisch bereitgestellt (exportiert, validierbar), damit ein spaeteres
   Pack ihn direkt verwenden kann, statt selbst wieder einen freien String
   zu erfinden. */
const MUSCLE_CONTRIBUTION_BAND=Object.freeze({PRIMARY_HIGH:"PRIMARY_HIGH",PRIMARY_MODERATE:"PRIMARY_MODERATE",SECONDARY:"SECONDARY",STABILIZER:"STABILIZER"});
const CANONICAL_VOLUME_MUSCLE_ID=Object.freeze({
  CHEST:"CHEST",FRONT_DELT:"FRONT_DELT",SIDE_DELT:"SIDE_DELT",REAR_DELT:"REAR_DELT",
  LATS:"LATS",UPPER_BACK:"UPPER_BACK",LOWER_BACK:"LOWER_BACK",BICEPS:"BICEPS",
  TRICEPS:"TRICEPS",FOREARM:"FOREARM",QUADS:"QUADS",HAMSTRINGS:"HAMSTRINGS",
  GLUTES:"GLUTES",ADDUCTORS:"ADDUCTORS",ABDUCTORS:"ABDUCTORS",CALVES:"CALVES",
  ABS:"ABS",OBLIQUES:"OBLIQUES",
});
/* ===== Pack 04 (Volume Engine, §4.4/§4.4): kanonische Enums fuer
   VolumeDeficit.limiting_constraint und VolumeSnapshot.status. Beide
   Felder existierten bereits als freie Werte in createVolumeDeficit/
   createVolumeSnapshot (STEP 01) — hier NACHTRAEGLICH mit den in Pack 04
   §4.4 wortgetreu genannten Werten geschlossen, analog der STEP-03-
   Korrektur an createSlotFunction (kein Freitext fuer normative Enums,
   INVARIANT G-D3/V-M1). */
const LIMITING_CONSTRAINT=Object.freeze({
  P2_EQUIPMENT:"P2_EQUIPMENT",P3_TIME:"P3_TIME",P4_SLOT_FUNCTION:"P4_SLOT_FUNCTION",
  USER_COMPOSED_CHOICE:"USER_COMPOSED_CHOICE",
});
const VOLUME_TOLERANCE_STATUS=Object.freeze({OK:"OK",WARNING:"WARNING",ERROR:"ERROR"});

/* ===== Pack 02 (User Profile/Onboarding): weitere kanonische Enums, die
   erst in Paket 02 wortgetreu benannt werden (§1.2, §1.4, §3.1). Analog zur
   STEP-01-Korrektur: geschlossene Enums statt dauerhaft freier Strings. ===== */
const REST_PREFERENCE=Object.freeze({SHORT:"SHORT",STANDARD:"STANDARD",LONG:"LONG"});
/* §3.1 Kandidatenraum — die 9 dort benannten Splits. preferred_split bleibt
   fachlich OPTIONAL (Default null = "Automatisch") und wirkt laut §3 nur als
   Score-Bonus, nie als Hard Filter (siehe UX-Vorgabe Paket 02) — die Split
   Engine/Bewertung selbst folgt erst in STEP 03. */
const PREFERRED_SPLIT=Object.freeze({
  FULL_BODY:"FULL_BODY",UPPER_LOWER:"UPPER_LOWER",UPPER_LOWER_FULL:"UPPER_LOWER_FULL",
  PUSH_PULL:"PUSH_PULL",PPL:"PPL",PPL_X2:"PPL_X2",PPL_UL_HYBRID:"PPL_UL_HYBRID",
  UPPER_LOWER_X3:"UPPER_LOWER_X3",BODY_PART_SPLIT:"BODY_PART_SPLIT",
});
/* §1.4 TrainingLocation.type */
const TRAINING_LOCATION_TYPE=Object.freeze({
  COMMERCIAL_GYM:"COMMERCIAL_GYM",HOME_GYM:"HOME_GYM",HOTEL_TRAVEL:"HOTEL_TRAVEL",
  BODYWEIGHT_ONLY:"BODYWEIGHT_ONLY",OTHER:"OTHER",
});
/* §1.2 REQUIRED-Tabelle: numerische Wertebereiche der Onboarding-Felder.
   Einzige Quelle dieser Grenzen — UI und Domain-Validierung verwenden
   ausschliesslich diese Konstante, keine zweite Kopie der Zahlen. */
const USER_TRAINING_PROFILE_FIELD_BOUNDS=Object.freeze({
  training_days_per_week:Object.freeze([2,6]),
  session_time_budget_min:Object.freeze([20,120]),
  bodyweight_kg:Object.freeze([30,250]),
});
function validateNumericRange(value,bounds,fieldLabel){
  if(typeof value!=="number"||Number.isNaN(value)||value<bounds[0]||value>bounds[1]){
    throw new Error("training-domain: "+fieldLabel+" ausserhalb des gueltigen Bereichs ["+bounds[0]+", "+bounds[1]+"]: "+JSON.stringify(value));
  }
}
/* ===== Pack 05 (§5.1 Kanonische Bewegungsmuster-Taxonomie): schliesst die
   in STEP01 bewusst offen gelassene Movement-Registry. STEP01 hatte hierfuer
   nur eine LEERE Set-Struktur mit registerMovementPatternId()/
   registerMovementSubpatternId() als Platzhalter angelegt, weil Paket 01
   selbst keine konkreten IDs nannte ("Aufgabe eines spaeteren Packs mit der
   vollstaendigen Liste" — siehe Git-Historie). Pack 05 liefert diese Liste
   jetzt wortgetreu; die Registry ist damit GESCHLOSSEN (§5.1: "Der Registry
   ist geschlossen: neue Subpatterns erfordern eine versionierte Catalog-/
   Registry-Aenderung und duerfen nicht als freie Strings erscheinen") — die
   vormals offene register*()-API entfaellt ersatzlos, isRegisteredMovement
   PatternId()/isRegisteredMovementSubpatternId() bleiben als Mitgliedschafts-
   pruefung erhalten, lesen jetzt aber die feste Liste statt eines Sets. */
const MOVEMENT_PATTERN_ID=Object.freeze({
  HORIZONTAL_PRESS:"HORIZONTAL_PRESS",VERTICAL_PRESS:"VERTICAL_PRESS",
  HORIZONTAL_PULL:"HORIZONTAL_PULL",VERTICAL_PULL:"VERTICAL_PULL",
  KNEE_DOMINANT:"KNEE_DOMINANT",KNEE_EXTENSION:"KNEE_EXTENSION",
  HIP_HINGE:"HIP_HINGE",HIP_EXTENSION:"HIP_EXTENSION",KNEE_FLEXION:"KNEE_FLEXION",
  SHOULDER_LATERAL:"SHOULDER_LATERAL",SHOULDER_REAR:"SHOULDER_REAR",
  SHOULDER_ADDUCTION:"SHOULDER_ADDUCTION",SHOULDER_EXTENSION:"SHOULDER_EXTENSION",
  SCAPULAR_PULL:"SCAPULAR_PULL",ELBOW_FLEXION:"ELBOW_FLEXION",ELBOW_EXTENSION:"ELBOW_EXTENSION",
  HIP_ABDUCTION:"HIP_ABDUCTION",HIP_ADDUCTION:"HIP_ADDUCTION",
  ANKLE_PLANTARFLEXION:"ANKLE_PLANTARFLEXION",FOREARM:"FOREARM",
  TRUNK_FLEXION:"TRUNK_FLEXION",TRUNK_ANTIEXTENSION:"TRUNK_ANTIEXTENSION",
  TRUNK_ANTIROTATION:"TRUNK_ANTIROTATION",TRUNK_ANTILATERALFLEXION:"TRUNK_ANTILATERALFLEXION",
  LOADED_CARRY:"LOADED_CARRY",
});
const MOVEMENT_SUBPATTERN_ID=Object.freeze({
  ANTI_EXTENSION:"ANTI_EXTENSION",BACK_EXTENSION:"BACK_EXTENSION",BENT_OVER_ROW:"BENT_OVER_ROW",
  BILATERAL_SQUAT:"BILATERAL_SQUAT",CABLE_PRESS:"CABLE_PRESS",CABLE_ROW:"CABLE_ROW",
  CALF_RAISE:"CALF_RAISE",CHEST_SUPPORTED_ROW:"CHEST_SUPPORTED_ROW",CHINUP:"CHINUP",
  CURL:"CURL",DEADLIFT:"DEADLIFT",DIAGONAL_PRESS:"DIAGONAL_PRESS",DIP:"DIP",
  FACE_PULL:"FACE_PULL",FARMER_CARRY:"FARMER_CARRY",FLAT_PRESS:"FLAT_PRESS",
  FLOOR_PRESS:"FLOOR_PRESS",FLY:"FLY",GLUTE_BRIDGE:"GLUTE_BRIDGE",GOOD_MORNING:"GOOD_MORNING",
  HAMMER_CURL:"HAMMER_CURL",HANGING_RAISE:"HANGING_RAISE",HIP_THRUST:"HIP_THRUST",
  INCLINE_PRESS:"INCLINE_PRESS",INVERTED_ROW:"INVERTED_ROW",LATERAL_RAISE:"LATERAL_RAISE",
  LEG_CURL:"LEG_CURL",LOADED:"LOADED",LUNGE:"LUNGE",MACHINE_ROW:"MACHINE_ROW",NORDIC:"NORDIC",
  OPEN_CHAIN_HIP_ABDUCTION:"OPEN_CHAIN_HIP_ABDUCTION",OPEN_CHAIN_HIP_ADDUCTION:"OPEN_CHAIN_HIP_ADDUCTION",
  OPEN_CHAIN_KNEE_EXTENSION:"OPEN_CHAIN_KNEE_EXTENSION",OVERHEAD_PRESS:"OVERHEAD_PRESS",
  PALLOF:"PALLOF",PIKE_PRESS:"PIKE_PRESS",PRESS_COMPOUND:"PRESS_COMPOUND",PULLDOWN:"PULLDOWN",
  PULLUP:"PULLUP",PULL_THROUGH:"PULL_THROUGH",PUSHUP:"PUSHUP",RDL:"RDL",
  REAR_DELT_FLY:"REAR_DELT_FLY",ROLLOUT:"ROLLOUT",SIDE_PLANK:"SIDE_PLANK",SLIDER:"SLIDER",
  SPLIT_SQUAT:"SPLIT_SQUAT",STEP_UP:"STEP_UP",STRAIGHT_ARM_PULL:"STRAIGHT_ARM_PULL",
  SUPPORTED_KNEE_DOMINANT:"SUPPORTED_KNEE_DOMINANT",TRICEPS_EXTENSION:"TRICEPS_EXTENSION",
  TRUNK_FLEXION:"TRUNK_FLEXION",
});
/* Die 6 Grundmuster fuer Pflichtabdeckung bei GENERAL_FITNESS/HYPERTROPHY
   (§5.1, woertlich). */
const FOUNDATIONAL_MOVEMENT_PATTERNS=Object.freeze([
  "HORIZONTAL_PRESS","VERTICAL_PRESS","HORIZONTAL_PULL","VERTICAL_PULL","KNEE_DOMINANT","HIP_HINGE",
]);
function isRegisteredMovementPatternId(id){return Object.prototype.hasOwnProperty.call(MOVEMENT_PATTERN_ID,id);}
function isRegisteredMovementSubpatternId(id){return Object.values(MOVEMENT_SUBPATTERN_ID).indexOf(id)!==-1;}

/* ================= 23.0 Cross-Engine Context und Failure Contract ================= */
const FAILURE_CATEGORY=Object.freeze({
  USER_RESOLVABLE:"USER_RESOLVABLE",SYSTEM_REPAIRABLE:"SYSTEM_REPAIRABLE",TEMPORARY:"TEMPORARY",
  BLOCKING:"BLOCKING",INFEASIBLE:"INFEASIBLE",NEEDS_CONFIRMATION:"NEEDS_CONFIRMATION",
  DATA_QUALITY:"DATA_QUALITY",CALIBRATION_REQUIRED:"CALIBRATION_REQUIRED",
});
const FAILURE_SEVERITY=Object.freeze({INFO:"INFO",WARNING:"WARNING",ERROR:"ERROR",BLOCKING:"BLOCKING"});
const RETRY_SEMANTICS=Object.freeze({
  NONE:"NONE",RETRY_SAME_INPUT:"RETRY_SAME_INPUT",RETRY_AFTER_FACT_CHANGE:"RETRY_AFTER_FACT_CHANGE",
  RETRY_AFTER_USER_DECISION:"RETRY_AFTER_USER_DECISION",REBASE_AND_RETRY:"REBASE_AND_RETRY",
});
function createFailureResult(f){
  f=f||{};
  requireFields({...f,__type__:"FailureResult"},["code","category","severity","user_message_key","source_engine"]);
  return {
    code:f.code,category:f.category,severity:f.severity,user_message_key:f.user_message_key,
    repair_options:f.repair_options||[],blocking:!!f.blocking,
    retry_semantics:f.retry_semantics||RETRY_SEMANTICS.NONE,source_engine:f.source_engine,
  };
}

/* ================= 23.1 Katalog und Equipment ================= */
/* Kanonische Registries und der vollstaendige 125-Exercise-Katalog stehen
   laut Quelle in TEIL 29 (außerhalb dieses Packs) — hier NUR die
   Datenstrukturen, keine Katalog-Instanzdaten. */
function createExerciseDefinitionVersion(f){
  f=f||{};
  requireFields({...f,__type__:"ExerciseDefinitionVersion"},["exercise_id","canonical_name","definition_version","status","movement_pattern","exercise_class","instance_relevance","calibration_mode","technical_demand","stability_demand","mobility_demand","setup_complexity","fatigue_local","fatigue_systemic","setup_time_class","unilateral_time_class","warmup_protocol_class","progression_ceiling_behavior","auto_selectable","metadata_completeness"]);
  validateEnumValue(f.movement_pattern,MOVEMENT_PATTERN_ID,"movement_pattern");
  if(f.movement_subpattern!=null)validateEnumValue(f.movement_subpattern,MOVEMENT_SUBPATTERN_ID,"movement_subpattern");
  /* §5.3/§23.1: primary_muscle_bands[]/secondary_muscle_bands[] sind Listen
     von {canonical_volume_muscle_id, contribution_band}-Paaren (Pack 05,
     29.8 "Primary bands"/"Secondary bands"), NICHT blosse Muskel-ID-Strings
     — STEP01 hatte hier faelschlich validateEnumArray gegen die reine
     Muskel-ID-Liste verwendet (derselbe Fehlertyp wie bei createSlotFunction,
     dort in STEP03 bereits korrigiert). Korrigiert analog mit der bereits
     vorhandenen validateMuscleContributionBands(). */
  validateMuscleContributionBands(f.primary_muscle_bands,"primary_muscle_bands");
  validateMuscleContributionBands(f.secondary_muscle_bands,"secondary_muscle_bands");
  return {
    exercise_id:f.exercise_id,canonical_name:f.canonical_name,aliases:f.aliases||[],
    definition_version:f.definition_version,status:f.status,
    movement_pattern:f.movement_pattern,movement_subpattern:f.movement_subpattern!==undefined?f.movement_subpattern:null,
    primary_muscle_bands:f.primary_muscle_bands||[],secondary_muscle_bands:f.secondary_muscle_bands||[],
    anatomy_tags:f.anatomy_tags||[],subregion_tags:f.subregion_tags||[],stabilizer_tags:f.stabilizer_tags||[],
    exercise_class:f.exercise_class,laterality_modes:f.laterality_modes||[],supported_slot_roles:f.supported_slot_roles||[],
    equipment_setups:f.equipment_setups||[],possible_load_mechanisms:f.possible_load_mechanisms||[],
    instance_relevance:f.instance_relevance,
    goal_compatibility:f.goal_compatibility||[],supported_rep_characters:f.supported_rep_characters||[],rep_band_classes:f.rep_band_classes||[],
    progression_capabilities:f.progression_capabilities||[],calibration_mode:f.calibration_mode,
    technical_demand:f.technical_demand,stability_demand:f.stability_demand,mobility_demand:f.mobility_demand,
    setup_complexity:f.setup_complexity,fatigue_local:f.fatigue_local,fatigue_systemic:f.fatigue_systemic,
    setup_time_class:f.setup_time_class,unilateral_time_class:f.unilateral_time_class,warmup_protocol_class:f.warmup_protocol_class,
    bodyweight_assistance_semantics:f.bodyweight_assistance_semantics!==undefined?f.bodyweight_assistance_semantics:null,
    progression_ceiling_behavior:f.progression_ceiling_behavior,
    auto_selectable:!!f.auto_selectable,metadata_completeness:f.metadata_completeness,
    animation_id:f.animation_id!==undefined?f.animation_id:null,
    laterality_animation_mode:f.laterality_animation_mode!==undefined?f.laterality_animation_mode:null,
    equipment_visual_id:f.equipment_visual_id!==undefined?f.equipment_visual_id:null,
    setup_variant_id:f.setup_variant_id!==undefined?f.setup_variant_id:null,
  };
}
function createExerciseSetupVariant(f){
  f=f||{};
  requireFields({...f,__type__:"ExerciseSetupVariant"},["id","exercise_id","definition_version","name","history_identity_effect"]);
  return {id:f.id,exercise_id:f.exercise_id,definition_version:f.definition_version,name:f.name,
    capability_overrides:f.capability_overrides||[],technique_tags:f.technique_tags||[],
    history_identity_effect:f.history_identity_effect};
}
function createExerciseSetup(f){
  f=f||{};
  requireFields({...f,__type__:"ExerciseSetup"},["id","exercise_definition_version_id","load_mechanism","load_profile_selector","instance_relevance"]);
  return {id:f.id,exercise_definition_version_id:f.exercise_definition_version_id,predicates:f.predicates||[],
    load_mechanism:f.load_mechanism,load_profile_selector:f.load_profile_selector,instance_relevance:f.instance_relevance};
}
function createResolvedSetupBinding(f){
  f=f||{};
  requireFields({...f,__type__:"ResolvedSetupBinding"},["id","exercise_setup_id","location_id","capability_snapshot","load_semantics_snapshot","resolved_at","source_equipment_profile_version_id"]);
  return {id:f.id,exercise_setup_id:f.exercise_setup_id,location_id:f.location_id,
    equipment_instance_ids:f.equipment_instance_ids||[],attachment_instance_ids:f.attachment_instance_ids||[],
    load_bearing_instance_id:f.load_bearing_instance_id!==undefined?f.load_bearing_instance_id:null,
    load_profile_version_id:f.load_profile_version_id!==undefined?f.load_profile_version_id:null,
    station_group_ids:f.station_group_ids||[],capability_snapshot:f.capability_snapshot,
    load_semantics_snapshot:f.load_semantics_snapshot,resolved_at:f.resolved_at,
    source_equipment_profile_version_id:f.source_equipment_profile_version_id};
}
function createExerciseRelation(f){
  f=f||{};
  requireFields({...f,__type__:"ExerciseRelation"},["from_cluster","to_cluster","factor","sample_confidence"]);
  return {from_cluster:f.from_cluster,to_cluster:f.to_cluster,factor:f.factor,sample_confidence:f.sample_confidence};
}
function createCuratedSubstituteGroup(f){
  f=f||{};
  requireFields({...f,__type__:"CuratedSubstituteGroup"},["id"]);
  return {id:f.id,exercise_ids:f.exercise_ids||[]};
}
function createCuratedVeto(f){
  f=f||{};
  requireFields({...f,__type__:"CuratedVeto"},["from_exercise_id","to_exercise_id","reason"]);
  return {from_exercise_id:f.from_exercise_id,to_exercise_id:f.to_exercise_id,reason:f.reason};
}
/* KORREKTUR (STEP 06): family/subtype/machine_functional_subtype waren in
   STEP01 bewusst offene Strings (siehe Datei-Kopfkommentar) — jetzt gegen
   §29.1/§29.2 geschlossen. SELECTORIZED_MACHINE/PLATE_LOADED_MACHINE
   verlangen laut §29.1 woertlich einen machine_functional_subtype; alle
   anderen Familien duerfen ihn nicht fuehren (kein MACHINE(X)-Anspruch ohne
   diese zwei Familien, sonst wuerde eine nicht gestuetzte Aequivalenz
   suggeriert). */
function createEquipmentDefinitionVersion(f){
  f=f||{};
  requireFields({...f,__type__:"EquipmentDefinitionVersion"},["id","version","canonical_name","family","subtype","status"]);
  if(!isValidEquipmentFamily(f.family))throw new Error("training-domain: ungueltige EquipmentDefinitionVersion.family: "+JSON.stringify(f.family)+" (§29.1)");
  if(!isValidEquipmentSubtype(f.family,f.subtype))throw new Error("training-domain: ungueltiger EquipmentDefinitionVersion.subtype '"+f.subtype+"' fuer family '"+f.family+"' (§29.1)");
  const requiresMachineSubtype=EQUIPMENT_FAMILIES_REQUIRING_MACHINE_FUNCTIONAL_SUBTYPE.indexOf(f.family)!==-1;
  if(requiresMachineSubtype){
    if(f.machine_functional_subtype==null)throw new Error("training-domain: EquipmentDefinitionVersion.family '"+f.family+"' erfordert machine_functional_subtype (§29.1)");
    if(MACHINE_FUNCTIONAL_SUBTYPE_REGISTRY.indexOf(f.machine_functional_subtype)===-1)throw new Error("training-domain: ungueltiger machine_functional_subtype: "+JSON.stringify(f.machine_functional_subtype)+" (§29.2)");
  }else if(f.machine_functional_subtype!=null){
    throw new Error("training-domain: machine_functional_subtype ist nur fuer SELECTORIZED_MACHINE/PLATE_LOADED_MACHINE zulaessig, nicht fuer family '"+f.family+"' (§29.1)");
  }
  return {id:f.id,version:f.version,canonical_name:f.canonical_name,family:f.family,subtype:f.subtype,
    machine_functional_subtype:f.machine_functional_subtype!==undefined?f.machine_functional_subtype:null,
    default_capability_schema:f.default_capability_schema||[],status:f.status};
}
/* KORREKTUR (STEP 06): inventory_state war in STEP01 ein ungeprueftes
   Pflichtfeld — jetzt gegen INVENTORY_STATE (§1.4/§23.2) geschlossen.
   equivalence_group_id bleibt bewusst ein freier, optionaler Identifier
   (kein geschlossenes Registry noetig: §11.8 definiert ihn als kuratierte,
   fallweise vergebene Kennung, kein Enum) — INVARIANT LB-7/Catalog-Lint
   #15 verlangen nur, dass NIE aus family/subtype/machine_functional_subtype
   auf Aequivalenz geschlossen wird (siehe training-equipment.js
   isLoadEquivalentInstance()), nicht dass equivalence_group_id selbst aus
   einer Liste stammt. */
function createEquipmentInstance(f){
  f=f||{};
  requireFields({...f,__type__:"EquipmentInstance"},["id","location_id","equipment_definition_version_id","inventory_state"]);
  validateEnumValue(f.inventory_state,INVENTORY_STATE,"inventory_state");
  return {id:f.id,location_id:f.location_id,equipment_definition_version_id:f.equipment_definition_version_id,
    inventory_state:f.inventory_state,capability_values:f.capability_values||[],
    load_profile_version_id:f.load_profile_version_id!==undefined?f.load_profile_version_id:null,
    manufacturer:f.manufacturer!==undefined?f.manufacturer:null,model_name:f.model_name!==undefined?f.model_name:null,
    equivalence_group_id:f.equivalence_group_id!==undefined?f.equivalence_group_id:null,
    station_group_id:f.station_group_id!==undefined?f.station_group_id:null};
}
function createAttachmentInstance(f){
  f=f||{};
  requireFields({...f,__type__:"AttachmentInstance"},["id","location_id","equipment_definition_version_id","inventory_state"]);
  validateEnumValue(f.inventory_state,INVENTORY_STATE,"inventory_state");
  return {id:f.id,location_id:f.location_id,equipment_definition_version_id:f.equipment_definition_version_id,
    capability_values:f.capability_values||[],inventory_state:f.inventory_state};
}
function createEquipmentProfileVersion(f){
  f=f||{};
  requireFields({...f,__type__:"EquipmentProfileVersion"},["id","location_id","version","created_at"]);
  return {id:f.id,location_id:f.location_id,version:f.version,equipment_instance_ids:f.equipment_instance_ids||[],created_at:f.created_at};
}
/* KORREKTUR (STEP 06): namespace/value waren in STEP01 ungeprueft — jetzt
   gegen §29.3 CAPABILITY_REGISTRY geschlossen. `operator` bleibt bewusst
   ungeprueft (siehe CAPABILITY_REGISTRY-Kommentar oben: kein woertlicher
   Wertevorrat in den fuer dieses Pack verfuegbaren Quellen). */
function createCapabilityPredicate(f){
  f=f||{};
  requireFields({...f,__type__:"CapabilityPredicate"},["namespace","operator","value"]);
  if(!isValidCapabilityNamespace(f.namespace))throw new Error("training-domain: ungueltiger CapabilityPredicate.namespace: "+JSON.stringify(f.namespace)+" (§29.3)");
  if(!isValidCapabilityValue(f.namespace,f.value))throw new Error("training-domain: ungueltiger CapabilityPredicate.value '"+f.value+"' fuer namespace '"+f.namespace+"' (§29.3)");
  return {namespace:f.namespace,operator:f.operator,value:f.value};
}
/* §9.1 — jede numerisch/ordinal progressierbare Equipment-Instanz besitzt
   eine versionierte, explizite Lastsemantik. */
/* KORREKTUR (STEP 06): die 6 Enum-Felder waren in STEP01 ungeprueft (freie
   Strings) — jetzt gegen die woertlichen §9.1-Wertelisten geschlossen. */
function createLoadProfileVersion(f){
  f=f||{};
  requireFields({...f,__type__:"LoadProfileVersion"},["id","equipment_instance_id","version","load_unit","display_semantics","direction","pair_semantics","per_side_semantics","ratio_confidence","effective_load_unknown","microloading_available"]);
  validateEnumValue(f.load_unit,LOAD_UNIT,"load_unit");
  validateEnumValue(f.display_semantics,DISPLAY_SEMANTICS,"display_semantics");
  validateEnumValue(f.direction,LOAD_DIRECTION,"direction");
  validateEnumValue(f.pair_semantics,PAIR_SEMANTICS,"pair_semantics");
  validateEnumValue(f.per_side_semantics,PER_SIDE_SEMANTICS,"per_side_semantics");
  validateEnumValue(f.ratio_confidence,RATIO_CONFIDENCE,"ratio_confidence");
  return {
    id:f.id,equipment_instance_id:f.equipment_instance_id,version:f.version,
    load_unit:f.load_unit,display_semantics:f.display_semantics,direction:f.direction,
    min:f.min!==undefined?f.min:null,max:f.max!==undefined?f.max:null,
    available_steps:f.available_steps!==undefined?f.available_steps:null,
    combination_rule:f.combination_rule!==undefined?f.combination_rule:null,
    base_load:f.base_load!==undefined?f.base_load:null,
    pair_semantics:f.pair_semantics,per_side_semantics:f.per_side_semantics,
    mechanical_ratio:f.mechanical_ratio!==undefined?f.mechanical_ratio:null,
    ratio_confidence:f.ratio_confidence,effective_load_unknown:!!f.effective_load_unknown,
    microloading_available:!!f.microloading_available,
  };
}
function createCatalogMigrationRecord(f){
  f=f||{};
  requireFields({...f,__type__:"CatalogMigrationRecord"},["id","entity_type","from_version","to_version","operation","created_at"]);
  return {id:f.id,entity_type:f.entity_type,from_version:f.from_version,to_version:f.to_version,
    operation:f.operation,deterministic_rule:f.deterministic_rule!==undefined?f.deterministic_rule:null,created_at:f.created_at};
}

/* ================= 23.2 Nutzer, Locations und Profil ================= */
function createUser(f){
  f=f||{};
  requireFields({...f,__type__:"User"},["id","created_at"]);
  return {id:f.id,created_at:f.created_at};
}
/* UserTrainingProfile.bodyweight_kg ist NUR der aktuelle Convenience-Wert,
   NIE die alleinige historische Quelle (Bodyweight-Replay-Contract) — die
   Historie lebt in BodyweightEvent (append-only, siehe unten). */
function createUserTrainingProfile(f){
  f=f||{};
  /* KORREKTUR (Paket 02): preferred_split/uses_rir/rest_preference sind laut
     §1.2 OPTIONAL mit definiertem Default (null/false/STANDARD) — STEP 01
     hatte sie faelschlich als Pflichtfelder in requireFields gelistet, was
     "Default preferred_split = null" technisch unmoeglich gemacht haette.
     Konflikt dokumentiert und gemaess v1.4.1 aufgeloest: nur die 7 in §1.2
     als REQUIRED gefuehrten Felder plus die DERIVED-Snapshot-Felder sind
     hier Pflicht; die drei OPTIONAL-Felder werden unten mit ihrem Default
     belegt, wenn sie fehlen. */
  requireFields({...f,__type__:"UserTrainingProfile"},["user_id","goal","experience_self","training_days_per_week","session_time_budget_min","primary_location_id","bodyweight_kg","experience_level_eligible","experience_level","user_skill_level"]);
  validateEnumValue(f.goal,TRAINING_GOAL,"goal");
  validateEnumValue(f.experience_self,EXPERIENCE_SELF,"experience_self");
  validateEnumValue(f.experience_level_eligible,EXPERIENCE_LEVEL,"experience_level_eligible");
  validateEnumValue(f.experience_level,EXPERIENCE_LEVEL,"experience_level");
  validateNumericRange(f.training_days_per_week,USER_TRAINING_PROFILE_FIELD_BOUNDS.training_days_per_week,"training_days_per_week");
  validateNumericRange(f.session_time_budget_min,USER_TRAINING_PROFILE_FIELD_BOUNDS.session_time_budget_min,"session_time_budget_min");
  validateNumericRange(f.bodyweight_kg,USER_TRAINING_PROFILE_FIELD_BOUNDS.bodyweight_kg,"bodyweight_kg");
  const priorityMuscles=f.priority_muscles||[];
  if(priorityMuscles.length>2)throw new Error("training-domain: priority_muscles erlaubt maximal 2 Eintraege (§4.5), erhalten: "+priorityMuscles.length);
  validateEnumArray(priorityMuscles,CANONICAL_VOLUME_MUSCLE_ID,"priority_muscles");
  const preferredSplit=f.preferred_split!==undefined?f.preferred_split:null;
  if(preferredSplit!==null)validateEnumValue(preferredSplit,PREFERRED_SPLIT,"preferred_split");
  const restPreference=f.rest_preference!==undefined?f.rest_preference:REST_PREFERENCE.STANDARD;
  validateEnumValue(restPreference,REST_PREFERENCE,"rest_preference");
  return {
    user_id:f.user_id,goal:f.goal,experience_self:f.experience_self,
    training_days_per_week:f.training_days_per_week,session_time_budget_min:f.session_time_budget_min,
    primary_location_id:f.primary_location_id,bodyweight_kg:f.bodyweight_kg,
    priority_muscles:priorityMuscles,preferred_split:preferredSplit,
    training_weekdays:f.training_weekdays||[],weekday_location_map:f.weekday_location_map||{},
    uses_rir:!!f.uses_rir,rest_preference:restPreference,
    sex:f.sex!==undefined?f.sex:null,age:f.age!==undefined?f.age:null,
    experience_level_eligible:f.experience_level_eligible,experience_level:f.experience_level,
    user_skill_level:f.user_skill_level,
    rir_reliability_tier_by_exercise:f.rir_reliability_tier_by_exercise||{},
    session_adherence_rate:f.session_adherence_rate!==undefined?f.session_adherence_rate:null,
    actual_session_duration_factor:f.actual_session_duration_factor!==undefined?f.actual_session_duration_factor:null,
  };
}
const BODYWEIGHT_EVENT_SOURCE=Object.freeze({USER_ENTRY:"USER_ENTRY",IMPORT:"IMPORT",CORRECTION:"CORRECTION",OTHER:"OTHER"});
function createBodyweightEvent(f){
  f=f||{};
  requireFields({...f,__type__:"BodyweightEvent"},["event_id","user_id","bodyweight_kg","effective_at","recorded_at","source"]);
  return {event_id:f.event_id,user_id:f.user_id,bodyweight_kg:f.bodyweight_kg,
    effective_at:f.effective_at,recorded_at:f.recorded_at,source:f.source,
    corrects_event_id:f.corrects_event_id!==undefined?f.corrects_event_id:null,
    idempotency_key:f.idempotency_key!==undefined?f.idempotency_key:null};
}
function createTrainingLocation(f){
  f=f||{};
  requireFields({...f,__type__:"TrainingLocation"},["id","user_id","name","type"]);
  validateEnumValue(f.type,TRAINING_LOCATION_TYPE,"type");
  return {id:f.id,user_id:f.user_id,name:f.name,type:f.type,
    current_equipment_profile_version_id:f.current_equipment_profile_version_id!==undefined?f.current_equipment_profile_version_id:null,
    is_default_for_weekdays:f.is_default_for_weekdays||[]};
}
const AVAILABILITY_STATE=Object.freeze({AVAILABLE:"AVAILABLE",TEMPORARILY_UNAVAILABLE:"TEMPORARILY_UNAVAILABLE"});
function createAvailabilityEvent(f){
  f=f||{};
  requireFields({...f,__type__:"AvailabilityEvent"},["id","equipment_instance_id","state","starts_at","reason","recorded_at"]);
  validateEnumValue(f.state,AVAILABILITY_STATE,"state"); // KORREKTUR (STEP 06): war ungeprueft
  return {id:f.id,equipment_instance_id:f.equipment_instance_id,
    session_instance_id:f.session_instance_id!==undefined?f.session_instance_id:null,
    state:f.state,starts_at:f.starts_at,expires_at:f.expires_at!==undefined?f.expires_at:null,
    reason:f.reason,recorded_at:f.recorded_at};
}
const INVENTORY_STATE=Object.freeze({PRESENT:"PRESENT",NOT_PRESENT:"NOT_PRESENT",UNKNOWN:"UNKNOWN"});
function createLocationInventoryEvent(f){
  f=f||{};
  requireFields({...f,__type__:"LocationInventoryEvent"},["id","location_id","from_state","to_state","source","effective_at","recorded_at"]);
  validateEnumValue(f.from_state,INVENTORY_STATE,"from_state"); // KORREKTUR (STEP 06): war ungeprueft
  validateEnumValue(f.to_state,INVENTORY_STATE,"to_state");
  return {id:f.id,location_id:f.location_id,
    equipment_instance_id:f.equipment_instance_id!==undefined?f.equipment_instance_id:null,
    capability_key:f.capability_key!==undefined?f.capability_key:null,
    from_state:f.from_state,to_state:f.to_state,source:f.source,
    effective_at:f.effective_at,recorded_at:f.recorded_at};
}
function createExercisePreference(f){
  f=f||{};
  requireFields({...f,__type__:"ExercisePreference"},["user_id","exercise_id","stage","set_by","reason_code","created_at","decay_score"]);
  return {user_id:f.user_id,exercise_id:f.exercise_id,stage:f.stage,set_by:f.set_by,
    reason_code:f.reason_code,note:f.note!==undefined?f.note:null,created_at:f.created_at,
    expires_at:f.expires_at!==undefined?f.expires_at:null,evidence_events:f.evidence_events||[],
    decay_score:f.decay_score};
}
function createPatternCaution(f){
  f=f||{};
  requireFields({...f,__type__:"PatternCaution"},["user_id","movement_pattern","level","source_reason_code","created_at","review_at"]);
  return {user_id:f.user_id,movement_pattern:f.movement_pattern,level:f.level,
    source_reason_code:f.source_reason_code,created_at:f.created_at,review_at:f.review_at};
}
function createSubstitutionPairScore(f){
  f=f||{};
  requireFields({...f,__type__:"SubstitutionPairScore"},["user_id","from_exercise_id","to_exercise_id","score","updated_at"]);
  return {user_id:f.user_id,from_exercise_id:f.from_exercise_id,to_exercise_id:f.to_exercise_id,
    score:f.score,updated_at:f.updated_at};
}

/* ================= 23.3 Plan, Sessions, Mutations ================= */
const PLAN_ORIGIN=Object.freeze({GENERATED:"GENERATED",USER_COMPOSED:"USER_COMPOSED"});
const CONTROL_AUTHORITY=Object.freeze({AUTOMATIC:"AUTOMATIC",RECOMMENDATION:"RECOMMENDATION",MANUAL:"MANUAL"});
function createPlan(f){
  f=f||{};
  requireFields({...f,__type__:"Plan"},["id","user_id","goal","plan_origin","control_authority_default","status","current_version_id","created_at"]);
  validateEnumValue(f.goal,TRAINING_GOAL,"goal");
  return {id:f.id,user_id:f.user_id,goal:f.goal,plan_origin:f.plan_origin,
    control_authority_default:f.control_authority_default,status:f.status,flags:f.flags||[],
    current_version_id:f.current_version_id,created_at:f.created_at};
}
function createPlanBlock(f){
  f=f||{};
  requireFields({...f,__type__:"PlanBlock"},["id","plan_id","block_index","split_type","start_date","planned_weeks","status"]);
  return {id:f.id,plan_id:f.plan_id,block_index:f.block_index,split_type:f.split_type,
    start_date:f.start_date,planned_weeks:f.planned_weeks,status:f.status,
    predecessor_block_id:f.predecessor_block_id!==undefined?f.predecessor_block_id:null};
}
function createPlanVersion(f){
  f=f||{};
  requireFields({...f,__type__:"PlanVersion"},["id","plan_id","block_id","version_number","actor","change_type","change_summary","created_at"]);
  return {id:f.id,plan_id:f.plan_id,block_id:f.block_id,version_number:f.version_number,
    actor:f.actor,change_type:f.change_type,change_summary:f.change_summary,
    parent_version_id:f.parent_version_id!==undefined?f.parent_version_id:null,created_at:f.created_at};
}
function createSessionTemplate(f){
  f=f||{};
  requireFields({...f,__type__:"Session"},["id","plan_version_id","day_index","session_type","default_location_id","estimated_duration_s"]);
  return {id:f.id,plan_version_id:f.plan_version_id,day_index:f.day_index,session_type:f.session_type,
    default_location_id:f.default_location_id,estimated_duration_s:f.estimated_duration_s,
    estimated_duration_range:f.estimated_duration_range!==undefined?f.estimated_duration_range:null};
}
const SESSION_INSTANCE_STATUS=Object.freeze({
  SCHEDULED:"SCHEDULED",STARTED:"STARTED",COMPLETED:"COMPLETED",SKIPPED:"SKIPPED",
  CANCELLED:"CANCELLED",BLOCKED:"BLOCKED",ABORTED:"ABORTED",
});
function createSessionInstance(f){
  f=f||{};
  requireFields({...f,__type__:"SessionInstance"},["id","plan_id","plan_version_id","session_id","scheduled_for","original_scheduled_for","effective_location_id","status"]);
  return {id:f.id,plan_id:f.plan_id,plan_version_id:f.plan_version_id,session_id:f.session_id,
    scheduled_for:f.scheduled_for,original_scheduled_for:f.original_scheduled_for,
    effective_location_id:f.effective_location_id,status:f.status,
    started_at:f.started_at!==undefined?f.started_at:null,ended_at:f.ended_at!==undefined?f.ended_at:null,
    moved_at:f.moved_at!==undefined?f.moved_at:null,block_reason:f.block_reason!==undefined?f.block_reason:null,
    slot_execution_ids:f.slot_execution_ids||[]};
}
const SLOT_EXECUTION_MODE=Object.freeze({WORKING:"WORKING",CALIBRATION_ONLY:"CALIBRATION_ONLY",SKIPPED:"SKIPPED",ABORTED:"ABORTED"});
function createSlotExecution(f){
  f=f||{};
  requireFields({...f,__type__:"SlotExecution"},["id","session_instance_id","plan_slot_id","mode","exercise_id","effective_prescription_snapshot","authority_mode_at_start"]);
  return {id:f.id,session_instance_id:f.session_instance_id,plan_slot_id:f.plan_slot_id,
    mode:f.mode,exercise_id:f.exercise_id,
    resolved_setup_binding_id:f.resolved_setup_binding_id!==undefined?f.resolved_setup_binding_id:null,
    engine_recommendation_snapshot:f.engine_recommendation_snapshot!==undefined?f.engine_recommendation_snapshot:null,
    effective_prescription_snapshot:f.effective_prescription_snapshot,
    authority_mode_at_start:f.authority_mode_at_start,
    started_at:f.started_at!==undefined?f.started_at:null,ended_at:f.ended_at!==undefined?f.ended_at:null,
    flags:f.flags||[]};
}
const SLOT_ROLE=Object.freeze({PRIMARY:"PRIMARY",SECONDARY:"SECONDARY",ISOLATION:"ISOLATION",ACCESSORY:"ACCESSORY"});
const REP_CHARACTER=Object.freeze({HEAVY:"HEAVY",MODERATE:"MODERATE",LIGHT:"LIGHT"});
const REQUIRED_PROGRESSIBILITY=Object.freeze({HIGH:"HIGH",MEDIUM:"MEDIUM",LOW:"LOW"});
/* KORREKTUR (Paket 03, §5.3-Dependency-Exzerpt wortgetreu): PlanSlot.
   slot_function.primary_muscle_bands[] ist laut Master-Spec "canonical_
   volume_muscle_id + contribution band" — also eine Liste von {canonical_
   volume_muscle_id, contribution_band}-Paaren, NICHT eine Liste blosser
   Muskel-ID-Strings. STEP 01 hatte dieses Feld (mangels des zu diesem
   Zeitpunkt noch nicht vorliegenden §5.3-Exzerpts) faelschlich nur als
   Array reiner CANONICAL_VOLUME_MUSCLE_ID-Werte validiert. Konflikt
   dokumentiert und gemaess v1.4.1 aufgeloest: jeder Eintrag ist jetzt ein
   validiertes {canonical_volume_muscle_id, contribution_band}-Objekt.
   Dieser Fix ist fuer STEP 03 zwingend, weil INVARIANT S-3 (Same-Day-
   Overlap) genau diese contribution_band-Information braucht (identischer
   PRIMARY_HIGH-Volume-Muskel). */
/* Pack 05 (§29.13 INVARIANT CAT-C1): innerhalb EINER Liste darf dieselbe
   canonical_volume_muscle_id nicht mehrfach vorkommen (die vollstaendige
   Cross-Check ueber primary_muscle_bands+secondary_muscle_bands HINWEG ist
   Aufgabe von training-exercise-catalog.js/validateCatalogLints — diese
   Funktion sieht die beiden Listen hier nicht gleichzeitig). */
function validateMuscleContributionBands(bands,fieldLabel){
  const seen=new Set();
  (bands||[]).forEach(b=>{
    if(!b||typeof b!=="object")throw new Error("training-domain: "+fieldLabel+"-Eintrag muss ein Objekt {canonical_volume_muscle_id, contribution_band} sein, erhalten: "+JSON.stringify(b));
    validateEnumValue(b.canonical_volume_muscle_id,CANONICAL_VOLUME_MUSCLE_ID,fieldLabel+".canonical_volume_muscle_id");
    validateEnumValue(b.contribution_band,MUSCLE_CONTRIBUTION_BAND,fieldLabel+".contribution_band");
    if(seen.has(b.canonical_volume_muscle_id))throw new Error("training-domain: "+fieldLabel+" enthaelt "+b.canonical_volume_muscle_id+" mehrfach (INVARIANT CAT-C1)");
    seen.add(b.canonical_volume_muscle_id);
  });
}
function createSlotFunction(f){
  f=f||{};
  requireFields({...f,__type__:"SlotFunction"},["movement_pattern","role","rep_character"]);
  validateEnumValue(f.movement_pattern,MOVEMENT_PATTERN_ID,"movement_pattern");
  if(f.movement_subpattern!=null)validateEnumValue(f.movement_subpattern,MOVEMENT_SUBPATTERN_ID,"movement_subpattern");
  validateMuscleContributionBands(f.primary_muscle_bands,"primary_muscle_bands");
  return {movement_pattern:f.movement_pattern,
    movement_subpattern:f.movement_subpattern!==undefined?f.movement_subpattern:null,
    primary_muscle_bands:f.primary_muscle_bands||[],role:f.role,rep_character:f.rep_character};
}
function createSubstitutionHistoryEntry(f){
  f=f||{};
  requireFields({...f,__type__:"SubstitutionHistoryEntry"},["from","to","reason","scope","ts","actor"]);
  return {from:f.from,to:f.to,reason:f.reason,scope:f.scope,ts:f.ts,actor:f.actor};
}
/* PlanSlot.slot_function und original_exercise_id sind laut Dependency
   §5.5 (INVARIANT SL-2) nach Slot-Generierung UNVERAENDERLICH — diese
   Foundation erzwingt das (noch) nicht technisch (das ist Aufgabe der
   spaeteren Slot-/Substitution-Engine), bildet die Felder aber bereits
   klar getrennt von "exercise_id" (der aktuell aktiven Uebung) ab. */
function createPlanSlot(f){
  f=f||{};
  requireFields({...f,__type__:"PlanSlot"},["id","plan_version_id","session_id","order_index","slot_function","priority_value","required_progressibility","fatigue_budget","exercise_id","original_exercise_id","resolved_setup_binding_id","prescription_id","calibration_state"]);
  validateEnumArray(Object.keys(f.volume_contribution||{}),CANONICAL_VOLUME_MUSCLE_ID,"volume_contribution");
  return {id:f.id,plan_version_id:f.plan_version_id,session_id:f.session_id,order_index:f.order_index,
    slot_function:f.slot_function,volume_contribution:f.volume_contribution||{},
    priority_value:f.priority_value,required_progressibility:f.required_progressibility,fatigue_budget:f.fatigue_budget,
    equipment_constraints:f.equipment_constraints!==undefined?f.equipment_constraints:null,
    exercise_id:f.exercise_id,original_exercise_id:f.original_exercise_id,
    resolved_setup_binding_id:f.resolved_setup_binding_id,prescription_id:f.prescription_id,
    calibration_state:f.calibration_state,
    control_authority_override:f.control_authority_override!==undefined?f.control_authority_override:null,
    flags:f.flags||[],substitution_history:f.substitution_history||[]};
}
function createPrescription(f){
  f=f||{};
  requireFields({...f,__type__:"Prescription"},["id","sets","rep_min","rep_max","rir_target","rir_accept_low","rir_accept_high","rest_s","progression_model","warmup_protocol_class"]);
  return {id:f.id,sets:f.sets,rep_min:f.rep_min,rep_max:f.rep_max,rir_target:f.rir_target,
    rir_accept_low:f.rir_accept_low,rir_accept_high:f.rir_accept_high,rest_s:f.rest_s,
    progression_model:f.progression_model,warmup_protocol_class:f.warmup_protocol_class,
    load_recommendation_id:f.load_recommendation_id!==undefined?f.load_recommendation_id:null};
}
function createSessionOverride(f){
  f=f||{};
  requireFields({...f,__type__:"SessionOverride"},["session_instance_id","slot_id"]);
  return {session_instance_id:f.session_instance_id,slot_id:f.slot_id,
    exercise_id:f.exercise_id!==undefined?f.exercise_id:null,
    resolved_setup_binding_id:f.resolved_setup_binding_id!==undefined?f.resolved_setup_binding_id:null,
    prescription_delta:f.prescription_delta!==undefined?f.prescription_delta:null,
    expires_after_session:true};
}
function createTimeBudgetOverride(f){
  f=f||{};
  requireFields({...f,__type__:"TimeBudgetOverride"},["id","scope","scope_id","max_duration_min","accepted_at"]);
  return {id:f.id,scope:f.scope,scope_id:f.scope_id,max_duration_min:f.max_duration_min,
    accepted_at:f.accepted_at,expires_at:f.expires_at!==undefined?f.expires_at:null};
}
function createTimeModelConfig(f){
  f=f||{};
  requireFields({...f,__type__:"TimeModelConfig"},["version","tempo_default_s_per_rep","transition_same_station_s","transition_station_change_s","reserve_fraction"]);
  return {version:f.version,tempo_default_s_per_rep:f.tempo_default_s_per_rep,
    setup_time_s:f.setup_time_s||{},unilateral_time_factor:f.unilateral_time_factor||{},
    transition_same_station_s:f.transition_same_station_s,transition_station_change_s:f.transition_station_change_s,
    capacity_planning_by_goal:f.capacity_planning_by_goal||{},reserve_fraction:f.reserve_fraction};
}
function createPerformanceInterpretationConfig(f){
  f=f||{};
  requireFields({...f,__type__:"PerformanceInterpretationConfig"},["version","rest_shortfall_warning_count","rest_shortfall_lookback_exposures","rest_shortfall_ratio"]);
  return {version:f.version,rest_shortfall_warning_count:f.rest_shortfall_warning_count,
    rest_shortfall_lookback_exposures:f.rest_shortfall_lookback_exposures,rest_shortfall_ratio:f.rest_shortfall_ratio};
}
const DELOAD_PROPOSAL_STATUS=Object.freeze({PROPOSED:"PROPOSED",ACCEPTED:"ACCEPTED",REJECTED:"REJECTED",EXPIRED:"EXPIRED"});
function createDeloadProposal(f){
  f=f||{};
  requireFields({...f,__type__:"DeloadProposal"},["id","plan_id","status","proposed_at"]);
  return {id:f.id,plan_id:f.plan_id,status:f.status,proposed_at:f.proposed_at,
    resolved_at:f.resolved_at!==undefined?f.resolved_at:null,
    suppression_until:f.suppression_until!==undefined?f.suppression_until:null};
}
function createDeloadOverlay(f){
  f=f||{};
  requireFields({...f,__type__:"DeloadOverlay"},["plan_id","start_date","end_date","set_factor","load_factor","rir_delta","accepted_at","pre_deload_progression_snapshot","resume_hold_required"]);
  return {plan_id:f.plan_id,start_date:f.start_date,end_date:f.end_date,set_factor:f.set_factor,
    load_factor:f.load_factor,rir_delta:f.rir_delta,accepted_at:f.accepted_at,
    pre_deload_progression_snapshot:f.pre_deload_progression_snapshot,resume_hold_required:!!f.resume_hold_required};
}
function createValidationAcknowledgment(f){
  f=f||{};
  requireFields({...f,__type__:"ValidationAcknowledgment"},["user_id","plan_id","check_id","scope_key","acknowledged_until"]);
  return {user_id:f.user_id,plan_id:f.plan_id,check_id:f.check_id,scope_key:f.scope_key,acknowledged_until:f.acknowledged_until};
}
/* §21.6: "Gleicher Key + gleicher Payload liefert das bereits gespeicherte
   Ergebnis. Gleicher Key + anderer Payload ist IDEMPOTENCY_CONFLICT."
   Reine Vergleichsfunktion — das eigentliche "Candidate bauen -> P0-P2 ->
   ... -> atomic commit" (§21.6 Commit-Regel) ist Mutation-Processing-
   Engine-Logik eines spaeteren Packs und wird hier NICHT vorgezogen. */
function checkMutationIdempotency(existingCommands,command){
  const existing=(existingCommands||[]).find(c=>c.idempotency_key===command.idempotency_key);
  if(!existing)return {outcome:"NEW"};
  return {outcome:existing.payload_hash===command.payload_hash?"DUPLICATE":"IDEMPOTENCY_CONFLICT",existing};
}
function createMutationCommand(f){
  f=f||{};
  requireFields({...f,__type__:"MutationCommand"},["command_id","idempotency_key","actor","evaluation_context","payload_hash","created_at"]);
  return {command_id:f.command_id,idempotency_key:f.idempotency_key,actor:f.actor,
    expected_plan_version_id:f.expected_plan_version_id!==undefined?f.expected_plan_version_id:null,
    evaluation_context:f.evaluation_context,payload_hash:f.payload_hash,created_at:f.created_at};
}
const MUTATION_RESULT_STATUS=Object.freeze({COMMITTED:"COMMITTED",NEEDS_USER_DECISION:"NEEDS_USER_DECISION",REJECTED:"REJECTED",STALE_VERSION:"STALE_VERSION"});
function createMutationResult(f){
  f=f||{};
  requireFields({...f,__type__:"MutationResult"},["command_id","status"]);
  return {command_id:f.command_id,status:f.status,
    resulting_plan_version_id:f.resulting_plan_version_id!==undefined?f.resulting_plan_version_id:null,
    failure_results:f.failure_results||[]};
}

/* ================= 23.4 Leistung, Logging, Korrekturen, Kalibrierung ================= */
const WORKOUT_METRIC_TYPE=Object.freeze({REPS:"REPS",DURATION:"DURATION",DISTANCE:"DISTANCE"});
const WORKOUT_SESSION_STATUS=Object.freeze({COMPLETE:"COMPLETE",PARTIAL:"PARTIAL",ABORTED:"ABORTED"});
function createIntraSessionAdjustment(f){
  f=f||{};
  requireFields({...f,__type__:"IntraSessionAdjustment"},["direction","steps","reason"]);
  return {direction:f.direction,steps:f.steps,reason:f.reason};
}
function createWorkoutSetEntry(f){
  f=f||{};
  requireFields({...f,__type__:"WorkoutSetEntry"},["index","metric_type","is_warmup","is_calibration_set"]);
  return {
    index:f.index,metric_type:f.metric_type,
    weight:f.weight!==undefined?f.weight:null,reps:f.reps!==undefined?f.reps:null,
    duration_s:f.duration_s!==undefined?f.duration_s:null,distance_m:f.distance_m!==undefined?f.distance_m:null,
    rir_reported:f.rir_reported!==undefined?f.rir_reported:null,effort_band:f.effort_band!==undefined?f.effort_band:null,
    rir_effective:f.rir_effective!==undefined?f.rir_effective:null,sigma:f.sigma!==undefined?f.sigma:null,
    n_total:f.n_total!==undefined?f.n_total:null,zone:f.zone!==undefined?f.zone:null,
    is_warmup:!!f.is_warmup,is_calibration_set:!!f.is_calibration_set,
    rep_cap:f.rep_cap!==undefined?f.rep_cap:null,rep_floor:f.rep_floor!==undefined?f.rep_floor:null,
    cap_hit:f.cap_hit!==undefined?f.cap_hit:null,floor_violated:f.floor_violated!==undefined?f.floor_violated:null,
    technique_valid:f.technique_valid!==undefined?f.technique_valid:null,
    aborted:f.aborted!==undefined?f.aborted:null,
    intra_session_adjustment:f.intra_session_adjustment!==undefined?f.intra_session_adjustment:null,
  };
}
/* WorkoutLog ist append-only/immutable (23.4). Diese Fabrik markiert
   immutable:true fest verdrahtet — es gibt keinen Parameter, der das
   uebersteuern kann. */
function createWorkoutLog(f){
  f=f||{};
  requireFields({...f,__type__:"WorkoutLog"},["id","user_id","plan_id","plan_version_id","session_id","session_instance_id","slot_execution_id","slot_id","exercise_id","exercise_definition_version","resolved_setup_binding_snapshot","prescription_snapshot","authority_mode_at_execution","performed_at","recorded_at","session_status"]);
  return {
    id:f.id,user_id:f.user_id,plan_id:f.plan_id,plan_version_id:f.plan_version_id,
    session_id:f.session_id,session_instance_id:f.session_instance_id,
    slot_execution_id:f.slot_execution_id,slot_id:f.slot_id,
    exercise_id:f.exercise_id,exercise_definition_version:f.exercise_definition_version,
    setup_variant_id:f.setup_variant_id!==undefined?f.setup_variant_id:null,
    resolved_setup_binding_snapshot:f.resolved_setup_binding_snapshot,
    equipment_instance_id:f.equipment_instance_id!==undefined?f.equipment_instance_id:null,
    equipment_definition_version:f.equipment_definition_version!==undefined?f.equipment_definition_version:null,
    load_profile_version:f.load_profile_version!==undefined?f.load_profile_version:null,
    load_semantics_snapshot:f.load_semantics_snapshot!==undefined?f.load_semantics_snapshot:null,
    engine_recommendation_snapshot:f.engine_recommendation_snapshot!==undefined?f.engine_recommendation_snapshot:null,
    prescription_snapshot:f.prescription_snapshot,
    authority_mode_at_execution:f.authority_mode_at_execution,
    bodyweight_kg_at_execution:f.bodyweight_kg_at_execution!==undefined?f.bodyweight_kg_at_execution:null,
    performed_at:f.performed_at,recorded_at:f.recorded_at,
    sets:f.sets||[],session_status:f.session_status,flags:f.flags||[],
    immutable:true,
  };
}
const WORKOUT_LOG_CORRECTION_OPERATION=Object.freeze({PATCH_FIELD:"PATCH_FIELD",DELETE_SET:"DELETE_SET",INSERT_SET:"INSERT_SET",VOID_AND_REPLACE:"VOID_AND_REPLACE"});
function createWorkoutLogCorrection(f){
  f=f||{};
  requireFields({...f,__type__:"WorkoutLogCorrection"},["id","workout_log_id","operation","effective_at","recorded_at","reason","actor","idempotency_key"]);
  return {id:f.id,workout_log_id:f.workout_log_id,operation:f.operation,
    path:f.path!==undefined?f.path:null,old_value_hash:f.old_value_hash!==undefined?f.old_value_hash:null,
    new_value:f.new_value!==undefined?f.new_value:null,
    replacement_workout_log_id:f.replacement_workout_log_id!==undefined?f.replacement_workout_log_id:null,
    effective_at:f.effective_at,recorded_at:f.recorded_at,reason:f.reason,actor:f.actor,
    idempotency_key:f.idempotency_key};
}
/* Deterministische Projektion Basislog + geordnete Corrections (23.4).
   Die Quelle definiert exakt vier Operationstypen und WOFUER sie genutzt
   werden ("PATCH_FIELD" fuer reps/RIR/weight/time-Korrekturen,
   "DELETE_SET" fuer versehentlich geloggte Saetze, "INSERT_SET" fuer
   nachtraeglich erfasste Saetze, "VOID_AND_REPLACE" fuer identitaets-
   kritische Aenderungen) — aber KEINE konkrete Adressierungssyntax fuer
   "path"/"new_value" bei DELETE_SET/INSERT_SET (kein normierter
   Set-Index, kein normiertes Set-Objekt-Schema). Diese Foundation
   erfindet dafuer bewusst KEINE eigene fachliche Semantik:
   - PATCH_FIELD wird angewendet (generischer, punktgetrennter
     Feld-Pfad-Setter — reine Technik, keine fachliche Zusatzannahme
     ueber die bereits explizit benannten Zielfelder hinaus).
   - VOID_AND_REPLACE wird angewendet (Wirkung ist explizit normiert:
     "voided"/"contributes_zero"/replacement_workout_log_id).
   - DELETE_SET/INSERT_SET werden NICHT auf sets[] angewendet, sondern
     unangewendet, aber in kanonischer Reihenfolge sichtbar unter
     "unresolved_set_corrections" durchgereicht. Ein spaeteres Pack, das
     die konkrete Adressierungssemantik normativ festlegt (oder eine
     ausdrueckliche Spezifikation dafuer liefert), wertet sie aus.
   Der Basislog selbst wird NIE mutiert (deep clone). */
function applyPatchFieldPath(target,path,value){
  const parts=String(path).split(".");
  let node=target;
  for(let i=0;i<parts.length-1;i++){
    if(node[parts[i]]===undefined)node[parts[i]]={};
    node=node[parts[i]];
  }
  node[parts[parts.length-1]]=value;
}
function projectEffectiveWorkoutLog(baseLog,corrections){
  if(!baseLog)return null;
  const relevant=(corrections||[]).filter(c=>c.workout_log_id===baseLog.id);
  const ordered=sortByCanonicalEventOrder(relevant.map(c=>({...c,event_id:c.id})));
  let voided=false,replacementId=null;
  const working=JSON.parse(JSON.stringify(baseLog));
  const unresolvedSetCorrections=[];
  for(const c of ordered){
    if(c.operation===WORKOUT_LOG_CORRECTION_OPERATION.VOID_AND_REPLACE){
      voided=true;replacementId=c.replacement_workout_log_id||null;continue;
    }
    if(voided)continue;
    if(c.operation===WORKOUT_LOG_CORRECTION_OPERATION.PATCH_FIELD){
      applyPatchFieldPath(working,c.path,c.new_value);
    }else if(c.operation===WORKOUT_LOG_CORRECTION_OPERATION.DELETE_SET||c.operation===WORKOUT_LOG_CORRECTION_OPERATION.INSERT_SET){
      unresolvedSetCorrections.push(c);
    }
  }
  return {...working,voided,replacement_workout_log_id:replacementId,contributes_zero:voided,unresolved_set_corrections:unresolvedSetCorrections};
}
/* Bodyweight-Replay-Contract (23.4): fuer eine Exposure gilt der Event mit
   maximalem effective_at <= performed_at; bei Gleichstand kanonische
   Reihenfolge aus 0.3. corrects_event_id ist reine Audit-/Traceability-
   Information — die Aufloesung selbst braucht keine Sonderbehandlung
   dafuer, weil ein Correction-Event durch sein EIGENES effective_at
   automatisch fuer alle spaeteren Exposures gewinnt (INVARIANT BW-R1). */
function resolveBodyweightAtPerformedAt(bodyweightEvents,performedAt){
  const performedMs=toComparableTime(performedAt);
  const eligible=(bodyweightEvents||[]).filter(e=>toComparableTime(e.effective_at)<=performedMs);
  if(!eligible.length)return null;
  const sorted=sortByCanonicalEventOrder(eligible.map(e=>({...e,event_id:e.event_id})));
  return sorted[sorted.length-1];
}
/* NON_REP contract: die vier NON_REP-Records bleiben auto_selectable=false
   (Katalogfeld, siehe ExerciseDefinitionVersion) — diese Funktion
   verhindert, dass ein NON_REP-Log rep-basierte Ableitungen anstoesst
   (INVARIANT NR-1). Reine Guard-Funktion, keine Entscheidungslogik. */
function isNonRepWorkoutLog(workoutLog){
  return (workoutLog.sets||[]).every(s=>s.metric_type===WORKOUT_METRIC_TYPE.DURATION||s.metric_type===WORKOUT_METRIC_TYPE.DISTANCE);
}

function createExercisePerformanceProfile(f){
  f=f||{};
  requireFields({...f,__type__:"ExercisePerformanceProfile"},["user_id","exercise_id","performance_index","pi_measured_n_total","k_current","k_source","k_prior_reference_load","form_error_ewma","sessions_since_k_adjust","confidence","last_session_at","session_count","ramp_pattern","trend"]);
  return {user_id:f.user_id,exercise_id:f.exercise_id,
    equipment_instance_id:f.equipment_instance_id!==undefined?f.equipment_instance_id:null,
    performance_index:f.performance_index,pi_measured_n_total:f.pi_measured_n_total,
    k_current:f.k_current,k_source:f.k_source,k_prior_reference_load:f.k_prior_reference_load,
    curve_consistency_J:f.curve_consistency_J!==undefined?f.curve_consistency_J:null,
    form_error_ewma:f.form_error_ewma,sessions_since_k_adjust:f.sessions_since_k_adjust,
    confidence:f.confidence,last_session_at:f.last_session_at,session_count:f.session_count,
    ramp_pattern:f.ramp_pattern,flags:f.flags||[],trend:f.trend};
}
function createCalibrationPoint(f){
  f=f||{};
  requireFields({...f,__type__:"CalibrationPoint"},["id","user_id","exercise_id","source","weight","reps","rir_effective","sigma","n_total","zone","weight_epoch","outlier_factor","excluded_from_curve_fit","created_at"]);
  return {id:f.id,user_id:f.user_id,exercise_id:f.exercise_id,
    equipment_instance_id:f.equipment_instance_id!==undefined?f.equipment_instance_id:null,
    source:f.source,weight:f.weight,reps:f.reps,
    rir_reported:f.rir_reported!==undefined?f.rir_reported:null,effort_band:f.effort_band!==undefined?f.effort_band:null,
    rir_effective:f.rir_effective,sigma:f.sigma,n_total:f.n_total,zone:f.zone,
    weight_epoch:f.weight_epoch,outlier_factor:f.outlier_factor,excluded_from_curve_fit:!!f.excluded_from_curve_fit,
    flags:f.flags||[],created_at:f.created_at};
}
function createLoadRecommendation(f){
  f=f||{};
  requireFields({...f,__type__:"LoadRecommendation"},["slot_id","exercise_id","session_instance_id","weight_lo","weight_hi","weight_selected","n_ziel_primaer","n_ziel_sekundaer","k_used","pi_used","confidence","tier","jump_regime","jump_limited","requires_calibration_set","range_displayed"]);
  return {slot_id:f.slot_id,exercise_id:f.exercise_id,session_instance_id:f.session_instance_id,
    weight_lo:f.weight_lo,weight_hi:f.weight_hi,weight_selected:f.weight_selected,
    n_ziel_primaer:f.n_ziel_primaer,n_ziel_sekundaer:f.n_ziel_sekundaer,
    k_used:f.k_used,pi_used:f.pi_used,confidence:f.confidence,tier:f.tier,
    jump_regime:f.jump_regime,jump_limited:!!f.jump_limited,
    jump_limit_applied:f.jump_limit_applied!==undefined?f.jump_limit_applied:null,
    derived_from_exercise_id:f.derived_from_exercise_id!==undefined?f.derived_from_exercise_id:null,
    relation_factor_used:f.relation_factor_used!==undefined?f.relation_factor_used:null,
    requires_calibration_set:!!f.requires_calibration_set,
    rep_cap:f.rep_cap!==undefined?f.rep_cap:null,rep_floor:f.rep_floor!==undefined?f.rep_floor:null,
    range_displayed:f.range_displayed};
}
const PROGRESSION_MODEL=Object.freeze({TARGET_PROGRESSION:"TARGET_PROGRESSION",REP_ONLY_TARGET_PROGRESSION:"REP_ONLY_TARGET_PROGRESSION"});
const PROGRESSION_PHASE=Object.freeze({
  CALIBRATING:"CALIBRATING",BUILDING:"BUILDING",READY_TO_INCREASE:"READY_TO_INCREASE",
  FATIGUE_HOLD:"FATIGUE_HOLD",LOCAL_WATCH:"LOCAL_WATCH",LOCAL_STALL:"LOCAL_STALL",
  PROGRESSION_LIMITED:"PROGRESSION_LIMITED",DETRAINING:"DETRAINING",
});
/* ProgressionState ist an (user, exercise, equipment_instance) gebunden,
   NICHT an den Slot (23-Abschluss-DECISION). Ein zusaetzliches
   "local_watch"-Boolean wird bewusst NICHT persistiert; phase=LOCAL_WATCH
   ist die einzige Zustandswahrheit — diese Fabrik bietet dafuer keinen
   Parameter an. */
function createProgressionState(f){
  f=f||{};
  requireFields({...f,__type__:"ProgressionState"},["user_id","exercise_id","model","phase","current_load","prescription_band_snapshot","target_total_reps","frontier_load_step_index","frontier_target_total_reps","miss_streak","hard_failure_streak","local_stall_count","rep_bridge_active","readiness_overlay_active","predictive_confidence","effort_accuracy_tier","last_evaluated_session_id"]);
  return {user_id:f.user_id,exercise_id:f.exercise_id,
    equipment_instance_id:f.equipment_instance_id!==undefined?f.equipment_instance_id:null,
    model:f.model,phase:f.phase,current_load:f.current_load,
    prescription_band_snapshot:f.prescription_band_snapshot,target_total_reps:f.target_total_reps,
    frontier_load_step_index:f.frontier_load_step_index,frontier_target_total_reps:f.frontier_target_total_reps,
    miss_streak:f.miss_streak,hard_failure_streak:f.hard_failure_streak,local_stall_count:f.local_stall_count,
    last_reset_session_id:f.last_reset_session_id!==undefined?f.last_reset_session_id:null,
    rep_bridge_active:!!f.rep_bridge_active,bridge_rep_max:f.bridge_rep_max!==undefined?f.bridge_rep_max:null,
    readiness_overlay_active:!!f.readiness_overlay_active,
    predictive_confidence:f.predictive_confidence,effort_accuracy_tier:f.effort_accuracy_tier,
    last_evaluated_session_id:f.last_evaluated_session_id};
}
const DAILY_TARGET_APPLICATION_STATUS=Object.freeze({APPLIED:"APPLIED",AWAITING_USER:"AWAITING_USER",SHADOW_ONLY:"SHADOW_ONLY"});
function createDailyTarget(f){
  f=f||{};
  requireFields({...f,__type__:"DailyTarget"},["exercise_id","slot_id","session_instance_id","load","target_total_reps","hard_set_floor","rep_max_effective","rir_target","rir_accept_low","rir_accept_high","predictive_confidence","effort_accuracy_tier","config_version","source_event_revision","authority_mode","application_status","generated_at"]);
  return {exercise_id:f.exercise_id,slot_id:f.slot_id,session_instance_id:f.session_instance_id,
    load:f.load,target_total_reps:f.target_total_reps,suggested_set_vector:f.suggested_set_vector||[],
    hard_set_floor:f.hard_set_floor,rep_max_effective:f.rep_max_effective,
    rir_target:f.rir_target,rir_accept_low:f.rir_accept_low,rir_accept_high:f.rir_accept_high,
    predictive_confidence:f.predictive_confidence,effort_accuracy_tier:f.effort_accuracy_tier,
    config_version:f.config_version,source_event_revision:f.source_event_revision,
    authority_mode:f.authority_mode,application_status:f.application_status,
    next_step_preview:f.next_step_preview!==undefined?f.next_step_preview:null,generated_at:f.generated_at};
}
function createRepDecayProfile(f){
  f=f||{};
  requireFields({...f,__type__:"RepDecayProfile"},["user_id","exercise_id","rep_band_class","comparable_session_count"]);
  return {user_id:f.user_id,exercise_id:f.exercise_id,
    equipment_instance_id:f.equipment_instance_id!==undefined?f.equipment_instance_id:null,
    rep_band_class:f.rep_band_class,comparable_session_count:f.comparable_session_count,
    median_decay_vector:f.median_decay_vector!==undefined?f.median_decay_vector:null,
    mad_decay_vector:f.mad_decay_vector!==undefined?f.mad_decay_vector:null};
}
function createExerciseRoundingDebt(f){
  f=f||{};
  requireFields({...f,__type__:"ExerciseRoundingDebt"},["user_id","exercise_id","debt"]);
  return {user_id:f.user_id,exercise_id:f.exercise_id,
    equipment_instance_id:f.equipment_instance_id!==undefined?f.equipment_instance_id:null,debt:f.debt};
}
function createRirCalibrationEvent(f){
  f=f||{};
  requireFields({...f,__type__:"RirCalibrationEvent"},["id","user_id","exercise_id","reported_rir","actual_extra_reps","error","performed_at","recorded_at","source_event_revision"]);
  return {id:f.id,user_id:f.user_id,exercise_id:f.exercise_id,reported_rir:f.reported_rir,
    actual_extra_reps:f.actual_extra_reps,error:f.error,performed_at:f.performed_at,
    recorded_at:f.recorded_at,source_event_revision:f.source_event_revision};
}
function createVolumeSnapshot(f){
  f=f||{};
  requireFields({...f,__type__:"VolumeSnapshot"},["user_id","week_start","canonical_volume_muscle_id","fractional_sets","direct_share","corridor_min","corridor_max","status"]);
  validateEnumValue(f.canonical_volume_muscle_id,CANONICAL_VOLUME_MUSCLE_ID,"canonical_volume_muscle_id");
  validateEnumValue(f.status,VOLUME_TOLERANCE_STATUS,"status");
  return {user_id:f.user_id,week_start:f.week_start,canonical_volume_muscle_id:f.canonical_volume_muscle_id,
    fractional_sets:f.fractional_sets,direct_share:f.direct_share,
    volume_floor:f.volume_floor!==undefined?f.volume_floor:null,
    corridor_min:f.corridor_min,corridor_max:f.corridor_max,status:f.status,
    /* upper_bound + config_version: Pack 04 (§4.1 Config-Versionierung,
       §4.4 Obergrenzen-Schwellen) — nachtraeglich ergaenzte optionale
       Felder, analog der STEP-03-Korrektur an createSlotFunction. Ein
       fehlender Wert bleibt null statt einer erfundenen Zahl. */
    upper_bound:f.upper_bound!==undefined?f.upper_bound:null,
    config_version:f.config_version!==undefined?f.config_version:null,
    volume_deficit:f.volume_deficit!==undefined?f.volume_deficit:null};
}
function createVolumeDeficit(f){
  f=f||{};
  requireFields({...f,__type__:"VolumeDeficit"},["muscle_id","planned_credit","standard_min","volume_floor","deficit_to_floor","limiting_constraint","generated_at"]);
  validateEnumValue(f.muscle_id,CANONICAL_VOLUME_MUSCLE_ID,"muscle_id");
  validateEnumValue(f.limiting_constraint,LIMITING_CONSTRAINT,"limiting_constraint");
  return {muscle_id:f.muscle_id,planned_credit:f.planned_credit,standard_min:f.standard_min,
    volume_floor:f.volume_floor,deficit_to_floor:f.deficit_to_floor,
    limiting_constraint:f.limiting_constraint,generated_at:f.generated_at};
}

/* Node-Testzugriff (analog forecast-engine.js/chart-resolution.js) — rein
   additiv, aendert nichts am Browser-Verhalten (dort existiert "module"
   nicht). */
if(typeof module!=="undefined" && module.exports){
  module.exports={
    TRAINING_DOMAIN_SCHEMA_VERSION,genTrainingId,
    PRIORITY_LEVELS,PRIORITY_ORDER,comparePriority,UNVIOLABLE_PRIORITIES,isUnviolablePriority,
    createEvaluationContext,toComparableTime,compareEventOrder,sortByCanonicalEventOrder,
    CONFIDENCE_LEVELS,CONFIDENCE_ORDER,compareConfidence,
    roundVolumeToHalfSet,roundToAvailableSteps,roundTimeSpanMinutes,
    LOAD_MECHANISM_REGISTRY,LOAD_AXIS_CLASS,loadAxisClass,
    EQUIPMENT_FAMILY_SUBTYPE_REGISTRY,EQUIPMENT_FAMILIES_REQUIRING_MACHINE_FUNCTIONAL_SUBTYPE,
    isValidEquipmentFamily,isValidEquipmentSubtype,MACHINE_FUNCTIONAL_SUBTYPE_REGISTRY,
    CAPABILITY_REGISTRY,isValidCapabilityNamespace,isValidCapabilityValue,
    LOAD_UNIT,DISPLAY_SEMANTICS,LOAD_DIRECTION,PAIR_SEMANTICS,PER_SIDE_SEMANTICS,RATIO_CONFIDENCE,
    validateEnumValue,validateEnumArray,validateNumericRange,validateMuscleContributionBands,
    TRAINING_GOAL,EXPERIENCE_SELF,EXPERIENCE_LEVEL,MUSCLE_CONTRIBUTION_BAND,CANONICAL_VOLUME_MUSCLE_ID,
    LIMITING_CONSTRAINT,VOLUME_TOLERANCE_STATUS,
    REST_PREFERENCE,PREFERRED_SPLIT,TRAINING_LOCATION_TYPE,USER_TRAINING_PROFILE_FIELD_BOUNDS,
    MOVEMENT_PATTERN_ID,MOVEMENT_SUBPATTERN_ID,FOUNDATIONAL_MOVEMENT_PATTERNS,
    isRegisteredMovementPatternId,isRegisteredMovementSubpatternId,
    FAILURE_CATEGORY,FAILURE_SEVERITY,RETRY_SEMANTICS,createFailureResult,
    createExerciseDefinitionVersion,createExerciseSetupVariant,createExerciseSetup,createResolvedSetupBinding,
    createExerciseRelation,createCuratedSubstituteGroup,createCuratedVeto,
    createEquipmentDefinitionVersion,createEquipmentInstance,createAttachmentInstance,createEquipmentProfileVersion,
    createCapabilityPredicate,createLoadProfileVersion,createCatalogMigrationRecord,
    createUser,createUserTrainingProfile,BODYWEIGHT_EVENT_SOURCE,createBodyweightEvent,
    createTrainingLocation,AVAILABILITY_STATE,createAvailabilityEvent,INVENTORY_STATE,createLocationInventoryEvent,
    createExercisePreference,createPatternCaution,createSubstitutionPairScore,
    PLAN_ORIGIN,CONTROL_AUTHORITY,createPlan,createPlanBlock,createPlanVersion,createSessionTemplate,
    SESSION_INSTANCE_STATUS,createSessionInstance,SLOT_EXECUTION_MODE,createSlotExecution,
    SLOT_ROLE,REP_CHARACTER,REQUIRED_PROGRESSIBILITY,createSlotFunction,createSubstitutionHistoryEntry,createPlanSlot,
    createPrescription,createSessionOverride,createTimeBudgetOverride,createTimeModelConfig,createPerformanceInterpretationConfig,
    DELOAD_PROPOSAL_STATUS,createDeloadProposal,createDeloadOverlay,createValidationAcknowledgment,
    checkMutationIdempotency,createMutationCommand,MUTATION_RESULT_STATUS,createMutationResult,
    WORKOUT_METRIC_TYPE,WORKOUT_SESSION_STATUS,createIntraSessionAdjustment,createWorkoutSetEntry,createWorkoutLog,
    WORKOUT_LOG_CORRECTION_OPERATION,createWorkoutLogCorrection,projectEffectiveWorkoutLog,
    resolveBodyweightAtPerformedAt,isNonRepWorkoutLog,
    createExercisePerformanceProfile,createCalibrationPoint,createLoadRecommendation,
    PROGRESSION_MODEL,PROGRESSION_PHASE,createProgressionState,
    DAILY_TARGET_APPLICATION_STATUS,createDailyTarget,
    createRepDecayProfile,createExerciseRoundingDebt,createRirCalibrationEvent,
    createVolumeSnapshot,createVolumeDeficit,
  };
}
