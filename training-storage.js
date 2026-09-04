/* training-storage.js — Persistenz-/Migrationsschicht fuer das TRAINING-
   Datenmodell aus training-domain.js (IMPLEMENTATION PACK 01/14).

   Die App nutzt AUSSCHLIESSLICH localStorage (kein Backend, keine externe
   Datenbank) — siehe CLAUDE.md/Bestehende Architektur. Diese Schicht
   bildet die von der v1.4.1-Spec geforderte Persistenz/Migration/
   Versionierung DAHER aequivalent innerhalb des bestehenden
   localStorage-Systems ab, statt eine neue Backend-/DB-Infrastruktur zu
   erfinden: jede TEIL-23-Entity-Sammlung ist ein eigener, namensraum-
   getrennter localStorage-Key (ueber die bereits vorhandenen load()/
   save()-Primitiven aus storage.js), mit einem Schema-Versions-Feld
   (TRAINING_DOMAIN_SCHEMA_VERSION aus training-domain.js) und einer
   Migrationsfunktion als Einstiegspunkt fuer kuenftige Packs.

   WICHTIG: dieses File ist reine Persistenz-Verkabelung. Keine fachliche
   Entscheidungslogik (die lebt in training-domain.js als reine Funktionen,
   oder folgt in spaeteren Packs als eigene Engine). Wird per normalem
   <script src="training-storage.js"> NACH storage.js UND training-
   domain.js geladen (keine ES-Module, keine Ladereihenfolge-Abhaengigkeit
   fuer den tatsaechlichen Aufruf, siehe etabliertes Muster der uebrigen
   *-engine.js-Dateien — lediglich beim Laden selbst muessen load()/save()
   und die training-domain-Funktionen bereits als globale Funktionen
   DEKLARIERT sein, was durch die Script-Reihenfolge in index.html
   sichergestellt wird).

   AGGREGATE-EINTEILUNG:
   - SINGLETON-Eintraege (genau ein Datensatz, z.B. das eine
     UserTrainingProfile dieser Single-User-App): direkt unter einem
     eigenen Key gespeichert (kein Array).
   - COLLECTION-Eintraege (mehrere Datensaetze): als Array unter einem
     eigenen Key, ueber generische load/save/upsert/append-Helfer.
   - APPEND-ONLY-Collections (WorkoutLog, WorkoutLogCorrection,
     BodyweightEvent, AvailabilityEvent, LocationInventoryEvent,
     CalibrationPoint, RirCalibrationEvent, CatalogMigrationRecord,
     MutationCommand, MutationResult): bieten AUSSCHLIESSLICH eine
     append*()-Funktion an, nie ein update/delete — Basis-Records werden
     nie ueberschrieben oder geloescht (INVARIANT LOG-1 u.a.).

   Oeffentliche API: siehe Ende der Datei (module.exports-Liste) fuer die
   vollstaendige Funktionsliste. */

const TRAINING_STORAGE_PREFIX="tracker_training_";
const TRAINING_SCHEMA_VERSION_KEY=TRAINING_STORAGE_PREFIX+"schema_version";

function trainingKey(name){return TRAINING_STORAGE_PREFIX+name;}

/* ===== Generische Collection-Helfer (Array-Collections) ===== */
function loadTrainingCollection(name){return load(trainingKey(name),[]);}
function saveTrainingCollection(name,list){save(trainingKey(name),list);}
/* Fuegt einen neuen Eintrag hinzu, sofern noch kein Eintrag mit demselben
   idField-Wert existiert (Idempotenz bei Doppel-Aufruf) — verletzt NIE
   INVARIANT LOG-1: es gibt hier keinen Codepfad, der einen bestehenden
   Eintrag ueberschreibt oder entfernt. */
function appendToTrainingCollection(name,entry,idField){
  const list=loadTrainingCollection(name);
  if(list.some(x=>x[idField]===entry[idField]))return {appended:false,list};
  const next=list.concat([entry]);
  saveTrainingCollection(name,next);
  return {appended:true,list:next};
}
/* Fuer NICHT-append-only Collections: ersetzt den Eintrag mit gleichem
   idField-Wert (falls vorhanden) oder haengt neu an. Wird NIE fuer die
   oben gelisteten append-only-Entities verwendet. */
