/* training-domain.test.js — Tests fuer training-domain.js (TRAINING SYSTEM
   v1.4.1, IMPLEMENTATION PACK 01/14: Foundation/Core Types/Datenmodell).

   Deckt ab: P0-P7-Prioritaetsrahmen, EvaluationContext/Determinismus
   (kanonische Ereignisreihenfolge inkl. aller Tie-Breaks), Confidence-
   Modell, §0.5-Rundungsregeln, §9.1 load_axis_class-Ableitung,
   FailureResult, alle TEIL-23-Entity-Fabriken (Pflichtfeld-Validierung +
   vollstaendige Feld-Uebernahme), WorkoutLog-Korrektur-Projektion
   (PATCH_FIELD/DELETE_SET/INSERT_SET/VOID_AND_REPLACE), Bodyweight-Replay-
   Contract, Mutation-Idempotenz. */
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

console.log("========== 0.2 Prioritaetshierarchie (P0-P7) ==========");
{
  assertEq(TD.PRIORITY_ORDER,["P0","P1","P2","P3","P4","P5","P6","P7"],"Kanonische Reihenfolge P0..P7");
  assert(TD.comparePriority("P0","P1")<0,"P0 rangiert vor P1");
  assert(TD.comparePriority("P3","P4")<0,"P3 (Zeit) rangiert vor P4 (Slot-Funktion) — 0.2 DECISION");
  assert(TD.comparePriority("P3","P6")<0,"P3 (Zeit) rangiert vor P6 (Volumen) — 0.2 DECISION");
  assert(TD.isUnviolablePriority("P0")&&TD.isUnviolablePriority("P1")&&TD.isUnviolablePriority("P2"),"P0-P2 sind 'nie verletzbar'");
  assert(!TD.isUnviolablePriority("P3")&&!TD.isUnviolablePriority("P7"),"P3.. sind nicht als unverletzbar markiert");
  assertEq(TD.PRIORITY_LEVELS.P0.violable,"Nie","P0.violable exakt uebernommen");
  assertEq(TD.PRIORITY_LEVELS.P7.violable,"Ja, mit Hinweis","P7.violable exakt uebernommen");
}

console.log("========== 0.3 EvaluationContext / Determinismus ==========");
{
  const ctx=TD.createEvaluationContext({evaluation_at:new Date(2026,7,15),user_timezone:"Europe/Berlin",config_version:1,catalog_version:1,source_event_revision:7});
  assertEq(ctx.plan_version_id,null,"plan_version_id defaultet auf null, nicht erfunden");
  assertEq(ctx.equipment_profile_versions,[],"equipment_profile_versions defaultet auf leeres Array");
  assertThrows(()=>TD.createEvaluationContext({user_timezone:"Europe/Berlin",config_version:1,catalog_version:1,source_event_revision:7}),"EvaluationContext ohne evaluation_at wirft (kein verstecktes now())");

  // Kanonische Ereignisreihenfolge: 1. effective_at/performed_at, 2. recorded_at, 3. event_id lexikografisch
  const a={effective_at:new Date(2026,0,1),recorded_at:new Date(2026,0,2),event_id:"b"};
  const b={effective_at:new Date(2026,0,1),recorded_at:new Date(2026,0,2),event_id:"a"};
  assert(TD.compareEventOrder(b,a)<0,"Bei identischem effective_at/recorded_at entscheidet die lexikografische event_id (G-D2)");
  const c={effective_at:new Date(2026,0,1),recorded_at:new Date(2026,0,1),event_id:"z"};
  const d={effective_at:new Date(2026,0,1),recorded_at:new Date(2026,0,3),event_id:"a"};
  assert(TD.compareEventOrder(c,d)<0,"Bei identischem effective_at entscheidet recorded_at vor event_id");
  const e={effective_at:new Date(2026,0,1),recorded_at:new Date(2026,0,5),event_id:"z"};
  const f={effective_at:new Date(2026,0,2),recorded_at:new Date(2026,0,1),event_id:"a"};
  assert(TD.compareEventOrder(e,f)<0,"effective_at hat oberste Prioritaet vor recorded_at");
  // G-D2: Einfuegereihenfolge in der 'Datenbank' (Array) darf kein Ergebnis beeinflussen
  const shuffled=[d,c].sort(TD.compareEventOrder);
  const shuffled2=[c,d].sort(TD.compareEventOrder);
  assertEq(shuffled.map(x=>x.event_id),shuffled2.map(x=>x.event_id),"Sortierergebnis ist unabhaengig von der Ausgangsreihenfolge (G-D2)");
  // performed_at als Fallback, wenn effective_at fehlt
  const g={performed_at:new Date(2026,0,1),recorded_at:new Date(2026,0,1),event_id:"a"};
  const h={performed_at:new Date(2026,0,2),recorded_at:new Date(2026,0,1),event_id:"a"};
  assert(TD.compareEventOrder(g,h)<0,"performed_at wird verwendet, wenn effective_at fehlt");
}

console.log("========== 0.4 Confidence-Modell ==========");
{
  assertEq(TD.CONFIDENCE_ORDER,["NONE","LOW","MEDIUM","HIGH"],"Kanonische Confidence-Reihenfolge");
  assert(TD.compareConfidence("NONE","LOW")<0,"NONE < LOW");
  assert(TD.compareConfidence("HIGH","MEDIUM")>0,"HIGH > MEDIUM");
}

console.log("========== 0.5 Keine falsche Praezision (Rundung) ==========");
{
  assertEq(TD.roundVolumeToHalfSet(3.24),3,"Volumen auf 0.5 Saetze gerundet (3.24 -> 3)");
  assertEq(TD.roundVolumeToHalfSet(3.26),3.5,"Volumen auf 0.5 Saetze gerundet (3.26 -> 3.5)");
  assertEq(TD.roundToAvailableSteps(23,[10,20,25,30],"nearest"),25,"Naechstgelegene verfuegbare Stufe (23 -> 25)");
  assertEq(TD.roundToAvailableSteps(23,[10,20,25,30],"down"),20,"Konservativ abgerundete Stufe (23 -> 20)");
  assertEq(TD.roundToAvailableSteps(23,[10,20,25,30],"up"),25,"Aufgerundete Stufe (23 -> 25)");
  assertEq(TD.roundToAvailableSteps(5,[10,20],"down"),10,"Unterhalb aller Stufen: niedrigste Stufe als Fallback");
  assertEq(TD.roundToAvailableSteps(50,[10,20],"up"),20,"Oberhalb aller Stufen: hoechste Stufe als Fallback");
  assertEq(TD.roundToAvailableSteps(23,[],"nearest"),23,"Keine verfuegbaren Stufen: Originalwert unveraendert");
  const span=TD.roundTimeSpanMinutes(60,0.12,5);
  assertEq(span,{lo:55,hi:65},"Zeitspanne +-12% auf 5 Minuten gerundet (60min -> 55-65)");
}

