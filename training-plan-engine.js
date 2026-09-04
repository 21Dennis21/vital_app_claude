/* training-plan-engine.js — TRAINING SYSTEM v1.4.1, IMPLEMENTATION PACK
   03/14: Plan Requirements / Plan Generation Pipeline (Grenzen) / Split
   Engine.

   Quelle: 03_PLAN_REQUIREMENTS_SPLIT_ENGINE.md (wortgetreue v1.4.1-
   Auszuege, Primary Scope Master-Zeilen 669-945, plus die dort
   ausdruecklich referenzierten Dependency-Contract-Auszuege §0.2-0.5,
   §4.2, §4.5, §4.6, §5.3, §5.5(Kopf), §17.3, §17.4, §21.6, §23.0).

   ===========================================================================
   STEP-03 TARGETED SPEC-CONFORMANCE CORRECTION (INVARIANT G-D3)
   ===========================================================================
   Diese Datei wurde nach der ersten STEP-03-Umsetzung korrigiert: mehrere
   zuvor als "dokumentierte Interpretation" bezeichnete Werte/Strukturen
   waren tatsaechlich FREIE Entwicklerinterpretationen ohne Deckung in
   v1.4.1 und wurden entfernt. Details siehe STEP-03-Korrekturbericht.
   Kurzfassung der Aenderungen:

   1. `min_viable_session_slots` wird NICHT mehr aus §17.3 rueckwaerts
      abgeleitet (das war eine erfundene Produktregel). v1.4.1 nennt fuer
      dieses Feld nur den Namen, keine Formel/Werte. Es ist jetzt ein
      PFLICHT-externer Input `minViableSessionSlotsBySplit` (wie
      VolumeTargets/equipmentCoverageBySplit) — kein Default im
      Produktionscode, siehe checkSF2.

   2. `muscle_frequency_map`: Fuer 8 der 9 Splits gibt §3.1 einen exakten
      Punktwert bzw. eine exakte Formel woertlich an (FULL_BODY "=Tage",
      UPPER_LOWER "Tage/2", UPPER_LOWER_FULL "1.67x", PUSH_PULL "2x", PPL
      "1x", PPL_X2 "2x", UPPER_LOWER_X3 "3x", BODY_PART_SPLIT "1x") — diese
      sind wortgetreu uebernommen, keine Interpretation. NUR PPL_UL_HYBRID
      nennt einen BEREICH ("1.6-2x"), keinen Punktwert. Die vorige Version
      hat diesen Bereich still auf 1.8 (Mittelwert) reduziert — das war
      unzulaessig (siehe Aufgabenstellung) und wurde entfernt. Der Wert
      muss jetzt explizit extern uebergeben werden (`frequencyOverrides.
      PPL_UL_HYBRID`), sonst wirft computeMuscleFrequency.

   3. `session_templates[]`-INHALT (welche Muskeln pro Template, in welcher
      Reihenfolge auf welchen Tag) ist in Pack 03 NICHT spezifiziert — nur
      der Feldname wird genannt. Die vorige Version hatte dafuer eine
      komplette, frei erfundene Muskel-Kategorisierung (PUSH/PULL/LEGS/
      UPPER/LOWER/FULL/PART_A..E mit konkreten Muskellisten) als
      Produktkonstante hartkodiert — das ist exakt die in G-D3 verbotene
      freie Interpretation eines Datenmodells. Diese Konstanten
      (SPLIT_TEMPLATE_MUSCLES, SPLIT_GOVERNED_MUSCLES) wurden vollstaendig
      entfernt. SF4 (Regeneration), SP1 (Peak-Session-Saetze) und SP5
      (Regenerationsabstand) benoetigen fachlich zwingend, welche Muskeln
      an welchem Tag eines Splits trainiert werden — dieser Wert kommt
      jetzt als PFLICHT-externer Input `sessionTemplateSequenceBySplit`
      herein (Form: {split_type: [{name, muscles:[canonical_muscle_id,...]},
      ...]}). Das ist Exercise-Catalog-/Bewegungsmuster-Registry-Wissen
      (§5.1/§6, ausserhalb dieses Packs), keine Split-Engine-Fachregel.
      SF3 und SF6 ("fuer jeden Muskel ...") brauchen dagegen KEINE
      Kategorisierung mehr: sie werden jetzt woertlich auf jeden Muskel
      angewendet, der ueberhaupt einen Eintrag in VolumeTargets hat.

   4. Wochentagsverteilung: die vorige Version hat bei fehlenden expliziten
      `training_weekdays` eine selbst erfundene "Gleichverteilungs"-
      Formel verwendet. v1.4.1 definiert dafuer keinen Algorithmus.
      `resolveTrainingWeekdays` verlangt jetzt IMMER explizite
      `training_weekdays` (bereits ein Profilfeld seit Paket 02) und wirft
      andernfalls einen klaren Fehler, statt eine Verteilung zu erfinden.

   5. SP4 (Prioritaetsmuskel-Score) bei ZWEI gleichzeitigen Prioritaets-
      muskeln (§4.5 erlaubt max. 2): eine Aggregation ueber mehrere
      Muskel-Scores wird HIER NICHT gebraucht, weil frequency(split,muskel)
      in diesem (jetzt korrigierten) Modell fuer JEDEN Muskel desselben
      Splits identisch ist (ein einziger Wert pro Split, siehe Punkt 2) —
      jeder Prioritaetsmuskel liefert also zwangslaeufig denselben
      Score, unabhaengig von einer Aggregationsfunktion. Es musste daher
      keine Aggregationsregel erfunden werden (siehe scoreSP4).

   6. SP6 hatte einen erfundenen Basiswert 50. §3.3 nennt fuer SP6
      AUSSCHLIESSLICH die additiven Modifikatoren (+40/-20). Basis ist
      jetzt 0 (additive Identitaet — die einzige Zahl, die keine
      zusaetzliche Annahme braucht), keine erfundene Konstante.

   7. SF5 behandelt eine explizit als "UNKNOWN" markierte Abdeckung jetzt
      korrekt als NICHT erfuellt (nie stillschweigend als erfuellt
      gewertet); ein komplett fehlender Eintrag wirft weiterhin (kein
      stiller Default, kein angenommenes Equipment).

   Verbleibende, nicht aufloesbare Struktur-Luecke (siehe STEP-03-
   Korrekturbericht Punkt 6): keine — alle o.g. Werte sind jetzt entweder
   woertlich aus §3.1 uebernommen oder als expliziter, versionierter
   externer Input modelliert, den der Aufrufer (Tests via Fixture, ein
   spaeteres Pack in Produktion) beibringen muss. Es gibt keinen in
   Produktionscode gebackenen erfundenen Wert mehr.

   ABSICHTLICH WEITERHIN NUR DIESER SCOPE:
   - Phase 1 (Requirements Resolution) und Phase 2 (Time Budget
     Resolution/SessionCapacity) sind ECHTE, vollstaendig implementierte
     reine Funktionen.
   - Phase 4 (Split Selection/Split Engine) ist eine ECHTE, vollstaendige
     reine Funktion inkl. SF1-SF6, SP1-SP6, Tie-Breaker und Fallback exakt
     nach §3 — jetzt mit den o.g. Werten als Pflicht-Inputs statt
     Erfindung.
   - Die restlichen 13 Pipeline-Phasen bleiben ausschliesslich als
     dokumentierte technische Contracts/Grenzen abgebildet
     (PLAN_GENERATION_PHASES). VolumeTargets bleiben ein externer,
     bereits berechneter Input (STEP 04).

   KORREKTUR AN training-domain.js (siehe dort, unveraendert aus der
   ersten STEP-03-Umsetzung): PlanSlot.slot_function.primary_muscle_bands[]
   ist korrekt eine Liste von {canonical_volume_muscle_id, contribution_
   band}-Paaren (§5.3-Exzerpt dieses Packs). */

