/* training-volume-engine.js — TRAINING SYSTEM v1.4.1, IMPLEMENTATION PACK
   04/14: Volume Engine / Frequency / Weekly Distribution.

   Quelle: 04_VOLUME_FREQUENCY_WEEKLY_DISTRIBUTION.md (wortgetreue v1.4.1-
   Auszuege, Primary Scope Master-Zeilen 946-1188 = TEIL 4 §4.1-§4.8, plus
   die dort ausdruecklich referenzierten Dependency-Contract-Auszuege
   §0.2-0.5, §17.3, §20.2(nur zur Einordnung, NICHT implementiert),
   §23.0).

   ABSICHTLICH NUR DIESER SCOPE (Primary Scope §4.1-§4.8):
   - §4.1 Zaehlmodell (MuscleContributionConfig, Set-Credit, direct_share)
   - §4.2 Zielkorridore (VOLUME_FLOOR/Standardkorridor/Obergrenze)
   - §4.3 Kanonischer Muscle Registry (anatomy_tags[]/subregion_tags[])
   - §4.4 Toleranzbaender + VolumeDeficit
   - §4.5 Prioritaetsmuskeln (NUR Volumen-Wirkung, Regel 1+4 — Regeln 2+3
     sind Slot-/Score-Effekte anderer, hier NICHT implementierter Engines
     und werden nur als Kommentar-Contract dokumentiert)
   - §4.6 Frequenzverteilung (kanonische Formel, Split-Frequenz-Clamp)
   - §4.7 Session-Caps und Ermuedung (reine Klassifikationsfunktionen)
   - §4.8 Direktarbeits-Mindestanteil (RT-02)
   - Phase 3 (Volume Target Resolution) und Phase 5 (Volume Distribution)
     als ECHTE Funktionen, soweit v1.4.1 die dafuer noetigen Werte normativ
     hergibt (siehe Luecken-Dokumentation unten).

   NICHT implementiert (spaetere Packs/out of scope): Slot Generation,
   Exercise Catalog, Exercise Selection, Prescription, Session Ordering,
   Calibration, Load, Progression, Fatigue-Konsumenten (S6/Session-
   Sortierung selbst), Deload, Detraining, Substitution, USER_COMPOSED-
   Editor, Global Validation (§20.2s V01-V30-Pruefkatalog — hier NUR als
   Referenz gelesen, nicht als Engine gebaut), neue UI.

   ===========================================================================
   NORMATIVE LUECKEN DIESES PACKS (explizit, keine stillen Defaults —
   INVARIANT G-D3). Jede hier als externer Pflicht-Input modellierte Groesse
   wird NIE mit einem Produktions-Default belegt; Tests uebergeben klar
   gekennzeichnete Fixtures.
   ===========================================================================
   L1. "P0-P4 HARD REQUIREMENTS, einschliesslich der sechs foundational
       movement patterns" (Allocation-Stufe 1): welche 6 Muster das sind
       und wie viel Volumen sie je verlangen, definiert dieses Pack NICHT
       (das ist §5.1/Slot-Generation-Wissen, ausserhalb dieses Packs).
       resolveVolumeTargets() akzeptiert dafuer einen OPTIONALEN externen
       `hardRequirementFloors`-Parameter (Default: leer = keine Wirkung).
   L2. "weekly_deliverable_volume_capacity" (wie viele fraktionale
       Volumen-Credits kann ein Plan pro Woche realistisch liefern): eine
       direkte Ableitung aus SessionCapacity.max_working_sets waere
       fachlich falsch, weil ein einzelner Arbeitssatz mehrere Muskeln
       gleichzeitig mit unterschiedlichem Credit versorgt (§4.1) — die
       dafuer noetige Ueberlappungsrate pro Uebung ist Exercise-Catalog-
       Wissen (ausserhalb dieses Packs). Deshalb PFLICHT-externer Input,
       keine Ableitungsformel hier erfunden.
   L3. Innerhalb einer Allocation-Stufe (§4.2: "VOLUME_FLOOR der uebrigen
       Zielmuskeln" / "Standardkorridor" / "zusaetzliches Volumen") sagt
       v1.4.1 nicht, WIE knappe Kapazitaet auf MEHRERE gleichzeitig
       betroffene Nicht-Prioritaets-Muskeln verteilt wird. FRUEHERE FASSUNG
       (Fehler, per STEP-04-Korrektur entfernt): eine selbst erfundene
       proportionale Gleichverteilung. Das war eine freie Entwicklerregel
       ohne v1.4.1-Deckung (INVARIANT G-D3) und wurde ersatzlos entfernt.
       resolveVolumeTargets() verlangt jetzt einen PFLICHT-externen
       Parameter `allocationOrder` (Reihenfolge der konkurrierenden
       Muskel-IDs), sobald mehr als ein Nicht-Prioritaets-Zielmuskel
       gleichzeitig um Kapazitaet konkurrieren kann: jeder Muskel wird in
       genau dieser vom Aufrufer vorgegebenen Reihenfolge vollstaendig bis
       zum jeweiligen Stufen-Zielwert finanziert, bevor der naechste an
       der Reihe ist — keine Gewichtung, kein Round-Robin, keine
       Gleichverteilung wird von dieser Datei selbst entschieden. Die 3
       Stufen-Zielwerte selbst (volume_floor, standard_max, upper_bound)
       bleiben exakt woertlich aus §4.2.
   L4. "limiting_constraint" fuer einen VolumeDeficit: welcher P2/P3/P4-
       Engpass die Ursache war, weiss die Volume Engine allein nicht (das
       haengt von Equipment/Zeit/Slot-Entscheidungen anderer Engines ab).
       PFLICHT-externer Parameter `limitingConstraint`, keine Vermutung.
   L5. §4.4s bedingte ERROR/WARNING-Verzweigung ("...wenn noch legal
       nutzbare Kapazitaet existiert; sonst WARNING") haengt von einer
       Information ab (gibt es noch legal nutzbare P2/P3-Kapazitaet?), die
       ausserhalb der Volume Engine entschieden wird. PFLICHT-externer
       Parameter `hasRepairableCapacity` in evaluateVolumeTolerance(),
       keine Annahme.
   L6. Support-State-Downgrade (§4.2 nennt "mindestens GOAL_LIMITED bzw.
       SUPPORTED_WITH_LIMITATIONS") ist Teil eines groesseren, hier NICHT
       definierten Support-State-Systems (vermutlich Global-Validation-
       Scope, §20). FRUEHERE FASSUNG (Fehler, per STEP-04-Korrektur
       entfernt): ein eigenes `VOLUME_SUPPORT_STATE_HINT`-Enum mit
       GENAU diesen 2 Werten — das haette faelschlich den Eindruck einer
       vollstaendigen, von dieser Datei kanonisch definierten Taxonomie
       erweckt, obwohl v1.4.1 an anderer Stelle weitere Support-States
       kennt (z.B. SUPPORTED, siehe §4.2-Flusstext) und dieses Pack die
       Taxonomie gar nicht besitzt. Diese Datei definiert daher KEIN
       Support-State-Enum. Ihr einziger, tatsaechlich benoetigter Beitrag
       ist das strukturierte `VolumeDeficit`-Signal (`deficits[]` in
       resolveVolumeTargets()); welchen konkreten Support-State ein
       spaeteres, dafuer zustaendiges Modul daraus ableitet, ist nicht
       Teil dieses Packs.
   L7. Phase 5 (`VolumeTargets + SplitStructure -> SessionVolumeTargets`)
       verlangt laut Primary Scope eine DETERMINISTISCHE Verteilung, ohne
       dafuer einen konkreten Equal-Split-/Remainder-Algorithmus zu
       nennen. FRUEHERE FASSUNG (Fehler, per STEP-04-Korrektur entfernt):
       ein selbst erfundener Equal-Split (Wochenziel/Anzahl Expositionen).
       computeSessionVolumeTargets() verlangt jetzt einen PFLICHT-externen
       Parameter `sessionDistributionWeights` (Gewichte je Muskel und
       Exposition, muessen sich zu 1 summieren) — diese Datei entscheidet
       selbst nicht mehr, WIE ein Wochenziel auf mehrere Sessions verteilt
       wird, sondern wendet nur eine vom Aufrufer vorgegebene Verteilung
       an. Welche Session ueberhaupt fuer einen Muskel in Frage kommt
       (Eligibility), bleibt weiterhin ueber `sessionTemplateSequence`
       bestimmt (das ist KEINE Verteilentscheidung, sondern eine reine
       Tatsachenfeststellung aus einem bereits in STEP 03 etablierten
       externen Input).
   Alle Luecken sind damit entweder (a) explizite, versionierte externe
   Inputs ohne Produktions-Default, oder (b) eine bewusst NICHT von dieser
   Datei getroffene Entscheidung (L6) — es gibt keinen stillen erfundenen
   Zahlenwert und keine erfundene Verteil-/Reduktionsregel mehr. */