function upsertInTrainingCollection(name,entry,idField){
  const list=loadTrainingCollection(name);
  const idx=list.findIndex(x=>x[idField]===entry[idField]);
  const next=idx===-1?list.concat([entry]):list.map((x,i)=>i===idx?entry:x);
  saveTrainingCollection(name,next);
  return next;
}
function findInTrainingCollection(name,idField,idValue){
  return loadTrainingCollection(name).find(x=>x[idField]===idValue)||null;
}

/* ===== 23.2 Nutzer, Locations, Profil ===== */
/* UserTrainingProfile: Singleton dieser Single-User-App. Es wird NIE ein
   Profil mit erfundenen Defaults automatisch erzeugt — laedt schlicht
   null, solange der Nutzer keines angelegt hat (spaeteres Onboarding-Pack). */
function loadUserTrainingProfile(){return load(trainingKey("profile"),null);}
function saveUserTrainingProfile(profile){save(trainingKey("profile"),profile);}

/* Paket 02 (Onboarding) braucht einen stabilen user_id-Anker fuer
   UserTrainingProfile/TrainingLocation/BodyweightEvent — diese Single-User-
   App fuehrt bislang keinen Nutzer-Account. Statt dafuer eine neue Backend-
   /Auth-Architektur einzufuehren, wird EINMALIG eine lokale, opake ID
   erzeugt und dauerhaft unter einem eigenen Key gespeichert; danach immer
   dieselbe ID zurueckgegeben. Rein technischer Anker, keine fachliche
   Bedeutung. */
function getOrCreateLocalTrainingUserId(){
  let id=load(trainingKey("local_user_id"),null);
  if(!id){id=genTrainingId("user");save(trainingKey("local_user_id"),id);}
  return id;
}

/* BodyweightEvent: append-only (Bodyweight-Replay-Contract, 23.4). */
function loadBodyweightEvents(){return loadTrainingCollection("bodyweight_events");}
function appendBodyweightEvent(event){return appendToTrainingCollection("bodyweight_events",event,"event_id");}

function loadTrainingLocations(){return loadTrainingCollection("locations");}
function upsertTrainingLocation(loc){return upsertInTrainingCollection("locations",loc,"id");}

function loadAvailabilityEvents(){return loadTrainingCollection("availability_events");}
function appendAvailabilityEvent(event){return appendToTrainingCollection("availability_events",event,"id");}

function loadLocationInventoryEvents(){return loadTrainingCollection("location_inventory_events");}
function appendLocationInventoryEvent(event){return appendToTrainingCollection("location_inventory_events",event,"id");}

function loadExercisePreferences(){return loadTrainingCollection("exercise_preferences");}
function saveExercisePreferences(list){saveTrainingCollection("exercise_preferences",list);}

function loadPatternCautions(){return loadTrainingCollection("pattern_cautions");}
function savePatternCautions(list){saveTrainingCollection("pattern_cautions",list);}

function loadSubstitutionPairScores(){return loadTrainingCollection("substitution_pair_scores");}
function saveSubstitutionPairScores(list){saveTrainingCollection("substitution_pair_scores",list);}

/* ===== 23.1 Katalog und Equipment (Strukturen; Katalog-Instanzdaten aus
   Teil 29 sind NICHT Teil dieses Packs — die Collections starten leer) ===== */
function loadExerciseDefinitionVersions(){return loadTrainingCollection("exercise_definition_versions");}
function upsertExerciseDefinitionVersion(v){return upsertInTrainingCollection("exercise_definition_versions",v,"exercise_id");}

function loadExerciseSetupVariants(){return loadTrainingCollection("exercise_setup_variants");}
function upsertExerciseSetupVariant(v){return upsertInTrainingCollection("exercise_setup_variants",v,"id");}

function loadExerciseSetups(){return loadTrainingCollection("exercise_setups");}
function upsertExerciseSetup(v){return upsertInTrainingCollection("exercise_setups",v,"id");}