/* ================= 2.1/2.2 — Plan Generation Pipeline: Phasen als
   technische Contracts/Grenzen (KEINE Engine-Logik ausser Phase 1/2/4) ===== */
const PLAN_GENERATION_PHASES=Object.freeze([
  Object.freeze({phase:1,name:"Requirements Resolution",input:["UserTrainingProfile"],output:"PlanRequirements",failure_codes:Object.freeze(["INFEASIBLE_REQUIREMENTS"]),implemented:true}),
  Object.freeze({phase:2,name:"Time Budget Resolution",input:["session_time_budget_min","training_days","actual_session_duration_factor","goal"],output:"SessionCapacity",failure_codes:Object.freeze(["INFEASIBLE_TIME"]),implemented:true}),
  Object.freeze({phase:3,name:"Volume Target Resolution",input:["PlanRequirements","SessionCapacity"],output:"VolumeTargets",failure_codes:Object.freeze(["VOLUME_INFEASIBLE"]),implemented:false}),
  Object.freeze({phase:4,name:"Split Selection",input:["PlanRequirements","VolumeTargets","SessionCapacity"],output:"SplitStructure",failure_codes:Object.freeze(["NO_VIABLE_SPLIT"]),implemented:true}),
  Object.freeze({phase:5,name:"Volume Distribution",input:["VolumeTargets","SplitStructure"],output:"SessionVolumeTargets",failure_codes:Object.freeze([]),implemented:false}),
  Object.freeze({phase:6,name:"Slot Generation",input:["SessionVolumeTargets","SessionCapacity","goal"],output:"PlanSlot[] (ohne exercise_id)",failure_codes:Object.freeze([]),implemented:false}),
  Object.freeze({phase:7,name:"Exercise Selection",input:["PlanSlot[]","Katalog","Equipment","Praeferenzen","user_skill_level"],output:"PlanSlot[] (mit exercise_id)",failure_codes:Object.freeze([]),implemented:false}),
  Object.freeze({phase:8,name:"Prescription Assignment",input:["Slots mit Uebungen","goal","experience_level","Equipment-Granularity","Safety-/Caution-Kontext"],output:"PrescriptionBand + initialer Progressionsmodus",failure_codes:Object.freeze([]),implemented:false}),
  Object.freeze({phase:9,name:"Session Ordering",input:["Slots einer Session"],output:"order_index",failure_codes:Object.freeze([]),implemented:false}),
  Object.freeze({phase:10,name:"Calibration Planning",input:["geordneter Plan","PerformanceProfile-Bestand","experience_level"],output:"CalibrationPlan + geplante Kalibriersaetze",failure_codes:Object.freeze([]),implemented:false}),
  Object.freeze({phase:11,name:"Time Validation & Repair",input:["Sessions inkl. geplanter Kalibriersaetze"],output:"zeitkonforme Sessions",failure_codes:Object.freeze(["TIME_UNRESOLVABLE"]),implemented:false}),
  Object.freeze({phase:12,name:"Global Validation & Repair",input:["vollstaendiger Planentwurf inkl. CalibrationPlan"],output:"ValidationReport + ggf. reparierter Plan",failure_codes:Object.freeze(["BLOCKING_ERRORS"]),implemented:false}),
  Object.freeze({phase:13,name:"Plan Finalization",input:["validierter Candidate State"],output:"PlanVersion (NEEDS_CALIBRATION | ACTIVE | NEEDS_USER_DECISION)",failure_codes:Object.freeze([]),implemented:false}),
]);
/* INVARIANT G-9: maximal 2 Ruecklaeufe von Phase 11 nach Phase 4 pro
   Plangenerierung — hier nur als dokumentierte Konstante fuer eine
   spaetere Phase-11-Implementierung, da Phase 11 selbst nicht Teil dieses
   Packs ist. */
const MAX_PHASE11_TO_PHASE4_REROUTES=2;

/* ================= §17.3 — TimeCapacityPlanningConfig v1.4.1 (Phase 2) ===== */
const TIME_CAPACITY_PLANNING_CONFIG=Object.freeze({
  STRENGTH:Object.freeze({work_execution_share_s:28,rest_share_s:130,setup_share_s:14,warmup_share_s:18,transition_share_s:15,unilateral_share_s:5,planning_set_equivalent_s:210}),
  HYPERTROPHY:Object.freeze({work_execution_share_s:40,rest_share_s:80,setup_share_s:10,warmup_share_s:10,transition_share_s:10,unilateral_share_s:5,planning_set_equivalent_s:155}),
  GENERAL_FITNESS:Object.freeze({work_execution_share_s:46,rest_share_s:50,setup_share_s:8,warmup_share_s:5,transition_share_s:10,unilateral_share_s:6,planning_set_equivalent_s:125}),
});

/* Phase 1 — Requirements Resolution. INPUT: UserTrainingProfile (bereits
   durch STEP 01/02 vollstaendig validiert). OUTPUT: PlanRequirements.
   FAILURE: INFEASIBLE_REQUIREMENTS mit mindestens einer Lockerungsoption. */