/* ================= §4.3 — Kanonischer Muscle Registry (Anatomy/Subregion) ===== */
/* canonical_volume_muscle_id lebt bereits in training-domain.js
   (CANONICAL_VOLUME_MUSCLE_ID, STEP 01) — hier NICHT erneut definiert. */
const NO_FLOOR_MUSCLES=Object.freeze(["FOREARM","ADDUCTORS","ABDUCTORS","OBLIQUES","LOWER_BACK"]);
const ANATOMY_SUBREGION_TAG_TYPE=Object.freeze({ANATOMY:"ANATOMY",SUBREGION:"SUBREGION"});
/* Woertlich aus §4.3-Tabelle (kanonischer Registry v1.3.1). mapping=null
   entspricht dem Tabellenwert "NONE" (kein Weekly-Volume-Credit). */
const ANATOMY_SUBREGION_REGISTRY=Object.freeze({
  UPPER_CHEST:Object.freeze({type:"SUBREGION",mapping_to_volume_muscle:"CHEST"}),
  CLAVICULAR_PEC:Object.freeze({type:"ANATOMY",mapping_to_volume_muscle:"CHEST"}),
  STERNAL_PEC:Object.freeze({type:"ANATOMY",mapping_to_volume_muscle:"CHEST"}),
  ANTERIOR_DELTOID:Object.freeze({type:"ANATOMY",mapping_to_volume_muscle:"FRONT_DELT"}),
  LATERAL_DELTOID:Object.freeze({type:"ANATOMY",mapping_to_volume_muscle:"SIDE_DELT"}),
  POSTERIOR_DELTOID:Object.freeze({type:"ANATOMY",mapping_to_volume_muscle:"REAR_DELT"}),
  BRACHIALIS:Object.freeze({type:"ANATOMY",mapping_to_volume_muscle:"BICEPS"}),
  BRACHIORADIALIS:Object.freeze({type:"ANATOMY",mapping_to_volume_muscle:"FOREARM"}),
  GRIP:Object.freeze({type:"ANATOMY",mapping_to_volume_muscle:"FOREARM"}),
  TRAPS:Object.freeze({type:"ANATOMY",mapping_to_volume_muscle:"UPPER_BACK"}),
  ERECTORS:Object.freeze({type:"ANATOMY",mapping_to_volume_muscle:"LOWER_BACK"}),
  LONG_HEAD_TRICEPS:Object.freeze({type:"SUBREGION",mapping_to_volume_muscle:"TRICEPS"}),
  HIP_FLEXORS:Object.freeze({type:"ANATOMY",mapping_to_volume_muscle:null}),
  TRUNK_STABILIZERS:Object.freeze({type:"ANATOMY",mapping_to_volume_muscle:null}),
  SCAPULAR_RETRACTORS:Object.freeze({type:"ANATOMY",mapping_to_volume_muscle:"UPPER_BACK"}),
});
/* INVARIANT V-M1: freie Muscle-/Tag-Strings sind verboten. */
function validateAnatomySubregionTag(tag){
  if(!Object.prototype.hasOwnProperty.call(ANATOMY_SUBREGION_REGISTRY,tag)){
    throw new Error("training-volume-engine: unbekannter anatomy/subregion Tag '"+tag+"' — nicht im §4.3-Registry v1.3.1 registriert (INVARIANT V-M1)");
  }
  return ANATOMY_SUBREGION_REGISTRY[tag];
}
function isCanonicalVolumeMuscleOrTag(value){
  return Object.prototype.hasOwnProperty.call(CANONICAL_VOLUME_MUSCLE_ID,value)||Object.prototype.hasOwnProperty.call(ANATOMY_SUBREGION_REGISTRY,value);
}