console.log("========== §9.1 load_axis_class ==========");
{
  assertEq(TD.loadAxisClass("PLATE_LOADABLE_FREE_WEIGHT"),"NUMERIC_EXTERNAL_LOAD","Freihantel -> NUMERIC_EXTERNAL_LOAD");
  assertEq(TD.loadAxisClass("DUMBBELL_DISCRETE"),"NUMERIC_EXTERNAL_LOAD","Kurzhantel -> NUMERIC_EXTERNAL_LOAD");
  assertEq(TD.loadAxisClass("SELECTORIZED_STACK"),"NUMERIC_EXTERNAL_LOAD","Stack-Maschine -> NUMERIC_EXTERNAL_LOAD");
  assertEq(TD.loadAxisClass("ASSISTANCE_INVERSE"),"ASSISTANCE_INVERSE","Assistance -> ASSISTANCE_INVERSE");
  assertEq(TD.loadAxisClass("BODYWEIGHT_PLUS_EXTERNAL"),"BODYWEIGHT_PLUS_EXTERNAL","BW+Extern -> BODYWEIGHT_PLUS_EXTERNAL");
  assertEq(TD.loadAxisClass("BAND_ORDINAL"),"BAND_ORDINAL","Band ordinal -> BAND_ORDINAL");
  assertEq(TD.loadAxisClass("BAND_ASSISTANCE"),"BAND_ORDINAL","Band-Assistance -> ebenfalls BAND_ORDINAL");
  assertEq(TD.loadAxisClass("BODYWEIGHT_OR_REP_ONLY",true),"VARIANT_PROGRESSIVE","BW/Rep-only MIT variant_chain -> VARIANT_PROGRESSIVE");
  assertEq(TD.loadAxisClass("BODYWEIGHT_OR_REP_ONLY",false),"BODYWEIGHT_REP_ONLY","BW/Rep-only OHNE variant_chain -> BODYWEIGHT_REP_ONLY");
  assertEq(TD.loadAxisClass("NO_EXTERNAL_LOAD"),"NON_REP","Kein externes Load -> NON_REP");
  assertEq(TD.loadAxisClass("UNKNOWN_MECHANISM"),"NON_REP","Unbekannter Mechanismus faellt sicher auf NON_REP zurueck");
  // STEP-05-Korrektur: INSTANCE_DEFINED_MACHINE (in Pack 05s eigener
  // Baseline Catalog B durchgaengig verwendet, aber im §9.1-Dependency-
  // Exzerpt fehlend) ist jetzt Teil der Registry und loest als
  // NUMERIC_EXTERNAL_LOAD auf (siehe training-domain.js-Kommentar).
  assert(TD.LOAD_MECHANISM_REGISTRY.indexOf("INSTANCE_DEFINED_MACHINE")!==-1,"LOAD_MECHANISM_REGISTRY enthaelt INSTANCE_DEFINED_MACHINE (STEP-05-Korrektur)");
  assertEq(TD.loadAxisClass("INSTANCE_DEFINED_MACHINE"),"NUMERIC_EXTERNAL_LOAD","INSTANCE_DEFINED_MACHINE -> NUMERIC_EXTERNAL_LOAD (dieselbe Semantik wie PLATE_LOADED_MACHINE)");
}

console.log("========== FailureResult ==========");
{
  const fr=TD.createFailureResult({code:"V19",category:TD.FAILURE_CATEGORY.BLOCKING,severity:TD.FAILURE_SEVERITY.BLOCKING,user_message_key:"rest_too_short",blocking:true,source_engine:"validation"});
  assertEq(fr.retry_semantics,"NONE","retry_semantics defaultet auf NONE");
  assertEq(fr.repair_options,[],"repair_options defaultet auf leeres Array");
  assertThrows(()=>TD.createFailureResult({code:"V19"}),"FailureResult ohne Pflichtfelder wirft");
}

console.log("========== TEIL 23 Entity-Fabriken: Pflichtfelder + vollstaendige Feldliste ==========");
/* Datengetriebene Pruefung fuer alle Fabriken: (1) fehlt ein Pflichtfeld,
   wird geworfen; (2) bei vollstaendigem, minimalem Input enthaelt das
   Ergebnis GENAU die dokumentierten Feldnamen (keine vergessenen, keine
   erfundenen Zusatzfelder). */
