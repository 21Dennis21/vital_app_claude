/* training-plan-engine.js — TRAINING SYSTEM v1.4.1, IMPLEMENTATION PACK
   03/14: Plan Requirements / Plan Generation Pipeline (Grenzen) / Split
   Engine.

   Quelle: 03_PLAN_REQUIREMENTS_SPLIT_ENGINE.md (wortgetreue v1.4.1-
   Auszuege, Primary Scope Master-Zeilen 669-945, plus die dort
   ausdruecklich referenzierten Dependency-Contract-Auszuege §0.2-0.5,
   §4.2, §4.5, §4.6, §5.3, §5.5(Kopf), §17.3, §17.4, §21.6, §23.0).

   ABSICHTLICH NUR DIESER SCOPE:
   - Phase 1 (Requirements Resolution) und Phase 2 (Time Budget
     Resolution/SessionCapacity) sind ECHTE, vollstaendig implementierte
     reine Funktionen.
   - Phase 4 (Split Selection/Split Engine) ist eine ECHTE, vollstaendige
     reine Funktion inkl. SF1-SF6, SP1-SP6, Tie-Breaker und Fallback exakt
     nach §3.
   - Die restlichen 13 Pipeline-Phasen (insbesondere Phase 3 Volume Target
     Resolution) sind ausschliesslich als dokumentierte technische
     Contracts/Grenzen abgebildet (PLAN_GENERATION_PHASES) — NICHT als
     Engine-Logik. Die Split Engine akzeptiert `VolumeTargets` bewusst als
     externen, bereits berechneten Input (Plain-Object `{muscle: fraktionale
     Woechentliche Zielsaetze}`) statt sie selbst zu berechnen — das ist
     Aufgabe von STEP 04. Tests uebergeben dafuer explizite Fixture-Werte.
   - Ebenso wird die Equipment-/Muster-Abdeckung fuer SF5 (haengt an
     Exercise-Catalog-Daten aus TEIL 29, ausserhalb dieses Packs) als
     externer Input `equipmentCoverageBySplit` erwartet, nicht selbst aus
     einem (nicht vorhandenen) Katalog berechnet.

   KORREKTUR AN training-domain.js (siehe dort): PlanSlot.slot_function.
   primary_muscle_bands[] ist jetzt korrekt eine Liste von {canonical_
   volume_muscle_id, contribution_band}-Paaren (§5.3-Exzerpt dieses Packs),
   nicht mehr eine Liste blosser Muskel-ID-Strings — noetig fuer INVARIANT
   S-3 (Same-Day-Overlap, siehe determineSameDayOverlap unten).

   DOKUMENTIERTE INTERPRETATIONEN (siehe STEP-03-Abschlussbericht fuer die
   vollstaendige Begruendung; hier nur die technischen Eckpunkte):
   1. `muscle_frequency_map`/`session_templates` sind pro Split als
      GLEICHFOERMIGER Wert bzw. eine Liste von Muskelkategorie-Labels
      (PUSH/PULL/LEGS/UPPER/LOWER/FULL/PART_A..E) modelliert, mechanisch aus
      Trainingstagen und Template-Zyklus abgeleitet (computeMuscleFrequency)
      — nicht aus einer (hier nicht vorhandenen) Exercise-Catalog-
      Bewegungsmuster-Zuordnung. Fuer 7 von 9 Splits reproduziert diese
      Ableitung den in §3.1 genannten Wert exakt; bei den zwei "Hybrid"-
      Splits (UPPER_LOWER_FULL, PPL_UL_HYBRID) weicht der abgeleitete Wert
      vom dort genannten Richtwert ab, weil dessen exakte Herleitung eine
      granulare Bewegungsmuster-Zuordnung braeuchte, die explizit ausserhalb
      dieses Packs liegt (Exercise Catalog/Exercise Selection).
   2. `min_viable_session_slots` ist nicht explizit numerisch in Paket 03
      angegeben. Es wird deterministisch ueber die bereits in diesem Pack
      exakt spezifizierte §17.3-Formel aus der jeweils UNTEREN Grenze der in
      §3.1 genannten "typischen Sessionlaenge" abgeleitet (Referenzwerte
      goal=HYPERTROPHY, reserve_s=0, actual_session_duration_factor=1.0) —
      mechanisch aus Pack-eigenen Daten, keine freie Zahl.
   3. Wochentagsverteilung: Paket 02 dokumentiert "gleichmaessig verteilt"
      als Default fuer `training_weekdays`, ohne einen Algorithmus zu
      nennen. resolveTrainingWeekdays() implementiert eine deterministische
      Gleichverteilung (Bresenham-artig), verwendet aber immer zuerst
      explizit vom Nutzer gesetzte `training_weekdays`, falls vorhanden.
   4. Muskel-Kategorisierung (PUSH/PULL/LEGS, CORE separat) ist als
      begruendete, dokumentierte Zuordnung der 18 kanonischen Muskel-IDs
      implementiert (SPLIT_TEMPLATE_MUSCLES) — Rumpf (ABS/OBLIQUES) bleibt
      bewusst ausserhalb der Split-Frequenz-Betrachtung, weil §5.5 Punkt 4
      dafuer eine eigene, spaetere Slot-Generation-Regel vorsieht. */

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