/* ================= §4.1 — Zaehlmodell (Contribution + Set-Credit) ================= */
const MUSCLE_CONTRIBUTION_CONFIG_VERSION="v1.4.1";
/* Woertlich aus §4.1: PRIMARY_HIGH=1.00, PRIMARY_MODERATE=0.50,
   SECONDARY=0.50, STABILIZER=0.00. MUSCLE_CONTRIBUTION_BAND-Enum selbst
   lebt in training-domain.js (STEP 01). */
const MUSCLE_CONTRIBUTION_CREDIT=Object.freeze({
  PRIMARY_HIGH:1.00,PRIMARY_MODERATE:0.50,SECONDARY:0.50,STABILIZER:0.00,
});
function rirCreditFactor(rir){
  if(rir==null)throw new Error("training-volume-engine: rirCreditFactor benoetigt einen RIR-Wert (tatsaechlich bei ausgefuehrten, Ziel-RIR bei geplanten Saetzen — §4.1)");
  if(rir<=4)return 1;
  if(rir<=6)return 0.5;
  return 0;
}
/* Reiner Formel-Kern (§4.1): is_work_set=false (Warm-up/Kalibriersatz)
   zaehlt immer 0, unabhaengig von RIR/Contribution. Unilateral: der
   Aufrufer uebergibt bereits die tatsaechlich ausgefuehrten Saetze PRO
   SEITE als eigene Eintraege — diese Funktion multipliziert nichts
   zusaetzlich (§4.1: "Saetze pro Seite zaehlen einfach", keine
   Verdopplung noetig oder zulaessig). */
function computeSetVolumeCredit({is_work_set,rir,contribution_band}){
  if(!is_work_set)return 0;
  if(!Object.prototype.hasOwnProperty.call(MUSCLE_CONTRIBUTION_CREDIT,contribution_band)){
    throw new Error("training-volume-engine: computeSetVolumeCredit — unbekannter contribution_band '"+contribution_band+"'");
  }
  return MUSCLE_CONTRIBUTION_CREDIT[contribution_band]*rirCreditFactor(rir);
}
/* INVARIANT V-3: direct_share zaehlt AUSSCHLIESSLICH PRIMARY_HIGH. */
function computeDirectShareSetCredit(setInput){
  if(setInput.contribution_band!==MUSCLE_CONTRIBUTION_BAND.PRIMARY_HIGH)return 0;
  return computeSetVolumeCredit(setInput);
}
/* Adapter fuer ein bereits geloggtes WorkoutSetEntry (training-domain.js,
   STEP 01): "tatsaechlicher RIR" = rir_effective, falls vorhanden (kalibrierter
   Wert), sonst der rohe rir_reported. is_work_set = weder Warm-up noch
   Kalibriersatz. */
function isCountableWorkSet(workoutSetEntry){
  return !workoutSetEntry.is_warmup && !workoutSetEntry.is_calibration_set;
}
function resolveEffectiveRir(workoutSetEntry){
  return workoutSetEntry.rir_effective!=null?workoutSetEntry.rir_effective:workoutSetEntry.rir_reported;
}
/* §4.1: "Bei geplanten Saetzen wird der Ziel-RIR verwendet" — fuer noch
   nicht ausgefuehrte Saetze (Prescription.rir_target, training-domain.js)
   liegt kein WorkoutSetEntry vor; der Aufrufer uebergibt direkt
   {is_work_set:true, rir:prescription.rir_target, contribution_band}. */

/* Rollierendes 7-Tage-Fenster (§4.1). evaluationContext.evaluation_at ist
   das einzige Zeit-Bezugsdatum (INVARIANT G-D1: kein now()). */
const ROLLING_VOLUME_WINDOW_DAYS=7;
function rollingWindowStartMs(evaluationAtMs){
  return evaluationAtMs-ROLLING_VOLUME_WINDOW_DAYS*24*60*60*1000;
}
function isWithinRollingWindow(timestampMs,evaluationAtMs){
  return timestampMs>=rollingWindowStartMs(evaluationAtMs)&&timestampMs<=evaluationAtMs;
}
/* setInputs: [{muscle_id, contribution_band, is_work_set, rir, performed_at_ms}]
   — bereits aus WorkoutLog/WorkoutSetEntry + PlanSlot.slot_function.
   primary_muscle_bands vom Aufrufer zusammengefuehrt (dieser Join gehoert
   nicht zur Volume Engine, da PlanSlot/Exercise-Zuordnung ausserhalb
   dieses Packs liegt). */
function computeRollingMuscleVolumeCredit(setInputs,muscleId,evaluationContext){
  if(!evaluationContext||evaluationContext.evaluation_at===undefined)throw new Error("training-volume-engine: computeRollingMuscleVolumeCredit benoetigt einen EvaluationContext (kein verstecktes now())");
  const evalMs=new Date(evaluationContext.evaluation_at).getTime();
  return (setInputs||[]).filter(s=>s.muscle_id===muscleId&&isWithinRollingWindow(new Date(s.performed_at_ms).getTime(),evalMs))
    .reduce((sum,s)=>sum+computeSetVolumeCredit(s),0);
}
function computeRollingDirectShareCredit(setInputs,muscleId,evaluationContext){
  if(!evaluationContext||evaluationContext.evaluation_at===undefined)throw new Error("training-volume-engine: computeRollingDirectShareCredit benoetigt einen EvaluationContext (kein verstecktes now())");
  const evalMs=new Date(evaluationContext.evaluation_at).getTime();
  return (setInputs||[]).filter(s=>s.muscle_id===muscleId&&isWithinRollingWindow(new Date(s.performed_at_ms).getTime(),evalMs))
    .reduce((sum,s)=>sum+computeDirectShareSetCredit(s),0);
}