const ENTITY_CASES=[
  {name:"ExerciseDefinitionVersion",factory:TD.createExerciseDefinitionVersion,
    input:{exercise_id:"ex1",canonical_name:"Bench Press",definition_version:1,status:"ACTIVE",movement_pattern:"HORIZONTAL_PRESS",exercise_class:"COMPOUND",instance_relevance:"HIGH",calibration_mode:"STANDARD",technical_demand:3,stability_demand:2,mobility_demand:2,setup_complexity:2,fatigue_local:3,fatigue_systemic:3,setup_time_class:"FAST",unilateral_time_class:"N_A",warmup_protocol_class:"STANDARD",progression_ceiling_behavior:"NONE",auto_selectable:true,metadata_completeness:"COMPLETE"},
    expectedKeys:["exercise_id","canonical_name","aliases","definition_version","status","movement_pattern","movement_subpattern","primary_muscle_bands","secondary_muscle_bands","anatomy_tags","subregion_tags","stabilizer_tags","exercise_class","laterality_modes","supported_slot_roles","equipment_setups","possible_load_mechanisms","instance_relevance","goal_compatibility","supported_rep_characters","rep_band_classes","progression_capabilities","calibration_mode","technical_demand","stability_demand","mobility_demand","setup_complexity","fatigue_local","fatigue_systemic","setup_time_class","unilateral_time_class","warmup_protocol_class","bodyweight_assistance_semantics","progression_ceiling_behavior","auto_selectable","metadata_completeness","animation_id","laterality_animation_mode","equipment_visual_id","setup_variant_id"]},
  {name:"ExerciseSetupVariant",factory:TD.createExerciseSetupVariant,input:{id:"esv1",exercise_id:"ex1",definition_version:1,name:"Wide Grip",history_identity_effect:"NONE"},expectedKeys:["id","exercise_id","definition_version","name","capability_overrides","technique_tags","history_identity_effect"]},
  {name:"ExerciseSetup",factory:TD.createExerciseSetup,input:{id:"es1",exercise_definition_version_id:"ex1",load_mechanism:"PLATE_LOADABLE_FREE_WEIGHT",load_profile_selector:"default",instance_relevance:"HIGH"},expectedKeys:["id","exercise_definition_version_id","predicates","load_mechanism","load_profile_selector","instance_relevance"]},
  {name:"ResolvedSetupBinding",factory:TD.createResolvedSetupBinding,input:{id:"rsb1",exercise_setup_id:"es1",location_id:"loc1",capability_snapshot:{},load_semantics_snapshot:{},resolved_at:"2026-08-15T00:00:00Z",source_equipment_profile_version_id:"epv1"},expectedKeys:["id","exercise_setup_id","location_id","equipment_instance_ids","attachment_instance_ids","load_bearing_instance_id","load_profile_version_id","station_group_ids","capability_snapshot","load_semantics_snapshot","resolved_at","source_equipment_profile_version_id"]},
  {name:"ExerciseRelation",factory:TD.createExerciseRelation,input:{from_cluster:"c1",to_cluster:"c2",factor:0.9,sample_confidence:"MEDIUM"},expectedKeys:["from_cluster","to_cluster","factor","sample_confidence"]},
  {name:"CuratedSubstituteGroup",factory:TD.createCuratedSubstituteGroup,input:{id:"csg1"},expectedKeys:["id","exercise_ids"]},
  {name:"CuratedVeto",factory:TD.createCuratedVeto,input:{from_exercise_id:"ex1",to_exercise_id:"ex2",reason:"contraindicated"},expectedKeys:["from_exercise_id","to_exercise_id","reason"]},
  {name:"EquipmentDefinitionVersion",factory:TD.createEquipmentDefinitionVersion,input:{id:"edv1",version:1,canonical_name:"Barbell",family:"FREE_WEIGHT",subtype:"OLYMPIC_BAR",status:"ACTIVE"},expectedKeys:["id","version","canonical_name","family","subtype","machine_functional_subtype","default_capability_schema","status"]},
  {name:"EquipmentInstance",factory:TD.createEquipmentInstance,input:{id:"ei1",location_id:"loc1",equipment_definition_version_id:"edv1",inventory_state:"PRESENT"},expectedKeys:["id","location_id","equipment_definition_version_id","inventory_state","capability_values","load_profile_version_id","manufacturer","model_name","equivalence_group_id","station_group_id"]},
  {name:"AttachmentInstance",factory:TD.createAttachmentInstance,input:{id:"ai1",location_id:"loc1",equipment_definition_version_id:"edv1",inventory_state:"PRESENT"},expectedKeys:["id","location_id","equipment_definition_version_id","capability_values","inventory_state"]},
  {name:"EquipmentProfileVersion",factory:TD.createEquipmentProfileVersion,input:{id:"epv1",location_id:"loc1",version:1,created_at:"2026-08-15T00:00:00Z"},expectedKeys:["id","location_id","version","equipment_instance_ids","created_at"]},
  {name:"CapabilityPredicate",factory:TD.createCapabilityPredicate,input:{namespace:"rack",operator:"EQ",value:true},expectedKeys:["namespace","operator","value"]},
  {name:"LoadProfileVersion",factory:TD.createLoadProfileVersion,input:{id:"lpv1",equipment_instance_id:"ei1",version:1,load_unit:"KG",display_semantics:"TOTAL_LOAD",direction:"HIGHER_IS_MORE",pair_semantics:"SINGLE",per_side_semantics:"N_A",ratio_confidence:"NONE",effective_load_unknown:false,microloading_available:false},expectedKeys:["id","equipment_instance_id","version","load_unit","display_semantics","direction","min","max","available_steps","combination_rule","base_load","pair_semantics","per_side_semantics","mechanical_ratio","ratio_confidence","effective_load_unknown","microloading_available"]},
  {name:"CatalogMigrationRecord",factory:TD.createCatalogMigrationRecord,input:{id:"cmr1",entity_type:"ExerciseDefinitionVersion",from_version:1,to_version:2,operation:"RENAME",created_at:"2026-08-15T00:00:00Z"},expectedKeys:["id","entity_type","from_version","to_version","operation","deterministic_rule","created_at"]},
  {name:"User",factory:TD.createUser,input:{id:"u1",created_at:"2026-08-15T00:00:00Z"},expectedKeys:["id","created_at"]},
  {name:"UserTrainingProfile",factory:TD.createUserTrainingProfile,input:{user_id:"u1",goal:"HYPERTROPHY",experience_self:"SOME",training_days_per_week:4,session_time_budget_min:60,primary_location_id:"loc1",bodyweight_kg:80,preferred_split:"UPPER_LOWER",uses_rir:true,rest_preference:"STANDARD",experience_level_eligible:"INTERMEDIATE",experience_level:"INTERMEDIATE",user_skill_level:2},expectedKeys:["user_id","goal","experience_self","training_days_per_week","session_time_budget_min","primary_location_id","bodyweight_kg","priority_muscles","preferred_split","training_weekdays","weekday_location_map","uses_rir","rest_preference","sex","age","experience_level_eligible","experience_level","user_skill_level","rir_reliability_tier_by_exercise","session_adherence_rate","actual_session_duration_factor"]},
  {name:"BodyweightEvent",factory:TD.createBodyweightEvent,input:{event_id:"bwe1",user_id:"u1",bodyweight_kg:80,effective_at:"2026-08-15T00:00:00Z",recorded_at:"2026-08-15T00:00:00Z",source:"USER_ENTRY"},expectedKeys:["event_id","user_id","bodyweight_kg","effective_at","recorded_at","source","corrects_event_id","idempotency_key"]},
  {name:"TrainingLocation",factory:TD.createTrainingLocation,input:{id:"loc1",user_id:"u1",name:"Home Gym",type:"HOME_GYM"},expectedKeys:["id","user_id","name","type","current_equipment_profile_version_id","is_default_for_weekdays"]},
  {name:"AvailabilityEvent",factory:TD.createAvailabilityEvent,input:{id:"ave1",equipment_instance_id:"ei1",state:"AVAILABLE",starts_at:"2026-08-15T00:00:00Z",reason:"restocked",recorded_at:"2026-08-15T00:00:00Z"},expectedKeys:["id","equipment_instance_id","session_instance_id","state","starts_at","expires_at","reason","recorded_at"]},
  {name:"LocationInventoryEvent",factory:TD.createLocationInventoryEvent,input:{id:"lie1",location_id:"loc1",from_state:"NOT_PRESENT",to_state:"PRESENT",source:"USER_ENTRY",effective_at:"2026-08-15T00:00:00Z",recorded_at:"2026-08-15T00:00:00Z"},expectedKeys:["id","location_id","equipment_instance_id","capability_key","from_state","to_state","source","effective_at","recorded_at"]},
  {name:"ExercisePreference",factory:TD.createExercisePreference,input:{user_id:"u1",exercise_id:"ex1",stage:"LIKED",set_by:"USER",reason_code:"MANUAL",created_at:"2026-08-15T00:00:00Z",decay_score:1},expectedKeys:["user_id","exercise_id","stage","set_by","reason_code","note","created_at","expires_at","evidence_events","decay_score"]},
  {name:"PatternCaution",factory:TD.createPatternCaution,input:{user_id:"u1",movement_pattern:"HORIZONTAL_PRESS",level:"CAUTION_LOW",source_reason_code:"USER_REPORTED",created_at:"2026-08-15T00:00:00Z",review_at:"2026-09-15T00:00:00Z"},expectedKeys:["user_id","movement_pattern","level","source_reason_code","created_at","review_at"]},
  {name:"SubstitutionPairScore",factory:TD.createSubstitutionPairScore,input:{user_id:"u1",from_exercise_id:"ex1",to_exercise_id:"ex2",score:0.8,updated_at:"2026-08-15T00:00:00Z"},expectedKeys:["user_id","from_exercise_id","to_exercise_id","score","updated_at"]},
  {name:"Plan",factory:TD.createPlan,input:{id:"p1",user_id:"u1",goal:"HYPERTROPHY",plan_origin:"GENERATED",control_authority_default:"AUTOMATIC",status:"ACTIVE",current_version_id:"pv1",created_at:"2026-08-15T00:00:00Z"},expectedKeys:["id","user_id","goal","plan_origin","control_authority_default","status","flags","current_version_id","created_at"]},
  {name:"PlanBlock",factory:TD.createPlanBlock,input:{id:"pb1",plan_id:"p1",block_index:0,split_type:"UPPER_LOWER",start_date:"2026-08-15",planned_weeks:6,status:"ACTIVE"},expectedKeys:["id","plan_id","block_index","split_type","start_date","planned_weeks","status","predecessor_block_id"]},
  {name:"PlanVersion",factory:TD.createPlanVersion,input:{id:"pv1",plan_id:"p1",block_id:"pb1",version_number:1,actor:"SYSTEM",change_type:"CREATE",change_summary:"initial",created_at:"2026-08-15T00:00:00Z"},expectedKeys:["id","plan_id","block_id","version_number","actor","change_type","change_summary","parent_version_id","created_at"]},
  {name:"Session",factory:TD.createSessionTemplate,input:{id:"s1",plan_version_id:"pv1",day_index:0,session_type:"UPPER",default_location_id:"loc1",estimated_duration_s:3600},expectedKeys:["id","plan_version_id","day_index","session_type","default_location_id","estimated_duration_s","estimated_duration_range"]},
  {name:"SessionInstance",factory:TD.createSessionInstance,input:{id:"si1",plan_id:"p1",plan_version_id:"pv1",session_id:"s1",scheduled_for:"2026-08-15",original_scheduled_for:"2026-08-15",effective_location_id:"loc1",status:"SCHEDULED"},expectedKeys:["id","plan_id","plan_version_id","session_id","scheduled_for","original_scheduled_for","effective_location_id","status","started_at","ended_at","moved_at","block_reason","slot_execution_ids"]},
  {name:"SlotExecution",factory:TD.createSlotExecution,input:{id:"se1",session_instance_id:"si1",plan_slot_id:"ps1",mode:"WORKING",exercise_id:"ex1",effective_prescription_snapshot:{},authority_mode_at_start:"AUTOMATIC"},expectedKeys:["id","session_instance_id","plan_slot_id","mode","exercise_id","resolved_setup_binding_id","engine_recommendation_snapshot","effective_prescription_snapshot","authority_mode_at_start","started_at","ended_at","flags"]},
  {name:"PlanSlot",factory:TD.createPlanSlot,input:{id:"ps1",plan_version_id:"pv1",session_id:"s1",order_index:0,slot_function:TD.createSlotFunction({movement_pattern:"HORIZONTAL_PRESS",role:"PRIMARY",rep_character:"MODERATE"}),priority_value:90,required_progressibility:"HIGH",fatigue_budget:3,exercise_id:"ex1",original_exercise_id:"ex1",resolved_setup_binding_id:"rsb1",prescription_id:"pr1",calibration_state:"ACTIVE"},expectedKeys:["id","plan_version_id","session_id","order_index","slot_function","volume_contribution","priority_value","required_progressibility","fatigue_budget","equipment_constraints","exercise_id","original_exercise_id","resolved_setup_binding_id","prescription_id","calibration_state","control_authority_override","flags","substitution_history"]},
  {name:"Prescription",factory:TD.createPrescription,input:{id:"pr1",sets:3,rep_min:6,rep_max:8,rir_target:2,rir_accept_low:1,rir_accept_high:3,rest_s:120,progression_model:"TARGET_PROGRESSION",warmup_protocol_class:"STANDARD"},expectedKeys:["id","sets","rep_min","rep_max","rir_target","rir_accept_low","rir_accept_high","rest_s","progression_model","warmup_protocol_class","load_recommendation_id"]},
  {name:"SessionOverride",factory:TD.createSessionOverride,input:{session_instance_id:"si1",slot_id:"ps1"},expectedKeys:["session_instance_id","slot_id","exercise_id","resolved_setup_binding_id","prescription_delta","expires_after_session"]},
  {name:"TimeBudgetOverride",factory:TD.createTimeBudgetOverride,input:{id:"tbo1",scope:"SESSION_INSTANCE",scope_id:"si1",max_duration_min:75,accepted_at:"2026-08-15T00:00:00Z"},expectedKeys:["id","scope","scope_id","max_duration_min","accepted_at","expires_at"]},
  {name:"TimeModelConfig",factory:TD.createTimeModelConfig,input:{version:1,tempo_default_s_per_rep:3,transition_same_station_s:15,transition_station_change_s:60,reserve_fraction:0.1},expectedKeys:["version","tempo_default_s_per_rep","setup_time_s","unilateral_time_factor","transition_same_station_s","transition_station_change_s","capacity_planning_by_goal","reserve_fraction"]},
  {name:"PerformanceInterpretationConfig",factory:TD.createPerformanceInterpretationConfig,input:{version:1,rest_shortfall_warning_count:2,rest_shortfall_lookback_exposures:5,rest_shortfall_ratio:0.3},expectedKeys:["version","rest_shortfall_warning_count","rest_shortfall_lookback_exposures","rest_shortfall_ratio"]},
  {name:"DeloadProposal",factory:TD.createDeloadProposal,input:{id:"dp1",plan_id:"p1",status:"PROPOSED",proposed_at:"2026-08-15T00:00:00Z"},expectedKeys:["id","plan_id","status","proposed_at","resolved_at","suppression_until"]},
  {name:"DeloadOverlay",factory:TD.createDeloadOverlay,input:{plan_id:"p1",start_date:"2026-08-15",end_date:"2026-08-22",set_factor:0.6,load_factor:0.9,rir_delta:1,accepted_at:"2026-08-15T00:00:00Z",pre_deload_progression_snapshot:{},resume_hold_required:true},expectedKeys:["plan_id","start_date","end_date","set_factor","load_factor","rir_delta","accepted_at","pre_deload_progression_snapshot","resume_hold_required"]},
  {name:"ValidationAcknowledgment",factory:TD.createValidationAcknowledgment,input:{user_id:"u1",plan_id:"p1",check_id:"V04",scope_key:"muscle:chest",acknowledged_until:"2026-09-15T00:00:00Z"},expectedKeys:["user_id","plan_id","check_id","scope_key","acknowledged_until"]},
  {name:"MutationCommand",factory:TD.createMutationCommand,input:{command_id:"mc1",idempotency_key:"idem1",actor:"USER",evaluation_context:{},payload_hash:"h1",created_at:"2026-08-15T00:00:00Z"},expectedKeys:["command_id","idempotency_key","actor","expected_plan_version_id","evaluation_context","payload_hash","created_at"]},
  {name:"MutationResult",factory:TD.createMutationResult,input:{command_id:"mc1",status:"COMMITTED"},expectedKeys:["command_id","status","resulting_plan_version_id","failure_results"]},
  {name:"ExercisePerformanceProfile",factory:TD.createExercisePerformanceProfile,input:{user_id:"u1",exercise_id:"ex1",performance_index:1.05,pi_measured_n_total:24,k_current:32,k_source:"MEASURED",k_prior_reference_load:80,form_error_ewma:0.1,sessions_since_k_adjust:2,confidence:"MEDIUM",last_session_at:"2026-08-15T00:00:00Z",session_count:6,ramp_pattern:"STANDARD",trend:"STABLE"},expectedKeys:["user_id","exercise_id","equipment_instance_id","performance_index","pi_measured_n_total","k_current","k_source","k_prior_reference_load","curve_consistency_J","form_error_ewma","sessions_since_k_adjust","confidence","last_session_at","session_count","ramp_pattern","flags","trend"]},
  {name:"CalibrationPoint",factory:TD.createCalibrationPoint,input:{id:"cp1",user_id:"u1",exercise_id:"ex1",source:"WORKOUT",weight:80,reps:6,rir_effective:2,sigma:0.5,n_total:6,zone:"MODERATE",weight_epoch:1,outlier_factor:1,excluded_from_curve_fit:false,created_at:"2026-08-15T00:00:00Z"},expectedKeys:["id","user_id","exercise_id","equipment_instance_id","source","weight","reps","rir_reported","effort_band","rir_effective","sigma","n_total","zone","weight_epoch","outlier_factor","excluded_from_curve_fit","flags","created_at"]},
  {name:"LoadRecommendation",factory:TD.createLoadRecommendation,input:{slot_id:"ps1",exercise_id:"ex1",session_instance_id:"si1",weight_lo:75,weight_hi:82.5,weight_selected:80,n_ziel_primaer:6,n_ziel_sekundaer:8,k_used:32,pi_used:1.05,confidence:"MEDIUM",tier:1,jump_regime:"A",jump_limited:false,requires_calibration_set:false,range_displayed:true},expectedKeys:["slot_id","exercise_id","session_instance_id","weight_lo","weight_hi","weight_selected","n_ziel_primaer","n_ziel_sekundaer","k_used","pi_used","confidence","tier","jump_regime","jump_limited","jump_limit_applied","derived_from_exercise_id","relation_factor_used","requires_calibration_set","rep_cap","rep_floor","range_displayed"]},
  {name:"ProgressionState",factory:TD.createProgressionState,input:{user_id:"u1",exercise_id:"ex1",model:"TARGET_PROGRESSION",phase:"BUILDING",current_load:80,prescription_band_snapshot:{},target_total_reps:18,frontier_load_step_index:2,frontier_target_total_reps:18,miss_streak:0,hard_failure_streak:0,local_stall_count:0,rep_bridge_active:false,readiness_overlay_active:false,predictive_confidence:"MEDIUM",effort_accuracy_tier:"MEDIUM",last_evaluated_session_id:"si1"},expectedKeys:["user_id","exercise_id","equipment_instance_id","model","phase","current_load","prescription_band_snapshot","target_total_reps","frontier_load_step_index","frontier_target_total_reps","miss_streak","hard_failure_streak","local_stall_count","last_reset_session_id","rep_bridge_active","bridge_rep_max","readiness_overlay_active","predictive_confidence","effort_accuracy_tier","last_evaluated_session_id"]},
  {name:"DailyTarget",factory:TD.createDailyTarget,input:{exercise_id:"ex1",slot_id:"ps1",session_instance_id:"si1",load:80,target_total_reps:18,hard_set_floor:5,rep_max_effective:8,rir_target:2,rir_accept_low:1,rir_accept_high:3,predictive_confidence:"MEDIUM",effort_accuracy_tier:"MEDIUM",config_version:1,source_event_revision:1,authority_mode:"AUTOMATIC",application_status:"APPLIED",generated_at:"2026-08-15T00:00:00Z"},expectedKeys:["exercise_id","slot_id","session_instance_id","load","target_total_reps","suggested_set_vector","hard_set_floor","rep_max_effective","rir_target","rir_accept_low","rir_accept_high","predictive_confidence","effort_accuracy_tier","config_version","source_event_revision","authority_mode","application_status","next_step_preview","generated_at"]},
  {name:"RepDecayProfile",factory:TD.createRepDecayProfile,input:{user_id:"u1",exercise_id:"ex1",rep_band_class:"6-8",comparable_session_count:4},expectedKeys:["user_id","exercise_id","equipment_instance_id","rep_band_class","comparable_session_count","median_decay_vector","mad_decay_vector"]},
  {name:"ExerciseRoundingDebt",factory:TD.createExerciseRoundingDebt,input:{user_id:"u1",exercise_id:"ex1",debt:0.5},expectedKeys:["user_id","exercise_id","equipment_instance_id","debt"]},
  {name:"RirCalibrationEvent",factory:TD.createRirCalibrationEvent,input:{id:"rce1",user_id:"u1",exercise_id:"ex1",reported_rir:2,actual_extra_reps:1,error:1,performed_at:"2026-08-15T00:00:00Z",recorded_at:"2026-08-15T00:00:00Z",source_event_revision:1},expectedKeys:["id","user_id","exercise_id","reported_rir","actual_extra_reps","error","performed_at","recorded_at","source_event_revision"]},
  {name:"VolumeSnapshot",factory:TD.createVolumeSnapshot,input:{user_id:"u1",week_start:"2026-08-10",canonical_volume_muscle_id:"CHEST",fractional_sets:14,direct_share:10,corridor_min:10,corridor_max:20,status:"OK"},expectedKeys:["user_id","week_start","canonical_volume_muscle_id","fractional_sets","direct_share","volume_floor","corridor_min","corridor_max","status","upper_bound","config_version","volume_deficit"]},
  {name:"VolumeDeficit",factory:TD.createVolumeDeficit,input:{muscle_id:"CHEST",planned_credit:8,standard_min:10,volume_floor:6,deficit_to_floor:0,limiting_constraint:"P3_TIME",generated_at:"2026-08-15T00:00:00Z"},expectedKeys:["muscle_id","planned_credit","standard_min","volume_floor","deficit_to_floor","limiting_constraint","generated_at"]},
];
ENTITY_CASES.forEach(({name,factory,input,expectedKeys})=>{
  const result=factory(input);
  const actualKeys=Object.keys(result).sort();
  assertEq(actualKeys,[...expectedKeys].sort(),name+": Ergebnis enthaelt exakt die dokumentierten Felder");
  const firstRequiredKey=Object.keys(input)[0];
  const withoutFirst={...input};delete withoutFirst[firstRequiredKey];
  // Nur pruefen, wenn das entfernte Feld tatsaechlich zu den Pflichtfeldern gehoert (nicht z.B. ein optional mitgegebenes)
  assertThrows(()=>factory(withoutFirst),name+": fehlendes Pflichtfeld ('"+firstRequiredKey+"') wirft");
});
console.log(ENTITY_CASES.length+" Entity-Fabriken geprueft (Feldvollstaendigkeit + Pflichtfeld-Validierung).");

