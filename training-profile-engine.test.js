/* training-profile-engine.test.js — Tests fuer training-profile-engine.js
   (TRAINING SYSTEM v1.4.1, IMPLEMENTATION PACK 02/14: User Profile/
   Onboarding/Split-Praeferenz-UX).

   Deckt ab: §1.3 Experience-Eligibility (vor/nach 12 Sessions, gemapptes
   Selbstauskunft vs. gemessener Wert), §1.3 Skill-Startwerte und
   Erhoehungsregel (alle Bedingungen noetig, nie automatische Absenkung),
   §1.2 Onboarding-Vollstaendigkeitspruefung (genau 7 Pflichtfelder, keine
   verstecken zusaetzlichen), §1.4 BODYWEIGHT_ONLY-Guard. */
/* training-domain.js definiert seine Funktionen/Enums als globale Browser-
   Funktionen (kein CommonJS-Modul) — training-profile-engine.js nutzt sie
   bewusst als bare Identifier (siehe Kommentar dort), analog zu
   training-storage.js. Fuer den Node-Test daher per vm.runInThisContext()
   in den globalen Kontext geladen, exakt wie training-storage.test.js es
   fuer training-storage.js tut. */
const fs=require("fs");
const path=require("path");
const vm=require("vm");
vm.runInThisContext(fs.readFileSync(path.join(__dirname,"training-domain.js"),"utf8"),{filename:"training-domain.js"});
const TP=require("./training-profile-engine.js");
/* Zusaetzlich als normales CommonJS-Modul geladen, fuer die direkte
   Verwendung der Entity-Fabriken (createWorkoutLog etc.) in diesem Test. */
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

console.log("========== §1.3 computeTrainingStats (aus WorkoutLog-Foundation) ==========");
{
  const ctx=TD.createEvaluationContext({evaluation_at:new Date(2026,7,15),user_timezone:"Europe/Berlin",config_version:1,catalog_version:1,source_event_revision:1});
  assertThrows(()=>TP.computeTrainingStats([],[],{}),"computeTrainingStats ohne evaluation_at wirft (kein verstecktes now())");
  assertEq(TP.computeTrainingStats([],[],ctx),{loggedSessionsTotal:0,monthsSinceFirstSession:0},"Keine Logs -> 0 Sessions, 0 Monate");

  const base={user_id:"u1",plan_id:"p1",plan_version_id:"pv1",session_id:"s1",session_instance_id:"si1",slot_execution_id:"se1",slot_id:"ps1",exercise_id:"ex1",exercise_definition_version:1,resolved_setup_binding_snapshot:{},prescription_snapshot:{},authority_mode_at_execution:"AUTOMATIC",session_status:"COMPLETE"};
  const log1=TD.createWorkoutLog({...base,id:"wl1",performed_at:"2026-01-01T00:00:00Z",recorded_at:"2026-01-01T00:00:00Z"});
  const log2=TD.createWorkoutLog({...base,id:"wl2",performed_at:"2026-03-01T00:00:00Z",recorded_at:"2026-03-01T00:00:00Z"});
  const stats=TP.computeTrainingStats([log1,log2],[],ctx);
  assertEq(stats.loggedSessionsTotal,2,"2 WorkoutLogs -> logged_sessions_total=2");
  assertEq(stats.monthsSinceFirstSession,7,"aeltester Log 01.01.2026 -> evaluation_at 15.08.2026 = 7 volle Monate");

  // Ein per VOID_AND_REPLACE annullierter Log zaehlt nicht mit (contributes_zero).
  const voidCorr=TD.createWorkoutLogCorrection({id:"c1",workout_log_id:"wl2",operation:"VOID_AND_REPLACE",replacement_workout_log_id:"wl3",effective_at:"2026-03-02T00:00:00Z",recorded_at:"2026-03-02T00:00:00Z",reason:"falsche Uebung geloggt",actor:"USER",idempotency_key:"k1"});
  const statsAfterVoid=TP.computeTrainingStats([log1,log2],[voidCorr],ctx);
  assertEq(statsAfterVoid.loggedSessionsTotal,1,"Ein VOID_AND_REPLACE-annullierter Log zaehlt nicht zu logged_sessions_total");
}