/* ================= §4.2 — Zielkorridore ================= */
/* Woertlich aus §4.2. Alle Werte in fraktionalen Saetzen/Muskel/Woche. */
const VOLUME_CORRIDORS=Object.freeze({
  HYPERTROPHY:Object.freeze({
    BEGINNER:Object.freeze({volume_floor:6,standard_min:8,standard_max:12,upper_bound:14}),
    INTERMEDIATE:Object.freeze({volume_floor:8,standard_min:12,standard_max:18,upper_bound:22}),
    ADVANCED:Object.freeze({volume_floor:10,standard_min:14,standard_max:20,upper_bound:26}),
  }),
  STRENGTH:Object.freeze({
    BEGINNER:Object.freeze({volume_floor:5,standard_min:6,standard_max:10,upper_bound:12}),
    INTERMEDIATE:Object.freeze({volume_floor:6,standard_min:9,standard_max:14,upper_bound:18}),
    ADVANCED:Object.freeze({volume_floor:8,standard_min:10,standard_max:16,upper_bound:20}),
  }),
  GENERAL_FITNESS:Object.freeze({
    ALL:Object.freeze({volume_floor:4,standard_min:6,standard_max:10,upper_bound:12}),
  }),
});
/* NO_FLOOR_MUSCLES (§4.3): kein VOLUME_FLOOR/Standardkorridor — v1.4.1
   nennt fuer sie auch KEINEN Obergrenzen-Zahlenwert (nur "wird auf
   Obergrenze/Safety geprueft", ohne Zahl). has_corridor:false ist daher
   die korrekte, nicht-erfundene Antwort fuer diese 5 Muskeln (siehe
   Kopf-Kommentar). */
function resolveMuscleVolumeCorridor(muscleId,goal,experienceLevel){
  validateEnumValue(muscleId,CANONICAL_VOLUME_MUSCLE_ID,"muscleId");
  validateEnumValue(goal,TRAINING_GOAL,"goal");
  if(NO_FLOOR_MUSCLES.indexOf(muscleId)!==-1){
    return {muscle_id:muscleId,has_corridor:false};
  }
  const byGoal=VOLUME_CORRIDORS[goal];
  const row=goal===TRAINING_GOAL.GENERAL_FITNESS?byGoal.ALL:byGoal[experienceLevel];
  if(!row)throw new Error("training-volume-engine: kein Zielkorridor fuer goal="+goal+", experience_level="+experienceLevel);
  return {muscle_id:muscleId,has_corridor:true,volume_floor:row.volume_floor,
    standard_min:row.standard_min,standard_max:row.standard_max,upper_bound:row.upper_bound};
}

/* ================= §4.4 — Toleranzbaender + VolumeDeficit ================= */
/* evaluateVolumeTolerance: siehe Kopf-Kommentar L5 fuer hasRepairableCapacity. */
/* Epsilon gegen Floating-Point-Rundungsartefakte exakt AUF einer
   Prozent-Grenze (z.B. 12*0.85=10.2, aber (12-10.2)/12 ergibt in IEEE754
   0.15000000000000005 statt exakt 0.15) — reine Rundungskorrektur, KEINE
   fachliche Toleranzaenderung. */
const TOLERANCE_BAND_EPSILON=1e-9;
function evaluateVolumeTolerance(plannedCredit,corridor,opts){
  if(!corridor||!corridor.has_corridor)return {status:"NOT_APPLICABLE"};
  const {standard_min,standard_max,volume_floor,upper_bound}=corridor;
  const hasRepairableCapacity=!!(opts&&opts.hasRepairableCapacity);

  // Absolute Obergrenzen-Pruefung (§4.4 letzte Zeile) — unabhaengig von
  // Reparaturkapazitaet, da diese beiden Schwellen unbedingt formuliert
  // sind ("WARNING; ... -> ERROR", kein Reparatur-Vorbehalt wie beim
  // Unterschreiten).
  if(upper_bound!=null&&plannedCredit>upper_bound){
    const overUpperPct=(plannedCredit-upper_bound)/upper_bound;
    if(overUpperPct>0.50+TOLERANCE_BAND_EPSILON)return {status:VOLUME_TOLERANCE_STATUS.ERROR,reason:"MORE_THAN_50_PERCENT_OVER_UPPER_BOUND"};
    if(overUpperPct>0.30+TOLERANCE_BAND_EPSILON)return {status:VOLUME_TOLERANCE_STATUS.WARNING,reason:"MORE_THAN_30_PERCENT_OVER_UPPER_BOUND"};
    // <=30% ueber der Obergrenze: faellt durch in die normale
    // Standardkorridor-relative Einordnung unten (dort in aller Regel
    // ohnehin schon ">15%/>30% ueber Standardkorridor" -> WARNING).
  }

  if(plannedCredit>=standard_min&&plannedCredit<=standard_max)return {status:VOLUME_TOLERANCE_STATUS.OK,reason:"WITHIN_STANDARD_CORRIDOR"};

  if(plannedCredit>standard_max){
    const overPct=(plannedCredit-standard_max)/standard_max;
    if(overPct<=0.15+TOLERANCE_BAND_EPSILON)return {status:VOLUME_TOLERANCE_STATUS.OK,reason:"WITHIN_15_PERCENT_ABOVE"};
    if(overPct<=0.30+TOLERANCE_BAND_EPSILON)return {status:VOLUME_TOLERANCE_STATUS.WARNING,reason:"15_TO_30_PERCENT_ABOVE_STANDARD"};
    // >30% ueber Standardkorridor, aber (siehe oben) nicht stark genug
    // ueber der Obergrenze fuer ERROR -> bleibt WARNING (§4.4 kennt keine
    // ERROR-Schwelle fuer reines Ueberschreiten des Standardkorridors).
    return {status:VOLUME_TOLERANCE_STATUS.WARNING,reason:"MORE_THAN_30_PERCENT_ABOVE_STANDARD"};
  }

  // plannedCredit < standard_min
  const underPct=(standard_min-plannedCredit)/standard_min;
  if(underPct<=0.15+TOLERANCE_BAND_EPSILON)return {status:VOLUME_TOLERANCE_STATUS.OK,reason:"WITHIN_15_PERCENT_BELOW"};
  if(underPct<=0.30+TOLERANCE_BAND_EPSILON)return {status:VOLUME_TOLERANCE_STATUS.WARNING,reason:"15_TO_30_PERCENT_BELOW_STANDARD"};
  // >30% unter Standardkorridor
  if(volume_floor!=null&&plannedCredit>=volume_floor){
    return {status:hasRepairableCapacity?VOLUME_TOLERANCE_STATUS.ERROR:VOLUME_TOLERANCE_STATUS.WARNING,reason:"MORE_THAN_30_PERCENT_BELOW_STANDARD_ABOVE_FLOOR",needsVolumeDeficit:!hasRepairableCapacity};
  }
  // unter VOLUME_FLOOR
  return {status:hasRepairableCapacity?VOLUME_TOLERANCE_STATUS.ERROR:VOLUME_TOLERANCE_STATUS.WARNING,reason:"BELOW_VOLUME_FLOOR",needsVolumeDeficit:!hasRepairableCapacity};
}
/* KEIN Support-State-Enum hier (siehe Kopf-Kommentar L6) — dieses Pack
   besitzt die Support-State-Taxonomie nicht. Das strukturierte
   `deficits[]`-Ergebnis von resolveVolumeTargets() ist das einzige Signal,
   das diese Datei dafuer liefert. */