function resolvePlanRequirements(profile,evaluationContext){
  if(!evaluationContext||evaluationContext.evaluation_at===undefined)throw new Error("training-plan-engine: resolvePlanRequirements benoetigt einen EvaluationContext mit evaluation_at (kein verstecktes now())");
  if(!profile)throw new Error("training-plan-engine: resolvePlanRequirements benoetigt ein UserTrainingProfile");
  /* Machbarkeitsvorpruefung (Phase 1): existiert ueberhaupt ein Split-
     Kandidat, dessen Tage-Bereich die gewaehlten Trainingstage abdeckt?
     Bei den durch STEP 02 erzwungenen Grenzen (2-6 Tage) ist das immer der
     Fall (Vereinigung aller SPLIT_CANDIDATES.valid_training_days deckt
     [2,6] lueckenlos ab) — die Pruefung bleibt trotzdem als echter,
     testbarer Vertrag bestehen, statt sie stillschweigend wegzulassen. */
  const anyCandidateForDays=Object.keys(SPLIT_CANDIDATES).some(k=>SPLIT_CANDIDATES[k].valid_training_days.indexOf(profile.training_days_per_week)!==-1);
  if(!anyCandidateForDays){
    return {status:"FAILURE",failure:createFailureResult({
      code:"INFEASIBLE_REQUIREMENTS",category:FAILURE_CATEGORY.INFEASIBLE,severity:FAILURE_SEVERITY.BLOCKING,
      user_message_key:"plan_requirements_no_split_for_training_days",
      repair_options:["training_days_per_week aendern"],blocking:true,
      retry_semantics:RETRY_SEMANTICS.RETRY_AFTER_USER_DECISION,source_engine:"plan-requirements-resolution",
    })};
  }
  const planRequirements={
    user_id:profile.user_id,
    goal:profile.goal,
    experience_level:profile.experience_level,
    user_skill_level:profile.user_skill_level,
    training_days_per_week:profile.training_days_per_week,
    session_time_budget_min:profile.session_time_budget_min,
    /* actual_session_duration_factor ist ein LEARNED-Feld (Paket 02, §1.2)
       und liegt vor der ersten gemessenen Session als null vor. 1.0 ist
       hier der mathematisch neutrale Wert eines multiplikativen
       Korrekturfaktors (klemmt ohnehin auf [0.75,1.5]) — keine erfundene
       Tatsachenbehauptung ueber den Nutzer, sondern "noch keine Korrektur
       gelernt". */
    actual_session_duration_factor:profile.actual_session_duration_factor!=null?profile.actual_session_duration_factor:1.0,
    priority_muscles:profile.priority_muscles||[],
    preferred_split:profile.preferred_split,
    rest_preference:profile.rest_preference,
    uses_rir:!!profile.uses_rir,
    primary_location_id:profile.primary_location_id,
    training_weekdays:(profile.training_weekdays&&profile.training_weekdays.length===profile.training_days_per_week)?profile.training_weekdays.slice():null,
  };
  return {status:"OK",planRequirements};
}

/* Phase 2 — Time Budget Resolution (§17.3). reserve_s ist ein versionierter
   Zeitmodell-Parameter aus §17.1 (ausserhalb dieses Packs) und wird daher
   NICHT hier erfunden, sondern vom Aufrufer explizit uebergeben. */
function resolveSessionCapacity({session_time_budget_min,reserve_s,goal,actual_session_duration_factor}){
  if(session_time_budget_min==null)throw new Error("training-plan-engine: resolveSessionCapacity benoetigt session_time_budget_min");
  if(reserve_s==null)throw new Error("training-plan-engine: resolveSessionCapacity benoetigt reserve_s (versionierter §17.1-Zeitmodell-Parameter, kein Default hier erfunden)");
  validateEnumValue(goal,TRAINING_GOAL,"goal");
  const factor=actual_session_duration_factor!=null?actual_session_duration_factor:1.0;
  const config=TIME_CAPACITY_PLANNING_CONFIG[goal];
  const brutto_budget_s=session_time_budget_min*60;
  const netto_s=brutto_budget_s-reserve_s;
  const burdened_set_s=config.planning_set_equivalent_s*factor;
  const max_working_sets=Math.floor(netto_s/burdened_set_s);
  const raw_max_slots=Math.floor(max_working_sets/3);
  if(raw_max_slots<2){
    return {status:"FAILURE",failure:createFailureResult({
      code:"INFEASIBLE_TIME",category:FAILURE_CATEGORY.INFEASIBLE,severity:FAILURE_SEVERITY.BLOCKING,
      user_message_key:"session_capacity_infeasible_time",repair_options:["Zeitbudget erhoehen"],blocking:true,
      retry_semantics:RETRY_SEMANTICS.RETRY_AFTER_USER_DECISION,source_engine:"session-capacity-resolution",
    })};
  }
  const max_slots=Math.min(raw_max_slots,9);
  return {status:"OK",sessionCapacity:{brutto_budget_s,netto_s,burdened_set_s,max_working_sets,raw_max_slots,max_slots,goal}};
}

/* ================= §3.1 — Split-Kandidatenraum ================= */
/* NUR woertlich aus §3.1 uebernommene Metadaten: split_type,
   valid_training_days, typical_session_length_min. min_viable_session_slots
   und session_templates[]-Inhalt sind NICHT Teil dieser Konstante (siehe
   Kopf-Kommentar Punkte 1+3) — sie kommen als externe Pflicht-Inputs. */
const SPLIT_TYPE=Object.freeze({
  FULL_BODY:"FULL_BODY",UPPER_LOWER:"UPPER_LOWER",UPPER_LOWER_FULL:"UPPER_LOWER_FULL",
  PUSH_PULL:"PUSH_PULL",PPL:"PPL",PPL_X2:"PPL_X2",PPL_UL_HYBRID:"PPL_UL_HYBRID",
  UPPER_LOWER_X3:"UPPER_LOWER_X3",BODY_PART_SPLIT:"BODY_PART_SPLIT",
});

