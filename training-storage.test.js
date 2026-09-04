/* training-storage.test.js — Tests fuer training-storage.js (localStorage-
   Persistenz-/Migrationsschicht des TRAINING-Datenmodells, Pack 01/14).

   storage.js und training-domain.js definieren ihre Funktionen als
   globale Browser-Funktionen (kein CommonJS-Modul) — fuer den Node-Test
   werden sie per vm.runInThisContext() in den globalen Kontext geladen,
   exakt wie sie im Browser via <script> verfuegbar waeren. Node kennt kein
   natives localStorage, daher ein minimaler In-Memory-Mock VOR dem Laden
   von storage.js (dessen load()/save() bare "localStorage.getItem/
   setItem" aufrufen). */
const fs=require("fs");
const path=require("path");
const vm=require("vm");

function makeMockLocalStorage(){
  const store={};
  return {
    getItem:(k)=>Object.prototype.hasOwnProperty.call(store,k)?store[k]:null,
    setItem:(k,v)=>{store[k]=String(v);},
    removeItem:(k)=>{delete store[k];},
    clear:()=>{Object.keys(store).forEach(k=>delete store[k]);},
    get __store(){return store;},
  };
}
global.localStorage=makeMockLocalStorage();
vm.runInThisContext(fs.readFileSync(path.join(__dirname,"storage.js"),"utf8"),{filename:"storage.js"});
vm.runInThisContext(fs.readFileSync(path.join(__dirname,"training-domain.js"),"utf8"),{filename:"training-domain.js"});
const TS=require("./training-storage.js");
/* Zusaetzlich als normales CommonJS-Modul geladen, NUR um im Test auf
   TRAINING_DOMAIN_SCHEMA_VERSION zuzugreifen — "const" aus einem per
   vm.runInThisContext geladenen Skript haengt sich (anders als
   Funktionsdeklarationen) nicht an globalThis, ist also von hier aus nicht
   als bare Identifier erreichbar. Training-storage.js selbst nutzt
   weiterhin ausschliesslich die per vm.runInThisContext geladenen
   globalen Funktionen/Konstanten, exakt wie im Browser. */
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
function resetStorage(){global.localStorage.clear();}

console.log("========== Schema-Version / Migration ==========");
{
  resetStorage();
  assertEq(TS.trainingSchemaVersion(),0,"Vor jeder Migration: Version 0 (noch keine Trainings-Persistenz vorhanden)");
  const first=TS.migrateTrainingStorage();
  assertEq(first,{migrated:true,fromVersion:0,toVersion:TD.TRAINING_DOMAIN_SCHEMA_VERSION},"Erste Migration setzt die Versionsmarke");
  assertEq(TS.trainingSchemaVersion(),TD.TRAINING_DOMAIN_SCHEMA_VERSION,"Version danach korrekt gesetzt");
  const second=TS.migrateTrainingStorage();
  assertEq(second.migrated,false,"Zweiter Aufruf ist ein No-Op (idempotent)");
}

console.log("========== Isolation: beruehrt keine bestehenden Nicht-Training-Keys ==========");
{
  resetStorage();
  save("tracker_data",{"2026-8-15":{weight:80}});
  save("tracker_goals",[{id:"g1"}]);
  TS.migrateTrainingStorage();
  TS.saveUserTrainingProfile({user_id:"u1"});
  assertEq(load("tracker_data",null),{"2026-8-15":{weight:80}},"Bestehende Ernaehrungs-/Gewichtsdaten bleiben von der Training-Persistenz unberuehrt");
  assertEq(load("tracker_goals",null),[{id:"g1"}],"Bestehende Ziele bleiben unberuehrt");
  const keys=Object.keys(global.localStorage.__store).filter(k=>k.indexOf("tracker_training_")===0);
  assert(keys.length>0,"Training-Keys leben unter einem eigenen 'tracker_training_'-Namensraum");
}

console.log("========== UserTrainingProfile: Singleton, keine erfundenen Defaults ==========");
{
  resetStorage();
  assertEq(TS.loadUserTrainingProfile(),null,"Ohne vorherigen Save: null (kein automatisch erzeugtes Profil)");
  const profile=createUserTrainingProfile({user_id:"u1",goal:"HYPERTROPHY",experience_self:"INTERMEDIATE",training_days_per_week:4,session_time_budget_min:60,primary_location_id:"loc1",bodyweight_kg:80,preferred_split:"UPPER_LOWER",uses_rir:true,rest_preference:"STANDARD",experience_level_eligible:"INTERMEDIATE",experience_level:"INTERMEDIATE",user_skill_level:2});
  TS.saveUserTrainingProfile(profile);
  assertEq(TS.loadUserTrainingProfile(),profile,"Roundtrip: gespeichertes Profil wird unveraendert zurueckgegeben");
}