console.log("========== Kanonische Enums/Registry-IDs (Korrektur nach STEP-01-Review) ==========");
{
  const validProfile={user_id:"u1",goal:"HYPERTROPHY",experience_self:"SOME",training_days_per_week:4,session_time_budget_min:60,primary_location_id:"loc1",bodyweight_kg:80,preferred_split:"UPPER_LOWER",uses_rir:true,rest_preference:"STANDARD",experience_level_eligible:"INTERMEDIATE",experience_level:"INTERMEDIATE",user_skill_level:2};
  assert(!!TD.createUserTrainingProfile(validProfile),"UserTrainingProfile mit ausschliesslich kanonischen Enum-Werten wird akzeptiert");
  assertThrows(()=>TD.createUserTrainingProfile({...validProfile,goal:"NOT_A_GOAL"}),"Ungueltiger goal-Wert wird abgelehnt");
  assertThrows(()=>TD.createUserTrainingProfile({...validProfile,experience_self:"INTERMEDIATE"}),"Ungueltiger experience_self-Wert (INTERMEDIATE ist kein ExperienceSelf-Wert) wird abgelehnt");
  assertThrows(()=>TD.createUserTrainingProfile({...validProfile,experience_level:"NOT_A_LEVEL"}),"Ungueltiger experience_level-Wert wird abgelehnt");
  assertThrows(()=>TD.createUserTrainingProfile({...validProfile,experience_level_eligible:"NOT_A_LEVEL"}),"Ungueltiger experience_level_eligible-Wert wird abgelehnt");
  assertThrows(()=>TD.createUserTrainingProfile({...validProfile,priority_muscles:["NOT_A_MUSCLE"]}),"Ungueltige Muskel-ID in priority_muscles wird abgelehnt");
  assert(!!TD.createUserTrainingProfile({...validProfile,priority_muscles:["CHEST","LATS"]}),"Kanonische Muskel-IDs in priority_muscles werden akzeptiert");

  assertThrows(()=>TD.createPlan({id:"p1",user_id:"u1",goal:"NOT_A_GOAL",plan_origin:"GENERATED",control_authority_default:"AUTOMATIC",status:"ACTIVE",current_version_id:"pv1",created_at:"2026-08-15T00:00:00Z"}),"Plan.goal mit ungueltigem Wert wird abgelehnt");

  const validExercise={exercise_id:"ex1",canonical_name:"Bench Press",definition_version:1,status:"ACTIVE",movement_pattern:"HORIZONTAL_PRESS",exercise_class:"COMPOUND",instance_relevance:"HIGH",calibration_mode:"STANDARD",technical_demand:3,stability_demand:2,mobility_demand:2,setup_complexity:2,fatigue_local:3,fatigue_systemic:3,setup_time_class:"FAST",unilateral_time_class:"N_A",warmup_protocol_class:"STANDARD",progression_ceiling_behavior:"NONE",auto_selectable:true,metadata_completeness:"COMPLETE"};
  assertThrows(()=>TD.createExerciseDefinitionVersion({...validExercise,primary_muscle_bands:["CHEST"]}),"primary_muscle_bands als blosse Muskel-ID-Strings (statt {canonical_volume_muscle_id,contribution_band}-Objekten) wird abgelehnt (Pack-05-Korrektur, analog SlotFunction)");
  assertThrows(()=>TD.createExerciseDefinitionVersion({...validExercise,primary_muscle_bands:[{canonical_volume_muscle_id:"NOT_A_MUSCLE",contribution_band:"PRIMARY_HIGH"}]}),"Ungueltige Muskel-ID in primary_muscle_bands wird abgelehnt");
  assertThrows(()=>TD.createExerciseDefinitionVersion({...validExercise,secondary_muscle_bands:[{canonical_volume_muscle_id:"TRICEPS",contribution_band:"NOT_A_BAND"}]}),"Ungueltiger contribution_band in secondary_muscle_bands wird abgelehnt");
  assert(!!TD.createExerciseDefinitionVersion({...validExercise,primary_muscle_bands:[{canonical_volume_muscle_id:"CHEST",contribution_band:"PRIMARY_HIGH"}],secondary_muscle_bands:[{canonical_volume_muscle_id:"TRICEPS",contribution_band:"SECONDARY"}]}),"§23.1/29.8: primary_muscle_bands/secondary_muscle_bands akzeptieren {canonical_volume_muscle_id,contribution_band}-Paare");

  assertThrows(()=>TD.createSlotFunction({movement_pattern:"HORIZONTAL_PRESS",role:"PRIMARY",rep_character:"MODERATE",primary_muscle_bands:["NOT_A_MUSCLE"]}),"SlotFunction.primary_muscle_bands als blosse Muskel-ID-Strings (statt {canonical_volume_muscle_id,contribution_band}-Objekten) wird abgelehnt");
  assertThrows(()=>TD.createSlotFunction({movement_pattern:"HORIZONTAL_PRESS",role:"PRIMARY",rep_character:"MODERATE",primary_muscle_bands:[{canonical_volume_muscle_id:"NOT_A_MUSCLE",contribution_band:"PRIMARY_HIGH"}]}),"SlotFunction.primary_muscle_bands mit ungueltiger Muskel-ID wird abgelehnt");
  assertThrows(()=>TD.createSlotFunction({movement_pattern:"HORIZONTAL_PRESS",role:"PRIMARY",rep_character:"MODERATE",primary_muscle_bands:[{canonical_volume_muscle_id:"CHEST",contribution_band:"NOT_A_BAND"}]}),"SlotFunction.primary_muscle_bands mit ungueltigem contribution_band wird abgelehnt");
  assert(!!TD.createSlotFunction({movement_pattern:"HORIZONTAL_PRESS",role:"PRIMARY",rep_character:"MODERATE",primary_muscle_bands:[{canonical_volume_muscle_id:"CHEST",contribution_band:"PRIMARY_HIGH"}]}),"§5.3: SlotFunction.primary_muscle_bands akzeptiert {canonical_volume_muscle_id,contribution_band}-Paare");

  assertThrows(()=>TD.createVolumeSnapshot({user_id:"u1",week_start:"2026-08-10",canonical_volume_muscle_id:"NOT_A_MUSCLE",fractional_sets:14,direct_share:10,corridor_min:10,corridor_max:20,status:"OK"}),"VolumeSnapshot.canonical_volume_muscle_id mit ungueltigem Wert wird abgelehnt");
  assertThrows(()=>TD.createVolumeDeficit({muscle_id:"NOT_A_MUSCLE",planned_credit:8,standard_min:10,volume_floor:6,deficit_to_floor:0,limiting_constraint:"P3_TIME",generated_at:"2026-08-15T00:00:00Z"}),"VolumeDeficit.muscle_id mit ungueltigem Wert wird abgelehnt");

  // Pack 04 (§4.1/§4.4): VolumeSnapshot.status und VolumeDeficit.limiting_constraint
  // waren in STEP 01 freie Strings — jetzt gegen die woertlich in §4.4
  // genannten Enums validiert (analog der STEP-03-Korrektur an createSlotFunction).
  assertThrows(()=>TD.createVolumeSnapshot({user_id:"u1",week_start:"2026-08-10",canonical_volume_muscle_id:"CHEST",fractional_sets:14,direct_share:10,corridor_min:10,corridor_max:20,status:"IN_CORRIDOR"}),"VolumeSnapshot.status mit frei erfundenem Wert (\"IN_CORRIDOR\") wird abgelehnt");
  ["OK","WARNING","ERROR"].forEach(status=>{
    assert(!!TD.createVolumeSnapshot({user_id:"u1",week_start:"2026-08-10",canonical_volume_muscle_id:"CHEST",fractional_sets:14,direct_share:10,corridor_min:10,corridor_max:20,status}),"VolumeSnapshot.status akzeptiert kanonischen Wert '"+status+"'");
  });
  assertThrows(()=>TD.createVolumeDeficit({muscle_id:"CHEST",planned_credit:8,standard_min:10,volume_floor:6,deficit_to_floor:0,limiting_constraint:"TIME",generated_at:"2026-08-15T00:00:00Z"}),"VolumeDeficit.limiting_constraint mit frei erfundenem Wert (\"TIME\") wird abgelehnt");
  ["P2_EQUIPMENT","P3_TIME","P4_SLOT_FUNCTION","USER_COMPOSED_CHOICE"].forEach(lc=>{
    assert(!!TD.createVolumeDeficit({muscle_id:"CHEST",planned_credit:8,standard_min:10,volume_floor:6,deficit_to_floor:0,limiting_constraint:lc,generated_at:"2026-08-15T00:00:00Z"}),"VolumeDeficit.limiting_constraint akzeptiert kanonischen Wert '"+lc+"'");
  });
  const snapshotWithOptionalFields=TD.createVolumeSnapshot({user_id:"u1",week_start:"2026-08-10",canonical_volume_muscle_id:"CHEST",fractional_sets:14,direct_share:10,corridor_min:10,corridor_max:20,status:"OK",upper_bound:22,config_version:"v1.4.1"});
  assertEq(snapshotWithOptionalFields.upper_bound,22,"VolumeSnapshot.upper_bound (Pack-04-Ergaenzung) wird uebernommen");
  assertEq(snapshotWithOptionalFields.config_version,"v1.4.1","VolumeSnapshot.config_version (Pack-04-Ergaenzung, fuer historische Snapshots) wird uebernommen");
  const snapshotWithoutOptionalFields=TD.createVolumeSnapshot({user_id:"u1",week_start:"2026-08-10",canonical_volume_muscle_id:"CHEST",fractional_sets:14,direct_share:10,corridor_min:10,corridor_max:20,status:"OK"});
  assertEq(snapshotWithoutOptionalFields.upper_bound,null,"VolumeSnapshot.upper_bound defaultet auf null, keine erfundene Zahl");
  assertEq(snapshotWithoutOptionalFields.config_version,null,"VolumeSnapshot.config_version defaultet auf null");

  const slotFn=TD.createSlotFunction({movement_pattern:"HORIZONTAL_PRESS",role:"PRIMARY",rep_character:"MODERATE"});
  const validSlot={id:"ps1",plan_version_id:"pv1",session_id:"s1",order_index:0,slot_function:slotFn,priority_value:90,required_progressibility:"HIGH",fatigue_budget:3,exercise_id:"ex1",original_exercise_id:"ex1",resolved_setup_binding_id:"rsb1",prescription_id:"pr1",calibration_state:"ACTIVE"};
  assertThrows(()=>TD.createPlanSlot({...validSlot,volume_contribution:{NOT_A_MUSCLE:1}}),"PlanSlot.volume_contribution mit ungueltigem Muskel-Key wird abgelehnt");
  assert(!!TD.createPlanSlot({...validSlot,volume_contribution:{CHEST:1}}),"PlanSlot.volume_contribution mit kanonischem Muskel-Key wird akzeptiert");

  // MovementPattern/MovementSubpattern: Paket 01 liefert keine geschlossene
  // Liste (nur die Anzahl "6 Grundmuster" in §5.5, keine konkreten IDs) —
  // deshalb hier NUR die Registry-Struktur pruefen, keine harte Ablehnung
  // beliebiger movement_pattern-Strings in den Fabriken.
  // Pack 05 (§5.1): die vormals offene, in STEP01 absichtlich LEERE
  // MovementPattern-/MovementSubpattern-Registry ist jetzt geschlossen und
  // mit den wortgetreuen v1.4.1-IDs vorbefuellt — es gibt keine
  // register*()-API mehr (siehe training-domain.js-Kommentar).
  assert(TD.isRegisteredMovementPatternId("HORIZONTAL_PRESS"),"MovementPattern-Registry enthaelt die kanonischen §5.1-IDs (Pack 05)");
  assert(!TD.isRegisteredMovementPatternId("HORIZONTAL_PUSH"),"MovementPattern-Registry lehnt nicht-kanonische IDs ab (geschlossene Registry)");
  assert(TD.isRegisteredMovementSubpatternId("FLAT_PRESS"),"MovementSubpattern-Registry enthaelt die kanonischen §5.1-IDs (Pack 05)");
  assert(!TD.isRegisteredMovementSubpatternId("ANY_SUBPATTERN"),"MovementSubpattern-Registry lehnt nicht-kanonische IDs ab");
  assertEq(Object.keys(TD.MOVEMENT_PATTERN_ID).length,25,"MOVEMENT_PATTERN_ID enthaelt exakt die 25 in §5.1 genannten IDs");
  assertEq(Object.keys(TD.MOVEMENT_SUBPATTERN_ID).length,53,"MOVEMENT_SUBPATTERN_ID enthaelt exakt die 53 in §5.1 genannten IDs");
  assertEq(TD.FOUNDATIONAL_MOVEMENT_PATTERNS.slice().sort(),["HIP_HINGE","HORIZONTAL_PRESS","HORIZONTAL_PULL","KNEE_DOMINANT","VERTICAL_PRESS","VERTICAL_PULL"],"die 6 Grundmuster (§5.1) exakt");
}