const SPLIT_CANDIDATES=Object.freeze({
  FULL_BODY:Object.freeze({split_type:"FULL_BODY",valid_training_days:Object.freeze([2,3,4]),typical_session_length_min:Object.freeze({min:45,max:90})}),
  UPPER_LOWER:Object.freeze({split_type:"UPPER_LOWER",valid_training_days:Object.freeze([2,4]),typical_session_length_min:Object.freeze({min:45,max:75})}),
  UPPER_LOWER_FULL:Object.freeze({split_type:"UPPER_LOWER_FULL",valid_training_days:Object.freeze([3]),typical_session_length_min:Object.freeze({min:50,max:75})}),
  PUSH_PULL:Object.freeze({split_type:"PUSH_PULL",valid_training_days:Object.freeze([4]),typical_session_length_min:Object.freeze({min:45,max:70})}),
  PPL:Object.freeze({split_type:"PPL",valid_training_days:Object.freeze([3]),typical_session_length_min:Object.freeze({min:60,max:90})}),
  PPL_X2:Object.freeze({split_type:"PPL_X2",valid_training_days:Object.freeze([6]),typical_session_length_min:Object.freeze({min:40,max:70})}),
  PPL_UL_HYBRID:Object.freeze({split_type:"PPL_UL_HYBRID",valid_training_days:Object.freeze([5]),typical_session_length_min:Object.freeze({min:50,max:80})}),
  UPPER_LOWER_X3:Object.freeze({split_type:"UPPER_LOWER_X3",valid_training_days:Object.freeze([6]),typical_session_length_min:Object.freeze({min:40,max:60})}),
  BODY_PART_SPLIT:Object.freeze({split_type:"BODY_PART_SPLIT",valid_training_days:Object.freeze([5]),typical_session_length_min:Object.freeze({min:50,max:80})}),
});
/* DECISION (§3.4-Kommentar): BODY_PART_SPLIT bleibt ein zulaessiger
   Kandidat und wird NICHT per Hard Filter ausgeschlossen — siehe SF1-SF6
   unten: keiner davon nennt BODY_PART_SPLIT explizit. */

/* ================= Wochentage: reiner Pass-Through, KEIN erfundener
   Verteilungsalgorithmus (siehe Kopf-Kommentar Punkt 4) ================= */
function resolveTrainingWeekdays(trainingDaysPerWeek,explicitWeekdays){
  if(!explicitWeekdays||explicitWeekdays.length!==trainingDaysPerWeek){
    throw new Error("training-plan-engine: resolveTrainingWeekdays benoetigt explizite training_weekdays der Laenge "+trainingDaysPerWeek+" — v1.4.1 Pack 03 definiert keinen Algorithmus, um Trainingstage auf konkrete Wochentage zu verteilen; das ist eine Nutzer-/Scheduling-Entscheidung (UserTrainingProfile.training_weekdays, Paket 02), kein aus der Split Engine ableitbarer Wert. Es darf hier keine Verteilung erfunden werden.");
  }
  return explicitWeekdays.slice().sort((a,b)=>a-b);
}
function areWeekdaysConsecutive(a,b){
  const diff=Math.abs(a-b);
  return diff===1||diff===6;
}

/* ================= §3.1 Muskelfrequenz — woertliche Formeln ================= */
/* 8 der 9 Splits: exakter Punktwert/Formel direkt aus §3.1 uebernommen
   (keine Interpretation). PPL_UL_HYBRID ABSICHTLICH NICHT enthalten: §3.1
   nennt dafuer nur einen Bereich (1.6-2x), keinen Punktwert. Ein Bereich
   darf nicht still auf seinen Mittelpunkt reduziert werden — der Aufrufer
   muss einen Punktwert explizit ueber frequencyOverrides.PPL_UL_HYBRID
   vorgeben (Tests: klar deklarierte Fixture; Produktion: erst moeglich,
   sobald eine spaetere Spec-Praezisierung oder ein versioniertes Tuning
   diesen Punktwert definiert). */
const SPLIT_FREQUENCY_FORMULA=Object.freeze({
  FULL_BODY:(days)=>days,
  UPPER_LOWER:(days)=>days/2,
  UPPER_LOWER_FULL:()=>1.67,
  PUSH_PULL:()=>2,
  PPL:()=>1,
  PPL_X2:()=>2,
  UPPER_LOWER_X3:()=>3,
  BODY_PART_SPLIT:()=>1,
});
function computeMuscleFrequency(splitType,trainingDays,frequencyOverrides){
  const formula=SPLIT_FREQUENCY_FORMULA[splitType];
  if(formula)return formula(trainingDays);
  const override=frequencyOverrides?frequencyOverrides[splitType]:undefined;
  if(override==null)throw new Error("training-plan-engine: computeMuscleFrequency("+splitType+") — §3.1 nennt fuer diesen Split nur einen Frequenzbereich (kein Punktwert) und frequencyOverrides."+splitType+" wurde nicht uebergeben. Ein Bereich darf nicht durch Mittelwertbildung stillschweigend aufgeloest werden.");
  return override;
}

/* ================= §3.2 — Hard Filters SF1-SF6 ================= */
/* INVARIANT S-1: ein Split, der SF1-SF6 verletzt, wird nie gewaehlt — auch
   nicht als Fallback, auch nicht bei Nutzerpraeferenz. SF4/SF5 werden in
   keiner Fallback-Stufe gelockert (INVARIANT S-2). Nur SF3 darf in der
   Fallback-Stufe 1 von 12 auf 16 gelockert werden (sessionCapSets-Param). */
function checkSF1(splitMeta,trainingDays){
  return splitMeta.valid_training_days.indexOf(trainingDays)!==-1;
}
/* min_viable_session_slots ist ein PFLICHT-externer Input (siehe Kopf-
   Kommentar Punkt 1) — kein Default, keine Ableitung hier. */
function checkSF2(splitMeta,sessionCapacity,minViableSessionSlots){
  if(minViableSessionSlots==null)throw new Error("training-plan-engine: checkSF2("+splitMeta.split_type+") benoetigt minViableSessionSlots — v1.4.1 (§3.1) nennt min_viable_session_slots nur als Metadatenfeld-Namen ohne Formel/Werte je Split; muss vom Aufrufer explizit als versionierte Config uebergeben werden.");
  return minViableSessionSlots<=sessionCapacity.max_slots;
}
/* "Fuer jeden Muskel im Plan" = jeder Schluessel in VolumeTargets — keine
   Kategorisierung/Filterung noetig oder zulaessig (siehe Kopf-Kommentar
   Punkt 3). */
function checkSF3(splitMeta,trainingDays,volumeTargets,sessionCapSets,frequencyOverrides){
  const freq=computeMuscleFrequency(splitMeta.split_type,trainingDays,frequencyOverrides);
  return Object.keys(volumeTargets).every(m=>{
    const weeklyTarget=volumeTargets[m];
    if(weeklyTarget==null)return true;
    return (weeklyTarget/freq)<=sessionCapSets;
  });
}
/* sessionTemplateSequence: PFLICHT-externer Input {name, muscles[]}[] fuer
   GENAU diesen Split (siehe Kopf-Kommentar Punkt 3) — Pack 03 definiert
   weder Template-Namen/Reihenfolge noch Muskelinhalt. */