/* ================= §3.1 — Split-Kandidatenraum + Metadaten ================= */
/* Muskel-Kategorisierung: siehe Dateikopf-Kommentar Punkt 4. Rumpf (ABS/
   OBLIQUES) bleibt ausserhalb der Split-Frequenz-Betrachtung. */
const SPLIT_TEMPLATE_MUSCLES=Object.freeze({
  PUSH:Object.freeze(["CHEST","FRONT_DELT","SIDE_DELT","TRICEPS"]),
  PULL:Object.freeze(["LATS","UPPER_BACK","REAR_DELT","BICEPS","FOREARM","LOWER_BACK"]),
  LEGS:Object.freeze(["QUADS","HAMSTRINGS","GLUTES","ADDUCTORS","ABDUCTORS","CALVES"]),
  UPPER:Object.freeze(["CHEST","FRONT_DELT","SIDE_DELT","TRICEPS","LATS","UPPER_BACK","REAR_DELT","BICEPS","FOREARM","LOWER_BACK"]),
  LOWER:Object.freeze(["QUADS","HAMSTRINGS","GLUTES","ADDUCTORS","ABDUCTORS","CALVES"]),
  FULL:Object.freeze(["CHEST","FRONT_DELT","SIDE_DELT","TRICEPS","LATS","UPPER_BACK","REAR_DELT","BICEPS","FOREARM","LOWER_BACK","QUADS","HAMSTRINGS","GLUTES","ADDUCTORS","ABDUCTORS","CALVES"]),
  PART_A:Object.freeze(["CHEST"]),
  PART_B:Object.freeze(["LATS","UPPER_BACK","LOWER_BACK"]),
  PART_C:Object.freeze(["FRONT_DELT","SIDE_DELT","REAR_DELT"]),
  PART_D:Object.freeze(["BICEPS","TRICEPS","FOREARM"]),
  PART_E:Object.freeze(["QUADS","HAMSTRINGS","GLUTES","ADDUCTORS","ABDUCTORS","CALVES"]),
});
const SPLIT_GOVERNED_MUSCLES=Object.freeze(SPLIT_TEMPLATE_MUSCLES.FULL.slice());

function deriveMinViableSessionSlots(typicalSessionLengthMinLowerBound){
  const result=resolveSessionCapacity({session_time_budget_min:typicalSessionLengthMinLowerBound,reserve_s:0,goal:"HYPERTROPHY",actual_session_duration_factor:1.0});
  return result.status==="OK"?result.sessionCapacity.max_slots:2;
}

const SPLIT_TYPE=Object.freeze({
  FULL_BODY:"FULL_BODY",UPPER_LOWER:"UPPER_LOWER",UPPER_LOWER_FULL:"UPPER_LOWER_FULL",
  PUSH_PULL:"PUSH_PULL",PPL:"PPL",PPL_X2:"PPL_X2",PPL_UL_HYBRID:"PPL_UL_HYBRID",
  UPPER_LOWER_X3:"UPPER_LOWER_X3",BODY_PART_SPLIT:"BODY_PART_SPLIT",
});

