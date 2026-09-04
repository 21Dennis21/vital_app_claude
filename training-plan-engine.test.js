/* training-plan-engine.test.js — Tests fuer training-plan-engine.js
   (TRAINING SYSTEM v1.4.1, IMPLEMENTATION PACK 03/14: Plan Requirements/
   Plan Generation Pipeline (Grenzen)/Split Engine).

   WICHTIG (STEP-03 Spec-Conformance-Korrektur): mehrere Werte, die die
   erste Fassung dieser Engine noch selbst berechnet/hartkodiert hatte
   (min_viable_session_slots je Split, PPL_UL_HYBRID-Frequenz, Muskelinhalt
   der session_templates[] je Split), sind jetzt PFLICHT-externe Inputs,
   weil v1.4.1 Pack 03 dafuer keine Formel/Werte nennt (siehe Kopf-
   Kommentar in training-plan-engine.js). Die folgenden TEST_* -Konstanten
   sind AUSDRUECKLICH NICHT normativ — sie dienen ausschliesslich dazu, die
   Algorithmen (SF1-SF6, SP1-SP6, Fallback) in diesem Test mit konkreten
   Zahlen/Strukturen auszufuehren. Kein Produktionscode liest diese
   Konstanten; sie werden hier nur an die Engine-Funktionen als expliziter
   Parameter uebergeben (siehe scoreSplitCandidate/selectSplit-Signatur).

   training-domain.js definiert seine Funktionen/Enums als globale Browser-
   Funktionen (kein CommonJS-Modul) — training-plan-engine.js nutzt sie
   bewusst als bare Identifier (analog training-storage.js/training-
   profile-engine.js). Fuer den Node-Test daher per vm.runInThisContext()
   in den globalen Kontext geladen. */
const fs=require("fs");
const path=require("path");
const vm=require("vm");
vm.runInThisContext(fs.readFileSync(path.join(__dirname,"training-domain.js"),"utf8"),{filename:"training-domain.js"});
const TP=require("./training-plan-engine.js");
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
function assertClose(actual,expected,label){
  const ok=Math.abs(actual-expected)<1e-9;
  if(ok){passed++;}else{failed++;console.error("❌ FAIL:",label,"— erwartet:",expected,"erhalten:",actual);}
}

const ALL_MUSCLES=Object.keys(TD.CANONICAL_VOLUME_MUSCLE_ID);
function uniformVolumeTargets(value){
  const vt={};
  ALL_MUSCLES.forEach(m=>vt[m]=value);
  return vt;
}
function fullCoverage(){
  const cov={};
  Object.keys(TP.SPLIT_CANDIDATES).forEach(k=>cov[k]=1.0);
  return cov;
}
function basePlanRequirements(overrides){
  return Object.assign({
    user_id:"u1",goal:"HYPERTROPHY",experience_level:"INTERMEDIATE",user_skill_level:2,
    training_days_per_week:4,session_time_budget_min:60,actual_session_duration_factor:1.0,
    priority_muscles:[],preferred_split:null,rest_preference:"STANDARD",uses_rir:false,
    primary_location_id:"loc1",training_weekdays:[1,2,3,4],
  },overrides||{});
}
function capacityFor(days,minutes,goal){
  const r=TP.resolveSessionCapacity({session_time_budget_min:minutes,reserve_s:0,goal:goal||"HYPERTROPHY",actual_session_duration_factor:1.0});
  return r.sessionCapacity;
}
/* Explizite training_weekdays je Trainingstage-Anzahl fuer Tests, die
   keine eigenen weekdays via basePlanRequirements mitbringen. Rein
   arbitraere, aber deterministische Testwahl (0=Montag ... 6=Sonntag) —
   NICHT als normativer Verteilungsalgorithmus zu verstehen (siehe
   training-plan-engine.js: resolveTrainingWeekdays verlangt jetzt IMMER
   explizite Wochentage, es gibt keinen eingebauten Algorithmus mehr). */
const TEST_WEEKDAYS_BY_DAYS={
  2:[0,3],3:[0,2,4],4:[0,1,3,4],5:[0,1,2,3,4],6:[0,1,2,3,4,5],
};

/* ===================================================================
   TEST-FIXTURE: min_viable_session_slots je Split (NICHT normativ!)
   v1.4.1 (§3.1) nennt dieses Feld nur namentlich, ohne Formel/Werte.
   Diese Zahlen sind rein testintern gewaehlt (hier: bequem aus der bereits
   an anderer Stelle exakt spezifizierten §17.3-Kapazitaetsformel auf die
   jeweils UNTERE Grenze der §3.1-"typischen Sessionlaenge" angewendet,
   NUR um in Tests plausible, interne konsistente Zahlen zu haben) und
   duerfen NIEMALS als Produktionsdefault interpretiert werden.
   =================================================================== */
const TEST_MIN_VIABLE_SESSION_SLOTS={
  FULL_BODY:5,UPPER_LOWER:5,UPPER_LOWER_FULL:6,PUSH_PULL:5,PPL:7,
  PPL_X2:5,PPL_UL_HYBRID:6,UPPER_LOWER_X3:5,BODY_PART_SPLIT:6,
};

/* ===================================================================
   TEST-FIXTURE: sessionTemplateSequenceBySplit (NICHT normativ!)
   v1.4.1 Pack 03 definiert weder Template-Namen/Reihenfolge noch
   Muskelinhalt der session_templates[] — das ist Exercise-Catalog-/
   Bewegungsmuster-Registry-Wissen ausserhalb dieses Packs. Die folgende
   Zuordnung ist eine rein synthetische Test-Konstruktion (3 beliebige
   Muskel-Buckets A/B/C), NICHT eine Behauptung ueber echte Anatomie oder
   ueber die "richtige" Aufteilung eines Splits.
   =================================================================== */