function checkSF4(splitMeta,trainingDays,weekdays,volumeTargets,sessionTemplateSequence,frequencyOverrides){
  if(!Array.isArray(sessionTemplateSequence)||!sessionTemplateSequence.length)throw new Error("training-plan-engine: checkSF4("+splitMeta.split_type+") benoetigt sessionTemplateSequence — siehe Kopf-Kommentar Punkt 3 (v1.4.1 definiert session_templates[]-Inhalt nicht).");
  const freq=computeMuscleFrequency(splitMeta.split_type,trainingDays,frequencyOverrides);
  const T=sessionTemplateSequence.length;
  const dayMuscles=weekdays.map((wd,i)=>({weekday:wd,muscles:sessionTemplateSequence[i%T].muscles}));
  for(let i=0;i<dayMuscles.length;i++){
    for(let j=i+1;j<dayMuscles.length;j++){
      if(!areWeekdaysConsecutive(dayMuscles[i].weekday,dayMuscles[j].weekday))continue;
      const shared=dayMuscles[i].muscles.filter(m=>dayMuscles[j].muscles.indexOf(m)!==-1);
      for(const m of shared){
        const weeklyTarget=volumeTargets[m];
        if(weeklyTarget==null)continue;
        if((weeklyTarget/freq)>=10)return false;
      }
    }
  }
  return true;
}
/* equipmentCoverageBySplit[split_type] ist entweder eine Zahl 0..1 oder der
   String "UNKNOWN". Ein fehlender Eintrag wirft (kein stiller Default,
   kein angenommenes Equipment). "UNKNOWN" gilt NIE als erfuellt (nie
   stillschweigend als erfuellt gewertet — siehe Aufgabenstellung Punkt G). */
function checkSF5(splitMeta,equipmentCoverageBySplit){
  if(!equipmentCoverageBySplit||!Object.prototype.hasOwnProperty.call(equipmentCoverageBySplit,splitMeta.split_type)){
    throw new Error("training-plan-engine: equipmentCoverageBySplit["+splitMeta.split_type+"] fehlt — SF5 erfordert eine Equipment-/Muster-Abdeckungsquote aus dem (in diesem Pack nicht vorhandenen) Exercise-Catalog-Kontext; muss vom Aufrufer explizit uebergeben werden.");
  }
  const coverage=equipmentCoverageBySplit[splitMeta.split_type];
  if(coverage==="UNKNOWN")return false;
  if(typeof coverage!=="number")throw new Error("training-plan-engine: equipmentCoverageBySplit["+splitMeta.split_type+"] muss eine Zahl 0..1 oder der String \"UNKNOWN\" sein, erhalten: "+JSON.stringify(coverage));
  return coverage>=0.6;
}
/* frequency(split,muskel) ist in diesem Modell fuer jeden Muskel desselben
   Splits identisch (ein Punktwert pro Split, §3.1) — SF6 reduziert sich
   damit auf eine einzige Pruefung, unabhaengig davon, welche/wie viele
   Muskeln VolumeTargets enthaelt. */
function checkSF6(splitMeta,trainingDays,volumeTargets,frequencyOverrides){
  const freq=computeMuscleFrequency(splitMeta.split_type,trainingDays,frequencyOverrides);
  return freq>=1;
}
/* Wertet alle 6 Hard Filters aus. sessionCapSets ist der SF3-Parameter
   (12 normal, 16 in Fallback-Stufe 1 — §3.5). ctx.minViableSessionSlots und
   ctx.sessionTemplateSequence sind die bereits fuer GENAU diesen Split
   aufgeloesten externen Werte (siehe filterSplitCandidates/selectSplit). */
function evaluateHardFilters(splitMeta,ctx){
  const {trainingDays,weekdays,volumeTargets,sessionCapacity,equipmentCoverageBySplit,sessionCapSets,minViableSessionSlots,sessionTemplateSequence,frequencyOverrides}=ctx;
  const failures=[];
  if(!checkSF1(splitMeta,trainingDays))failures.push("SF1");
  if(!checkSF2(splitMeta,sessionCapacity,minViableSessionSlots))failures.push("SF2");
  if(!checkSF3(splitMeta,trainingDays,volumeTargets,sessionCapSets,frequencyOverrides))failures.push("SF3");
  if(!checkSF4(splitMeta,trainingDays,weekdays,volumeTargets,sessionTemplateSequence,frequencyOverrides))failures.push("SF4");
  if(!checkSF5(splitMeta,equipmentCoverageBySplit))failures.push("SF5");
  if(!checkSF6(splitMeta,trainingDays,volumeTargets,frequencyOverrides))failures.push("SF6");
  return {pass:failures.length===0,failures};
}