console.log("========== BodyweightEvent: append-only ==========");
{
  resetStorage();
  const e1=createBodyweightEvent({event_id:"bw1",user_id:"u1",bodyweight_kg:80,effective_at:"2026-08-01T00:00:00Z",recorded_at:"2026-08-01T00:00:00Z",source:"USER_ENTRY"});
  const r1=TS.appendBodyweightEvent(e1);
  assertEq(r1.appended,true,"Erster Append erfolgreich");
  assertEq(TS.loadBodyweightEvents().length,1,"Genau 1 Event gespeichert");
  const r2=TS.appendBodyweightEvent(e1); // exakt derselbe event_id nochmal
  assertEq(r2.appended,false,"Doppelter Append mit identischem event_id wird NICHT erneut gespeichert (kein Duplikat, kein Ueberschreiben)");
  assertEq(TS.loadBodyweightEvents().length,1,"Weiterhin genau 1 Event nach doppeltem Append-Versuch");
  const e2=createBodyweightEvent({event_id:"bw2",user_id:"u1",bodyweight_kg:79.5,effective_at:"2026-08-08T00:00:00Z",recorded_at:"2026-08-08T00:00:00Z",source:"USER_ENTRY"});
  TS.appendBodyweightEvent(e2);
  assertEq(TS.loadBodyweightEvents().length,2,"Ein echtes zweites Event wird zusaetzlich gespeichert");
}

console.log("========== WorkoutLog: append-only + immutable-Guard ==========");
{
  resetStorage();
  const baseFields={id:"wl1",user_id:"u1",plan_id:"p1",plan_version_id:"pv1",session_id:"s1",session_instance_id:"si1",slot_execution_id:"se1",slot_id:"ps1",exercise_id:"ex1",exercise_definition_version:1,resolved_setup_binding_snapshot:{},prescription_snapshot:{},authority_mode_at_execution:"AUTOMATIC",performed_at:"2026-08-15T00:00:00Z",recorded_at:"2026-08-15T00:00:00Z",session_status:"COMPLETE"};
  const log=createWorkoutLog(baseFields);
  const r=TS.appendWorkoutLog(log);
  assertEq(r.appended,true,"WorkoutLog erfolgreich angehaengt");
  assertThrows(()=>TS.appendWorkoutLog({...log,immutable:false}),"appendWorkoutLog verweigert einen Log ohne immutable:true (Persistenz-Guard)");
  assertEq(TS.findWorkoutLog("wl1").id,"wl1","findWorkoutLog findet den gespeicherten Log");
  TS.appendWorkoutLog(log); // erneuter Versuch, identische id
  assertEq(TS.loadWorkoutLogs().length,1,"Doppelter Append derselben id erzeugt kein Duplikat");
}

console.log("========== WorkoutLogCorrection + effectiveWorkoutLog-Projektion ==========");
{
  resetStorage();
  const log=createWorkoutLog({id:"wl1",user_id:"u1",plan_id:"p1",plan_version_id:"pv1",session_id:"s1",session_instance_id:"si1",slot_execution_id:"se1",slot_id:"ps1",exercise_id:"ex1",exercise_definition_version:1,resolved_setup_binding_snapshot:{},prescription_snapshot:{},authority_mode_at_execution:"AUTOMATIC",performed_at:"2026-08-15T00:00:00Z",recorded_at:"2026-08-15T00:00:00Z",session_status:"COMPLETE"});
  TS.appendWorkoutLog(log);
  assertEq(TS.effectiveWorkoutLog("wl1").session_status,"COMPLETE","Ohne Korrekturen entspricht die effektive Projektion dem Basislog");
  const correction=createWorkoutLogCorrection({id:"c1",workout_log_id:"wl1",operation:"PATCH_FIELD",path:"session_status",new_value:"PARTIAL",effective_at:"2026-08-16T00:00:00Z",recorded_at:"2026-08-16T00:00:00Z",reason:"korrigiert",actor:"USER",idempotency_key:"k1"});
  TS.appendWorkoutLogCorrection(correction);
  assertEq(TS.effectiveWorkoutLog("wl1").session_status,"PARTIAL","Nach Korrektur zeigt effectiveWorkoutLog den korrigierten Stand");
  assertEq(TS.findWorkoutLog("wl1").session_status,"COMPLETE","Der gespeicherte Basislog selbst bleibt unveraendert (append-only)");
  assertEq(TS.effectiveWorkoutLog("does-not-exist"),null,"Unbekannte id liefert null statt zu crashen");
}