const FIX_A=["CHEST","FRONT_DELT","TRICEPS"];
const FIX_B=["LATS","UPPER_BACK","BICEPS"];
const FIX_C=["QUADS","HAMSTRINGS","GLUTES"];
const FIX_ALL=ALL_MUSCLES.slice();
function tmpl(name,muscles){return {name,muscles};}
const TEST_SESSION_TEMPLATES={
  FULL_BODY:[tmpl("FULL",FIX_ALL)],
  UPPER_LOWER:[tmpl("UPPER",FIX_A.concat(FIX_B)),tmpl("LOWER",FIX_C)],
  UPPER_LOWER_FULL:[tmpl("UPPER",FIX_A.concat(FIX_B)),tmpl("LOWER",FIX_C),tmpl("FULL",FIX_ALL)],
  PUSH_PULL:[tmpl("PUSH",FIX_A),tmpl("PULL",FIX_B)],
  PPL:[tmpl("PUSH",FIX_A),tmpl("PULL",FIX_B),tmpl("LEGS",FIX_C)],
  PPL_X2:[tmpl("PUSH",FIX_A),tmpl("PULL",FIX_B),tmpl("LEGS",FIX_C)],
  PPL_UL_HYBRID:[tmpl("PUSH",FIX_A),tmpl("PULL",FIX_B),tmpl("LEGS",FIX_C),tmpl("UPPER",FIX_A.concat(FIX_B)),tmpl("LOWER",FIX_C)],
  UPPER_LOWER_X3:[tmpl("UPPER",FIX_A.concat(FIX_B)),tmpl("LOWER",FIX_C)],
  BODY_PART_SPLIT:[tmpl("PART_A",FIX_A),tmpl("PART_B",FIX_B),tmpl("PART_C",FIX_C),tmpl("PART_D",["ABS"]),tmpl("PART_E",["CALVES"])],
};
/* Bequemlichkeitsfunktion fuer den haeufigsten Testfall: vollstaendige,
   testinterne externalConfig fuer selectSplit()/scoreSplitCandidate(). */
function testExternalConfig(overrides){
  return Object.assign({
    equipmentCoverageBySplit:fullCoverage(),
    minViableSessionSlotsBySplit:Object.assign({},TEST_MIN_VIABLE_SESSION_SLOTS),
    sessionTemplateSequenceBySplit:JSON.parse(JSON.stringify(TEST_SESSION_TEMPLATES)),
    /* §3.1 nennt fuer PPL_UL_HYBRID nur den Bereich 1.6-2x, keinen
       Punktwert. 1.8 ist HIER ausdruecklich nur eine Test-Fixture
       innerhalb dieses Bereichs, KEINE normative Aufloesung (siehe
       training-plan-engine.js computeMuscleFrequency-Kommentar). */
    frequencyOverrides:{PPL_UL_HYBRID:1.8},
  },overrides||{});
}

console.log("========== §3.1 Split-Kandidatenraum: alle 9 Typen mit woertlichen Metadaten ==========");
{
  const expectedTypes=["FULL_BODY","UPPER_LOWER","UPPER_LOWER_FULL","PUSH_PULL","PPL","PPL_X2","PPL_UL_HYBRID","UPPER_LOWER_X3","BODY_PART_SPLIT"];
  assertEq(Object.keys(TP.SPLIT_CANDIDATES).sort(),expectedTypes.slice().sort(),"alle 9 kanonischen Split-Typen sind vorhanden");
  expectedTypes.forEach(t=>{
    const meta=TP.SPLIT_CANDIDATES[t];
    assert(Array.isArray(meta.valid_training_days)&&meta.valid_training_days.length>0,t+": valid_training_days vorhanden");
    assert(typeof meta.typical_session_length_min.min==="number"&&typeof meta.typical_session_length_min.max==="number",t+": typical_session_length_min vorhanden");
    /* min_viable_session_slots und session_templates[]-Inhalt sind KEINE
       Produktionsmetadaten mehr (siehe STEP-03-Korrektur) — bewusst NICHT
       auf SPLIT_CANDIDATES getestet. */
    assert(!("min_viable_session_slots" in meta),t+": min_viable_session_slots ist NICHT mehr Teil der Produktionsmetadaten (kein erfundener Default)");
    assert(!("session_templates" in meta),t+": session_templates ist NICHT mehr Teil der Produktionsmetadaten (kein erfundener Muskelinhalt)");
  });
  assertEq(TP.SPLIT_CANDIDATES.FULL_BODY.valid_training_days,[2,3,4],"FULL_BODY: 2-4 Tage");
  assertEq(TP.SPLIT_CANDIDATES.UPPER_LOWER.valid_training_days,[2,4],"UPPER_LOWER: nur 2 oder 4 Tage");
  assertEq(TP.SPLIT_CANDIDATES.UPPER_LOWER_FULL.valid_training_days,[3],"UPPER_LOWER_FULL: nur 3 Tage");
  assertEq(TP.SPLIT_CANDIDATES.PUSH_PULL.valid_training_days,[4],"PUSH_PULL: nur 4 Tage");
  assertEq(TP.SPLIT_CANDIDATES.PPL.valid_training_days,[3],"PPL: nur 3 Tage");
  assertEq(TP.SPLIT_CANDIDATES.PPL_X2.valid_training_days,[6],"PPL_X2: nur 6 Tage");
  assertEq(TP.SPLIT_CANDIDATES.PPL_UL_HYBRID.valid_training_days,[5],"PPL_UL_HYBRID: nur 5 Tage");
  assertEq(TP.SPLIT_CANDIDATES.UPPER_LOWER_X3.valid_training_days,[6],"UPPER_LOWER_X3: nur 6 Tage");
  assertEq(TP.SPLIT_CANDIDATES.BODY_PART_SPLIT.valid_training_days,[5],"BODY_PART_SPLIT: nur 5 Tage");
}