/* ================= §3.3 — Soft Score SP1-SP6 (Summe 100) ================= */
function computePeakSessionSets(splitMeta,trainingDays,weekdays,volumeTargets,sessionTemplateSequence,frequencyOverrides){
  const freq=computeMuscleFrequency(splitMeta.split_type,trainingDays,frequencyOverrides);
  const T=sessionTemplateSequence.length;
  let peak=0;
  weekdays.forEach((wd,i)=>{
    const muscles=sessionTemplateSequence[i%T].muscles;
    let sessionSets=0;
    muscles.forEach(m=>{
      if(volumeTargets[m]==null)return;
      sessionSets+=volumeTargets[m]/freq;
    });
    peak=Math.max(peak,sessionSets);
  });
  return peak;
}
function scoreSP1(peakSets,maxWorkingSets){
  const ratio=maxWorkingSets>0?peakSets/maxWorkingSets:Infinity;
  return Math.max(0,Math.min(100,100-60*Math.max(0,ratio-1)));
}
function scoreSP3(estimatedPeakSessionS,bruttoBudgetS){
  return Math.max(0,Math.min(100,100-100*Math.max(0,estimatedPeakSessionS/bruttoBudgetS-1)));
}
function targetFrequencyFromWeeklyVolume(weeklyVol){
  if(weeklyVol<=10)return 1;
  if(weeklyVol<=20)return 2;
  return 3;
}
function scoreSP2(splitMeta,goal,trainingDays,volumeTargets,frequencyOverrides){
  const freq=computeMuscleFrequency(splitMeta.split_type,trainingDays,frequencyOverrides);
  if(goal===TRAINING_GOAL.STRENGTH){
    /* §4.6: fuer STRENGTH ist die >=2-Exposure-Praeferenz ausschliesslich
       P5-Optimierung, "1 Exposure/Woche bleibt gueltig und erzeugt weder
       ERROR noch INFEASIBLE" und "fehlende Machbarkeit erzeugt keinen
       Hard-Malus" — es gibt keinen im Pack genannten Punktwert fuer diese
       Praeferenz, daher: volle Punktzahl, solange ueberhaupt mindestens 1
       Exposure erreicht wird (durch SF6 fuer jeden survivierenden
       Kandidaten ohnehin garantiert). */
    return freq>=1?100:0;
  }
  const muscles=Object.keys(volumeTargets);
  if(!muscles.length)return 100;
  const scores=muscles.map(m=>{
    const targetFreq=targetFrequencyFromWeeklyVolume(volumeTargets[m]);
    const levelDiff=Math.abs(Math.round(freq)-targetFreq);
    return Math.max(0,Math.min(100,100-25*levelDiff));
  });
  return scores.reduce((a,b)=>a+b,0)/scores.length;
}
function scoreSP4(splitMeta,trainingDays,priorityMuscles,frequencyOverrides){
  if(!priorityMuscles||!priorityMuscles.length)return 100;
  const freq=computeMuscleFrequency(splitMeta.split_type,trainingDays,frequencyOverrides);
  /* Aggregation ueber mehrere Prioritaetsmuskeln (max. 2, §4.5) ist mit
     diesem Modell nicht mehrdeutig: frequency(split,muskel) ist fuer JEDEN
     Muskel desselben Splits identisch (ein Punktwert pro Split, §3.1) —
     jeder Prioritaetsmuskel liefert also exakt denselben Score. Es musste
     dafuer keine Aggregationsregel (min/max/Durchschnitt) erfunden werden. */
  return freq>=2?100:(freq>=1?60:30);
}
function computeMuscleExposureWeekdays(weekdays,sessionTemplateSequence,muscleId){
  const T=sessionTemplateSequence.length;
  const exposureDays=[];
  weekdays.forEach((wd,i)=>{
    if(sessionTemplateSequence[i%T].muscles.indexOf(muscleId)!==-1)exposureDays.push(wd);
  });
  return exposureDays.sort((a,b)=>a-b);
}
function averageGapHours(exposureDays){
  if(!exposureDays.length)return null;
  if(exposureDays.length===1)return 168;
  const gaps=[];
  for(let i=0;i<exposureDays.length;i++){
    const cur=exposureDays[i];
    const next=exposureDays[(i+1)%exposureDays.length];
    let diff=next-cur;
    if(diff<=0)diff+=7;
    gaps.push(diff*24);
  }
  return gaps.reduce((a,b)=>a+b,0)/gaps.length;
}
function gapHoursToScore(hours){
  if(hours>=48)return 100;
  if(hours<=24)return 40;
  return 40+(hours-24)/(48-24)*(100-40);
}
function scoreSP5(weekdays,volumeTargets,sessionTemplateSequence){
  const muscles=Object.keys(volumeTargets);
  if(!muscles.length)return 100;
  const scores=muscles.map(m=>{
    const exposureDays=computeMuscleExposureWeekdays(weekdays,sessionTemplateSequence,m);
    const hours=averageGapHours(exposureDays);
    return hours==null?100:gapHoursToScore(hours);
  });
  return scores.reduce((a,b)=>a+b,0)/scores.length;
}
const SP6_BEGINNER_UNSUITABLE_SPLITS=Object.freeze(["PPL","BODY_PART_SPLIT","PPL_X2"]);
function scoreSP6(splitMeta,preferredSplit,experienceLevel){
  /* §3.3 SP6 nennt AUSSCHLIESSLICH die additiven Modifikatoren (+40/-20),
     keinen Basiswert. 0 ist die additive Identitaet — die einzige Zahl,
     die hier keine zusaetzliche Annahme braucht (kein erfundener
     Basiswert wie z.B. 50). */
  let score=0;
  if(preferredSplit&&preferredSplit===splitMeta.split_type)score+=40;
  if(experienceLevel===EXPERIENCE_LEVEL.BEGINNER&&SP6_BEGINNER_UNSUITABLE_SPLITS.indexOf(splitMeta.split_type)!==-1)score-=20;
  return Math.max(0,Math.min(100,score));
}
const SP_WEIGHTS=Object.freeze({SP1:30,SP2:20,SP3:20,SP4:12,SP5:10,SP6:8});
/* externalConfig: {equipmentCoverageBySplit, minViableSessionSlotsBySplit,
   sessionTemplateSequenceBySplit, frequencyOverrides?} — siehe Kopf-
   Kommentar. Alle vier Felder sind Werte, die v1.4.1 Pack 03 nicht selbst
   definiert (ausser dem woertlichen §3.1-Frequenzformeln, die
   computeMuscleFrequency direkt enthaelt und die frequencyOverrides nur
   fuer PPL_UL_HYBRID ergaenzt). */
function requireSessionTemplateSequence(splitType,sessionTemplateSequenceBySplit){
  const seq=sessionTemplateSequenceBySplit?sessionTemplateSequenceBySplit[splitType]:undefined;
  if(!Array.isArray(seq)||!seq.length)throw new Error("training-plan-engine: sessionTemplateSequenceBySplit["+splitType+"] fehlt — v1.4.1 (§3.1) nennt 'session_templates[]' nur als Metadatenfeld-Namen, ohne Template-Namen/Reihenfolge/Muskelinhalt (Exercise-Catalog-Wissen, ausserhalb dieses Packs). Muss vom Aufrufer explizit als versionierter Input uebergeben werden.");
  return seq;
}
function scoreSplitCandidate(splitMeta,planRequirements,volumeTargets,sessionCapacity,weekdays,externalConfig){
  const {sessionTemplateSequenceBySplit,frequencyOverrides}=externalConfig;
  const trainingDays=planRequirements.training_days_per_week;
  const sessionTemplateSequence=requireSessionTemplateSequence(splitMeta.split_type,sessionTemplateSequenceBySplit);
  const peakSets=computePeakSessionSets(splitMeta,trainingDays,weekdays,volumeTargets,sessionTemplateSequence,frequencyOverrides);
  const estimatedPeakSessionS=peakSets*sessionCapacity.burdened_set_s;
  const sp1=scoreSP1(peakSets,sessionCapacity.max_working_sets);
  const sp2=scoreSP2(splitMeta,planRequirements.goal,trainingDays,volumeTargets,frequencyOverrides);
  const sp3=scoreSP3(estimatedPeakSessionS,sessionCapacity.brutto_budget_s);
  const sp4=scoreSP4(splitMeta,trainingDays,planRequirements.priority_muscles,frequencyOverrides);
  const sp5=scoreSP5(weekdays,volumeTargets,sessionTemplateSequence);
  const sp6=scoreSP6(splitMeta,planRequirements.preferred_split,planRequirements.experience_level);
  const total=(sp1*SP_WEIGHTS.SP1+sp2*SP_WEIGHTS.SP2+sp3*SP_WEIGHTS.SP3+sp4*SP_WEIGHTS.SP4+sp5*SP_WEIGHTS.SP5+sp6*SP_WEIGHTS.SP6)/100;
  const frequency=computeMuscleFrequency(splitMeta.split_type,trainingDays,frequencyOverrides);
  return {split_type:splitMeta.split_type,breakdown:{SP1:sp1,SP2:sp2,SP3:sp3,SP4:sp4,SP5:sp5,SP6:sp6},total,estimatedPeakSessionS,frequency};
}
/* Tie-Breaker exakt in dieser Reihenfolge: 1) hoeherer SP1, 2) niedrigere
   geschaetzte Sessionzeit, 3) hoehere Muskelfrequenz, 4) lexikografisch
   split_type. Wird NUR bei gleichem Gesamt-Score angewendet. */