function loadResolvedSetupBindings(){return loadTrainingCollection("resolved_setup_bindings");}
function upsertResolvedSetupBinding(v){return upsertInTrainingCollection("resolved_setup_bindings",v,"id");}

function loadExerciseRelations(){return loadTrainingCollection("exercise_relations");}
function saveExerciseRelations(list){saveTrainingCollection("exercise_relations",list);}

function loadCuratedSubstituteGroups(){return loadTrainingCollection("curated_substitute_groups");}
function upsertCuratedSubstituteGroup(v){return upsertInTrainingCollection("curated_substitute_groups",v,"id");}

function loadCuratedVetos(){return loadTrainingCollection("curated_vetos");}
function saveCuratedVetos(list){saveTrainingCollection("curated_vetos",list);}

function loadEquipmentDefinitionVersions(){return loadTrainingCollection("equipment_definition_versions");}
function upsertEquipmentDefinitionVersion(v){return upsertInTrainingCollection("equipment_definition_versions",v,"id");}

function loadEquipmentInstances(){return loadTrainingCollection("equipment_instances");}
function upsertEquipmentInstance(v){return upsertInTrainingCollection("equipment_instances",v,"id");}

function loadAttachmentInstances(){return loadTrainingCollection("attachment_instances");}
function upsertAttachmentInstance(v){return upsertInTrainingCollection("attachment_instances",v,"id");}

function loadEquipmentProfileVersions(){return loadTrainingCollection("equipment_profile_versions");}
function upsertEquipmentProfileVersion(v){return upsertInTrainingCollection("equipment_profile_versions",v,"id");}

function loadLoadProfileVersions(){return loadTrainingCollection("load_profile_versions");}
function upsertLoadProfileVersion(v){return upsertInTrainingCollection("load_profile_versions",v,"id");}

/* CatalogMigrationRecord: append-only Audit-Trail jeder Katalog-Migration. */
function loadCatalogMigrationRecords(){return loadTrainingCollection("catalog_migration_records");}
function appendCatalogMigrationRecord(r){return appendToTrainingCollection("catalog_migration_records",r,"id");}

/* ===== 23.3 Plan, Sessions, Mutations ===== */
function loadPlans(){return loadTrainingCollection("plans");}
function upsertPlan(p){return upsertInTrainingCollection("plans",p,"id");}
function findPlan(id){return findInTrainingCollection("plans","id",id);}

function loadPlanBlocks(){return loadTrainingCollection("plan_blocks");}
function upsertPlanBlock(b){return upsertInTrainingCollection("plan_blocks",b,"id");}

/* PlanVersion: fachlich append-only-artig (jede neue Version bekommt eine
   neue id, alte Versionen bleiben ueber parent_version_id verkettet
   erhalten) — hier dennoch als append() abgebildet, nicht upsert, damit
   eine bereits erzeugte Version nie versehentlich durch einen zweiten
   Aufruf mit gleicher id ueberschrieben wird. */
function loadPlanVersions(){return loadTrainingCollection("plan_versions");}
function appendPlanVersion(v){return appendToTrainingCollection("plan_versions",v,"id");}

function loadSessionTemplates(){return loadTrainingCollection("session_templates");}
function upsertSessionTemplate(s){return upsertInTrainingCollection("session_templates",s,"id");}

function loadPlanSlots(){return loadTrainingCollection("plan_slots");}
function upsertPlanSlot(s){return upsertInTrainingCollection("plan_slots",s,"id");}

function loadSessionInstances(){return loadTrainingCollection("session_instances");}
function upsertSessionInstance(s){return upsertInTrainingCollection("session_instances",s,"id");}
function findSessionInstance(id){return findInTrainingCollection("session_instances","id",id);}

function loadSlotExecutions(){return loadTrainingCollection("slot_executions");}
function upsertSlotExecution(s){return upsertInTrainingCollection("slot_executions",s,"id");}

function loadPrescriptions(){return loadTrainingCollection("prescriptions");}
function upsertPrescription(p){return upsertInTrainingCollection("prescriptions",p,"id");}