const SPLIT_CANDIDATES=Object.freeze({
  FULL_BODY:Object.freeze({split_type:"FULL_BODY",valid_training_days:Object.freeze([2,3,4]),session_templates:Object.freeze(["FULL"]),typical_session_length_min:Object.freeze({min:45,max:90}),min_viable_session_slots:deriveMinViableSessionSlots(45)}),
  UPPER_LOWER:Object.freeze({split_type:"UPPER_LOWER",valid_training_days:Object.freeze([2,4]),session_templates:Object.freeze(["UPPER","LOWER"]),typical_session_length_min:Object.freeze({min:45,max:75}),min_viable_session_slots:deriveMinViableSessionSlots(45)}),
  UPPER_LOWER_FULL:Object.freeze({split_type:"UPPER_LOWER_FULL",valid_training_days:Object.freeze([3]),session_templates:Object.freeze(["UPPER","LOWER","FULL"]),typical_session_length_min:Object.freeze({min:50,max:75}),min_viable_session_slots:deriveMinViableSessionSlots(50)}),
  PUSH_PULL:Object.freeze({split_type:"PUSH_PULL",valid_training_days:Object.freeze([4]),session_templates:Object.freeze(["PUSH","PULL"]),typical_session_length_min:Object.freeze({min:45,max:70}),min_viable_session_slots:deriveMinViableSessionSlots(45)}),
  PPL:Object.freeze({split_type:"PPL",valid_training_days:Object.freeze([3]),session_templates:Object.freeze(["PUSH","PULL","LEGS"]),typical_session_length_min:Object.freeze({min:60,max:90}),min_viable_session_slots:deriveMinViableSessionSlots(60)}),
  PPL_X2:Object.freeze({split_type:"PPL_X2",valid_training_days:Object.freeze([6]),session_templates:Object.freeze(["PUSH","PULL","LEGS"]),typical_session_length_min:Object.freeze({min:40,max:70}),min_viable_session_slots:deriveMinViableSessionSlots(40)}),
  PPL_UL_HYBRID:Object.freeze({split_type:"PPL_UL_HYBRID",valid_training_days:Object.freeze([5]),session_templates:Object.freeze(["PUSH","PULL","LEGS","UPPER","LOWER"]),typical_session_length_min:Object.freeze({min:50,max:80}),min_viable_session_slots:deriveMinViableSessionSlots(50)}),
  UPPER_LOWER_X3:Object.freeze({split_type:"UPPER_LOWER_X3",valid_training_days:Object.freeze([6]),session_templates:Object.freeze(["UPPER","LOWER"]),typical_session_length_min:Object.freeze({min:40,max:60}),min_viable_session_slots:deriveMinViableSessionSlots(40)}),
  BODY_PART_SPLIT:Object.freeze({split_type:"BODY_PART_SPLIT",valid_training_days:Object.freeze([5]),session_templates:Object.freeze(["PART_A","PART_B","PART_C","PART_D","PART_E"]),typical_session_length_min:Object.freeze({min:50,max:80}),min_viable_session_slots:deriveMinViableSessionSlots(50)}),
});
/* DECISION (§3.4-Kommentar): BODY_PART_SPLIT bleibt ein zulaessiger
   Kandidat und wird NICHT per Hard Filter ausgeschlossen — siehe SF1-SF6
   unten: keiner davon nennt BODY_PART_SPLIT explizit. */

/* ================= Wochentagsverteilung (siehe Dateikopf Punkt 3) ================= */
function resolveTrainingWeekdays(trainingDaysPerWeek,explicitWeekdays){
  if(explicitWeekdays&&explicitWeekdays.length===trainingDaysPerWeek){
    return explicitWeekdays.slice().sort((a,b)=>a-b);
  }
  const days=[];
  for(let i=0;i<trainingDaysPerWeek;i++){
    const wd=Math.round(i*7/trainingDaysPerWeek)%7;
    if(days.indexOf(wd)===-1)days.push(wd);
  }
  return days.sort((a,b)=>a-b);
}
function areWeekdaysConsecutive(a,b){
  const diff=Math.abs(a-b);
  return diff===1||diff===6;
}