function compareSplitCandidates(a,b){
  if(a.total!==b.total)return b.total-a.total;
  if(a.breakdown.SP1!==b.breakdown.SP1)return b.breakdown.SP1-a.breakdown.SP1;
  if(a.estimatedPeakSessionS!==b.estimatedPeakSessionS)return a.estimatedPeakSessionS-b.estimatedPeakSessionS;
  if(a.frequency!==b.frequency)return b.frequency-a.frequency;
  return a.split_type<b.split_type?-1:(a.split_type>b.split_type?1:0);
}

/* ================= §3.5 — Fallback ================= */
/* Filtert die Kandidatenliste; gibt {survivors, sessionCapSetsUsed,
   warning?} zurueck. */
function filterSplitCandidates(planRequirements,volumeTargets,sessionCapacity,externalConfig,weekdays,sessionCapSets){
  const {equipmentCoverageBySplit,minViableSessionSlotsBySplit,sessionTemplateSequenceBySplit,frequencyOverrides}=externalConfig;
  return Object.keys(SPLIT_CANDIDATES).filter(k=>{
    const splitMeta=SPLIT_CANDIDATES[k];
    const minViableSessionSlots=minViableSessionSlotsBySplit?minViableSessionSlotsBySplit[k]:undefined;
    const sessionTemplateSequence=requireSessionTemplateSequence(k,sessionTemplateSequenceBySplit);
    const ctx={trainingDays:planRequirements.training_days_per_week,weekdays,volumeTargets,sessionCapacity,equipmentCoverageBySplit,sessionCapSets,minViableSessionSlots,sessionTemplateSequence,frequencyOverrides};
    return evaluateHardFilters(splitMeta,ctx).pass;
  }).map(k=>SPLIT_CANDIDATES[k]);
}
/* Phase 4 — Split Selection (Split Engine). INPUT: PlanRequirements,
   VolumeTargets (externer, in STEP 04 zu berechnender Input),
   SessionCapacity, externalConfig ({equipmentCoverageBySplit,
   minViableSessionSlotsBySplit, sessionTemplateSequenceBySplit,
   frequencyOverrides?}) — allesamt Werte, die v1.4.1 Pack 03 nicht selbst
   definiert (siehe Kopf-Kommentar) und die daher zwingend extern/
   versioniert hereinkommen muessen; kein Default in Produktionscode.
   OUTPUT: {status:"OK", splitStructure, warnings[]} | {status:"FAILURE",
   failure} | {status:"NEEDS_VOLUME_ADJUSTMENT", repairRequest, warnings[]}
   (letzteres ist der in §3.5 Schritt 2 geforderte strukturierte Fallback-/
   Repair-Request an STEP 04, statt selbst Volumenziele zu erfinden). */
