/* training-profile-engine.js — TRAINING SYSTEM v1.4.1, IMPLEMENTATION PACK
   02/14: User Profile / Onboarding / Split-Praeferenz-UX.

   Quelle: 02_USER_PROFILE_ONBOARDING_SPLIT_PREFERENCE_UX.md (wortgetreue
   v1.4.1-Auszuege, Primary Scope Master-Zeilen 377-668, plus die dort
   ausdruecklich referenzierten Dependency-Contract-Auszuege, soweit fuer
   diesen Scope technisch benoetigt: §0.2-P0/P1/P2-Rahmen als Kontext fuer
   INVARIANT P-EX1, keine eigene Logik daraus).

   ABSICHTLICH NUR DIESER SCOPE: dieses File enthaelt reine,
   deterministische Funktionen fuer
     - §1.3 Ableitung von Erfahrung (experience_level_eligible) und Skill
       (user_skill_level),
     - die 7-Felder-Onboarding-Vollstaendigkeitspruefung aus §1.2
       (INVARIANT P-1: mit genau diesen 7 Feldern ist ein Plan vollstaendig
       erzeugbar; kein achtes verstecktes Pflichtfeld),
     - BODYWEIGHT_ONLY-Equipment-Guard (§1.4).
   KEINE Split-/Volume-/Slot-/Selection-/Prescription-Engine, KEIN Plan
   Generator, KEINE Equipment-Feasibility-/Support-Engine (STEP 06) — jene
   folgen in spaeteren Packs. Die eigentliche Split-Bewertung (§3/§3.4)
   ist ausdruecklich NICHT Teil dieses Packs; `preferred_split` wird hier
   nur als Datum erfasst/validiert (validatePreferredSplit ruft die in
   training-domain.js bereits vorhandene PREFERRED_SPLIT-Enum-Pruefung auf),
   nicht bewertet.

   Physisch nach demselben Muster wie training-domain.js/chart-resolution.js
   ausgelagert: reine, DOM-/React-/localStorage-unabhaengige Funktionen, per
   normalem <script src="training-profile-engine.js"> NACH training-
   domain.js geladen (keine ES-Module, keine Ladereihenfolge-Abhaengigkeit
   fuer den tatsaechlichen Aufruf ausser der Skript-Reihenfolge selbst).

   ABGRENZUNG zu §1.3 "user_skill_level +1"-Bedingung: Die Bedingung
   "≥8 verschiedene Uebungen mit technical_demand ≥ aktuellem Level sauber
   absolviert (keine SET_DECAY_MISMATCH-Sitzung)" erfordert Prescription-/
   Progression-Zustand (SET_DECAY_MISMATCH-Flag), der explizit ausserhalb
   dieses Packs liegt ("Keine spaeteren Volume-/Prescription-Regeln selbst
   implementieren"). canIncreaseSkillLevel() bildet die Entscheidungsregel
   exakt als reine Funktion bereits ausgezaehlter Bedingungen ab; das
   Auszaehlen von "distinctQualifyingExerciseCount" aus echten Sessions ist
   Aufgabe der spaeteren Progression-Engine, die dieses Pack bewusst nicht
   vorzieht. */

/* ================= §1.3 Erfahrung ================= */
/* "Vor 12 geloggten Sessions: experience_level_eligible = experience_self
   (gemappt), Confidence LOW." Diese Abbildung ist die einzige Stelle, die
   Selbstauskunft (ExperienceSelf) auf die planwirksame Werteliste
   (ExperienceLevel) projiziert — keine weitere/abweichende Mapping-Regel
   an anderer Stelle einfuehren (INVARIANT G-D3). */
const EXPERIENCE_SELF_TO_LEVEL_MAP=Object.freeze({
  NEW:"BEGINNER",SOME:"INTERMEDIATE",EXPERIENCED:"ADVANCED",
});