console.log("========== Paket 02: UserTrainingProfile §1.2 REQUIRED/OPTIONAL-Regeln ==========");
{
  // Minimalprofil mit ausschliesslich den 7 REQUIRED-Feldern + den DERIVED-
  // Snapshot-Feldern (die die Fabrik technisch als Struktur-Pflichtfelder
  // fuehrt, siehe Kommentar in createUserTrainingProfile) — KEINE der
  // OPTIONAL-Angaben wird mitgegeben.
  const minimal={user_id:"u1",goal:"HYPERTROPHY",experience_self:"NEW",training_days_per_week:3,session_time_budget_min:45,primary_location_id:"loc1",bodyweight_kg:82,experience_level_eligible:"BEGINNER",experience_level:"BEGINNER",user_skill_level:2};
  const profile=TD.createUserTrainingProfile(minimal);
  assertEq(profile.preferred_split,null,"Default preferred_split = null (§1.2 OPTIONAL), OHNE dass die Angabe den Abschluss blockiert");
  assertEq(profile.uses_rir,false,"Default uses_rir = false");
  assertEq(profile.rest_preference,"STANDARD","Default rest_preference = STANDARD");
  assertEq(profile.priority_muscles,[],"Default priority_muscles = []");

  // Wertebereiche (§1.2 REQUIRED-Tabelle): training_days_per_week 2-6,
  // session_time_budget_min 20-120, bodyweight_kg 30-250.
  assert(!!TD.createUserTrainingProfile({...minimal,training_days_per_week:2}),"training_days_per_week=2 (Untergrenze) wird akzeptiert");
  assert(!!TD.createUserTrainingProfile({...minimal,training_days_per_week:6}),"training_days_per_week=6 (Obergrenze) wird akzeptiert");
  assertThrows(()=>TD.createUserTrainingProfile({...minimal,training_days_per_week:1}),"training_days_per_week=1 (unterhalb 2) wird abgelehnt");
  assertThrows(()=>TD.createUserTrainingProfile({...minimal,training_days_per_week:7}),"training_days_per_week=7 (oberhalb 6) wird abgelehnt");
  assert(!!TD.createUserTrainingProfile({...minimal,session_time_budget_min:20}),"session_time_budget_min=20 (Untergrenze) wird akzeptiert");
  assert(!!TD.createUserTrainingProfile({...minimal,session_time_budget_min:120}),"session_time_budget_min=120 (Obergrenze) wird akzeptiert");
  assertThrows(()=>TD.createUserTrainingProfile({...minimal,session_time_budget_min:19}),"session_time_budget_min=19 (unterhalb 20) wird abgelehnt");
  assertThrows(()=>TD.createUserTrainingProfile({...minimal,session_time_budget_min:121}),"session_time_budget_min=121 (oberhalb 120) wird abgelehnt");
  assert(!!TD.createUserTrainingProfile({...minimal,bodyweight_kg:30}),"bodyweight_kg=30 (Untergrenze) wird akzeptiert");
  assert(!!TD.createUserTrainingProfile({...minimal,bodyweight_kg:250}),"bodyweight_kg=250 (Obergrenze) wird akzeptiert");
  assertThrows(()=>TD.createUserTrainingProfile({...minimal,bodyweight_kg:29}),"bodyweight_kg=29 (unterhalb 30) wird abgelehnt");
  assertThrows(()=>TD.createUserTrainingProfile({...minimal,bodyweight_kg:251}),"bodyweight_kg=251 (oberhalb 250) wird abgelehnt");

  // §4.5: maximal 2 Prioritaetsmuskeln.
  assert(!!TD.createUserTrainingProfile({...minimal,priority_muscles:["CHEST","LATS"]}),"genau 2 priority_muscles werden akzeptiert");
  assertThrows(()=>TD.createUserTrainingProfile({...minimal,priority_muscles:["CHEST","LATS","BICEPS"]}),"mehr als 2 priority_muscles werden abgelehnt (§4.5)");

  // preferred_split/rest_preference: kanonische Werte aus §3.1/§1.2.
  assert(!!TD.createUserTrainingProfile({...minimal,preferred_split:"PPL_UL_HYBRID"}),"kanonischer preferred_split-Wert wird akzeptiert");
  assertThrows(()=>TD.createUserTrainingProfile({...minimal,preferred_split:"NOT_A_SPLIT"}),"ungueltiger preferred_split-Wert wird abgelehnt");
  assert(!!TD.createUserTrainingProfile({...minimal,rest_preference:"LONG"}),"kanonischer rest_preference-Wert wird akzeptiert");
  assertThrows(()=>TD.createUserTrainingProfile({...minimal,rest_preference:"MEDIUM"}),"ungueltiger rest_preference-Wert wird abgelehnt (nur SHORT|STANDARD|LONG)");

  // TrainingLocation.type (§1.4).
  assert(!!TD.createTrainingLocation({id:"loc1",user_id:"u1",name:"Zuhause",type:"BODYWEIGHT_ONLY"}),"kanonischer TrainingLocation.type-Wert wird akzeptiert");
  assertThrows(()=>TD.createTrainingLocation({id:"loc1",user_id:"u1",name:"Zuhause",type:"GARAGE"}),"ungueltiger TrainingLocation.type-Wert wird abgelehnt");
}