console.log("========== Mutation-Idempotenz end-to-end ueber die Storage-Schicht ==========");
{
  resetStorage();
  const cmd=createMutationCommand({command_id:"m1",idempotency_key:"idem-a",actor:"USER",evaluation_context:{},payload_hash:"h1",created_at:"2026-08-15T00:00:00Z"});
  const first=TS.submitMutationCommand(cmd);
  assertEq(first.outcome,"NEW","Erster Submit: NEW");
  assertEq(TS.loadMutationCommands().length,1,"Command wurde gespeichert");
  const dup=TS.submitMutationCommand({...cmd,command_id:"m2"});
  assertEq(dup.outcome,"DUPLICATE","Zweiter Submit mit gleichem Key+Payload: DUPLICATE");
  assertEq(TS.loadMutationCommands().length,1,"Kein zusaetzlicher Eintrag bei DUPLICATE");
  const conflict=TS.submitMutationCommand({...cmd,command_id:"m3",payload_hash:"h2"});
  assertEq(conflict.outcome,"IDEMPOTENCY_CONFLICT","Dritter Submit mit gleichem Key + anderem Payload: IDEMPOTENCY_CONFLICT");
  assertEq(TS.loadMutationCommands().length,1,"Kein zusaetzlicher Eintrag bei IDEMPOTENCY_CONFLICT");
}

console.log("========== Plan: upsert/find (nicht append-only) ==========");
{
  resetStorage();
  const plan=createPlan({id:"p1",user_id:"u1",goal:"HYPERTROPHY",plan_origin:"GENERATED",control_authority_default:"AUTOMATIC",status:"ACTIVE",current_version_id:"pv1",created_at:"2026-08-15T00:00:00Z"});
  TS.upsertPlan(plan);
  assertEq(TS.findPlan("p1").status,"ACTIVE","Plan gefunden nach erstem upsert");
  TS.upsertPlan({...plan,status:"PAUSED"});
  assertEq(TS.loadPlans().length,1,"upsert mit gleicher id ERSETZT den bestehenden Eintrag, dupliziert nicht");
  assertEq(TS.findPlan("p1").status,"PAUSED","Ersetzter Plan traegt den aktualisierten Status");
}

console.log("========== ProgressionState: Bindung an (user, exercise, equipment_instance), nicht an Slot ==========");
{
  resetStorage();
  const state=createProgressionState({user_id:"u1",exercise_id:"ex1",equipment_instance_id:"ei1",model:"TARGET_PROGRESSION",phase:"BUILDING",current_load:80,prescription_band_snapshot:{},target_total_reps:18,frontier_load_step_index:2,frontier_target_total_reps:18,miss_streak:0,hard_failure_streak:0,local_stall_count:0,rep_bridge_active:false,readiness_overlay_active:false,predictive_confidence:"MEDIUM",effort_accuracy_tier:"MEDIUM",last_evaluated_session_id:"si1"});
  TS.upsertProgressionState(state);
  TS.upsertProgressionState({...state,phase:"READY_TO_INCREASE"});
  assertEq(TS.loadProgressionStates().length,1,"upsert fuer dieselbe (user,exercise,equipment)-Kombination ersetzt statt zu duplizieren");
  assertEq(TS.loadProgressionStates()[0].phase,"READY_TO_INCREASE","Aktualisierter Zustand wird uebernommen");
  const otherEquipment=createProgressionState({...state,equipment_instance_id:"ei2"});
  TS.upsertProgressionState(otherEquipment);
  assertEq(TS.loadProgressionStates().length,2,"Andere equipment_instance_id erzeugt einen EIGENEN ProgressionState (Bindung exakt an user+exercise+equipment)");
}

console.log("========== Generische Collection-Helfer ==========");
{
  resetStorage();
  assertEq(TS.loadTrainingCollection("does_not_exist_yet"),[],"Unbekannte Collection laedt als leeres Array, kein Crash");
  const r1=TS.appendToTrainingCollection("test_collection",{id:"a",v:1},"id");
  assertEq(r1.appended,true,"Erster Append erfolgreich");
  const r2=TS.appendToTrainingCollection("test_collection",{id:"a",v:2},"id");
  assertEq(r2.appended,false,"Zweiter Append mit gleicher id wird abgelehnt (append-only-Semantik bleibt gewahrt, v bleibt 1)");
  assertEq(TS.loadTrainingCollection("test_collection")[0].v,1,"Der urspruengliche Wert (v:1) bleibt erhalten, kein stilles Ueberschreiben");
  TS.upsertInTrainingCollection("test_collection",{id:"a",v:2},"id");
  assertEq(TS.loadTrainingCollection("test_collection")[0].v,2,"upsert (bewusst eine andere Funktion) darf dagegen ersetzen");
  assertEq(TS.findInTrainingCollection("test_collection","id","a").v,2,"findInTrainingCollection findet den aktuellen Eintrag");
  assertEq(TS.findInTrainingCollection("test_collection","id","missing"),null,"Nicht vorhandene id liefert null");
}

console.log("\n"+passed+" bestanden, "+failed+" fehlgeschlagen");
process.exit(failed>0?1:0);