/* Reine Datumsarithmetik fuer "months_since_first_session" — kein now(),
   der Aufrufer liefert evaluation_at explizit (INVARIANT G-D1). Zaehlt
   volle Kalendermonate zwischen zwei Zeitpunkten (a <= b vorausgesetzt). */
function monthsBetween(a,b){
  const da=a instanceof Date?a:new Date(a);
  const db=b instanceof Date?b:new Date(b);
  let months=(db.getFullYear()-da.getFullYear())*12+(db.getMonth()-da.getMonth());
  if(db.getDate()<da.getDate())months--;
  return Math.max(0,months);
}

/* Ermittelt logged_sessions_total und months_since_first_session aus den
   vorhandenen WorkoutLogs (STEP-01-Foundation) plus deren Korrekturen
   (VOID_AND_REPLACE-Logs zaehlen nicht mit, siehe projectEffectiveWorkoutLog/
   contributes_zero) — reine Funktion ihrer dokumentierten Inputs (§0.3).
   projectEffectiveWorkoutLog wird bewusst wiederverwendet (bestehende
   Foundation-Funktion), statt die Voided-Pruefung hier ein zweites Mal zu
   erfinden. */
function computeTrainingStats(workoutLogs,workoutLogCorrections,evaluationContext){
  if(!evaluationContext||evaluationContext.evaluation_at===undefined)throw new Error("training-profile-engine: computeTrainingStats benoetigt evaluationContext.evaluation_at (kein verstecktes now())");
  const logs=workoutLogs||[];
  const corrections=workoutLogCorrections||[];
  const effective=logs
    .map(l=>projectEffectiveWorkoutLog(l,corrections))
    .filter(l=>l&&!l.contributes_zero);
  const loggedSessionsTotal=effective.length;
  if(loggedSessionsTotal===0)return {loggedSessionsTotal:0,monthsSinceFirstSession:0};
  const performedTimes=effective.map(l=>toComparableTime(l.performed_at));
  const firstPerformedAt=effective[performedTimes.indexOf(Math.min(...performedTimes))].performed_at;
  const monthsSinceFirstSession=monthsBetween(firstPerformedAt,evaluationContext.evaluation_at);
  return {loggedSessionsTotal,monthsSinceFirstSession};
}

/* §1.3 Formel, wortgetreu:
     ADVANCED      wenn logged_sessions_total >= 200 UND months_since_first_session >= 24
     INTERMEDIATE  wenn logged_sessions_total >= 50  UND months_since_first_session >= 6
     BEGINNER      sonst
   Diese Funktion liefert IMMER den "gemessenen" Wert, unabhaengig von der
   12-Sessions-Schwelle — die Schwelle selbst wird von
   resolveExperienceEligibility() angewendet. */
function deriveMeasuredExperienceLevelEligible(stats){
  const s=stats||{};
  const sessions=s.loggedSessionsTotal||0;
  const months=s.monthsSinceFirstSession||0;
  if(sessions>=200&&months>=24)return "ADVANCED";
  if(sessions>=50&&months>=6)return "INTERMEDIATE";
  return "BEGINNER";
}

/* "Vor 12 geloggten Sessions: experience_level_eligible = experience_self
   (gemappt), Confidence LOW. Ab 12 Sessions: der gemessene Eligibility-Wert
   gewinnt, auch wenn er niedriger ist als die Selbstauskunft." Kein
   Confidence-Wert fuer den gemessenen Zweig wird erfunden — die Spec nennt
   fuer diesen Fall keinen; nur der Selbstauskunft-Zweig traegt explizit
   LOW. */
function resolveExperienceEligibility({loggedSessionsTotal,monthsSinceFirstSession,experienceSelf}){
  if((loggedSessionsTotal||0)<12){
    return {level:EXPERIENCE_SELF_TO_LEVEL_MAP[experienceSelf],confidence:"LOW",source:"SELF_REPORTED_MAPPED"};
  }
  return {level:deriveMeasuredExperienceLevelEligible({loggedSessionsTotal,monthsSinceFirstSession}),confidence:null,source:"MEASURED"};
}