function loadSessionOverrides(){return loadTrainingCollection("session_overrides");}
function saveSessionOverrides(list){saveTrainingCollection("session_overrides",list);}

function loadTimeBudgetOverrides(){return loadTrainingCollection("time_budget_overrides");}
function upsertTimeBudgetOverride(o){return upsertInTrainingCollection("time_budget_overrides",o,"id");}

/* TimeModelConfig/PerformanceInterpretationConfig: versionierte Config-
   Singletons (immer die zuletzt gespeicherte Version aktiv; alte Versionen
   werden nicht rueckwirkend geloescht, sondern als Historie mitgefuehrt). */
function loadTimeModelConfigHistory(){return loadTrainingCollection("time_model_configs");}
function appendTimeModelConfig(c){return appendToTrainingCollection("time_model_configs",c,"version");}
function currentTimeModelConfig(){const h=loadTimeModelConfigHistory();return h.length?h[h.length-1]:null;}

function loadPerformanceInterpretationConfigHistory(){return loadTrainingCollection("performance_interpretation_configs");}
function appendPerformanceInterpretationConfig(c){return appendToTrainingCollection("performance_interpretation_configs",c,"version");}
function currentPerformanceInterpretationConfig(){const h=loadPerformanceInterpretationConfigHistory();return h.length?h[h.length-1]:null;}

function loadDeloadProposals(){return loadTrainingCollection("deload_proposals");}
function upsertDeloadProposal(p){return upsertInTrainingCollection("deload_proposals",p,"id");}

function loadDeloadOverlays(){return loadTrainingCollection("deload_overlays");}
function saveDeloadOverlays(list){saveTrainingCollection("deload_overlays",list);}

function loadValidationAcknowledgments(){return loadTrainingCollection("validation_acknowledgments");}
function saveValidationAcknowledgments(list){saveTrainingCollection("validation_acknowledgments",list);}

/* MutationCommand/MutationResult: append-only Audit-Trail. Idempotenz wird
   VOR dem Anhaengen ueber checkMutationIdempotency() (training-domain.js)
   geprueft — diese Funktion fuehrt NUR die Speicherung aus, keine
   Candidate-/Validation-Entscheidung (das ist spaetere Mutation-Engine). */
function loadMutationCommands(){return loadTrainingCollection("mutation_commands");}
function submitMutationCommand(command){
  const existing=loadMutationCommands();
  const check=checkMutationIdempotency(existing,command);
  if(check.outcome==="NEW")appendToTrainingCollection("mutation_commands",command,"command_id");
  return check;
}
function loadMutationResults(){return loadTrainingCollection("mutation_results");}
function appendMutationResult(result){return appendToTrainingCollection("mutation_results",result,"command_id");}

/* ===== 23.4 Leistung, Logging, Korrekturen, Kalibrierung ===== */
/* WorkoutLog: append-only/immutable (INVARIANT LOG-1). */
function loadWorkoutLogs(){return loadTrainingCollection("workout_logs");}
function appendWorkoutLog(log){
  if(!log||log.immutable!==true)throw new Error("training-storage: WorkoutLog muss immutable:true tragen (append-only)");
  return appendToTrainingCollection("workout_logs",log,"id");
}
function findWorkoutLog(id){return findInTrainingCollection("workout_logs","id",id);}

/* WorkoutLogCorrection: append-only (INVARIANT LOG-1/LOG-2). */
function loadWorkoutLogCorrections(){return loadTrainingCollection("workout_log_corrections");}
function appendWorkoutLogCorrection(correction){return appendToTrainingCollection("workout_log_corrections",correction,"id");}
/* Liefert die effektive, projizierte Version eines WorkoutLog inkl. aller
   bisher gespeicherten Korrekturen (siehe projectEffectiveWorkoutLog in
   training-domain.js) — der Basis-Log in loadWorkoutLogs() bleibt dabei
   unangetastet. */
function effectiveWorkoutLog(id){
  const base=findWorkoutLog(id);
  if(!base)return null;
  return projectEffectiveWorkoutLog(base,loadWorkoutLogCorrections());
}