console.log("========== §3.1 Muskelfrequenz: woertliche Formeln, PPL_UL_HYBRID erfordert externen Wert ==========");
{
  assertEq(TP.computeMuscleFrequency("FULL_BODY",3),3,"FULL_BODY: Frequenz = Tage (woertlich)");
  assertEq(TP.computeMuscleFrequency("FULL_BODY",4),4,"FULL_BODY: Frequenz = Tage (woertlich), 4 Tage");
  assertEq(TP.computeMuscleFrequency("UPPER_LOWER",4),2,"UPPER_LOWER: Frequenz = Tage/2 (woertlich)");
  assertEq(TP.computeMuscleFrequency("UPPER_LOWER",2),1,"UPPER_LOWER: Frequenz = Tage/2 bei 2 Tagen");
  assertEq(TP.computeMuscleFrequency("UPPER_LOWER_FULL",3),1.67,"UPPER_LOWER_FULL: Frequenz = 1.67 (woertlich aus §3.1-Tabelle, KEINE Interpretation)");
  assertEq(TP.computeMuscleFrequency("PUSH_PULL",4),2,"PUSH_PULL: Frequenz = 2 (woertlich)");
  assertEq(TP.computeMuscleFrequency("PPL",3),1,"PPL: Frequenz = 1 (woertlich)");
  assertEq(TP.computeMuscleFrequency("PPL_X2",6),2,"PPL_X2: Frequenz = 2 (woertlich)");
  assertEq(TP.computeMuscleFrequency("UPPER_LOWER_X3",6),3,"UPPER_LOWER_X3: Frequenz = 3 (woertlich)");
  assertEq(TP.computeMuscleFrequency("BODY_PART_SPLIT",5),1,"BODY_PART_SPLIT: Frequenz = 1 (woertlich)");

  assertThrows(()=>TP.computeMuscleFrequency("PPL_UL_HYBRID",5),"PPL_UL_HYBRID OHNE frequencyOverrides wirft (§3.1 nennt nur Bereich 1.6-2x, kein Punktwert — KEIN stiller Mittelwert)");
  assertEq(TP.computeMuscleFrequency("PPL_UL_HYBRID",5,{PPL_UL_HYBRID:1.6}),1.6,"PPL_UL_HYBRID mit explizitem Override am unteren Rand des Bereichs");
  assertEq(TP.computeMuscleFrequency("PPL_UL_HYBRID",5,{PPL_UL_HYBRID:2}),2,"PPL_UL_HYBRID mit explizitem Override am oberen Rand des Bereichs");
}

console.log("========== §2.2 Phase 1 — Requirements Resolution ==========");
{
  const ctx=TD.createEvaluationContext({evaluation_at:new Date(2026,7,15),user_timezone:"Europe/Berlin",config_version:1,catalog_version:1,source_event_revision:1});
  const profile=TD.createUserTrainingProfile({user_id:"u1",goal:"HYPERTROPHY",experience_self:"SOME",training_days_per_week:4,session_time_budget_min:60,primary_location_id:"loc1",bodyweight_kg:80,experience_level_eligible:"INTERMEDIATE",experience_level:"INTERMEDIATE",user_skill_level:3});
  const result=TP.resolvePlanRequirements(profile,ctx);
  assertEq(result.status,"OK","Requirements Resolution liefert OK fuer ein gueltiges Profil");
  assertEq(result.planRequirements.training_days_per_week,4,"training_days_per_week uebernommen");
  assertEq(result.planRequirements.experience_level,"INTERMEDIATE","experience_level (planwirksamer Snapshot) uebernommen, NICHT experience_level_eligible");
  assertEq(result.planRequirements.actual_session_duration_factor,1.0,"actual_session_duration_factor defaultet auf neutralen Wert 1.0, wenn noch keine LEARNED-Daten vorliegen");
  assertThrows(()=>TP.resolvePlanRequirements(profile,{}),"Requirements Resolution ohne evaluation_at wirft (kein verstecktes now())");
  assertThrows(()=>TP.resolvePlanRequirements(null,ctx),"Requirements Resolution ohne Profil wirft");

  const result2=TP.resolvePlanRequirements(profile,ctx);
  assertEq(result.planRequirements,result2.planRequirements,"INVARIANT G-3: identischer Input liefert identisches Ergebnis");
}

console.log("========== §17.3 Phase 2 — SessionCapacity ==========");
{
  assertThrows(()=>TP.resolveSessionCapacity({session_time_budget_min:60,goal:"HYPERTROPHY",actual_session_duration_factor:1.0}),"SessionCapacity ohne reserve_s wirft (kein erfundener §17.1-Defaultwert)");
  const hyp=TP.resolveSessionCapacity({session_time_budget_min:60,reserve_s:0,goal:"HYPERTROPHY",actual_session_duration_factor:1.0});
  assertEq(hyp.status,"OK","60min/HYPERTROPHY liefert OK");
  assertEq(hyp.sessionCapacity.max_working_sets,Math.floor(3600/155),"max_working_sets exakt nach §17.3-Formel (HYPERTROPHY)");
  assertEq(hyp.sessionCapacity.max_slots,Math.min(Math.floor(Math.floor(3600/155)/3),9),"max_slots exakt nach §17.3-Formel");

  const strength=TP.resolveSessionCapacity({session_time_budget_min:60,reserve_s:0,goal:"STRENGTH",actual_session_duration_factor:1.0});
  assertEq(strength.sessionCapacity.max_working_sets,Math.floor(3600/210),"max_working_sets exakt nach §17.3-Formel (STRENGTH, anderer planning_set_equivalent_s)");

  const gf=TP.resolveSessionCapacity({session_time_budget_min:60,reserve_s:0,goal:"GENERAL_FITNESS",actual_session_duration_factor:1.0});
  assertEq(gf.sessionCapacity.max_working_sets,Math.floor(3600/125),"max_working_sets exakt nach §17.3-Formel (GENERAL_FITNESS)");

  const tiny=TP.resolveSessionCapacity({session_time_budget_min:20,reserve_s:0,goal:"STRENGTH",actual_session_duration_factor:1.0});
  assertEq(tiny.status,"FAILURE","raw_max_slots<2 -> FAILURE (INFEASIBLE_TIME)");
  assertEq(tiny.failure.code,"INFEASIBLE_TIME","Failure-Code ist INFEASIBLE_TIME");
  assertEq(tiny.failure.blocking,true,"INFEASIBLE_TIME ist blocking");

  const huge=TP.resolveSessionCapacity({session_time_budget_min:120,reserve_s:0,goal:"GENERAL_FITNESS",actual_session_duration_factor:1.0});
  assert(huge.sessionCapacity.max_slots<=9,"max_slots wird bei sehr grossem Budget auf 9 gedeckelt");

  const factorTest1=TP.resolveSessionCapacity({session_time_budget_min:60,reserve_s:0,goal:"HYPERTROPHY",actual_session_duration_factor:1.5});
  assert(factorTest1.sessionCapacity.max_working_sets<hyp.sessionCapacity.max_working_sets,"hoeherer actual_session_duration_factor senkt max_working_sets (mehr Zeit pro Satz veranschlagt)");
}