/* "experience_level ist der planwirksame Snapshot des Eligibility-Werts
   beim Start eines PlanBlocks." INVARIANT P-EX1: ein Wechsel von
   experience_level_eligible allein mutiert keinen laufenden PlanBlock —
   das Snapshotting darf daher NUR an der PlanBlock-Rollover-Grenze
   (spaeterer Plan-/Split-Engine-Pack) erneut aufgerufen werden, nie bei
   jeder Session. Fuer das initiale Onboarding (es existiert noch kein
   PlanBlock) ist der allererste Snapshot einfach der aktuelle
   Eligibility-Wert — es gibt nichts zu schuetzen, das laeuft. */
function snapshotExperienceLevel(eligibilityLevel){
  return eligibilityLevel;
}

/* ================= §1.3 Skill ================= */
const SKILL_LEVEL_MIN=1;
const SKILL_LEVEL_MAX=5;
const SKILL_LEVEL_START_BY_EXPERIENCE_SELF=Object.freeze({NEW:2,SOME:3,EXPERIENCED:4});
function initialSkillLevel(experienceSelf){
  const start=SKILL_LEVEL_START_BY_EXPERIENCE_SELF[experienceSelf];
  if(start===undefined)throw new Error("training-profile-engine: unbekannter experience_self-Wert fuer initialSkillLevel: "+JSON.stringify(experienceSelf));
  return start;
}
/* "+1 wenn ALLE erfuellt: >=12 Sessions seit letzter Erhoehung, >=8
   verschiedene Uebungen mit technical_demand >= aktuellem Level sauber
   absolviert, >=8 Wochen seit letzter Erhoehung. Maximum 5." Die drei
   Zaehlwerte sind bereits fertig ausgezaehlte Inputs (siehe Datei-Kopf-
   Kommentar zur bewussten Abgrenzung); diese Funktion trifft NUR die reine
   Entscheidung. */
function canIncreaseSkillLevel({currentLevel,sessionsSinceLastIncrease,distinctQualifyingExerciseCount,weeksSinceLastIncrease}){
  if((currentLevel||0)>=SKILL_LEVEL_MAX)return false;
  return (sessionsSinceLastIncrease||0)>=12
    && (distinctQualifyingExerciseCount||0)>=8
    && (weeksSinceLastIncrease||0)>=8;
}
/* INVARIANT P-2: user_skill_level sinkt nie automatisch — es gibt hier
   bewusst keinen Codepfad, der currentLevel verringert. */
function nextSkillLevel(currentLevel,conditionsMet){
  if(!conditionsMet)return currentLevel;
  return Math.min(SKILL_LEVEL_MAX,currentLevel+1);
}

/* ================= §1.2 Onboarding: genau 7 Pflichtfelder ================= */
/* INVARIANT P-1: ein Plan ist mit ausschliesslich diesen 7 Feldern
   vollstaendig erzeugbar. Diese Liste ist die EINZIGE Quelle dafuer, was
   den Onboarding-Abschluss blockiert — kein Aufrufer darf ein achtes,
   verstecktes Pflichtfeld ergaenzen. "equipment_profile" wird nicht als
   Profil-Feld gespeichert (siehe §1.4: Equipment lebt in TrainingLocation/
   EquipmentProfileVersion/EquipmentInstance), sondern hier als boolesches
   "equipmentProfileConfirmed" gepruft: eine (moeglicherweise leere, siehe
   BODYWEIGHT_ONLY) EquipmentProfileVersion wurde fuer den gewaehlten Ort
   angelegt. */