console.log("========== §1.3 Experience-Eligibility vor/nach 12 Sessions ==========");
{
  // Vor 12 Sessions: experience_self gemappt, Confidence LOW — auch wenn
  // months_since_first_session hoch genug fuer ADVANCED waere.
  const preTwelve=TP.resolveExperienceEligibility({loggedSessionsTotal:11,monthsSinceFirstSession:30,experienceSelf:"EXPERIENCED"});
  assertEq(preTwelve,{level:"ADVANCED",confidence:"LOW",source:"SELF_REPORTED_MAPPED"},"Vor 12 Sessions: experience_self=EXPERIENCED wird auf ADVANCED gemappt, Confidence LOW");
  assertEq(TP.resolveExperienceEligibility({loggedSessionsTotal:0,monthsSinceFirstSession:0,experienceSelf:"NEW"}),{level:"BEGINNER",confidence:"LOW",source:"SELF_REPORTED_MAPPED"},"NEW -> BEGINNER (gemappt)");
  assertEq(TP.resolveExperienceEligibility({loggedSessionsTotal:5,monthsSinceFirstSession:1,experienceSelf:"SOME"}),{level:"INTERMEDIATE",confidence:"LOW",source:"SELF_REPORTED_MAPPED"},"SOME -> INTERMEDIATE (gemappt)");

  // Ab 12 Sessions: gemessener Wert gewinnt, AUCH wenn niedriger als
  // Selbstauskunft (§1.3: "auch wenn er niedriger ist als die Selbstauskunft").
  const postTwelveLow=TP.resolveExperienceEligibility({loggedSessionsTotal:12,monthsSinceFirstSession:1,experienceSelf:"EXPERIENCED"});
  assertEq(postTwelveLow,{level:"BEGINNER",confidence:null,source:"MEASURED"},"Ab 12 Sessions gewinnt der gemessene Wert (BEGINNER), obwohl Selbstauskunft EXPERIENCED war");
  assertEq(TP.resolveExperienceEligibility({loggedSessionsTotal:50,monthsSinceFirstSession:6,experienceSelf:"NEW"}),{level:"INTERMEDIATE",confidence:null,source:"MEASURED"},"50 Sessions + 6 Monate -> INTERMEDIATE (gemessen)");
  assertEq(TP.resolveExperienceEligibility({loggedSessionsTotal:200,monthsSinceFirstSession:24,experienceSelf:"NEW"}),{level:"ADVANCED",confidence:null,source:"MEASURED"},"200 Sessions + 24 Monate -> ADVANCED (gemessen)");
  assertEq(TP.resolveExperienceEligibility({loggedSessionsTotal:200,monthsSinceFirstSession:23,experienceSelf:"NEW"}),{level:"INTERMEDIATE",confidence:null,source:"MEASURED"},"200 Sessions aber nur 23 Monate -> ADVANCED-Bedingung nicht erfuellt, faellt auf INTERMEDIATE (50/6 weiterhin erfuellt)");
  assertEq(TP.resolveExperienceEligibility({loggedSessionsTotal:49,monthsSinceFirstSession:12,experienceSelf:"NEW"}),{level:"BEGINNER",confidence:null,source:"MEASURED"},"49 Sessions -> unterhalb INTERMEDIATE-Schwelle, BEGINNER");

  assertEq(TP.snapshotExperienceLevel("INTERMEDIATE"),"INTERMEDIATE","snapshotExperienceLevel gibt den Eligibility-Wert unveraendert als Snapshot weiter");
}

console.log("========== §1.3 user_skill_level Startwerte und Erhoehungsregel ==========");
{
  assertEq(TP.initialSkillLevel("NEW"),2,"Start=2 bei NEW");
  assertEq(TP.initialSkillLevel("SOME"),3,"Start=3 bei SOME");
  assertEq(TP.initialSkillLevel("EXPERIENCED"),4,"Start=4 bei EXPERIENCED");
  assertThrows(()=>TP.initialSkillLevel("UNKNOWN"),"initialSkillLevel mit unbekanntem experience_self wirft");

  const allConditionsMet={currentLevel:2,sessionsSinceLastIncrease:12,distinctQualifyingExerciseCount:8,weeksSinceLastIncrease:8};
  assert(TP.canIncreaseSkillLevel(allConditionsMet),"Alle drei Bedingungen erfuellt -> Erhoehung erlaubt");
  assertEq(TP.nextSkillLevel(2,true),3,"nextSkillLevel erhoeht bei erfuellten Bedingungen um 1");

  // Jede einzelne Bedingung fuer sich MUSS die Erhoehung verhindern.
  assert(!TP.canIncreaseSkillLevel({...allConditionsMet,sessionsSinceLastIncrease:11}),"<12 Sessions seit letzter Erhoehung -> keine Erhoehung");
  assert(!TP.canIncreaseSkillLevel({...allConditionsMet,distinctQualifyingExerciseCount:7}),"<8 verschiedene Uebungen -> keine Erhoehung");
  assert(!TP.canIncreaseSkillLevel({...allConditionsMet,weeksSinceLastIncrease:7}),"<8 Wochen seit letzter Erhoehung -> keine Erhoehung");

  // Maximum 5.
  assert(!TP.canIncreaseSkillLevel({...allConditionsMet,currentLevel:5}),"Bei currentLevel=5 (Maximum) keine weitere Erhoehung");
  assertEq(TP.nextSkillLevel(5,true),5,"nextSkillLevel klemmt auf Maximum 5, auch wenn Bedingungen (fiktiv) erfuellt waeren");

  // INVARIANT P-2: niemals automatische Absenkung.
  assertEq(TP.nextSkillLevel(3,false),3,"nextSkillLevel senkt NIE ab, wenn Bedingungen nicht erfuellt sind (bleibt auf aktuellem Level)");
  assertEq(TP.SKILL_LEVEL_MIN,1,"SKILL_LEVEL_MIN=1 dokumentiert, aber nextSkillLevel hat keinen Codepfad unterhalb des aktuellen Levels");
}