console.log("========== Wochentage: KEIN erfundener Verteilungsalgorithmus mehr ==========");
{
  assertThrows(()=>TP.resolveTrainingWeekdays(4,null),"resolveTrainingWeekdays OHNE explizite Wochentage wirft (kein eingebauter Verteilungsalgorithmus mehr)");
  assertThrows(()=>TP.resolveTrainingWeekdays(4,[0,1]),"resolveTrainingWeekdays mit falscher Laenge wirft");
  assertEq(TP.resolveTrainingWeekdays(3,[4,0,2]),[0,2,4],"resolveTrainingWeekdays sortiert explizite Wochentage, erfindet aber nichts");
}

console.log("========== §3.2 Hard Filters SF1-SF6 einzeln ==========");
{
  const cap60=capacityFor(4,60,"HYPERTROPHY");
  const vt=uniformVolumeTargets(10);
  const weekdays4=TEST_WEEKDAYS_BY_DAYS[4];

  // SF1
  assert(TP.checkSF1(TP.SPLIT_CANDIDATES.PUSH_PULL,4),"SF1: PUSH_PULL bei 4 Tagen erfuellt");
  assert(!TP.checkSF1(TP.SPLIT_CANDIDATES.PUSH_PULL,3),"SF1: PUSH_PULL bei 3 Tagen verletzt (nur 4 Tage gueltig)");
  assert(!TP.checkSF1(TP.SPLIT_CANDIDATES.PPL,4),"SF1: PPL bei 4 Tagen verletzt (nur 3 Tage gueltig)");

  // SF2 — min_viable_session_slots ist jetzt ein expliziter Parameter (Test-Fixture)
  const tinyCapacity={max_slots:1,max_working_sets:3,burdened_set_s:155,brutto_budget_s:3600};
  assertThrows(()=>TP.checkSF2(TP.SPLIT_CANDIDATES.FULL_BODY,cap60),"SF2 ohne minViableSessionSlots wirft (kein stiller Default, v1.4.1 nennt keine Formel/Werte)");
  assert(!TP.checkSF2(TP.SPLIT_CANDIDATES.FULL_BODY,tinyCapacity,TEST_MIN_VIABLE_SESSION_SLOTS.FULL_BODY),"SF2: FULL_BODY verletzt bei max_slots=1 (Test-Fixture min_viable_session_slots > 1)");
  assert(TP.checkSF2(TP.SPLIT_CANDIDATES.FULL_BODY,cap60,TEST_MIN_VIABLE_SESSION_SLOTS.FULL_BODY),"SF2: FULL_BODY erfuellt bei ausreichender Kapazitaet (60min)");

  // SF3 (12er Cap) — sehr hohes Volumen bei niedriger Frequenz verletzt SF3
  const highVt=uniformVolumeTargets(30); // 30/freq(PPL=1)=30 > 12
  assert(!TP.checkSF3(TP.SPLIT_CANDIDATES.PPL,3,highVt,12),"SF3: PPL bei Frequenz 1 und 30 Saetzen/Woche verletzt 12er-Cap");
  assert(TP.checkSF3(TP.SPLIT_CANDIDATES.PPL,3,uniformVolumeTargets(12),12),"SF3: PPL bei genau 12 Saetzen/Woche (Frequenz 1) erfuellt den 12er-Cap (Grenzwert inklusiv)");

  // SF4 — hohe Dosis auf ueberlappenden Kategorien an Kalender-aufeinanderfolgenden Tagen.
  // Test-Fixture: FULL_BODY = 1 Template, das ALLE Muskeln jeden Tag traegt.
  const fullBodySeq=TEST_SESSION_TEMPLATES.FULL_BODY;
  assertThrows(()=>TP.checkSF4(TP.SPLIT_CANDIDATES.FULL_BODY,4,weekdays4,uniformVolumeTargets(8)),"SF4 ohne sessionTemplateSequence wirft (v1.4.1 definiert Template-Muskelinhalt nicht, kein Default)");
  const veryHeavyVt=uniformVolumeTargets(44); // 44/4=11 >=10
  assert(!TP.checkSF4(TP.SPLIT_CANDIDATES.FULL_BODY,4,weekdays4,veryHeavyVt,fullBodySeq),"SF4: FULL_BODY (jeder Tag = alle Muskeln, Test-Fixture) verletzt bei hoher Pro-Expositions-Dosis auf kalenderfolgenden Tagen");
  assert(TP.checkSF4(TP.SPLIT_CANDIDATES.FULL_BODY,4,weekdays4,uniformVolumeTargets(8),fullBodySeq),"SF4: FULL_BODY erfuellt bei niedriger Pro-Expositions-Dosis");

  // SF5
  assertThrows(()=>TP.checkSF5(TP.SPLIT_CANDIDATES.PPL,undefined),"SF5: fehlende equipmentCoverageBySplit wirft (kein stiller Default)");
  assert(TP.checkSF5(TP.SPLIT_CANDIDATES.PPL,{PPL:0.6}),"SF5: genau 60% Abdeckung erfuellt (Grenzwert inklusiv)");
  assert(!TP.checkSF5(TP.SPLIT_CANDIDATES.PPL,{PPL:0.59}),"SF5: unter 60% Abdeckung verletzt");
  assert(!TP.checkSF5(TP.SPLIT_CANDIDATES.PPL,{PPL:"UNKNOWN"}),"SF5: explizit unbekannte Abdeckung (\"UNKNOWN\") gilt NIE als erfuellt (niemals stillschweigend erfuellt)");
  assertThrows(()=>TP.checkSF5(TP.SPLIT_CANDIDATES.PPL,{PPL:"not-a-number"}),"SF5: ungueltiger (nicht-numerischer, nicht-UNKNOWN) Wert wirft");

  // SF6
  assert(TP.checkSF6(TP.SPLIT_CANDIDATES.UPPER_LOWER,2,uniformVolumeTargets(5)),"SF6: UPPER_LOWER bei 2 Tagen (Frequenz=1) erfuellt (>=1)");
}