/* Baut ein VolumeDeficit ueber die BESTEHENDE training-domain.js-Fabrik
   (createVolumeDeficit, STEP 01) — keine parallele Struktur. */
function buildVolumeDeficit(muscleId,plannedCredit,corridor,limitingConstraint,evaluationContext){
  if(!evaluationContext||evaluationContext.evaluation_at===undefined)throw new Error("training-volume-engine: buildVolumeDeficit benoetigt einen EvaluationContext (kein verstecktes now(), §0.3/generated_at)");
  if(!corridor||!corridor.has_corridor||corridor.volume_floor==null)throw new Error("training-volume-engine: buildVolumeDeficit benoetigt einen Korridor mit volume_floor fuer "+muscleId);
  return createVolumeDeficit({
    muscle_id:muscleId,
    planned_credit:roundVolumeToHalfSet(plannedCredit),
    standard_min:corridor.standard_min,
    volume_floor:corridor.volume_floor,
    deficit_to_floor:roundVolumeToHalfSet(corridor.volume_floor-plannedCredit),
    limiting_constraint:limitingConstraint,
    generated_at:evaluationContext.evaluation_at,
  });
}

/* ================= §4.5 — Prioritaetsmuskeln (Volumen-Wirkung) ================= */
const MAX_PRIORITY_MUSCLES=2;
function validatePriorityMuscleList(priorityMuscles){
  if(priorityMuscles&&priorityMuscles.length>MAX_PRIORITY_MUSCLES){
    throw new Error("training-volume-engine: maximal "+MAX_PRIORITY_MUSCLES+" Prioritaetsmuskeln erlaubt (§4.5), erhalten: "+priorityMuscles.length);
  }
}
/* §4.5 Regel 1: Zielvolumen = min(Obergrenze, Standardkorridor_Mitte * 1.30). */
function computePriorityMuscleTarget(corridor){
  if(!corridor||!corridor.has_corridor)throw new Error("training-volume-engine: computePriorityMuscleTarget benoetigt einen Muskel mit Korridor (Prioritaet ist fuer floorlose Muskeln nicht definierbar)");
  const midpoint=(corridor.standard_min+corridor.standard_max)/2;
  return Math.min(corridor.upper_bound,midpoint*1.30);
}
/* §4.5 Regeln 2+3 (Slot-Position >=2 Sessions, Score-Bonus +8 in §6) sind
   STRUKTURELLE EFFEKTE ANDERER ENGINES (Slot Generation §5.5, Exercise
   Selection §6) — hier bewusst NICHT implementiert (keine Slot Engine
   vorziehen), nur als Contract dokumentiert:
     - Slot Generation (§5.5, ausserhalb dieses Packs) MUSS jedem
       Prioritaetsmuskel ohne PRIMARY-Slot einen erzeugen (priority_value
       95) und ihm in >=2 Sessions Position 1/2 zusichern.
     - Exercise Selection §6 (ausserhalb dieses Packs) MUSS einem
       Prioritaetsmuskel-Slot einen Score-Bonus von +8 geben.
   INVARIANT V-1 (ein Prioritaetsmuskel hat nie weniger Wochenvolumen als
   ein vergleichbarer Nicht-Prioritaetsmuskel) wird durch
   resolveVolumeTargets() strukturell erfuellt: Prioritaetsmuskel-Ziele
   werden VOR und GESCHUETZT VOR jeder Nicht-Prioritaets-Reduktion
   alloziert (§4.5 Regel 4). */

/* ================= §4.6 — Frequenzverteilung ================= */
/* Kanonische Implementierung dieses Packs (Primary-Scope-Owner von §4.6).
   training-plan-engine.js (STEP 03, §4.6 nur als Dependency-Excerpt)
   enthaelt dieselbe woertliche Formel als eigene, unabhaengige Kopie
   (targetFrequencyFromWeeklyVolume) — bewusst NICHT hierher verlinkt, um
   keine fragile Datei-Kopplung fuer eine 3-Zeilen-Formel einzufuehren;
   beide Implementierungen sind identisch und aus demselben Spec-Satz
   abgeleitet, es gibt keinen Interpretationsspielraum, der auseinanderlaufen
   koennte. */