const ONBOARDING_REQUIRED_FIELDS=Object.freeze([
  "goal","experience_self","training_days_per_week","session_time_budget_min",
  "primary_location_id","equipment_profile_confirmed","bodyweight_kg",
]);
function checkOnboardingCompleteness(draft){
  const d=draft||{};
  const missing=[];
  if(!d.goal||Object.values(TRAINING_GOAL).indexOf(d.goal)===-1)missing.push("goal");
  if(!d.experience_self||Object.values(EXPERIENCE_SELF).indexOf(d.experience_self)===-1)missing.push("experience_self");
  const bounds=USER_TRAINING_PROFILE_FIELD_BOUNDS;
  if(typeof d.training_days_per_week!=="number"||d.training_days_per_week<bounds.training_days_per_week[0]||d.training_days_per_week>bounds.training_days_per_week[1])missing.push("training_days_per_week");
  if(typeof d.session_time_budget_min!=="number"||d.session_time_budget_min<bounds.session_time_budget_min[0]||d.session_time_budget_min>bounds.session_time_budget_min[1])missing.push("session_time_budget_min");
  if(!d.primary_location_id)missing.push("primary_location_id");
  if(!d.equipment_profile_confirmed)missing.push("equipment_profile_confirmed");
  if(typeof d.bodyweight_kg!=="number"||d.bodyweight_kg<bounds.bodyweight_kg[0]||d.bodyweight_kg>bounds.bodyweight_kg[1])missing.push("bodyweight_kg");
  return {complete:missing.length===0,missing};
}

/* ================= §1.4 BODYWEIGHT_ONLY-Guard ================= */
/* "BODYWEIGHT_ONLY impliziert nur Boden/Koerpergewicht, niemals Pull-up-Bar,
   Dip-Station, Ringe oder Suspension Trainer." Es gibt hier bewusst KEINE
   Funktion, die fuer BODYWEIGHT_ONLY irgendeine EquipmentInstance-Liste
   zurueckgibt — der Aufrufer (UI) ueberspringt den Equipment-Presets-Schritt
   fuer diesen Location-Typ komplett und legt eine EquipmentProfileVersion
   mit leerer instance_ids[] an. Diese Funktion dient nur als expliziter,
   testbarer Guard gegen versehentliches Vorbelegen. */
function isBodyweightOnlyLocationType(locationType){
  return locationType===TRAINING_LOCATION_TYPE.BODYWEIGHT_ONLY;
}

/* Node-Testzugriff (analog training-storage.js): KEIN eigener require()
   von training-domain.js hier — dieses File nutzt, exakt wie im Browser
   (<script>-Tag NACH training-domain.js), ausschliesslich die bereits
   global vorhandenen Bezeichner (projectEffectiveWorkoutLog,
   toComparableTime, TRAINING_GOAL, EXPERIENCE_SELF,
   USER_TRAINING_PROFILE_FIELD_BOUNDS, TRAINING_LOCATION_TYPE). Ein lokales
   "var X = TD.X" wuerde in der von browser-test-harness.js zu EINEM
   eval()-Aufruf zusammengefuegten Skriptfolge als Redeklaration desselben,
   bereits von training-domain.js per "const" vergebenen Namens kollidieren
   (SyntaxError "already been declared") — var-Deklarationen werden unabhaengig
   von der if-Bedingung an den Anfang des gemeinsamen Skript-Scopes gehoben.
   Der Testaufbau (training-profile-engine.test.js) laedt training-domain.js
   deshalb per vm.runInThisContext in denselben globalen Kontext, bevor
   dieses File per require() geladen wird — dieselbe Technik wie in
   training-storage.test.js. */
if(typeof module!=="undefined" && module.exports){
  module.exports={
    EXPERIENCE_SELF_TO_LEVEL_MAP,monthsBetween,computeTrainingStats,
    deriveMeasuredExperienceLevelEligible,resolveExperienceEligibility,snapshotExperienceLevel,
    SKILL_LEVEL_MIN,SKILL_LEVEL_MAX,SKILL_LEVEL_START_BY_EXPERIENCE_SELF,
    initialSkillLevel,canIncreaseSkillLevel,nextSkillLevel,
    ONBOARDING_REQUIRED_FIELDS,checkOnboardingCompleteness,
    isBodyweightOnlyLocationType,
  };
}