console.log("========== §3.5 Fallback: SF3 12->16, FULL_BODY-Erzwingung, SF2/SF4/SF5-Grenzen ==========");
{
  // Fallback-Stufe 1 (SF3 12->16): bei 5 Trainingstagen sind PPL_UL_HYBRID
  // (Test-Fixture-Frequenz 1.8) und BODY_PART_SPLIT (Frequenz 1, woertlich)
  // die einzigen SF1-Kandidaten. Bei 22 Saetzen/Woche verletzen BEIDE den
  // 12er-Cap (22/1.8=12.2>12; 22/1=22>12), aber PPL_UL_HYBRID besteht den
  // auf 16 gelockerten Cap (22/1.8=12.2<=16); BODY_PART_SPLIT bleibt
  // weiterhin ueber 16 (22/1=22>16).
  const cap5=capacityFor(5,90,"HYPERTROPHY");
  const vt22=uniformVolumeTargets(22);
  const planReq5=basePlanRequirements({training_days_per_week:5,session_time_budget_min:90,training_weekdays:TEST_WEEKDAYS_BY_DAYS[5]});
  const result=TP.selectSplit(planReq5,vt22,cap5,testExternalConfig());
  assertEq(result.status,"OK","Fallback-Stufe 1 (SF3 12->16) liefert am Ende einen gueltigen Kandidaten");
  assert(result.warnings.indexOf("SF3_RELAXED_TO_16")!==-1,"Warnung SF3_RELAXED_TO_16 wird gesetzt");
  assertEq(result.splitStructure.split_type,"PPL_UL_HYBRID","der bei 16 ueberlebende Kandidat (PPL_UL_HYBRID) wird gewaehlt, BODY_PART_SPLIT bleibt weiterhin SF3-verletzt");

  // SF4/SF5 werden NIE gelockert: konstruiere ein Szenario, in dem SF5 fuer
  // ALLE Splits (inkl. FULL_BODY) verletzt ist -> darf NICHT durch Fallback
  // ignoriert werden, auch nicht in der FULL_BODY-Erzwingungsstufe.
  const cap4=capacityFor(4,60,"HYPERTROPHY");
  const noEquip={};
  Object.keys(TP.SPLIT_CANDIDATES).forEach(k=>noEquip[k]=0.0);
  const planReq4=basePlanRequirements({training_days_per_week:4,session_time_budget_min:60});
  const result2=TP.selectSplit(planReq4,uniformVolumeTargets(8),cap4,testExternalConfig({equipmentCoverageBySplit:noEquip}));
  assertEq(result2.status,"FAILURE","Wenn SF5 fuer ALLE Kandidaten (inkl. FULL_BODY) verletzt ist, bleibt das Ergebnis FAILURE — SF5 wird NIE gelockert");
  assertEq(result2.failure.code,"NO_VIABLE_SPLIT","Failure-Code ist NO_VIABLE_SPLIT");

  // FULL_BODY-Fallback (Stufe 2): bei 6 Trainingstagen sind PPL_X2 (Frequenz
  // 2) und UPPER_LOWER_X3 (Frequenz 3) die einzigen SF1-Kandidaten — FULL_BODY
  // selbst ist bei 6 Tagen KEIN SF1-Kandidat (valid_training_days nur 2-4),
  // wird aber im Fallback ausdruecklich erzwungen. Bei 50 Saetzen/Woche
  // verletzen beide regulaeren Kandidaten SF3 auch bei 16 (50/2=25>16;
  // 50/3=16.67>16) -> FULL_BODY_FORCED mit strukturiertem Repair-Request.
  const cap6=capacityFor(6,60,"HYPERTROPHY");
  const vt50=uniformVolumeTargets(50);
  const planReq6=basePlanRequirements({training_days_per_week:6,session_time_budget_min:60,training_weekdays:TEST_WEEKDAYS_BY_DAYS[6]});
  const result3=TP.selectSplit(planReq6,vt50,cap6,testExternalConfig());
  assertEq(result3.status,"NEEDS_VOLUME_ADJUSTMENT","Wenn nach Stufe 1 kein Kandidat uebrig bleibt, liefert die Engine NEEDS_VOLUME_ADJUSTMENT statt selbst Volumenziele zu erfinden");
  assert(result3.warnings.indexOf("FULL_BODY_FORCED")!==-1,"Warnung FULL_BODY_FORCED wird gesetzt");
  assertEq(result3.splitStructure.split_type,"FULL_BODY","erzwungener Split ist FULL_BODY (trotz SF1-Ausschluss bei 6 Tagen)");
  assertEq(result3.repairRequest.type,"CAP_VOLUME_TARGETS_TO_SESSION_CAPACITY","strukturierter Repair-Request statt eigener Volume-Engine");
  assert(!!result3.repairRequest.note,"Repair-Request dokumentiert explizit, dass die eigentliche Anpassung STEP 04 obliegt");

  // SF2-Verletzung von FULL_BODY selbst -> INFEASIBLE (kein weiterer Fallback).
  const tinyCap={max_slots:2,max_working_sets:6,burdened_set_s:155,brutto_budget_s:1200}; // < FULL_BODY-Test-Fixture min_viable_session_slots (5)
  const result4=TP.selectSplit(planReq6,uniformVolumeTargets(8),tinyCap,testExternalConfig());
  assertEq(result4.status,"FAILURE","FULL_BODY verletzt SF2 (max_slots zu klein) -> FAILURE (INFEASIBLE), kein weiterer Fallback");
  assertEq(result4.failure.code,"NO_VIABLE_SPLIT","Failure-Code ist NO_VIABLE_SPLIT");
}