function selectSplit(planRequirements,volumeTargets,sessionCapacity,externalConfig){
  if(!planRequirements)throw new Error("training-plan-engine: selectSplit benoetigt PlanRequirements");
  if(!volumeTargets)throw new Error("training-plan-engine: selectSplit benoetigt VolumeTargets (externer Input, siehe STEP 04)");
  if(!sessionCapacity)throw new Error("training-plan-engine: selectSplit benoetigt SessionCapacity");
  if(!externalConfig)throw new Error("training-plan-engine: selectSplit benoetigt externalConfig {equipmentCoverageBySplit, minViableSessionSlotsBySplit, sessionTemplateSequenceBySplit, frequencyOverrides?} — diese Werte definiert v1.4.1 Pack 03 nicht selbst (siehe Kopf-Kommentar), sie muessen extern/versioniert hereinkommen.");
  const {equipmentCoverageBySplit,minViableSessionSlotsBySplit,sessionTemplateSequenceBySplit,frequencyOverrides}=externalConfig;
  const weekdays=resolveTrainingWeekdays(planRequirements.training_days_per_week,planRequirements.training_weekdays);
  const warnings=[];

  let survivors=filterSplitCandidates(planRequirements,volumeTargets,sessionCapacity,externalConfig,weekdays,12);
  if(!survivors.length){
    // Fallback Stufe 1: SF3 auf 16 lockern (SF4/SF5 NIE gelockert — INVARIANT S-2).
    survivors=filterSplitCandidates(planRequirements,volumeTargets,sessionCapacity,externalConfig,weekdays,16);
    if(survivors.length)warnings.push("SF3_RELAXED_TO_16");
  }
  if(!survivors.length){
    // Fallback Stufe 2: FULL_BODY erzwingen (SF4/SF5 weiterhin ungelockert
    // gegen FULL_BODY selbst geprueft), Volumenziele an Capacity anpassen
    // ist STEP-04-Aufgabe -> strukturierter Repair-Request statt Erfindung.
    const fullBody=SPLIT_CANDIDATES.FULL_BODY;
    const fbMinViableSessionSlots=minViableSessionSlotsBySplit?minViableSessionSlotsBySplit.FULL_BODY:undefined;
    const fbSessionTemplateSequence=requireSessionTemplateSequence("FULL_BODY",sessionTemplateSequenceBySplit);
    const fullBodyCheck=evaluateHardFilters(fullBody,{trainingDays:planRequirements.training_days_per_week,weekdays,volumeTargets,sessionCapacity,equipmentCoverageBySplit,sessionCapSets:16,minViableSessionSlots:fbMinViableSessionSlots,sessionTemplateSequence:fbSessionTemplateSequence,frequencyOverrides});
    const sf2Violated=fullBodyCheck.failures.indexOf("SF2")!==-1;
    if(sf2Violated){
      return {status:"FAILURE",failure:createFailureResult({
        code:"NO_VIABLE_SPLIT",category:FAILURE_CATEGORY.INFEASIBLE,severity:FAILURE_SEVERITY.BLOCKING,
        user_message_key:"split_selection_no_viable_split_full_body_sf2",
        repair_options:["Zeitbudget erhoehen","Trainingstage aendern"],blocking:true,
        retry_semantics:RETRY_SEMANTICS.RETRY_AFTER_USER_DECISION,source_engine:"split-selection",
      })};
    }
    if(fullBodyCheck.failures.indexOf("SF4")!==-1||fullBodyCheck.failures.indexOf("SF5")!==-1){
      return {status:"FAILURE",failure:createFailureResult({
        code:"NO_VIABLE_SPLIT",category:FAILURE_CATEGORY.INFEASIBLE,severity:FAILURE_SEVERITY.BLOCKING,
        user_message_key:"split_selection_no_viable_split_full_body_sf4_sf5",
        repair_options:["Equipment/Ort aendern","Trainingstage aendern"],blocking:true,
        retry_semantics:RETRY_SEMANTICS.RETRY_AFTER_USER_DECISION,source_engine:"split-selection",
      })};
    }
    warnings.push("FULL_BODY_FORCED");
    return {
      status:"NEEDS_VOLUME_ADJUSTMENT",
      warnings,
      splitStructure:createSplitStructure(fullBody,planRequirements,weekdays,fbMinViableSessionSlots,fbSessionTemplateSequence,frequencyOverrides),
      repairRequest:{
        type:"CAP_VOLUME_TARGETS_TO_SESSION_CAPACITY",
        reason:"NO_VIABLE_SPLIT_AFTER_SF3_RELAXATION",
        split_type:"FULL_BODY",
        session_capacity:sessionCapacity,
        note:"Volumenziel-Anpassung ist Aufgabe von STEP 04 (Volume Target Resolution) — dieser Request beschreibt nur den Bedarf, berechnet ihn aber nicht selbst.",
      },
    };
  }

  const scored=survivors.map(s=>scoreSplitCandidate(s,planRequirements,volumeTargets,sessionCapacity,weekdays,externalConfig));
  scored.sort(compareSplitCandidates);
  const winner=scored[0];
  const winnerMinViableSessionSlots=minViableSessionSlotsBySplit?minViableSessionSlotsBySplit[winner.split_type]:undefined;
  const winnerSessionTemplateSequence=requireSessionTemplateSequence(winner.split_type,sessionTemplateSequenceBySplit);
  return {
    status:"OK",
    warnings,
    splitStructure:createSplitStructure(SPLIT_CANDIDATES[winner.split_type],planRequirements,weekdays,winnerMinViableSessionSlots,winnerSessionTemplateSequence,frequencyOverrides),
    scoreBreakdown:winner,
    allScores:scored,
  };
}
function createSplitStructure(splitMeta,planRequirements,weekdays,minViableSessionSlots,sessionTemplateSequence,frequencyOverrides){
  return {
    split_type:splitMeta.split_type,
    training_days_per_week:planRequirements.training_days_per_week,
    training_weekdays:weekdays,
    session_templates:sessionTemplateSequence.map(t=>t.name),
    muscle_frequency:computeMuscleFrequency(splitMeta.split_type,planRequirements.training_days_per_week,frequencyOverrides),
    min_viable_session_slots:minViableSessionSlots,
  };
}

/* ================= §3.2 INVARIANT S-3 — Same-Day-Overlap ================= */
/* TRUE, wenn beide Sessions mindestens einen identischen PRIMARY_HIGH-
   Volume-Muskel ODER dasselbe movement_pattern in einer PRIMARY/SECONDARY-
   Slot-Function belasten. Erzwingt KEINE automatische Fusion — der
   Aufrufer setzt die zweite SessionInstance bei TRUE auf BLOCKED/
   NEEDS_USER_DECISION (siehe Dependency §3.2 S-3), diese Funktion trifft
   nur die reine Feststellung. */
function determineSameDayOverlap(sessionASlotFunctions,sessionBSlotFunctions){
  const primaryHigh=sfs=>{
    const set=new Set();
    (sfs||[]).forEach(sf=>(sf.primary_muscle_bands||[]).forEach(b=>{
      if(b.contribution_band===MUSCLE_CONTRIBUTION_BAND.PRIMARY_HIGH)set.add(b.canonical_volume_muscle_id);
    }));
    return set;
  };
  const primaryOrSecondaryPatterns=sfs=>{
    const set=new Set();
    (sfs||[]).forEach(sf=>{
      if(sf.role===SLOT_ROLE.PRIMARY||sf.role===SLOT_ROLE.SECONDARY)set.add(sf.movement_pattern);
    });
    return set;
  };
  const aMuscles=primaryHigh(sessionASlotFunctions),bMuscles=primaryHigh(sessionBSlotFunctions);
  const sharedMuscle=[...aMuscles].some(m=>bMuscles.has(m));
  const aPatterns=primaryOrSecondaryPatterns(sessionASlotFunctions),bPatterns=primaryOrSecondaryPatterns(sessionBSlotFunctions);
  const sharedPattern=[...aPatterns].some(p=>bPatterns.has(p));
  return sharedMuscle||sharedPattern;
}

if(typeof module!=="undefined" && module.exports){
  module.exports={
    PLAN_GENERATION_PHASES,MAX_PHASE11_TO_PHASE4_REROUTES,
    TIME_CAPACITY_PLANNING_CONFIG,resolvePlanRequirements,resolveSessionCapacity,
    SPLIT_TYPE,SPLIT_CANDIDATES,
    resolveTrainingWeekdays,areWeekdaysConsecutive,computeMuscleFrequency,
    checkSF1,checkSF2,checkSF3,checkSF4,checkSF5,checkSF6,evaluateHardFilters,
    computePeakSessionSets,scoreSP1,scoreSP2,scoreSP3,scoreSP4,scoreSP5,scoreSP6,targetFrequencyFromWeeklyVolume,
    SP_WEIGHTS,scoreSplitCandidate,compareSplitCandidates,
    filterSplitCandidates,selectSplit,createSplitStructure,
    determineSameDayOverlap,
  };
}