function loadExercisePerformanceProfiles(){return loadTrainingCollection("exercise_performance_profiles");}
function upsertExercisePerformanceProfile(p){
  const list=loadTrainingCollection("exercise_performance_profiles");
  const idx=list.findIndex(x=>x.user_id===p.user_id&&x.exercise_id===p.exercise_id&&x.equipment_instance_id===p.equipment_instance_id);
  const next=idx===-1?list.concat([p]):list.map((x,i)=>i===idx?p:x);
  saveTrainingCollection("exercise_performance_profiles",next);
  return next;
}

/* CalibrationPoint: append-only (Kalibrierhistorie, nie retroaktiv veraendert). */
function loadCalibrationPoints(){return loadTrainingCollection("calibration_points");}
function appendCalibrationPoint(p){return appendToTrainingCollection("calibration_points",p,"id");}

function loadLoadRecommendations(){return loadTrainingCollection("load_recommendations");}
function saveLoadRecommendations(list){saveTrainingCollection("load_recommendations",list);}

/* ProgressionState ist an (user_id, exercise_id, equipment_instance_id)
   gebunden (nicht an den Slot) — siehe 23-Abschluss-DECISION. */
function loadProgressionStates(){return loadTrainingCollection("progression_states");}
function upsertProgressionState(s){
  const list=loadTrainingCollection("progression_states");
  const idx=list.findIndex(x=>x.user_id===s.user_id&&x.exercise_id===s.exercise_id&&x.equipment_instance_id===s.equipment_instance_id);
  const next=idx===-1?list.concat([s]):list.map((x,i)=>i===idx?s:x);
  saveTrainingCollection("progression_states",next);
  return next;
}

function loadDailyTargets(){return loadTrainingCollection("daily_targets");}
function saveDailyTargets(list){saveTrainingCollection("daily_targets",list);}

function loadRepDecayProfiles(){return loadTrainingCollection("rep_decay_profiles");}
function saveRepDecayProfiles(list){saveTrainingCollection("rep_decay_profiles",list);}

function loadExerciseRoundingDebts(){return loadTrainingCollection("exercise_rounding_debts");}
function saveExerciseRoundingDebts(list){saveTrainingCollection("exercise_rounding_debts",list);}

/* RirCalibrationEvent: append-only. */
function loadRirCalibrationEvents(){return loadTrainingCollection("rir_calibration_events");}
function appendRirCalibrationEvent(e){return appendToTrainingCollection("rir_calibration_events",e,"id");}

function loadVolumeSnapshots(){return loadTrainingCollection("volume_snapshots");}
function saveVolumeSnapshots(list){saveTrainingCollection("volume_snapshots",list);}

function loadVolumeDeficits(){return loadTrainingCollection("volume_deficits");}
function saveVolumeDeficits(list){saveTrainingCollection("volume_deficits",list);}

/* ===== Schema-Version / Migration ===== */
/* Erste Version dieses Packs: es gibt noch keine vorherige
   Trainings-Domain-Persistenz, also nichts zu migrieren — die Funktion
   setzt nur die Versionsmarke, damit spaetere Packs einen definierten
   Einstiegspunkt haben. Beruehrt AUSSCHLIESSLICH "tracker_training_*"-Keys,
   nie bestehende Ernaehrungs-/Gewichts-/Sport-Daten. Idempotent: mehrfacher
   Aufruf (z.B. bei jedem Seitenaufruf) veraendert nach dem ersten Mal
   nichts mehr. */
function migrateTrainingStorage(){
  const current=load(TRAINING_SCHEMA_VERSION_KEY,0);
  if(current>=TRAINING_DOMAIN_SCHEMA_VERSION)return {migrated:false,version:current};
  /* Platz fuer kuenftige schrittweise Migrationen (if(current<2){...} usw.),
     analog zu deterministischen CatalogMigrationRecord-Eintraegen (23.1) —
     fuer v1 gibt es noch keinen Vorgaengerzustand. */
  save(TRAINING_SCHEMA_VERSION_KEY,TRAINING_DOMAIN_SCHEMA_VERSION);
  return {migrated:true,fromVersion:current,toVersion:TRAINING_DOMAIN_SCHEMA_VERSION};
}
function trainingSchemaVersion(){return load(TRAINING_SCHEMA_VERSION_KEY,0);}