console.log("========== §3.3 Soft Score SP1-SP6 einzeln ==========");
{
  assertEq(TP.scoreSP1(10,10),100,"SP1: peakSets==maxWorkingSets -> 100");
  assertEq(TP.scoreSP1(5,10),100,"SP1: peakSets < maxWorkingSets -> 100 (Kapazitaet reicht)");
  assertEq(TP.scoreSP1(20,10),100-60*1,"SP1: 100% Ueberschreitung -> 100-60=40");
  assertEq(TP.scoreSP1(15,10),100-60*0.5,"SP1: 50% Ueberschreitung -> 100-30=70");

  assertClose(TP.scoreSP3(3600,3600),100,"SP3: exakt im Budget -> 100");
  assertClose(TP.scoreSP3(3960,3600),90,"SP3: 10% Ueberhang -> 90");
  assertClose(TP.scoreSP3(5040,3600),60,"SP3: 40% Ueberhang -> 60");

  // SP6: Basis ist jetzt 0 (additive Identitaet), NICHT mehr ein erfundener
  // Wert wie 50 — §3.3 nennt ausschliesslich die +40/-20-Modifikatoren.
  const beg=TP.scoreSP6(TP.SPLIT_CANDIDATES.PPL,null,"BEGINNER");
  const notBeg=TP.scoreSP6(TP.SPLIT_CANDIDATES.PPL,null,"INTERMEDIATE");
  assertEq(beg,0,"SP6: Beginner-Malus auf PPL ohne Praeferenz -> clamped auf 0 (Basis 0, -20 geklemmt)");
  assertEq(notBeg,0,"SP6: kein Malus, keine Praeferenz -> Basis 0");
  assertEq(TP.scoreSP6(TP.SPLIT_CANDIDATES.PPL_X2,null,"BEGINNER"),0,"SP6: Beginner-Malus auf PPL_X2 -> geklemmt auf 0");
  assertEq(TP.scoreSP6(TP.SPLIT_CANDIDATES.BODY_PART_SPLIT,null,"BEGINNER"),0,"SP6: Beginner-Malus auf BODY_PART_SPLIT -> geklemmt auf 0");
  assertEq(TP.scoreSP6(TP.SPLIT_CANDIDATES.FULL_BODY,null,"BEGINNER"),0,"SP6: KEIN Beginner-Malus auf FULL_BODY, keine Praeferenz -> Basis 0");
  assertEq(TP.scoreSP6(TP.SPLIT_CANDIDATES.PPL,"PPL","ADVANCED"),40,"SP6: preferred_split-Treffer exakt +40 (Basis 0 -> 40)");
  assertEq(TP.scoreSP6(TP.SPLIT_CANDIDATES.PPL,"UPPER_LOWER","ADVANCED"),0,"SP6: kein Bonus ohne Treffer -> Basis 0");
  assertEq(TP.scoreSP6(TP.SPLIT_CANDIDATES.PPL,"PPL","BEGINNER"),20,"SP6: Treffer(+40) und Beginner-Malus(-20) kombinieren sich (0+40-20=20)");

  assertEq(TP.scoreSP4(TP.SPLIT_CANDIDATES.PPL,3,[]),100,"SP4: keine Prioritaetsmuskeln -> 100");
  const freqPPL_X2=TP.computeMuscleFrequency("PPL_X2",6);
  assert(freqPPL_X2>=2,"Kontrolle: PPL_X2-Frequenz >=2 fuer den folgenden SP4-Test");
  assertEq(TP.scoreSP4(TP.SPLIT_CANDIDATES.PPL_X2,6,["CHEST"]),100,"SP4: Prioritaetsmuskel mit Frequenz>=2 -> 100");
  const freqPPL=TP.computeMuscleFrequency("PPL",3);
  assertEq(freqPPL,1,"Kontrolle: PPL-Frequenz genau 1 fuer den folgenden SP4-Test");
  assertEq(TP.scoreSP4(TP.SPLIT_CANDIDATES.PPL,3,["CHEST"]),60,"SP4: Prioritaetsmuskel mit Frequenz genau 1 -> 60");
  // 2 gleichzeitige Prioritaetsmuskeln (§4.5 erlaubt max. 2): keine
  // Aggregations-Mehrdeutigkeit, weil frequency(split,muskel) fuer jeden
  // Muskel desselben Splits identisch ist (siehe Kopf-Kommentar Punkt 5) —
  // beide liefern denselben Score, egal welche 2 Muskeln gewaehlt werden.
  assertEq(TP.scoreSP4(TP.SPLIT_CANDIDATES.PPL,3,["CHEST","LATS"]),60,"SP4: 2 Prioritaetsmuskeln liefern denselben Score wie 1 (keine erfundene Aggregation noetig, da frequency split-einheitlich ist)");

  // STRENGTH: keine Hard-Malus fuer <2 Exposures (§4.6 P5-Praeferenz)
  assertEq(TP.scoreSP2(TP.SPLIT_CANDIDATES.PPL,"STRENGTH",3,uniformVolumeTargets(10)),100,"SP2 STRENGTH: 1 Exposure/Woche bleibt voll gueltig, kein Hard-Malus (§4.6)");
  assertEq(TP.scoreSP2(TP.SPLIT_CANDIDATES.PPL_X2,"STRENGTH",6,uniformVolumeTargets(10)),100,"SP2 STRENGTH: auch bei >=2 Exposures volle Punktzahl (keine explizite Zusatzpunktzahl im Pack angegeben)");

  // Strength->=2-Exposure ist ausschliesslich P5-Optimierung: PPL (Frequenz=1
  // bei 3 Tagen) darf fuer STRENGTH keinesfalls durch SF1-SF6 ausgeschlossen
  // werden, nur weil es unter 2 Exposures/Woche bleibt — INVARIANT V-2.
  const capStrength=capacityFor(3,90,"STRENGTH");
  const checkStrength=TP.evaluateHardFilters(TP.SPLIT_CANDIDATES.PPL,{trainingDays:3,weekdays:TEST_WEEKDAYS_BY_DAYS[3],volumeTargets:uniformVolumeTargets(10),sessionCapacity:capStrength,equipmentCoverageBySplit:fullCoverage(),sessionCapSets:12,minViableSessionSlots:TEST_MIN_VIABLE_SESSION_SLOTS.PPL,sessionTemplateSequence:TEST_SESSION_TEMPLATES.PPL});
  assert(checkStrength.pass,"PPL (Frequenz 1, <2 Exposures) besteht fuer STRENGTH weiterhin alle Hard Filters — die 2x-Praeferenz ist ausschliesslich P5/Score, nie ein Hard Filter");

  // HYP/GF: Abweichung von der §4.6-Zielfrequenz kostet 25 Punkte je Stufe
  const vtLow=uniformVolumeTargets(8); // wochenvolumen<=10 -> Zielfrequenz 1
  assertEq(TP.targetFrequencyFromWeeklyVolume(8),1,"§4.6: wochenvolumen<=10 -> Zielfrequenz 1");
  assertEq(TP.targetFrequencyFromWeeklyVolume(15),2,"§4.6: 10<wochenvolumen<=20 -> Zielfrequenz 2");
  assertEq(TP.targetFrequencyFromWeeklyVolume(25),3,"§4.6: wochenvolumen>20 -> Zielfrequenz 3");
  const sp2PPL=TP.scoreSP2(TP.SPLIT_CANDIDATES.PPL,"HYPERTROPHY",3,vtLow); // PPL-Frequenz=1, Ziel=1 -> exakter Treffer
  assertEq(sp2PPL,100,"SP2 HYP: exakter Frequenz-Treffer -> 100");
  const vtHigh=uniformVolumeTargets(25); // Ziel=3, PPL-Frequenz=1 -> Abweichung 2 Stufen -> 100-50=50
  assertEq(TP.scoreSP2(TP.SPLIT_CANDIDATES.PPL,"HYPERTROPHY",3,vtHigh),50,"SP2 HYP: 2 Stufen Abweichung -> 100-2*25=50");
}