function computeIdealTargetFrequency(weeklyVolume,goal){
  if(goal===TRAINING_GOAL.STRENGTH)throw new Error("training-volume-engine: computeIdealTargetFrequency gilt laut §4.6 nur fuer HYPERTROPHY/GENERAL_FITNESS — STRENGTH-Frequenz ist ausschliesslich die P5-Exposure-Praeferenz der Split Engine (SP2), kein Volumen-Ziel-Frequenz-Wert");
  if(weeklyVolume<=10)return 1;
  if(weeklyVolume<=20)return 2;
  return 3;
}
/* "geklemmt auf die vom Split gebotene Frequenz" — die tatsaechlich vom
   gewaehlten Split geleistete Frequenz (SplitStructure.muscle_frequency,
   STEP 03) ist die Obergrenze; mehr Sessions als der Split hergibt kann
   ein Zielwert nicht fordern. */
function clampFrequencyToSplit(idealFrequency,splitOfferedFrequency){
  return Math.min(idealFrequency,splitOfferedFrequency);
}
/* §4.6 STRENGTH-Praeferenz: >=2 Exposures ist AUSSCHLIESSLICH P5-
   Optimierung (SP2 in der Split Engine, STEP 03) — 1 Exposure bleibt
   immer gueltig, es gibt HIER keine ERROR/INFEASIBLE-Erzeugung. Reine
   Informationsfunktion, niemals blockierend. */
function evaluateStrengthExposurePreference(actualExposuresPerWeek){
  return {meetsPreference:actualExposuresPerWeek>=2,blocking:false};
}

/* ================= §4.7 — Session-Caps und Ermuedung ================= */
/* Fraktionale Saetze pro Muskel pro Session: Warnschwelle 10, Fehlerschwelle 12. */
function evaluateMuscleSessionSetCap(fractionalSetsInSession){
  if(fractionalSetsInSession>12)return {status:VOLUME_TOLERANCE_STATUS.ERROR};
  if(fractionalSetsInSession>10)return {status:VOLUME_TOLERANCE_STATUS.WARNING};
  return {status:VOLUME_TOLERANCE_STATUS.OK};
}
/* Arbeitssaetze pro Session gesamt: Warnschwelle = max_working_sets,
   Fehlerschwelle = max_working_sets * 1.25 (SessionCapacity, STEP 03). */
function evaluateTotalSessionSetCap(totalWorkingSets,maxWorkingSets){
  if(totalWorkingSets>maxWorkingSets*1.25)return {status:VOLUME_TOLERANCE_STATUS.ERROR};
  if(totalWorkingSets>maxWorkingSets)return {status:VOLUME_TOLERANCE_STATUS.WARNING};
  return {status:VOLUME_TOLERANCE_STATUS.OK};
}
/* fatigue_load(session) = Sum(sets * fatigue_systemic). fatigue_systemic
   je Uebung/Slot ist Exercise-Catalog-Wissen (ausserhalb dieses Packs) —
   slotFatigueEntries ist daher ein externer Input:
   [{sets, fatigue_systemic}]. */
function computeFatigueLoad(slotFatigueEntries){
  return (slotFatigueEntries||[]).reduce((sum,e)=>sum+e.sets*e.fatigue_systemic,0);
}
/* "Erfahrungsabhaengig: 60/80/100" — die Zuordnung zu BEGINNER/
   INTERMEDIATE/ADVANCED folgt der in JEDER Korridortabelle dieses Packs
   durchgehend verwendeten aufsteigenden Reihenfolge (Beginner < Intermediate
   < Advanced); keine freie Zuordnung, sondern die einzige mit der
   restlichen Spec konsistente Zuordnung dreier aufsteigender Werte auf
   drei aufsteigende Erfahrungsstufen. */
const FATIGUE_LOAD_THRESHOLD_BY_EXPERIENCE=Object.freeze({BEGINNER:60,INTERMEDIATE:80,ADVANCED:100});
/* "fatigue_load erzeugt nie einen ERROR" — ausschliesslich OK/WARNING. */
function classifyFatigueLoad(fatigueLoad,experienceLevel){
  validateEnumValue(experienceLevel,EXPERIENCE_LEVEL,"experienceLevel");
  const threshold=FATIGUE_LOAD_THRESHOLD_BY_EXPERIENCE[experienceLevel];
  return {status:fatigueLoad>threshold?VOLUME_TOLERANCE_STATUS.WARNING:VOLUME_TOLERANCE_STATUS.OK};
}

/* ================= §4.8 — Direktarbeits-Mindestanteil (RT-02) ================= */
/* Nur fuer Ziel HYPERTROPHY und Wochenziel >= 8 (woertlich §4.8). */
function evaluateDirectShare(directCredit,totalCredit,weeklyTarget,goal){
  if(goal!==TRAINING_GOAL.HYPERTROPHY||weeklyTarget<8)return {status:"NOT_APPLICABLE"};
  const share=totalCredit>0?directCredit/totalCredit:0;
  if(share>=0.30)return {status:VOLUME_TOLERANCE_STATUS.OK,share};
  if(share>0)return {status:VOLUME_TOLERANCE_STATUS.WARNING,share};
  return {status:VOLUME_TOLERANCE_STATUS.ERROR,share};
}