if(typeof module!=="undefined" && module.exports){
  module.exports={
    TRAINING_STORAGE_PREFIX,trainingKey,
    loadTrainingCollection,saveTrainingCollection,appendToTrainingCollection,upsertInTrainingCollection,findInTrainingCollection,
    loadUserTrainingProfile,saveUserTrainingProfile,getOrCreateLocalTrainingUserId,
    loadBodyweightEvents,appendBodyweightEvent,
    loadTrainingLocations,upsertTrainingLocation,
    loadAvailabilityEvents,appendAvailabilityEvent,
    loadLocationInventoryEvents,appendLocationInventoryEvent,
    loadExercisePreferences,saveExercisePreferences,
    loadPatternCautions,savePatternCautions,
    loadSubstitutionPairScores,saveSubstitutionPairScores,
    loadExerciseDefinitionVersions,upsertExerciseDefinitionVersion,
    loadExerciseSetupVariants,upsertExerciseSetupVariant,
    loadExerciseSetups,upsertExerciseSetup,
    loadResolvedSetupBindings,upsertResolvedSetupBinding,
    loadExerciseRelations,saveExerciseRelations,
    loadCuratedSubstituteGroups,upsertCuratedSubstituteGroup,
    loadCuratedVetos,saveCuratedVetos,
    loadEquipmentDefinitionVersions,upsertEquipmentDefinitionVersion,
    loadEquipmentInstances,upsertEquipmentInstance,
    loadAttachmentInstances,upsertAttachmentInstance,
    loadEquipmentProfileVersions,upsertEquipmentProfileVersion,
    loadLoadProfileVersions,upsertLoadProfileVersion,
    loadCatalogMigrationRecords,appendCatalogMigrationRecord,
    loadPlans,upsertPlan,findPlan,
    loadPlanBlocks,upsertPlanBlock,
    loadPlanVersions,appendPlanVersion,
    loadSessionTemplates,upsertSessionTemplate,
    loadPlanSlots,upsertPlanSlot,
    loadSessionInstances,upsertSessionInstance,findSessionInstance,
    loadSlotExecutions,upsertSlotExecution,
    loadPrescriptions,upsertPrescription,
    loadSessionOverrides,saveSessionOverrides,
    loadTimeBudgetOverrides,upsertTimeBudgetOverride,
    loadTimeModelConfigHistory,appendTimeModelConfig,currentTimeModelConfig,
    loadPerformanceInterpretationConfigHistory,appendPerformanceInterpretationConfig,currentPerformanceInterpretationConfig,
    loadDeloadProposals,upsertDeloadProposal,
    loadDeloadOverlays,saveDeloadOverlays,
    loadValidationAcknowledgments,saveValidationAcknowledgments,
    loadMutationCommands,submitMutationCommand,loadMutationResults,appendMutationResult,
    loadWorkoutLogs,appendWorkoutLog,findWorkoutLog,
    loadWorkoutLogCorrections,appendWorkoutLogCorrection,effectiveWorkoutLog,
    loadExercisePerformanceProfiles,upsertExercisePerformanceProfile,
    loadCalibrationPoints,appendCalibrationPoint,
    loadLoadRecommendations,saveLoadRecommendations,
    loadProgressionStates,upsertProgressionState,
    loadDailyTargets,saveDailyTargets,
    loadRepDecayProfiles,saveRepDecayProfiles,
    loadExerciseRoundingDebts,saveExerciseRoundingDebts,
    loadRirCalibrationEvents,appendRirCalibrationEvent,
    loadVolumeSnapshots,saveVolumeSnapshots,
    loadVolumeDeficits,saveVolumeDeficits,
    migrateTrainingStorage,trainingSchemaVersion,TRAINING_SCHEMA_VERSION_KEY,
  };
}