/* ================= Muskelfrequenz (siehe Dateikopf Punkt 1) ================= */
/* Fuer die 2 dokumentierten Hybrid-Faelle liegt kein aus Templates
   mechanisch ableitbarer Einzelwert vor (siehe Dateikopf) — hier wird der
   in §3.1 genannte Wert (bzw. bei einer Spanne deren Mittelwert) direkt
   uebernommen, alle anderen 7 Splits werden aus training_days/Template-
   Anzahl abgeleitet (reproduziert den §3.1-Wert exakt bei deren
   kanonischer Tageszahl). */
const HYBRID_FREQUENCY_OVERRIDES=Object.freeze({UPPER_LOWER_FULL:1.67,PPL_UL_HYBRID:1.8});
function computeMuscleFrequency(splitType,trainingDays){
  if(HYBRID_FREQUENCY_OVERRIDES[splitType]!==undefined)return HYBRID_FREQUENCY_OVERRIDES[splitType];
  const meta=SPLIT_CANDIDATES[splitType];
  return trainingDays/meta.session_templates.length;
}

/* ================= §3.2 — Hard Filters SF1-SF6 ================= */
/* INVARIANT S-1: ein Split, der SF1-SF6 verletzt, wird nie gewaehlt — auch
   nicht als Fallback, auch nicht bei Nutzerpraeferenz. SF4/SF5 werden in
   keiner Fallback-Stufe gelockert (INVARIANT S-2). Nur SF3 darf in der
   Fallback-Stufe 1 von 12 auf 16 gelockert werden (sessionCapSets-Param). */
function checkSF1(splitMeta,trainingDays){
  return splitMeta.valid_training_days.indexOf(trainingDays)!==-1;
}
function checkSF2(splitMeta,sessionCapacity){
  return splitMeta.min_viable_session_slots<=sessionCapacity.max_slots;
}
function checkSF3(splitMeta,trainingDays,volumeTargets,sessionCapSets){
  const freq=computeMuscleFrequency(splitMeta.split_type,trainingDays);
  return SPLIT_GOVERNED_MUSCLES.every(m=>{
    const weeklyTarget=volumeTargets[m];
    if(weeklyTarget==null)return true;
    return (weeklyTarget/freq)<=sessionCapSets;
  });
}
function checkSF4(splitMeta,trainingDays,weekdays,volumeTargets){
  const freq=computeMuscleFrequency(splitMeta.split_type,trainingDays);
  const templates=splitMeta.session_templates;
  const T=templates.length;
  const dayTemplates=weekdays.map((wd,i)=>({weekday:wd,category:templates[i%T]}));
  for(let i=0;i<dayTemplates.length;i++){
    for(let j=i+1;j<dayTemplates.length;j++){
      if(!areWeekdaysConsecutive(dayTemplates[i].weekday,dayTemplates[j].weekday))continue;
      const musclesA=SPLIT_TEMPLATE_MUSCLES[dayTemplates[i].category];
      const musclesB=SPLIT_TEMPLATE_MUSCLES[dayTemplates[j].category];
      const shared=musclesA.filter(m=>musclesB.indexOf(m)!==-1);
      for(const m of shared){
        const weeklyTarget=volumeTargets[m];
        if(weeklyTarget==null)continue;
        if((weeklyTarget/freq)>=10)return false;
      }
    }
  }
  return true;
}
function checkSF5(splitMeta,equipmentCoverageBySplit){
  const coverage=equipmentCoverageBySplit?equipmentCoverageBySplit[splitMeta.split_type]:undefined;
  if(coverage==null)throw new Error("training-plan-engine: equipmentCoverageBySplit["+splitMeta.split_type+"] fehlt — SF5 erfordert eine Equipment-/Muster-Abdeckungsquote aus dem (in diesem Pack nicht vorhandenen) Exercise-Catalog-Kontext; muss vom Aufrufer explizit uebergeben werden");
  return coverage>=0.6;
}
function checkSF6(splitMeta,trainingDays,volumeTargets){
  const freq=computeMuscleFrequency(splitMeta.split_type,trainingDays);
  return Object.keys(volumeTargets).every(m=>{
    if(SPLIT_GOVERNED_MUSCLES.indexOf(m)===-1)return true;
    return freq>=1;
  });
}
/* Wertet alle 6 Hard Filters aus. sessionCapSets ist der SF3-Parameter
   (12 normal, 16 in Fallback-Stufe 1 — §3.5). */