/* ================= Phase 3 — Volume Target Resolution ================= */
/* INPUT: planRequirements (STEP 03: goal, experience_level,
   priority_muscles[]), targetMuscles (optional, Default = alle 13
   Muskeln MIT Korridor), weeklyDeliverableVolumeCapacity (Pflicht,
   externer Input — siehe Kopf-Kommentar L2), hardRequirementFloors
   (optional, Default {} — siehe L1), limitingConstraint (Pflicht, sobald
   ein Deficit entstehen kann — siehe L4), evaluationContext.
   OUTPUT: {weeklyVolumeTargets:{muscle:credit}, corridorByMuscle,
   priorityMuscles, deficits[], weeklyDeliverableVolumeCapacity,
   usedCapacity}.
   Allocation-Reihenfolge exakt nach §4.2: 1) hardRequirementFloors
   (geschuetzt), 2) Prioritaetsmuskel-Ziele (geschuetzt, §4.5 Regel 1),
   3) VOLUME_FLOOR uebriger Zielmuskeln, 4) Standardkorridor (bis
   standard_max), 5) zusaetzliches Volumen bis Obergrenze. Innerhalb einer
   knappen Stufe entscheidet AUSSCHLIESSLICH der Pflicht-Parameter
   `allocationOrder` (siehe Kopf-Kommentar L3) — keine von dieser Datei
   erfundene Verteilregel. */
function resolveVolumeTargets({planRequirements,targetMuscles,weeklyDeliverableVolumeCapacity,hardRequirementFloors,allocationOrder,limitingConstraint,evaluationContext}){
  if(!evaluationContext||evaluationContext.evaluation_at===undefined)throw new Error("training-volume-engine: resolveVolumeTargets benoetigt einen EvaluationContext (kein verstecktes now())");
  if(!planRequirements)throw new Error("training-volume-engine: resolveVolumeTargets benoetigt PlanRequirements");
  if(weeklyDeliverableVolumeCapacity==null)throw new Error("training-volume-engine: resolveVolumeTargets benoetigt weeklyDeliverableVolumeCapacity — dieses Pack kann sie NICHT selbst aus SessionCapacity ableiten (siehe Kopf-Kommentar L2), muss vom Aufrufer explizit uebergeben werden");
  const goal=planRequirements.goal,experienceLevel=planRequirements.experience_level;
  const priorityMuscles=(planRequirements.priority_muscles||[]).slice();
  validatePriorityMuscleList(priorityMuscles);
  const hardReq=hardRequirementFloors||{};
  const muscles=targetMuscles||Object.keys(CANONICAL_VOLUME_MUSCLE_ID).filter(m=>NO_FLOOR_MUSCLES.indexOf(m)===-1);

  const corridorByMuscle={};
  muscles.forEach(m=>{corridorByMuscle[m]=resolveMuscleVolumeCorridor(m,goal,experienceLevel);});

  const allocated={};
  let usedCapacity=0;

  // Stufe 1: P0-P4 HARD REQUIREMENTS (extern, geschuetzt — siehe L1).
  muscles.forEach(m=>{
    if(hardReq[m]!=null){allocated[m]=hardReq[m];usedCapacity+=hardReq[m];}
  });

  // Stufe 2: Prioritaetsmuskel-Ziele (§4.5 Regel 1, geschuetzt).
  priorityMuscles.forEach(m=>{
    if(allocated[m]!=null)return;
    const corridor=corridorByMuscle[m];
    if(!corridor||!corridor.has_corridor)throw new Error("training-volume-engine: Prioritaetsmuskel "+m+" hat keinen Volumenkorridor — Prioritaets-Zielvolumen nicht definierbar");
    const target=computePriorityMuscleTarget(corridor);
    allocated[m]=target;
    usedCapacity+=target;
  });

  // Stufen 3-5: uebrige Zielmuskeln mit Korridor, Leiter [floor, standard_max, upper_bound].
  const remaining=muscles.filter(m=>allocated[m]==null&&corridorByMuscle[m]&&corridorByMuscle[m].has_corridor);
  remaining.forEach(m=>{allocated[m]=0;});
  const ladderByMuscle={};
  remaining.forEach(m=>{ladderByMuscle[m]=[corridorByMuscle[m].volume_floor,corridorByMuscle[m].standard_max,corridorByMuscle[m].upper_bound];});

  // Reihenfolge, in der KONKURRIERENDE Muskeln derselben Stufe finanziert
  // werden: AUSSCHLIESSLICH der vom Aufrufer vorgegebene `allocationOrder`
  // (siehe Kopf-Kommentar L3) — kein Round-Robin, keine Gewichtung, keine
  // Gleichverteilung wird hier erfunden. Bei hoechstens 1 konkurrierenden
  // Muskel gibt es nichts zu ordnen, `allocationOrder` ist dann nicht
  // erforderlich.
  let orderedRemaining=remaining;
  if(remaining.length>1){
    if(!Array.isArray(allocationOrder))throw new Error("training-volume-engine: resolveVolumeTargets benoetigt allocationOrder — mehrere Nicht-Prioritaets-Zielmuskeln ("+remaining.join(", ")+") koennen gleichzeitig um Kapazitaet konkurrieren, v1.4.1 nennt dafuer keine Verteilregel (kein Round-Robin, keine Gleichverteilung darf erfunden werden); die Finanzierungsreihenfolge muss vom Aufrufer explizit vorgegeben werden.");
    const missing=remaining.filter(m=>allocationOrder.indexOf(m)===-1);
    if(missing.length)throw new Error("training-volume-engine: allocationOrder deckt nicht alle konkurrierenden Muskeln ab, fehlend: "+missing.join(", "));
    orderedRemaining=remaining.slice().sort((a,b)=>allocationOrder.indexOf(a)-allocationOrder.indexOf(b));
  }

  let remainingCapacity=Math.max(0,weeklyDeliverableVolumeCapacity-usedCapacity);
  for(let tier=0;tier<3;tier++){
    orderedRemaining.forEach(m=>{
      const need=Math.max(0,ladderByMuscle[m][tier]-allocated[m]);
      if(need<=0)return;
      const give=Math.min(need,remainingCapacity);
      allocated[m]+=give;
      remainingCapacity-=give;
    });
  }
  usedCapacity=weeklyDeliverableVolumeCapacity-remainingCapacity;

  // Deficits: uebrige Zielmuskeln, deren Allokation den Floor nicht erreicht.
  const deficits=[];
  remaining.forEach(m=>{
    const corridor=corridorByMuscle[m];
    if(allocated[m]<corridor.volume_floor-1e-9){
      if(!limitingConstraint)throw new Error("training-volume-engine: VolumeDeficit fuer "+m+" erforderlich, aber limitingConstraint wurde nicht uebergeben (siehe Kopf-Kommentar L4) — keine Vermutung ueber die Ursache");
      deficits.push(buildVolumeDeficit(m,allocated[m],corridor,limitingConstraint,evaluationContext));
    }
  });

  Object.keys(allocated).forEach(m=>{allocated[m]=roundVolumeToHalfSet(allocated[m]);});

  return {weeklyVolumeTargets:allocated,corridorByMuscle,priorityMuscles,deficits,
    weeklyDeliverableVolumeCapacity,usedCapacity:roundVolumeToHalfSet(usedCapacity)};
}