console.log("========== §1.2 Onboarding-Vollstaendigkeit: genau 7 Pflichtfelder ==========");
{
  assertEq(TP.ONBOARDING_REQUIRED_FIELDS.length,7,"INVARIANT P-1: genau 7 Pflichtfelder, kein achtes verstecktes");
  const complete={
    goal:"HYPERTROPHY",experience_self:"SOME",training_days_per_week:4,
    session_time_budget_min:60,primary_location_id:"loc1",equipment_profile_confirmed:true,
    bodyweight_kg:80,
  };
  assertEq(TP.checkOnboardingCompleteness(complete),{complete:true,missing:[]},"Mit genau den 7 Pflichtangaben ist der Abschluss vollstaendig");

  // Optionale Felder duerfen den Abschluss nicht blockieren — auch wenn sie
  // fehlen ODER mitgegeben werden, aendert sich am complete-Status nichts.
  assertEq(TP.checkOnboardingCompleteness(complete).complete,true,"Fehlende OPTIONAL-Felder (priority_muscles/preferred_split/...) blockieren den Abschluss nicht");
  assertEq(TP.checkOnboardingCompleteness({...complete,preferred_split:"PPL",uses_rir:true,rest_preference:"LONG",priority_muscles:["CHEST"]}).complete,true,"Mitgegebene OPTIONAL-Felder aendern nichts am complete-Status");

  TP.ONBOARDING_REQUIRED_FIELDS.forEach(field=>{
    const withoutField={...complete};delete withoutField[field];
    const result=TP.checkOnboardingCompleteness(withoutField);
    assertEq(result.complete,false,"Fehlendes Pflichtfeld '"+field+"' verhindert den Abschluss");
    assert(result.missing.indexOf(field)!==-1,"'"+field+"' erscheint in missing[]");
  });

  assertEq(TP.checkOnboardingCompleteness({...complete,goal:"NOT_A_GOAL"}).complete,false,"Ungueltiger goal-Wert verhindert den Abschluss");
  assertEq(TP.checkOnboardingCompleteness({...complete,experience_self:"INTERMEDIATE"}).complete,false,"Ungueltiger experience_self-Wert verhindert den Abschluss");
  assertEq(TP.checkOnboardingCompleteness({...complete,training_days_per_week:1}).complete,false,"training_days_per_week ausserhalb [2,6] verhindert den Abschluss");
  assertEq(TP.checkOnboardingCompleteness({...complete,session_time_budget_min:15}).complete,false,"session_time_budget_min ausserhalb [20,120] verhindert den Abschluss");
  assertEq(TP.checkOnboardingCompleteness({...complete,bodyweight_kg:400}).complete,false,"bodyweight_kg ausserhalb [30,250] verhindert den Abschluss");
  assertEq(TP.checkOnboardingCompleteness({...complete,equipment_profile_confirmed:false}).complete,false,"equipment_profile_confirmed=false verhindert den Abschluss");
}

console.log("========== §1.4 BODYWEIGHT_ONLY erfindet kein Equipment ==========");
{
  assert(TP.isBodyweightOnlyLocationType("BODYWEIGHT_ONLY"),"BODYWEIGHT_ONLY wird korrekt erkannt");
  assert(!TP.isBodyweightOnlyLocationType("HOME_GYM"),"HOME_GYM ist NICHT BODYWEIGHT_ONLY");
  assert(!TP.isBodyweightOnlyLocationType("COMMERCIAL_GYM"),"COMMERCIAL_GYM ist NICHT BODYWEIGHT_ONLY");
}

console.log("\n"+passed+" bestanden, "+failed+" fehlgeschlagen");
process.exit(failed>0?1:0);