console.log("========== WorkoutLog: immutable:true fest verdrahtet ==========");
{
  const wl=TD.createWorkoutLog({id:"wl1",user_id:"u1",plan_id:"p1",plan_version_id:"pv1",session_id:"s1",session_instance_id:"si1",slot_execution_id:"se1",slot_id:"ps1",exercise_id:"ex1",exercise_definition_version:1,resolved_setup_binding_snapshot:{},prescription_snapshot:{},authority_mode_at_execution:"AUTOMATIC",performed_at:"2026-08-15T00:00:00Z",recorded_at:"2026-08-15T00:00:00Z",session_status:"COMPLETE"});
  assertEq(wl.immutable,true,"WorkoutLog.immutable ist immer true");
  assertEq(wl.sets,[],"sets defaultet auf leeres Array, keine erfundenen Saetze");
}

console.log("========== WorkoutLog-Korrektur-Projektion (23.4) ==========");
{
  const base=TD.createWorkoutLog({id:"wl1",user_id:"u1",plan_id:"p1",plan_version_id:"pv1",session_id:"s1",session_instance_id:"si1",slot_execution_id:"se1",slot_id:"ps1",exercise_id:"ex1",exercise_definition_version:1,resolved_setup_binding_snapshot:{},prescription_snapshot:{},authority_mode_at_execution:"AUTOMATIC",performed_at:"2026-08-15T00:00:00Z",recorded_at:"2026-08-15T00:00:00Z",sets:[
    TD.createWorkoutSetEntry({index:1,metric_type:"REPS",weight:80,reps:6,is_warmup:false,is_calibration_set:false}),
    TD.createWorkoutSetEntry({index:2,metric_type:"REPS",weight:80,reps:5,is_warmup:false,is_calibration_set:false}),
  ],session_status:"COMPLETE"});
  const baseSnapshot=JSON.stringify(base);

  // PATCH_FIELD: korrigiert ein Feld
  const patchCorrection=TD.createWorkoutLogCorrection({id:"c1",workout_log_id:"wl1",operation:"PATCH_FIELD",path:"session_status",new_value:"PARTIAL",effective_at:"2026-08-16T00:00:00Z",recorded_at:"2026-08-16T00:00:00Z",reason:"nutzer korrigiert",actor:"USER",idempotency_key:"k1"});
  const projected1=TD.projectEffectiveWorkoutLog(base,[patchCorrection]);
  assertEq(projected1.session_status,"PARTIAL","PATCH_FIELD aendert das Zielfeld in der Projektion");
  assertEq(JSON.stringify(base),baseSnapshot,"Der Basis-Log bleibt durch PATCH_FIELD komplett unveraendert (append-only)");

  // DELETE_SET: Foundation legt KEINE Satz-Adressierungssemantik fest (nicht
  // normativ durch Paket 01 spezifiziert) — die Correction wird deshalb
  // unangewendet durchgereicht, statt eine erfundene Bedeutung fuer "path"
  // anzunehmen.
  const deleteCorrection=TD.createWorkoutLogCorrection({id:"c2",workout_log_id:"wl1",operation:"DELETE_SET",path:2,effective_at:"2026-08-16T00:00:00Z",recorded_at:"2026-08-16T00:00:00Z",reason:"versehentlich geloggt",actor:"USER",idempotency_key:"k2"});
  const projected2=TD.projectEffectiveWorkoutLog(base,[deleteCorrection]);
  assertEq(projected2.sets.length,2,"DELETE_SET veraendert die Satzliste der Projektion NICHT (keine erfundene Adressierungssemantik)");
  assertEq(projected2.unresolved_set_corrections.length,1,"DELETE_SET wird stattdessen unaufgeloest in unresolved_set_corrections durchgereicht");
  assertEq(projected2.unresolved_set_corrections[0].id,"c2","Die durchgereichte Correction ist genau die uebergebene DELETE_SET-Correction");
  assertEq(base.sets.length,2,"Der Basis-Log behaelt weiterhin beide Saetze (append-only)");

  // INSERT_SET: gleiches Prinzip — keine erfundene Bedeutung fuer "new_value"
  // als vollstaendiger Satz-Eintrag, stattdessen unaufgeloest durchgereicht.
  const insertCorrection=TD.createWorkoutLogCorrection({id:"c3",workout_log_id:"wl1",operation:"INSERT_SET",new_value:TD.createWorkoutSetEntry({index:3,metric_type:"REPS",weight:80,reps:7,is_warmup:false,is_calibration_set:false}),effective_at:"2026-08-16T00:00:00Z",recorded_at:"2026-08-16T00:00:00Z",reason:"nachtraeglich erfasst",actor:"USER",idempotency_key:"k3"});
  const projected3=TD.projectEffectiveWorkoutLog(base,[insertCorrection]);
  assertEq(projected3.sets.length,2,"INSERT_SET veraendert die Satzliste der Projektion NICHT (keine erfundene Adressierungssemantik)");
  assertEq(projected3.unresolved_set_corrections.length,1,"INSERT_SET wird stattdessen unaufgeloest in unresolved_set_corrections durchgereicht");
  assertEq(projected3.unresolved_set_corrections[0].id,"c3","Die durchgereichte Correction ist genau die uebergebene INSERT_SET-Correction");

  // VOID_AND_REPLACE: Basis traegt danach 0 bei
  const voidCorrection=TD.createWorkoutLogCorrection({id:"c4",workout_log_id:"wl1",operation:"VOID_AND_REPLACE",replacement_workout_log_id:"wl2",effective_at:"2026-08-16T00:00:00Z",recorded_at:"2026-08-16T00:00:00Z",reason:"falsche Uebung geloggt",actor:"USER",idempotency_key:"k4"});
  const projected4=TD.projectEffectiveWorkoutLog(base,[voidCorrection,patchCorrection]);
  assertEq(projected4.voided,true,"VOID_AND_REPLACE markiert die Projektion als 'voided'");
  assertEq(projected4.contributes_zero,true,"Ein 'voided' Basislog traegt 0 zu abgeleiteten Werten bei");
  assertEq(projected4.replacement_workout_log_id,"wl2","replacement_workout_log_id wird uebernommen");

  // Reihenfolge: Corrections werden nach kanonischer Ereignisreihenfolge angewendet, nicht nach Array-Reihenfolge
  const laterPatch=TD.createWorkoutLogCorrection({id:"c5",workout_log_id:"wl1",operation:"PATCH_FIELD",path:"session_status",new_value:"ABORTED",effective_at:"2026-08-17T00:00:00Z",recorded_at:"2026-08-17T00:00:00Z",reason:"weitere Korrektur",actor:"USER",idempotency_key:"k5"});
  const outOfOrder=TD.projectEffectiveWorkoutLog(base,[laterPatch,patchCorrection]); // absichtlich "falsch" einsortiert uebergeben
  assertEq(outOfOrder.session_status,"ABORTED","Corrections werden nach effective_at angewendet, nicht nach Uebergabereihenfolge (letzte gewinnt: ABORTED nach PARTIAL)");

  assertEq(TD.projectEffectiveWorkoutLog(null,[]),null,"projectEffectiveWorkoutLog(null,...) liefert null statt zu crashen");
}