/* ================= Phase 5 — Volume Distribution (SessionVolumeTargets) ===== */
/* VolumeTargets + SplitStructure -> SessionVolumeTargets. v1.4.1 verlangt
   hierfuer eine DETERMINISTISCHE Verteilung, definiert aber keinen
   konkreten Equal-Split-/Remainder-Algorithmus (siehe Kopf-Kommentar L7).
   Diese Funktion erfindet daher KEINE Verteilregel (kein Equal-Split,
   kein Round-Robin, kein "Rest in erste Session"): `sessionTemplateSequence`
   bestimmt ausschliesslich die ELIGIBILITY (welche Session einen Muskel
   ueberhaupt traegt — eine reine Tatsachenfeststellung aus demselben
   externen Input wie in STEP 03), waehrend die tatsaechliche
   Gewichtsverteilung des Wochenziels auf diese Expositionen ein
   PFLICHT-externer Input `sessionDistributionWeights` ist (Form:
   {muscle: [gewicht_expo_0, gewicht_expo_1, ...]}, je Muskel parallel zu
   dessen eigenen Expositionen, muss sich zu 1 summieren). */
function computeSessionVolumeTargets(weeklyVolumeTargets,splitStructure,sessionTemplateSequence,sessionDistributionWeights){
  if(!splitStructure||!Array.isArray(splitStructure.training_weekdays))throw new Error("training-volume-engine: computeSessionVolumeTargets benoetigt SplitStructure.training_weekdays (STEP 03)");
  if(!Array.isArray(sessionTemplateSequence)||!sessionTemplateSequence.length)throw new Error("training-volume-engine: computeSessionVolumeTargets benoetigt sessionTemplateSequence (externer Input, siehe STEP 03)");
  if(!sessionDistributionWeights)throw new Error("training-volume-engine: computeSessionVolumeTargets benoetigt sessionDistributionWeights — v1.4.1 definiert fuer Phase 5 keinen konkreten Equal-Split-/Remainder-Algorithmus; die Gewichtung je Exposition muss vom Aufrufer explizit vorgegeben werden (kein impliziter Equal-Split).");
  const weekdays=splitStructure.training_weekdays;
  const T=sessionTemplateSequence.length;
  const perSessionInstance=weekdays.map(()=>({}));
  Object.keys(weeklyVolumeTargets).forEach(muscle=>{
    const weekly=weeklyVolumeTargets[muscle];
    const exposureIndexes=[];
    weekdays.forEach((wd,i)=>{
      if(sessionTemplateSequence[i%T].muscles.indexOf(muscle)!==-1)exposureIndexes.push(i);
    });
    if(!exposureIndexes.length)return;
    const weights=sessionDistributionWeights[muscle];
    if(!Array.isArray(weights)||weights.length!==exposureIndexes.length)throw new Error("training-volume-engine: sessionDistributionWeights["+muscle+"] fehlt oder passt nicht zur Anzahl der Expositionen ("+exposureIndexes.length+") — keine implizite Gleichverteilung, die Gewichte je Exposition muessen vom Aufrufer explizit vorgegeben werden.");
    const weightSum=weights.reduce((a,b)=>a+b,0);
    if(Math.abs(weightSum-1)>1e-6)throw new Error("training-volume-engine: sessionDistributionWeights["+muscle+"] muss sich zu 1 summieren (erhalten: "+weightSum+")");
    exposureIndexes.forEach((sessionIndex,k)=>{
      perSessionInstance[sessionIndex][muscle]=roundVolumeToHalfSet(weekly*weights[k]);
    });
  });
  return perSessionInstance;
}

if(typeof module!=="undefined" && module.exports){
  module.exports={
    NO_FLOOR_MUSCLES,ANATOMY_SUBREGION_TAG_TYPE,ANATOMY_SUBREGION_REGISTRY,
    validateAnatomySubregionTag,isCanonicalVolumeMuscleOrTag,
    MUSCLE_CONTRIBUTION_CONFIG_VERSION,MUSCLE_CONTRIBUTION_CREDIT,
    rirCreditFactor,computeSetVolumeCredit,computeDirectShareSetCredit,
    isCountableWorkSet,resolveEffectiveRir,
    ROLLING_VOLUME_WINDOW_DAYS,isWithinRollingWindow,
    computeRollingMuscleVolumeCredit,computeRollingDirectShareCredit,
    VOLUME_CORRIDORS,resolveMuscleVolumeCorridor,
    evaluateVolumeTolerance,buildVolumeDeficit,
    MAX_PRIORITY_MUSCLES,validatePriorityMuscleList,computePriorityMuscleTarget,
    computeIdealTargetFrequency,clampFrequencyToSplit,evaluateStrengthExposurePreference,
    evaluateMuscleSessionSetCap,evaluateTotalSessionSetCap,
    computeFatigueLoad,FATIGUE_LOAD_THRESHOLD_BY_EXPERIENCE,classifyFatigueLoad,
    evaluateDirectShare,
    resolveVolumeTargets,computeSessionVolumeTargets,
  };
}