console.log("========== Tie-Breaker exakt: SP1 > Sessionzeit > Frequenz > split_type ==========");
{
  const a={split_type:"PPL_X2",breakdown:{SP1:80},estimatedPeakSessionS:3000,frequency:2,total:70};
  const b={split_type:"UPPER_LOWER_X3",breakdown:{SP1:90},estimatedPeakSessionS:3200,frequency:3,total:70};
  assert(TP.compareSplitCandidates(a,b)>0,"bei gleichem Gesamt-Score gewinnt hoeheres SP1 (b vor a)");

  const c={split_type:"PUSH_PULL",breakdown:{SP1:80},estimatedPeakSessionS:2800,frequency:2,total:70};
  const d={split_type:"PPL",breakdown:{SP1:80},estimatedPeakSessionS:3000,frequency:1,total:70};
  assert(TP.compareSplitCandidates(c,d)<0,"bei gleichem SP1 gewinnt niedrigere geschaetzte Sessionzeit (c vor d)");

  const e={split_type:"UPPER_LOWER",breakdown:{SP1:80},estimatedPeakSessionS:3000,frequency:2,total:70};
  const f={split_type:"FULL_BODY",breakdown:{SP1:80},estimatedPeakSessionS:3000,frequency:4,total:70};
  assert(TP.compareSplitCandidates(e,f)>0,"bei gleichem SP1+Zeit gewinnt hoehere Muskelfrequenz (f vor e)");

  const g={split_type:"UPPER_LOWER",breakdown:{SP1:80},estimatedPeakSessionS:3000,frequency:2,total:70};
  const h={split_type:"BODY_PART_SPLIT",breakdown:{SP1:80},estimatedPeakSessionS:3000,frequency:2,total:70};
  assert(TP.compareSplitCandidates(g,h)>0,"bei allen Gleichstaenden entscheidet split_type lexikografisch (BODY_PART_SPLIT vor UPPER_LOWER)");

  const list=[b,a].sort(TP.compareSplitCandidates);
  assertEq(list[0].split_type,"UPPER_LOWER_X3","sort() liefert den nach Tie-Breaker besten Kandidaten an Position 0");
}

console.log("========== BODY_PART_SPLIT bleibt legaler Kandidat (kein Hard-Filter-Ausschluss) ==========");
{
  const cap=capacityFor(5,70,"HYPERTROPHY");
  const vt=uniformVolumeTargets(10);
  const check=TP.evaluateHardFilters(TP.SPLIT_CANDIDATES.BODY_PART_SPLIT,{trainingDays:5,weekdays:TEST_WEEKDAYS_BY_DAYS[5],volumeTargets:vt,sessionCapacity:cap,equipmentCoverageBySplit:fullCoverage(),sessionCapSets:12,minViableSessionSlots:TEST_MIN_VIABLE_SESSION_SLOTS.BODY_PART_SPLIT,sessionTemplateSequence:TEST_SESSION_TEMPLATES.BODY_PART_SPLIT});
  assert(check.pass,"BODY_PART_SPLIT besteht SF1-SF6 unter normalen Bedingungen (kein struktureller Ausschluss)");
}

console.log("========== preferred_split ist niemals ein Hard Filter (kein Bypass) ==========");
{
  // preferred_split=PPL bei 4 Trainingstagen: PPL verletzt SF1 (nur 3 Tage
  // gueltig) und darf trotz Praeferenz NIEMALS gewaehlt werden.
  const cap=capacityFor(4,60,"HYPERTROPHY");
  const planReq=basePlanRequirements({training_days_per_week:4,preferred_split:"PPL"});
  const result=TP.selectSplit(planReq,uniformVolumeTargets(10),cap,testExternalConfig());
  assertEq(result.status,"OK","Split-Auswahl gelingt trotz nicht erfuellbarer Praeferenz");
  assert(result.splitStructure.split_type!=="PPL","PPL wird trotz preferred_split NIEMALS gewaehlt, wenn es SF1 verletzt (INVARIANT S-1)");
  assert(result.allScores.every(s=>s.split_type!=="PPL"),"PPL taucht nicht einmal in der Kandidatenliste auf (SF1-gefiltert)");
}