console.log("========== Bodyweight-Replay-Contract (23.4, INVARIANT BW-R1) ==========");
{
  const events=[
    TD.createBodyweightEvent({event_id:"bw1",user_id:"u1",bodyweight_kg:82,effective_at:"2026-06-01T00:00:00Z",recorded_at:"2026-06-01T00:00:00Z",source:"USER_ENTRY"}),
    TD.createBodyweightEvent({event_id:"bw2",user_id:"u1",bodyweight_kg:80,effective_at:"2026-07-01T00:00:00Z",recorded_at:"2026-07-01T00:00:00Z",source:"USER_ENTRY"}),
    TD.createBodyweightEvent({event_id:"bw3",user_id:"u1",bodyweight_kg:90,effective_at:"2027-01-01T00:00:00Z",recorded_at:"2027-01-01T00:00:00Z",source:"USER_ENTRY"}), // liegt NACH performed_at unten
  ];
  const resolved=TD.resolveBodyweightAtPerformedAt(events,"2026-08-15T00:00:00Z");
  assertEq(resolved.event_id,"bw2","Wählt den Event mit maximalem effective_at <= performed_at (80kg vom 01.07.), NICHT das aktuelle/spaetere Gewicht");
  assert(resolved.bodyweight_kg!==90,"Ein SPAETERES Körpergewicht darf frühere Performance nie still neu interpretieren");

  const none=TD.resolveBodyweightAtPerformedAt(events,"2026-01-01T00:00:00Z");
  assertEq(none,null,"Kein Event vor performed_at vorhanden -> null (kein erfundener Wert)");

  // Korrektur-Event: hat eigenes effective_at, gewinnt automatisch ab da
  const correction=TD.createBodyweightEvent({event_id:"bw4",user_id:"u1",bodyweight_kg:79,effective_at:"2026-07-15T00:00:00Z",recorded_at:"2026-09-01T00:00:00Z",source:"CORRECTION",corrects_event_id:"bw2"});
  const withCorrection=events.concat([correction]);
  const resolvedAfterCorrection=TD.resolveBodyweightAtPerformedAt(withCorrection,"2026-08-15T00:00:00Z");
  assertEq(resolvedAfterCorrection.event_id,"bw4","Korrektur-Event gewinnt ab seinem eigenen effective_at automatisch, ohne Sonderbehandlung von corrects_event_id");
  const resolvedBeforeCorrection=TD.resolveBodyweightAtPerformedAt(withCorrection,"2026-07-10T00:00:00Z");
  assertEq(resolvedBeforeCorrection.event_id,"bw2","Vor dem effective_at der Korrektur bleibt der urspruengliche Event gueltig");

  // Gleichstand bei effective_at: kanonische Reihenfolge (recorded_at, dann event_id) entscheidet
  const tie1=TD.createBodyweightEvent({event_id:"bwA",user_id:"u1",bodyweight_kg:81,effective_at:"2026-08-01T00:00:00Z",recorded_at:"2026-08-01T00:00:00Z",source:"USER_ENTRY"});
  const tie2=TD.createBodyweightEvent({event_id:"bwB",user_id:"u1",bodyweight_kg:81.5,effective_at:"2026-08-01T00:00:00Z",recorded_at:"2026-08-02T00:00:00Z",source:"USER_ENTRY"});
  const tieResolved=TD.resolveBodyweightAtPerformedAt([tie1,tie2],"2026-08-15T00:00:00Z");
  assertEq(tieResolved.event_id,"bwB","Bei identischem effective_at entscheidet das spaetere recorded_at (kanonische Reihenfolge)");
}