function evaluateHardFilters(splitMeta,ctx){
  const {trainingDays,weekdays,volumeTargets,sessionCapacity,equipmentCoverageBySplit,sessionCapSets}=ctx;
  const failures=[];
  if(!checkSF1(splitMeta,trainingDays))failures.push("SF1");
  if(!checkSF2(splitMeta,sessionCapacity))failures.push("SF2");
  if(!checkSF3(splitMeta,trainingDays,volumeTargets,sessionCapSets))failures.push("SF3");
  if(!checkSF4(splitMeta,trainingDays,weekdays,volumeTargets))failures.push("SF4");
  if(!checkSF5(splitMeta,equipmentCoverageBySplit))failures.push("SF5");
  if(!checkSF6(splitMeta,trainingDays,volumeTargets))failures.push("SF6");
  return {pass:failures.length===0,failures};
}

/* ================= §3.3 — Soft Score SP1-SP6 (Summe 100) ================= */
function computePeakSessionSets(splitMeta,trainingDays,weekdays,volumeTargets){
  const freq=computeMuscleFrequency(splitMeta.split_type,trainingDays);
  const templates=splitMeta.session_templates;
  const T=templates.length;
  let peak=0;
  weekdays.forEach((wd,i)=>{
    const category=templates[i%T];
    const muscles=SPLIT_TEMPLATE_MUSCLES[category];
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
function scoreSP2(splitMeta,goal,trainingDays,volumeTargets){
  const freq=computeMuscleFrequency(splitMeta.split_type,trainingDays);
  if(goal===TRAINING_GOAL.STRENGTH){
    /* §4.6: fuer STRENGTH ist die >=2-Exposure-Praeferenz ausschliesslich
       P5-Optimierung, "1 Exposure/Woche bleibt gueltig und erzeugt weder
       ERROR noch INFEASIBLE" und "fehlende Machbarkeit erzeugt keinen
       Hard-Malus" — es gibt keinen im Pack genannten Punktwert fuer diese
       Praeferenz, daher: volle Punktzahl, solange ueberhaupt mindestens 1
       Exposure erreicht wird (durch SF6 fuer jeden survivinerenden
       Kandidaten ohnehin garantiert). */
    return freq>=1?100:0;
  }
  const muscles=Object.keys(volumeTargets).filter(m=>SPLIT_GOVERNED_MUSCLES.indexOf(m)!==-1);
  if(!muscles.length)return 100;
  const scores=muscles.map(m=>{
    const targetFreq=targetFrequencyFromWeeklyVolume(volumeTargets[m]);
    const levelDiff=Math.abs(Math.round(freq)-targetFreq);
    return Math.max(0,Math.min(100,100-25*levelDiff));
  });
  return scores.reduce((a,b)=>a+b,0)/scores.length;
}
function scoreSP4(splitMeta,trainingDays,priorityMuscles){
  if(!priorityMuscles||!priorityMuscles.length)return 100;
  const freq=computeMuscleFrequency(splitMeta.split_type,trainingDays);
  const perMuscle=freq>=2?100:(freq>=1?60:30);
  return Math.min.apply(null,priorityMuscles.map(()=>perMuscle));
}
function computeMuscleExposureWeekdays(splitMeta,weekdays,muscleId){
  const templates=splitMeta.session_templates;
  const T=templates.length;
  const exposureDays=[];
  weekdays.forEach((wd,i)=>{
    const category=templates[i%T];
    if(SPLIT_TEMPLATE_MUSCLES[category].indexOf(muscleId)!==-1)exposureDays.push(wd);
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
function scoreSP5(splitMeta,weekdays,volumeTargets){
  const muscles=Object.keys(volumeTargets).filter(m=>SPLIT_GOVERNED_MUSCLES.indexOf(m)!==-1);
  if(!muscles.length)return 100;
  const scores=muscles.map(m=>{
    const exposureDays=computeMuscleExposureWeekdays(splitMeta,weekdays,m);
    const hours=averageGapHours(exposureDays);
    return hours==null?100:gapHoursToScore(hours);
  });
  return scores.reduce((a,b)=>a+b,0)/scores.length;
}
const SP6_BEGINNER_UNSUITABLE_SPLITS=Object.freeze(["PPL","BODY_PART_SPLIT","PPL_X2"]);
function scoreSP6(splitMeta,preferredSplit,experienceLevel){
  let score=50;
  if(preferredSplit&&preferredSplit===splitMeta.split_type)score+=40;
  if(experienceLevel===EXPERIENCE_LEVEL.BEGINNER&&SP6_BEGINNER_UNSUITABLE_SPLITS.indexOf(splitMeta.split_type)!==-1)score-=20;
  return Math.max(0,Math.min(100,score));
}
const SP_WEIGHTS=Object.freeze({SP1:30,SP2:20,SP3:20,SP4:12,SP5:10,SP6:8});
function scoreSplitCandidate(splitMeta,planRequirements,volumeTargets,sessionCapacity,weekdays){
  const trainingDays=planRequirements.training_days_per_week;
  const peakSets=computePeakSessionSets(splitMeta,trainingDays,weekdays,volumeTargets);
  const estimatedPeakSessionS=peakSets*sessionCapacity.burdened_set_s;
  const sp1=scoreSP1(peakSets,sessionCapacity.max_working_sets);
  const sp2=scoreSP2(splitMeta,planRequirements.goal,trainingDays,volumeTargets);
  const sp3=scoreSP3(estimatedPeakSessionS,sessionCapacity.brutto_budget_s);
  const sp4=scoreSP4(splitMeta,trainingDays,planRequirements.priority_muscles);
  const sp5=scoreSP5(splitMeta,weekdays,volumeTargets);
  const sp6=scoreSP6(splitMeta,planRequirements.preferred_split,planRequirements.experience_level);
  const total=(sp1*SP_WEIGHTS.SP1+sp2*SP_WEIGHTS.SP2+sp3*SP_WEIGHTS.SP3+sp4*SP_WEIGHTS.SP4+sp5*SP_WEIGHTS.SP5+sp6*SP_WEIGHTS.SP6)/100;
  const frequency=computeMuscleFrequency(splitMeta.split_type,trainingDays);
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
function filterSplitCandidates(planRequirements,volumeTargets,sessionCapacity,equipmentCoverageBySplit,weekdays,sessionCapSets){
  const ctx={trainingDays:planRequirements.training_days_per_week,weekdays,volumeTargets,sessionCapacity,equipmentCoverageBySplit,sessionCapSets};
  return Object.keys(SPLIT_CANDIDATES).filter(k=>evaluateHardFilters(SPLIT_CANDIDATES[k],ctx).pass).map(k=>SPLIT_CANDIDATES[k]);
}
/* Phase 4 — Split Selection (Split Engine). INPUT: PlanRequirements,
   VolumeTargets (externer, in STEP 04 zu berechnender Input),
   SessionCapacity, equipmentCoverageBySplit (externer, an den (hier nicht
   vorhandenen) Exercise-Catalog gebundener Input, Map split_type->0..1).
   OUTPUT: {status:"OK", splitStructure, warnings[]} | {status:"FAILURE",
   failure} | {status:"NEEDS_VOLUME_ADJUSTMENT", repairRequest, warnings[]}
   (letzteres ist der in §3.5 Schritt 2 geforderte strukturierte Fallback-/
   Repair-Request an STEP 04, statt selbst Volumenziele zu erfinden). */
function selectSplit(planRequirements,volumeTargets,sessionCapacity,equipmentCoverageBySplit){
  if(!planRequirements)throw new Error("training-plan-engine: selectSplit benoetigt PlanRequirements");
  if(!volumeTargets)throw new Error("training-plan-engine: selectSplit benoetigt VolumeTargets (externer Input, siehe STEP 04)");
  if(!sessionCapacity)throw new Error("training-plan-engine: selectSplit benoetigt SessionCapacity");
  const weekdays=resolveTrainingWeekdays(planRequirements.training_days_per_week,planRequirements.training_weekdays);
  const warnings=[];

  let survivors=filterSplitCandidates(planRequirements,volumeTargets,sessionCapacity,equipmentCoverageBySplit,weekdays,12);
  if(!survivors.length){
    // Fallback Stufe 1: SF3 auf 16 lockern (SF4/SF5 NIE gelockert — INVARIANT S-2).
    survivors=filterSplitCandidates(planRequirements,volumeTargets,sessionCapacity,equipmentCoverageBySplit,weekdays,16);
    if(survivors.length)warnings.push("SF3_RELAXED_TO_16");
  }
  if(!survivors.length){
    // Fallback Stufe 2: FULL_BODY erzwingen (SF4/SF5 weiterhin ungelockert
    // gegen FULL_BODY selbst geprueft), Volumenziele an Capacity anpassen
    // ist STEP-04-Aufgabe -> strukturierter Repair-Request statt Erfindung.
    const fullBody=SPLIT_CANDIDATES.FULL_BODY;
    const fullBodyCheck=evaluateHardFilters(fullBody,{trainingDays:planRequirements.training_days_per_week,weekdays,volumeTargets,sessionCapacity,equipmentCoverageBySplit,sessionCapSets:16});
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
      splitStructure:createSplitStructure(fullBody,planRequirements,weekdays),
      repairRequest:{
        type:"CAP_VOLUME_TARGETS_TO_SESSION_CAPACITY",
        reason:"NO_VIABLE_SPLIT_AFTER_SF3_RELAXATION",
        split_type:"FULL_BODY",
        session_capacity:sessionCapacity,
        note:"Volumenziel-Anpassung ist Aufgabe von STEP 04 (Volume Target Resolution) — dieser Request beschreibt nur den Bedarf, berechnet ihn aber nicht selbst.",
      },
    };
  }

  const scored=survivors.map(s=>scoreSplitCandidate(s,planRequirements,volumeTargets,sessionCapacity,weekdays));
  scored.sort(compareSplitCandidates);
  const winner=scored[0];
  return {
    status:"OK",
    warnings,
    splitStructure:createSplitStructure(SPLIT_CANDIDATES[winner.split_type],planRequirements,weekdays),
    scoreBreakdown:winner,
    allScores:scored,
  };
}
function createSplitStructure(splitMeta,planRequirements,weekdays){
  return {
    split_type:splitMeta.split_type,
    training_days_per_week:planRequirements.training_days_per_week,
    training_weekdays:weekdays,
    session_templates:splitMeta.session_templates.slice(),
    muscle_frequency:computeMuscleFrequency(splitMeta.split_type,planRequirements.training_days_per_week),
    min_viable_session_slots:splitMeta.min_viable_session_slots,
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
    SPLIT_TYPE,SPLIT_CANDIDATES,SPLIT_TEMPLATE_MUSCLES,SPLIT_GOVERNED_MUSCLES,
    resolveTrainingWeekdays,areWeekdaysConsecutive,computeMuscleFrequency,
    checkSF1,checkSF2,checkSF3,checkSF4,checkSF5,checkSF6,evaluateHardFilters,
    computePeakSessionSets,scoreSP1,scoreSP2,scoreSP3,scoreSP4,scoreSP5,scoreSP6,targetFrequencyFromWeeklyVolume,
    SP_WEIGHTS,scoreSplitCandidate,compareSplitCandidates,
    filterSplitCandidates,selectSplit,createSplitStructure,
    determineSameDayOverlap,
  };
}