console.log("========== INVARIANT S-3 Same-Day-Overlap ==========");
{
  const sfPrimaryHighChest=TD.createSlotFunction({movement_pattern:"HORIZONTAL_PRESS",role:"PRIMARY",rep_character:"MODERATE",primary_muscle_bands:[{canonical_volume_muscle_id:"CHEST",contribution_band:"PRIMARY_HIGH"}]});
  const sfPrimaryHighChestOtherPattern=TD.createSlotFunction({movement_pattern:"VERTICAL_PRESS",role:"PRIMARY",rep_character:"MODERATE",primary_muscle_bands:[{canonical_volume_muscle_id:"CHEST",contribution_band:"PRIMARY_HIGH"}]});
  const sfSecondaryChest=TD.createSlotFunction({movement_pattern:"VERTICAL_PRESS",role:"SECONDARY",rep_character:"MODERATE",primary_muscle_bands:[{canonical_volume_muscle_id:"CHEST",contribution_band:"SECONDARY"}]});
  const sfPrimaryHighBack=TD.createSlotFunction({movement_pattern:"HORIZONTAL_PULL",role:"PRIMARY",rep_character:"MODERATE",primary_muscle_bands:[{canonical_volume_muscle_id:"LATS",contribution_band:"PRIMARY_HIGH"}]});
  const sfSecondaryBackSamePattern=TD.createSlotFunction({movement_pattern:"HORIZONTAL_PRESS",role:"SECONDARY",rep_character:"MODERATE",primary_muscle_bands:[{canonical_volume_muscle_id:"LATS",contribution_band:"SECONDARY"}]});
  const sfIsolationChestSamePattern=TD.createSlotFunction({movement_pattern:"HORIZONTAL_PRESS",role:"ISOLATION",rep_character:"LIGHT",primary_muscle_bands:[{canonical_volume_muscle_id:"CHEST",contribution_band:"STABILIZER"}]});

  assert(TP.determineSameDayOverlap([sfPrimaryHighChest],[sfPrimaryHighChestOtherPattern]),"beide Sessions bewerten CHEST als PRIMARY_HIGH (unterschiedliche Patterns) -> Overlap TRUE (Muskel-Kriterium)");
  assert(!TP.determineSameDayOverlap([sfPrimaryHighChest],[sfSecondaryChest]),"CHEST ist nur in Session A PRIMARY_HIGH, in Session B nur SECONDARY -> KEIN Overlap ueber das Muskel-Kriterium (beide Seiten muessen PRIMARY_HIGH sein)");
  assert(TP.determineSameDayOverlap([sfPrimaryHighChest],[sfSecondaryBackSamePattern]),"identisches movement_pattern (HORIZONTAL_PRESS) in PRIMARY (A) bzw. SECONDARY (B) mit unterschiedlichen Muskeln -> Overlap TRUE (Pattern-Kriterium)");
  assert(!TP.determineSameDayOverlap([sfPrimaryHighChest],[sfIsolationChestSamePattern]),"identisches Pattern, aber Session B nutzt es nur in ISOLATION-Rolle -> KEIN Pattern-Overlap (nur PRIMARY/SECONDARY zaehlen auf BEIDEN Seiten)");
  assert(!TP.determineSameDayOverlap([sfPrimaryHighChest],[sfPrimaryHighBack]),"unterschiedlicher PRIMARY_HIGH-Muskel UND unterschiedliches Pattern -> KEIN Overlap");

  const sfIsolationOnly=TD.createSlotFunction({movement_pattern:"HORIZONTAL_PRESS",role:"ISOLATION",rep_character:"LIGHT",primary_muscle_bands:[{canonical_volume_muscle_id:"TRICEPS",contribution_band:"STABILIZER"}]});
  const sfIsolationOnly2=TD.createSlotFunction({movement_pattern:"HORIZONTAL_PRESS",role:"ACCESSORY",rep_character:"LIGHT",primary_muscle_bands:[{canonical_volume_muscle_id:"TRICEPS",contribution_band:"STABILIZER"}]});
  assert(!TP.determineSameDayOverlap([sfIsolationOnly],[sfIsolationOnly2]),"gleiches movement_pattern, aber NUR ISOLATION/ACCESSORY-Rollen auf beiden Seiten -> KEIN Pattern-Overlap (nur PRIMARY/SECONDARY zaehlen)");
}

console.log("========== Determinismus: identischer Input liefert identischen Output ==========");
{
  const cap=capacityFor(5,70,"HYPERTROPHY");
  const planReq=basePlanRequirements({training_days_per_week:5,priority_muscles:["CHEST"],preferred_split:"PPL_UL_HYBRID",training_weekdays:TEST_WEEKDAYS_BY_DAYS[5]});
  const vt=uniformVolumeTargets(12);
  const r1=TP.selectSplit(planReq,vt,cap,testExternalConfig());
  const r2=TP.selectSplit(planReq,vt,cap,testExternalConfig());
  assertEq(r1.splitStructure,r2.splitStructure,"INVARIANT G-3: identischer Input + identischer Kontext -> identisches SplitStructure-Ergebnis");
  assertEq(r1.scoreBreakdown,r2.scoreBreakdown,"INVARIANT G-3: identische Score-Aufschluesselung bei wiederholtem Aufruf");
}

console.log("========== §3.4 Typische Szenarien als Verifikation (NICHT als Lookup) ==========");
{
  // 2 Tage/Woche: §3.1 listet 2 Tage sowohl bei FULL_BODY (2-4) als auch bei
  // UPPER_LOWER (2, 4) als gueltig — beide sind also SF1-Kandidaten (kein
  // Ausschluss durch SF1 allein); die Auswahl zwischen beiden ist dann
  // tatsaechlich eine Score-Frage (SP1-SP6), nicht mehr reine SF1-Konsequenz.
  const cap2=capacityFor(2,60,"HYPERTROPHY");
  const result2days=TP.selectSplit(basePlanRequirements({training_days_per_week:2,session_time_budget_min:60,training_weekdays:TEST_WEEKDAYS_BY_DAYS[2]}),uniformVolumeTargets(8),cap2,testExternalConfig());
  assertEq(result2days.status,"OK","2 Trainingstage: Split-Auswahl gelingt");
  assertEq(result2days.allScores.map(s=>s.split_type).sort(),["FULL_BODY","UPPER_LOWER"],"2 Trainingstage: FULL_BODY und UPPER_LOWER sind die einzigen SF1-Kandidaten (§3.1)");
  assert(["FULL_BODY","UPPER_LOWER"].indexOf(result2days.splitStructure.split_type)!==-1,"2 Trainingstage: Gewinner ist einer der beiden SF1-Kandidaten");

  // Hoehere Prioritaet auf preferred_split zeigt sich exakt als +40 in SP6,
  // veraendert aber niemals das Ergebnis von SF1-SF6 (reine Score-Wirkung).
  const cap4=capacityFor(4,60,"HYPERTROPHY");
  const withoutPref=TP.selectSplit(basePlanRequirements({training_days_per_week:4}),uniformVolumeTargets(10),cap4,testExternalConfig());
  const withPref=TP.selectSplit(basePlanRequirements({training_days_per_week:4,preferred_split:"FULL_BODY"}),uniformVolumeTargets(10),cap4,testExternalConfig());
  const fullBodyWithoutPref=withoutPref.allScores.find(s=>s.split_type==="FULL_BODY");
  const fullBodyWithPref=withPref.allScores.find(s=>s.split_type==="FULL_BODY");
  assertEq(fullBodyWithPref.breakdown.SP6-fullBodyWithoutPref.breakdown.SP6,40,"preferred_split-Treffer erhoeht SP6 von FULL_BODY um genau 40 Punkte, unabhaengig vom Gesamtranking");
}

console.log("\n"+passed+" bestanden, "+failed+" fehlgeschlagen");
process.exit(failed>0?1:0);