console.log("========== NON_REP-Guard (INVARIANT NR-1) ==========");
{
  const repLog=TD.createWorkoutLog({id:"wl1",user_id:"u1",plan_id:"p1",plan_version_id:"pv1",session_id:"s1",session_instance_id:"si1",slot_execution_id:"se1",slot_id:"ps1",exercise_id:"ex1",exercise_definition_version:1,resolved_setup_binding_snapshot:{},prescription_snapshot:{},authority_mode_at_execution:"AUTOMATIC",performed_at:"2026-08-15T00:00:00Z",recorded_at:"2026-08-15T00:00:00Z",sets:[TD.createWorkoutSetEntry({index:1,metric_type:"REPS",reps:6,is_warmup:false,is_calibration_set:false})],session_status:"COMPLETE"});
  const nonRepLog=TD.createWorkoutLog({...repLog,id:"wl2",sets:[TD.createWorkoutSetEntry({index:1,metric_type:"DURATION",duration_s:1800,is_warmup:false,is_calibration_set:false})]});
  assert(!TD.isNonRepWorkoutLog(repLog),"Ein REPS-basierter Log ist kein NON_REP-Log");
  assert(TD.isNonRepWorkoutLog(nonRepLog),"Ein reiner DURATION-Log gilt als NON_REP");
}

console.log("========== Mutation-Idempotenz (§21.6) ==========");
{
  const cmd1=TD.createMutationCommand({command_id:"m1",idempotency_key:"idem-a",actor:"USER",evaluation_context:{},payload_hash:"h1",created_at:"2026-08-15T00:00:00Z"});
  assertEq(TD.checkMutationIdempotency([],cmd1).outcome,"NEW","Kein vorheriger Command mit diesem Key -> NEW");
  const stored=[cmd1];
  const sameKeySamePayload={...cmd1,command_id:"m2"};
  assertEq(TD.checkMutationIdempotency(stored,sameKeySamePayload).outcome,"DUPLICATE","Gleicher Key + gleicher Payload -> DUPLICATE (liefert gespeichertes Ergebnis)");
  const sameKeyDifferentPayload={...cmd1,command_id:"m3",payload_hash:"h2"};
  assertEq(TD.checkMutationIdempotency(stored,sameKeyDifferentPayload).outcome,"IDEMPOTENCY_CONFLICT","Gleicher Key + anderer Payload -> IDEMPOTENCY_CONFLICT");
}

console.log("========== ID-Erzeugung ==========");
{
  const ids=new Set();
  for(let i=0;i<200;i++)ids.add(TD.genTrainingId("ex"));
  assertEq(ids.size,200,"200 in derselben Millisekunde erzeugte IDs sind alle eindeutig");
  assert([...ids].every(id=>id.indexOf("ex_")===0),"IDs tragen das erwartete Praefix");
}

console.log("========== Serialisierbarkeit (JSON-Roundtrip, Voraussetzung fuer localStorage) ==========");
{
  const profile=TD.createUserTrainingProfile({user_id:"u1",goal:"HYPERTROPHY",experience_self:"SOME",training_days_per_week:4,session_time_budget_min:60,primary_location_id:"loc1",bodyweight_kg:80,preferred_split:"UPPER_LOWER",uses_rir:true,rest_preference:"STANDARD",experience_level_eligible:"INTERMEDIATE",experience_level:"INTERMEDIATE",user_skill_level:2});
  const roundtripped=JSON.parse(JSON.stringify(profile));
  assertEq(roundtripped,profile,"UserTrainingProfile uebersteht einen JSON.stringify/parse-Roundtrip verlustfrei");
}

console.log("\n"+passed+" bestanden, "+failed+" fehlgeschlagen");
process.exit(failed>0?1:0);
