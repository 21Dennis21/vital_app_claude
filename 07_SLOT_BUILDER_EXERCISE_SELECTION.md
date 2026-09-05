# IMPLEMENTATION PACK 07/14 — SLOT BUILDER / INITIAL EXERCISE SELECTION

> Quelle: `TRAINING SYSTEM — FINAL IMPLEMENTATION SPEC v1.4.1`
> Status: Implementierungsprojektion der v1.4.1, **keine neue Spec** und keine fachliche Vereinfachung.
> Dieses Paket darf die Master-v1.4.1 nicht überschreiben. Alle normativen Quellpassagen unten sind wortgetreu aus der Master-Datei übernommen.

## VERBINDLICHE NUTZUNGSREGEL FÜR DEN IMPLEMENTIERUNGSAGENTEN

- Implementiere **nur den PRIMARY SCOPE dieses Packs**.
- Lies den gesamten Inhalt dieses Packs vor Änderungen vollständig.
- `DEPENDENCY CONTRACT EXCERPTS` sind verbindliche Schnittstellen-/Abhängigkeitsregeln; implementiere daraus nur das, was für den Primary Scope technisch erforderlich ist.
- Keine Fachlogik erfinden, vereinfachen, zusammenziehen oder stillschweigend ändern.
- Bestehende App-Architektur nur dort verändern, wo die hier enthaltene v1.4.1-Logik es verlangt.
- P0–P2 dürfen niemals umgangen werden.
- Wenn App-Code und dieses Pack fachlich kollidieren, dokumentiere den Konflikt und richte die Trainingslogik nach v1.4.1 aus.
- Keine späteren Packs vorsorglich halb implementieren.
- Nach Umsetzung Build/Tests des betroffenen Bereichs real ausführen; keine Fake-PASS-Angaben.

## ZIEL DIESES PACKS

Slot-Generierung, Exercise Hard Filters, Ranking, Kontextmodulation, Eskalation und Technique-Intro implementieren.

## PRIMARY-SOURCE-COVERAGE

Dieses Pack besitzt folgende Master-Line-Ranges als primären Implementierungsscope:

- Master-Zeilen `1381–1617`

Die Vereinigung aller 14 Primary-Scopes deckt die Master-v1.4.1 lückenlos ab. Doppelte Dependency-Excerpts ändern keine Ownership.

---

# PRIMARY SCOPE — WORTGETREUE v1.4.1-QUELLE

TEIL 6 — EXERCISE SELECTION ENGINE (INITIAL)

6.1 Abgrenzung zur Substitution Engine

                       Initial Selection (§6)                    Substitution (§19)

                                                                 original_exercise_id +
  Referenz             slot_function (abstrakt)
                                                                 slot_function


                       Progressierbarkeit, Vertrautheit,         Funktionserhalt gegenüber
  Optimiert für
                       Variationsbreite über den Plan            einer konkreten Übung

  Präferenzgewicht     niedrig (10)                              hoch (15)

  Vielfaltsterm        ja (SE7)                                  nein

  Vertrautheitsterm    ja (SE6)                                  nein

  Kandidatenmenge      ganzer Katalog                            Katalog minus aktuelle Übung

  Löst aus             Plangenerierung, Partial Rebuild          Nutzeraktion


DECISION: Zwei getrennte Engines mit gemeinsamen Hard Filters, aber eigenen Score-Sätzen.

RATIONALE: Bei der Erstauswahl gibt es keine Referenzübung, gegen die Ähnlichkeit gemessen
werden könnte — der Ähnlichkeitsterm S1 der Substitution Engine ist hier undefiniert. Umgekehrt
sind Vielfalt über den gesamten Plan und Vertrautheit bei einer Ersetzung irrelevant oder sogar
schädlich (der Nutzer will die Übung ja gerade loswerden). Eine gemeinsame Engine mit
Kontextschaltern wäre eine getarnte Doppelimplementierung mit doppelter Fehlerfläche.

6.2 Hard Filters (gemeinsam mit §19)

| ID | Filter |
|---|---|
| F1 | Mindestens ein vollständiges `equipment_setups[]` ist am `effective_location_id` satisfiable; alle AND-Prädikate dieser OR-Branch sind erfüllt; aktive numerische Ziellast liegt im `LoadProfileVersion` oder besitzt einen zulässigen Phase-1-Bridge/Rep-only-Pfad. |
| F2 | Exercise nicht `HARD_EXCLUDED` oder `PREFERENCE_PAUSED`; keine Safety-Sperre; alle benötigten Instanzen `PRESENT` und nicht `TEMPORARILY_UNAVAILABLE`. |
| F3 | `movement_pattern` identisch mit `slot_function.movement_pattern`; Subpattern muss kompatibel sein. Nachbarmuster erst in der definierten Eskalation. |
| F4 | Muskel-Overlap mit `slot_function.primary_muscles` >= 0.50, berechnet über die versionierten Contribution-Band-Gewichte (§4.1). |
| F5 | Kein aktives `CAUTION_HIGH`; bei `CAUTION`: `stability_demand <= 3` und `technical_demand <= 3`. |
| F6 | `technical_demand <= user_skill_level + 1`. |
| F7 | Übung noch nicht in derselben Session vergeben. |
| F8 | Paar nicht auf kuratierter Veto-Liste. |
| F9 | `metadata_completeness = COMPLETE` für Auto-Selection; `auto_selectable=false` darf nur manuell gewählt werden. |
| F10 | Falls der Slot explizite `equipment_constraints[]`/Capability-Prädikate besitzt, muss mindestens eine Setup-Branch sie erfüllen; ohne explizite Constraint ist F10 PASS. Keine simple Equipment-Family-Whitelist. |
| F11 | Bei `required_progressibility = HIGH`: legaler Load-Step oder definierter `REP_BRIDGE_OVERLAY`, `REP_ONLY_TARGET_PROGRESSION`, Assistance-/Bodyweight-Pfad; kein erfundener Load-Step. |

F1 ist kein reines Boolean. Für jeden Kandidaten erzeugt F1 die Menge aller am effektiven Ort
satisfiablen `ResolvedSetupBinding`-Kandidaten. F11 wird gegen diese konkrete Menge geprüft.
Ein Exercise-Kandidat bleibt nur dann gültig, wenn mindestens eine vollständige Setup-Bindung
F1 und F11 besteht.

Bindungswahl innerhalb derselben ExerciseDefinition, deterministisch in dieser Reihenfolge:
1. bereits persistierte Bindung weiterverwenden, wenn weiterhin satisfiable;
2. legaler Progressionspfad ohne `PROGRESSION_LIMITED`;
3. feinere verfügbare Laststufung;
4. geringere Setup-/Transition-Kosten;
5. vorhandene eigene Historie auf der relevanten Load-Identität;
6. lexikografisch `exercise_setup_id`, danach `equipment_instance_id[]`.

Die Bindungswahl ändert den Exercise-Score nicht nachträglich; sie materialisiert nur, welche der
bereits zulässigen Setup-Branches tatsächlich geplant wird. Session-Location-Overrides lösen eine
neue session-lokale Bindung aus, ohne die Default-Bindung stillschweigend umzuschreiben (§21.5).

INVARIANT E-5: Kein ausgewählter PlanSlot existiert ohne eine konkrete satisfiable `ResolvedSetupBinding`; ein späteres Workout snapshottet exakt diese bzw. die session-lokal neu aufgelöste Bindung.

Muskel-Overlap verwendet ausschließlich die Mapping-Werte aus `MuscleContributionConfig`; Katalogeinträge enthalten keine freien Dezimal-Contributions.

INVARIANT E-1: Hard Filters werden nie gewichtet, verrechnet oder umgangen. F1, F2 und F5 werden in keiner Eskalationsstufe gelockert.


6.3 Soft Score — Initial Selection

6.3 Soft Score — Initial Selection (Summe 100)

 ID      Kriterium              Gewicht      Berechnung

         Slot-Funktions-
 SE1                            26               0.6 × muskel_overlap + 0.4 × movement_similarity
         Erfüllung

  SE2       Progressierbarkeit   20          Abgleich progression_granularity × Lastschritt-
                                             Relativität (§9.6) mit required_progressibility

            Belastungsprofil                 Überlappung suitable_rep_range mit
  SE3                            14
            & Rep-Eignung                    `slot_function.rep_character`; keine freie `resistance_profile`-Variable


                                             100 − 22 × max(0, technical_demand −
            Technische
  SE4                            12          user_skill) − 10 × max(0, stability_demand −
            Eignung
                                             3)


                                             fatigue_systemic ≤ fatigue_budget ; Abgleich mit
  SE5       Fatigue-Passung      10
                                             Restbudget der Session

                                             100 wenn Historie vorhanden (Confidence ≥ MEDIUM);
  SE6       Vertrautheit         10
                                             70 wenn known_exercises ; 40 wenn neu

                                             100 − 30 × (Anzahl bereits vergebener Übungen
            Planvielfalt &                   mit Overlap ≥ 0.7) − 15 × (Anzahl bereits
  SE7                            8
            Redundanz                        vergebener Übungen derselben equipment_family in
                                             dieser Session über 2 hinaus)


Nutzerpräferenz fließt als Modifikator ein, nicht als eigener Term: FAVORITE +8 , SOFT_DOWNRANK
−8 , DISLIKED −25 auf den Endscore. Prioritätsmuskel-Slot: +8 .

RATIONALE für SE2 = 20 (zweitgrößtes Gewicht): Bei der Erstauswahl bestimmt die Übung,
ob der Slot über Monate progressierbar bleibt. Eine funktional perfekte Übung, deren kleinster
Lastschritt 25 % beträgt, ist ein Plan, der in drei Wochen stallt. Bei der Substitution ist dieses
Gewicht niedriger (12), weil dort die Funktionserhaltung gegenüber einer bereits laufenden
Übung im Vordergrund steht.

RATIONALE für SE6 (Vertrautheit) = 10: Eine bekannte Übung startet mit MEDIUM -Confidence
statt Findungsprotokoll, spart Sessionzeit und liefert sofort verwertbare Progressionsdaten. Das
ist ein realer Systemvorteil, kein Komfortargument.


6.4 Kontextmodulation
Multiplikatoren auf die Basisgewichte, danach Renormalisierung auf 100.


  Kontext                                   Modulation

  role = PRIMARY                            SE2 ×1.5, SE1 ×1.2, SE7 ×0.8

  role = ISOLATION / ACCESSORY              SE5 ×1.4, SE2 ×0.5, SE4 ×1.2

  goal = STRENGTH                           SE2 ×1.4, SE3 ×1.2, SE6 ×1.2

  goal = HYPERTROPHY                           SE5 ×1.2, SE3 ×1.2, SE2 ×0.85

  goal = GENERAL_FITNESS                       SE4 ×1.5, SE6 ×1.3, SE2 ×0.5

  experience_level = BEGINNER                  SE4 ×1.7, SE6 ×1.3, SE2 ×0.7

  experience_level = ADVANCED                  SE7 ×1.3, SE2 ×1.2

  Prioritätsmuskel-Slot                        SE1 ×1.3, SE2 ×1.2

  Zeitbudget < 45 min                          Setup-Term mit Gewicht 10 zusätzlich eingefügt



6.5 Schwellen und Tie-Breaker

  Endscore                Verwendung

  ≥ 60                    Regulärer Kandidat

  45–59                   Zulässig, SUBOPTIMAL_SELECTION -Flag am Slot

  < 45                    Nur in Eskalationsstufe ≥ 2


Tie-Breaker (Differenz < 1.0), in dieser Reihenfolge:

1. Höhere Präferenzstufe

2. Vorhandene eigene Historie

3. Höhere metadata_completeness

4. Niedrigerer technical_demand

5. Feinere progression_granularity

6. Kürzere setup_time_class

7. Lexikografisch nach exercise.id

INVARIANT E-2: Die Auswahl ist vollständig deterministisch. Keine Zufallskomponente, keine
Zeitabhängigkeit, keine A/B-Streuung.

RATIONALE: Zwei identische Nutzerprofile müssen denselben Plan erhalten. Andernfalls sind
Support, Reproduktion von Fehlern und die Bewertung von Änderungen an den Gewichten
unmöglich.


6.6 Eskalationsleiter bei leerem Kandidatenraum

 Stufe      Lockerung

 0          Normalbetrieb

 1          Präferenz-Modifikatoren auf 0; SE7 (Vielfalt) auf 0

            F3 erlaubt Nachbarmuster; F4-Schwelle auf 0.35; F10 aufgehoben; Score-Untergrenze
 2
            auf 30

            F11 aufgehoben; Slot erhält PROGRESSION_LIMITED -Flag; Prescription wechselt auf Rep-
 3
            Progression

 4          F6 auf user_skill + 2 gelockert; Slot erhält TECHNIQUE_INTRO -Flag (§6.7)

 5          Slot wird entfernt, Volumen auf verbleibende Slots desselben Muskels verteilt, WARNING


INVARIANT E-3: F1, F2, F5 werden in keiner Stufe gelockert. F6 wird ausschließlich in Stufe 4
und nur zusammen mit dem TECHNIQUE_INTRO -Protokoll gelockert.


6.7 TECHNIQUE_INTRO-Protokoll (RT-19)
Wird eine Übung über F6-Lockerung ausgewählt, gilt zwingend:

     Startlast: absolutes Minimum der verfügbaren Stufen

     Rep-Bereich: +3 auf beide Enden

     Ziel-RIR: +2

     Warm-up-Protokoll: +1 Satz

     Progressionsmodell: REP_ONLY_TARGET_PROGRESSION für die ersten 4 Sessions, dann Übergang

     Vor der ersten Session wird eine Technikanleitung eingeblendet, nicht optional weggeklickt

     Slot bleibt CALIBRATING für mindestens 4 Sessions

INVARIANT E-4: Eine über F6-Lockerung ausgewählte Übung erhält nie eine Lastempfehlung
aus Übertragung (§11 Tier T3/T4). Immer Findungsprotokoll.





---

# DEPENDENCY CONTRACT EXCERPTS — WORTGETREUE v1.4.1-QUELLE

Die folgenden Abschnitte liegen außerhalb des Primary Scope, werden aber durch diesen Scope explizit referenziert oder sind globale Core-Verträge. Sie sind hier enthalten, damit für diesen Schritt nicht erneut die gesamte Master-Datei gelesen werden muss.


## Dependency §0.2 — Master-Zeilen 69–115

0.2 Globale Prioritätshierarchie
Diese Hierarchie gilt in jeder Engine. Sie ist die einzige Konfliktlösungsinstanz des Systems.


  Ebene      Bereich                                                            Verletzbar?

             Safety: medizinische Flags, CAUTION-Muster, Lastsprung-
  P0                                                                            Nie
             Obergrenzen, Pausen-Untergrenze

  P1         Explizite harte Nutzerausschlüsse ( HARD_EXCLUDED )                Nie

  P2        Physische Ausführbarkeit: Equipment am Ort, Lastbereich, Skill-    Nie
            Untergrenze

                                                                               Nur mit
  P3        Zeitliche Durchführbarkeit: Session passt ins Zeitbudget
                                                                               Nutzerbestätigung

                                                                               Nur mit
  P4        Slot-Funktion: Bewegungsmuster + Primärmuskel des Slots
                                                                               Nutzerbestätigung

            Trainingsziel-Konformität: Rep-Bereich, Progressierbarkeit,        Automatisch
  P5
            Belastungsprofil                                                   anpassbar

                                                                               Automatisch
  P6        Volumenziele und Balance
                                                                               anpassbar

  P7        Weiche Nutzerpräferenzen, Komfort, Variation                       Ja, mit Hinweis


DECISION: P3 (Zeit) steht über P4 (Slot-Funktion) und P6 (Volumen).

RATIONALE: Eine Session, die nicht ins Zeitbudget passt, wird abgebrochen oder gar nicht
ausgeführt. Realisiertes Volumen von 70 % schlägt geplantes Volumen von 100 %, das nie
stattfindet. Diese Präzedenz löst außerdem die Oszillation zwischen Volumen-Repair (Sätze
hinzufügen) und Zeit-Repair (Sätze entfernen) — siehe RT-15.

INVARIANT G-1: Kein Codepfad, kein Fallback, kein Debug-Modus umgeht P0–P2.

INVARIANT G-2: Wenn P0–P2 keine Lösung zulassen, ist das Ergebnis nie ein schlechterer Plan,
sondern der Zustand INFEASIBLE bzw. NEEDS_USER_DECISION mit strukturierter Erklärung.



## Dependency §0.3 — Master-Zeilen 116–159

0.3 Determinismus und Kein-KI-Prinzip
DECISION: Alle Kern-Engines (Split, Volume, Slot, Selection, Prescription, Calibration,
Progression, Adaptation, Validation, Substitution) sind reine deterministische Funktionen ihrer
dokumentierten Inputs. Kein LLM, kein Zufall und kein impliziter Zugriff auf die Systemuhr.

DECISION: Jeder Core-Aufruf erhält einen expliziten `EvaluationContext`. Zeitfenster wie „letzte
7 Tage”, „letzte 28 Tage”, Detraining-Dauer, TTLs und wöchentliche Checks werden ausschließlich
gegen `evaluation_at` aus diesem Context ausgewertet. Ein erneuter Aufruf mit identischem State,
identischen Events, identischer Config und identischem `EvaluationContext` muss identische
Ergebnisse liefern.

```
EvaluationContext {
  evaluation_at                    // timezone-aware; pro Command/Evaluation genau einmal gesetzt
  user_timezone
  config_version
  catalog_version
  source_event_revision
  plan_version_id?
  equipment_profile_versions[]
}
```

Kanonische Ereignisreihenfolge für alle Replay-/Recompute-Pfade:
1. `effective_at` bzw. `performed_at`,
2. `recorded_at`,
3. unveränderliche `event_id` lexikografisch.

Korrekturen ändern diese Reihenfolge nicht rückwirkend durch Mutation des Basisereignisses,
sondern werden als eigene Events materialisiert (§21.6, §23.4).

DECISION: Ein LLM darf ausschließlich Ergebnisse erklären, die die Core Engine bereits
berechnet hat. Es darf keinen Zahlenwert erzeugen, verändern oder überschreiben.

INVARIANT G-3: Identischer fachlicher Input plus identischer `EvaluationContext` erzeugt identischen Output.

INVARIANT G-4: Alle abgeleiteten Werte (PerformanceIndex, Volumen, Zeit, Progression, Fatigue) sind reine Funktionen des kanonisch geordneten Event-Logs plus versionierter Config.

INVARIANT G-D3: Jeder normative Identifier in Formel, Sort-Key, Score, Filter, Transition, Validation oder Datenmodell ist in dieser Spec kanonisch definiert oder deterministisch aus definierten Feldern ableitbar. Freie Entwicklerinterpretation ist unzulässig.

INVARIANT G-D1: Kein Core-Modul liest „now()” oder nicht versionierte globale Konfiguration als versteckten Input.

INVARIANT G-D2: Bei identischem `effective_at` und `recorded_at` entscheidet ausschließlich die stabile `event_id`; Einfügereihenfolge in der Datenbank beeinflusst kein Ergebnis.


## Dependency §0.4 — Master-Zeilen 160–188

0.4 Systemweites Confidence-Modell
Vier Stufen, überall identisch interpretiert:


  Stufe        Bedeutung                        Systemverhalten

                                                Kein konkreter Zahlenwert wird ausgegeben;
  NONE         Keine verwertbaren Daten
                                                Findungsprotokoll

               Einzelner Datenpunkt,            Konservative Untergrenze, enge
  LOW          Selbstauskunft, oder             Änderungsgrenzen, keine Bereichsangabe wenn σ
               Übertragung                      ≥ 2.0

               2–3 konsistente Sessions oder
  MEDIUM                                        Bereichsangabe, normale Änderungsgrenzen
               belastbare Selbstauskunft

               ≥4 konsistente Sessions in den
  HIGH                                          Volle Änderungsgrenzen, Autoregulation zulässig
               letzten 60 Tagen


INVARIANT G-5: Bei NONE gibt das System niemals ein konkretes Arbeitsgewicht aus.

INVARIANT G-6: Jede Last-, Volumen- oder Leistungsempfehlung trägt ihren Confidence-Wert
im Datenmodell mit. Confidence ist nie optional.



## Dependency §0.5 — Master-Zeilen 189–210

0.5 Keine falsche Präzision
DECISION:

   Lastempfehlungen werden immer auf tatsächlich verfügbare Gewichtsstufen gerundet (§9).

   Bei MEDIUM / HIGH wird ein Bereich aus 1–3 verfügbaren Stufen ausgegeben, die
   konservativste vorausgewählt.

   Bei LOW mit σ ≥ 2.0 und bei NONE wird kein Bereich ausgegeben, sondern eine einzelne
   konservative Stufe plus Kalibriersatz.

   Zeitangaben werden als Spanne ±12 % (±20 % bei unvollständigen Metadaten) auf 5 Minuten
   gerundet.

   Volumen wird auf 0.5 Sätze gerundet.

   e1RM wird intern geführt und standardmäßig nie angezeigt.

RATIONALE für die e1RM-Verdeckung: Eine angezeigte 1RM-Schätzung lädt zum
Maximalkraft-Vergleich ein, den die Datenqualität nicht trägt, und verleitet zu Maximaltests, die
das System ausdrücklich vermeiden will.


## Dependency §4.1 — Master-Zeilen 948–976

4.1 Zählmodell
DECISION: Muskelbeiträge werden im Katalog kategorial gespeichert und über eine versionierte Mapping-Tabelle in die bestehende fraktionale Satzwährung übersetzt.

```
MuscleContributionBand = PRIMARY_HIGH | PRIMARY_MODERATE | SECONDARY | STABILIZER

MuscleContributionConfig v1.4.1:
  PRIMARY_HIGH      -> 1.00
  PRIMARY_MODERATE  -> 0.50
  SECONDARY         -> 0.50
  STABILIZER        -> 0.00
```

Die Zahlen sind Produktparameter für die Volume Engine, keine behaupteten anatomischen Messwerte. Änderungen an diesem Mapping erzeugen eine neue Config-Version; historische VolumeSnapshots behalten ihre verwendete Version. `PRIMARY_MODERATE` bleibt als funktionale Katalogkategorie vollständig erhalten; nur seine Volume-Credit-Währung wird mit `SECONDARY` auf 0.50 vereinheitlicht.

`direct_share` verwendet ausschließlich Arbeitssätze, in denen der betrachtete Muskel `PRIMARY_HIGH` ist. `PRIMARY_MODERATE` ist für Volume-Zwecke indirekter Credit und zählt niemals als direct work.

INVARIANT V-3: `direct_share` zählt ausschließlich `PRIMARY_HIGH`; `PRIMARY_MODERATE`, `SECONDARY` und `STABILIZER` können direct work niemals erhöhen.

Zählbedingungen bleiben unverändert:
- Nur Arbeitssätze. Warm-up- und Kalibriersätze zählen 0.
- Nur Sätze mit tatsächlichem RIR <= 4. Sätze mit RIR 5-6 zählen mit Faktor 0.5. RIR >= 7 zählt 0.
- Unilateral: Sätze pro Seite zählen einfach. 3 Sätze je Seite = 3 Sätze.
- Bezugsfenster: rollierende 7 Tage.
- Bei geplanten Sätzen wird der Ziel-RIR verwendet.

RATIONALE: Kategoriale Contributions verhindern biomechanische Scheinpräzision, ohne die bestehende fraktionale Volume Engine neu zu gestalten. Stabilisatorarbeit wird weiter für Ermüdung, nicht als direktes Hypertrophievolumen gezählt.



## Dependency §5.3 — Master-Zeilen 1255–1287

5.3 Slot-Definition

 PlanSlot {
     id, plan_version_id, session_id, order_index


     slot_function {
         movement_pattern                 // Pflicht, aus §5.1
         movement_subpattern?             // optionaler kanonischer Detailwert
         primary_muscle_bands[]           // canonical_volume_muscle_id + contribution band
         role                             // PRIMARY | SECONDARY | ISOLATION | ACCESSORY
         rep_character                    // HEAVY | MODERATE | LIGHT
     }


     volume_contribution[muscle]          // fraktionale Sätze, die dieser Slot liefern soll
     priority_value: 0..100               // Reihenfolge beim Entfernen unter Zeitdruck
     required_progressibility             // HIGH | MEDIUM | LOW
     fatigue_budget: 1..5                 // maximal zulässiges fatigue_systemic
     equipment_constraints[]?             // typed CapabilityPredicates; optional; kein class-only F10


     exercise_id                          // ab Phase 7
     original_exercise_id                 // bei Planerstellung gesetzt, nie überschrieben
     resolved_setup_binding_id            // konkrete, am Default-Sessionort satisfiable Setup-Bindung §6.2/§21.5
     prescription                         // ab Phase 8
     calibration_state                    // §11.7
     substitution_history[]
 }





## Dependency §5.4 — Master-Zeilen 1288–1313

5.4 Slot-Rollen

  Rolle            Definition             required_progressibility      fatigue_budget     Position

                   Hauptreiz für ein
                   Grundmuster,
  PRIMARY                                 HIGH                          5                  1–2
                   größter
                   Progressionsträger

                   Zweite Übung für
                   dasselbe Muster
  SECONDARY        oder Muskel,           MEDIUM                        4                  2–4
                   ergänzendes
                   Volumen

                Einzelmuskel,
  ISOLATION     Volumen-             LOW                          3                3–8
                Auffüllung

                Rumpf, Waden,
  ACCESSORY     Unterarme,           LOW                          2                letzte
                Rotatoren




## Dependency §5.5 — Master-Zeilen 1314–1382

5.5 Slot-Generierungsalgorithmus
INPUT: SessionVolumeTargets[session][muscle] , goal , SessionCapacity


 1. MUSTERPFLICHT
    Für jedes der 6 Grundmuster mit Zielvolumen > 0:
      erzeuge 1 PRIMARY-Slot in der frühesten Session, die dieses Muster abdeckt
      priority_value = 90
      (bei Ziel STRENGTH: 95)


 2. PRIORITÄTSMUSKELN
    Für jeden Prioritätsmuskel ohne PRIMARY-Slot:
      erzeuge PRIMARY-Slot, priority_value = 95
    Für jeden Prioritätsmuskel: mindestens 1 zusätzlicher SECONDARY- oder ISOLATION-Slot
      priority_value = 80


 3. VOLUMENAUFFÜLLUNG
    Solange ein Muskel sein Sessionziel nicht erreicht UND max_slots nicht erreicht:
      Restbedarf ≥ 3 fraktionale Sätze → SECONDARY-Slot, priority_value = 60
      Restbedarf < 3                       → ISOLATION-Slot, priority_value = 45
    Muskeln in aufsteigender Reihenfolge der aktuellen Erfüllung bedienen (deterministisch,
    bei Gleichstand alphabetisch nach Muskelname)


 4. ACCESSORY
    Rumpf: 1 Slot pro Session bei GENERAL_FITNESS, 1 Slot pro Woche sonst
      priority_value = 30
    Waden: nach Volumenziel, priority_value = 35


 5. REP-CHARACTER
    role = PRIMARY      und goal = STRENGTH      → HEAVY
    role = PRIMARY      und goal ≠ STRENGTH      → MODERATE
    role = SECONDARY                              → MODERATE
    role = ISOLATION | ACCESSORY                  → LIGHT


 6. PROGRESSABILITY_REQUIREMENT
    `required_progressibility = HIGH | MEDIUM | LOW` bleibt ausschließlich ein Slot-Constraint.
    Dieser Schritt erzeugt keine Equipment-Class-/Family-Whitelist.
    Die konkrete Erfüllung wird in Exercise Selection deterministisch durch F1/F11 gegen
    das aktive `equipment_setups[]`, `LoadProfileVersion` und die bestehenden Phase-1-
    Progressionspfade geprüft.


 7. KAPAZITÄTSPRÜFUNG

     Solange Slots > max_slots: entferne den Slot mit niedrigstem priority_value
     (bei Gleichstand: höherer order-Index zuerst); reduziere volume_contribution entsprechend


INVARIANT SL-1: Ein PRIMARY -Slot für ein Grundmuster wird nie durch die Kapazitätsprüfung
entfernt, solange noch ein Slot mit priority_value < 90 existiert.

INVARIANT SL-2: slot_function und original_exercise_id sind nach Phase 7
unveränderlich. Jede spätere Ersetzung rankt gegen diesen Vertrag, nicht gegen die zuletzt
gewählte Übung.

RATIONALE für SL-2: Ohne diesen Anker driftet ein Slot bei wiederholten Ersetzungen weg:
Bankdrücken → Brustpresse → Butterfly → Kabelzug. Jede einzelne Ersetzung wäre lokal
plausibel, das Ergebnis funktional wertlos.




TEIL 6 — EXERCISE SELECTION ENGINE (INITIAL)


## Dependency §9.6 — Master-Zeilen 1950–1986

9.6 Lastschritt-Relativität

`step_relativity` wird auf der **effektiven positiven Lastachse** berechnet:

```
current_effective_load = effective_load_for_progression(active_binding, current_step, bodyweight_snapshot)
next_effective_load    = effective_load_for_progression(active_binding, next_step, bodyweight_snapshot)

if current_effective_load <= 0:
    step_relativity = +INF        // VERY_COARSE; keine Division durch 0
else:
    step_relativity = next_effective_load / current_effective_load - 1
```

Für `ASSISTANCE_INVERSE` ist `next_step` die Stufe mit **weniger** Assistenz und damit höherer effektiver Last. Für BODYWEIGHT/added-load wird die effektive Last aus §14 verwendet. `+INF` erzwingt Calibration/Bridge/Variant-Auflösung; es ist nie eine Freigabe für einen beliebigen Sprung.



  Relativität      Klassifikation   Wirkung

  ≤ 2.5 %          FINE             TARGET_PROGRESSION; nächste Stufe typischerweise direkt nutzbar

  2.5–5 %          MEDIUM           TARGET_PROGRESSION; nächste Stufe über §11.7 prüfen

  5–10 %           COARSE           TARGET_PROGRESSION; REP_BRIDGE_OVERLAY prüfen, wenn §11.7/Modell den Sprung nicht freigibt

  > 10 %           VERY_COARSE      REP_BRIDGE_OVERLAY zwingend prüfen (§15.6)


DECISION: progression_granularity ist ein abgeleitetes, lastabhängiges Attribut, kein
statisches Übungsattribut.

RATIONALE: Ein 5-kg-Schritt sind 25 % bei 20 kg und 3.6 % bei 140 kg. Ein statisches Attribut
wäre bei leichten Nutzern und leichten Übungen systematisch falsch — genau dort, wo Beginner
starten (RT-01).



## Dependency §19.4 — Master-Zeilen 4057–4209

19.4 Ranking
Hard Filters: F1–F11 aus §6.2, identisch.


Soft Score — Substitution (Summe 100)

  ID    Kriterium                  Gewicht      Berechnung

        Funktionale
                                                 0.6 × muskel_overlap + 0.4 × movement_similarity
  S1    Ähnlichkeit zur            30
                                                
        Originalübung

        Belastungsprofil &                      Überlappung suitable_rep_range mit
  S2                               15
        Rep-Eignung                             aktive PrescriptionBand; keine freie `resistance_profile`-Variable

                                                 progression_granularity (lastrelativ, §9.6) vs.
  S3    Progressierbarkeit         12
                                                Slot-Rolle

  S4    Nutzerpräferenz            15           Basis 50 + Stufenmodifier + decay_score × 20

                                                 100 − 20 × max(0, technical_demand −

  S5     Technische Eignung         10              user_skill) − 10 × max(0, stability_demand −
                                                    3)


                                                    fatigue_systemic / fatigue_local vs. Slot-
  S6     Fatigue-Passung            10
                                                    Position und Restbudget

                                                    100 − 25 × (Anzahl Wochenplan-Übungen mit
  S7     Plan-Redundanz             8
                                                    Overlap ≥ 0.7)



Kontextmodulation
Multiplikatoren, danach Renormalisierung auf 100.


  Kontext                                             Modulation

  role = PRIMARY                                      S3 ×1.6, S2 ×1.2, S4 ×0.7, S6 ×0.8

  role = ISOLATION / ACCESSORY                        S6 ×1.5, S4 ×1.3, S3 ×0.6, S1 ×0.9

  Letzte Übung der Session                            S6 ×1.4

  goal = STRENGTH                                     S3 ×1.4, S1 ×1.2, S4 ×0.8

  goal = HYPERTROPHY                                  S6 ×1.2, S2 ×1.2, S3 ×0.8

  goal = GENERAL_FITNESS                              S4 ×1.4, S5 ×1.3, S3 ×0.6

  Grund = Technik zu kompliziert                      S5 ×2.2

  Grund = zu instabil                                 S5 ×2.0, S2 ×1.2

  Grund = Kraft reicht nicht                          S2 ×1.6, S3 ×1.2

  Grund = Beweglichkeit                               S5 ×1.5, S1 ×0.85

  Grund = Setup zu aufwendig                          Setup-Term mit Gewicht 12 zusätzlich

  Grund = Equipment                                   S4 ×1.2

  Grund = mag ich nicht                               S4 ×1.5, S7 ×1.2

  experience_level = BEGINNER                         S5 ×1.6, S3 ×0.7


RATIONALE für S1 = 30 als größtes Gewicht: Die Kernanforderung ist Funktionserhalt. Wenn
S1 nicht dominiert, ersetzt das System Bankdrücken durch die Übung, die dem Nutzer am besten
gefällt, und die Planstruktur zerfällt über Zeit.

RATIONALE für S4 = 15: Hoch genug, dass FAVORITE (+12 auf einen 0–100-Term, gewichtet 15

→ ≈1.8 Endpunkte) und SOFT_DOWNRANK Reihenfolgen unter funktional gleichwertigen Kandidaten
drehen. Zu niedrig, um funktional deutlich schlechtere Kandidaten nach oben zu ziehen.


Kuratierte Modifikatoren
    CURATED_BOOST : Paar in kuratierter Substitutgruppe → +10 auf den Endscore

    CURATED_VETO : Paar auf Veto-Liste → Hard Filter F8

   Gelernter substitution_pair_score → ±10, auf derselben Ebene wie CURATED_BOOST

DECISION: Dynamisches Scoring ist primär und eigenständig vollständig funktionsfähig.
Kuratierung ist eine Modifikator-Schicht und definiert nicht den Kandidatenraum.

RATIONALE: Definierte Kuratierung den Kandidatenraum, wäre jede neue Katalogübung
unbrauchbar bis zur manuellen Verknüpfung, nutzerdefinierte Übungen nie substituierbar,
ungewöhnliche Equipment-Kombinationen erzeugten leere Kandidatenräume, und der
Kurationsaufwand wüchse quadratisch mit der Katalogröße.

INVARIANT SU-9: Die Engine liefert ohne jeden kuratierten Eintrag ein gültiges Ranking.
Kuratierung ist Korrektur, nie Voraussetzung.

INVARIANT SU-10: CURATED_BOOST und gelernte Paar-Scores heben nie über einen Hard Filter.


Schwellen und Tie-Breaker

 Endscore               Behandlung

 ≥ 70                   EMPFOHLEN , max. 3 angezeigt


 55–69                  EMPFOHLEN , nur wenn <3 Kandidaten ≥ 70


 40–54                  „Weitere Alternativen” (aufklappbar)

 < 40                   Nicht angezeigt außer Dead-End-Modus


Tie-Breaker: 1) höhere Präferenzstufe, 2) höhere metadata_completeness , 3) eigene Historie
vorhanden, 4) niedrigerer technical_demand , 5) kürzere setup_time_class , 6) lexikografisch
nach exercise.id .

INVARIANT SU-11: Das Ranking ist vollständig deterministisch.


Referenz-Testfall
Langhantel-Bankdrücken, Slot A1, PRIMARY , 4×5 RIR 2, Ziel Maximalkraft, Vollausstattung,
user_skill = 4 , Grund „mag ich nicht”.

Renormalisierte Gewichte: S1 30, S2 15, S3 22, S4 13, S5 5, S6 6, S7 8

 Kandidat                          S1     S2    S3        S4    S5      S6      S7      Endscore

 Smith-Bankdrücken                 88     90    90        50    95      80      90      86.1

 Kurzhantel-Bankdrücken            92     80    70        50    80      75      90      81.4

 Brustpresse (Maschine)            78     85    55        50    100     90      85      75.3

 KH-Schrägbankdrücken              74     80    70        50    80      75      75      72.8

 Liegestütze                       70     25    20        50    90      70      80      56.2

 Butterfly                         52     45    40        50    100     95      70      55.9


Bei Ziel Hypertrophie und role = ISOLATION dreht sich die Reihenfolge: Brustpresse 79.1 vs.
Smith 77.4. Das Modell verhält sich kontextsensitiv wie gefordert.



## Dependency §19.11 — Master-Zeilen 4459–4503

19.11 Revalidation und Rekursionsgrenze

 VALID ──(Nutzeraktion)──► DIRTY ──► VALIDATING
                                             │
                              ┌────────────┼────────────┐
                           keine          ERROR            ERROR,
                           Fehler         vorhanden        Budget = 0
                              ▼              ▼                ▼
                            VALID       REPAIRING(n)   NEEDS_USER_DECISION
                                             │
                                        (n → n+1, max 2)
                                             └──► VALIDATING


DECISION: Maximal 2 automatische Repair-Passes pro Nutzeraktion. Pass 1 nur L1, Pass 2 nur
L2. Danach NEEDS_USER_DECISION .

DECISION: Automatische Änderungen dürfen weitere auslösen, aber nur innerhalb des Budgets
und nur mit monoton steigendem Level. Ein L2-Pass darf nie einen L1-Pass anstoßen.

RATIONALE: Monotonie garantiert Terminierung unabhängig vom Oszillationsschutz.

Oszillationsschutz: Vor jedem Pass wird ein Hash der Verletzungsmenge gebildet. Identischer
Hash wie im Vorgängerpass → sofortiger Abbruch, auch bei Restbudget.

INVARIANT SU-22: Ein Repair-Pass ersetzt nie eine Übung. Repair ändert ausschließlich
Prescriptions. Übungswechsel sind immer Nutzeraktionen oder bestätigte L3-Vorschläge.

RATIONALE: Wenn Repair Übungen tauschen dürfte, könnte das System eine gerade vom
Nutzer gewählte Übung wieder entfernen — der direkteste denkbare Vertrauensbruch.


Batch-Modus
Mehrere Ersetzungen in derselben Session innerhalb von 10 Minuten laufen in BATCH_EDIT .
Validation und Repair werden bis zum Commit zurückgestellt. Repair-Budget im Batch: 3. F7
(Session-Dublette) wird gegen den aktuellen Batch-Zwischenstand geprüft, nicht gegen den
Ausgangszustand.

INVARIANT SU-23: Der Plan-/Preference-Anteil eines Batch-Commits ist atomar. Bei Abbruch wird kein partieller PlanCandidate aktiv. Bereits persistierte factual Events (Inventory, Availability, Workout/Correction) bleiben gemäß TX-3 erhalten und werden nicht zurückgerollt.




TEIL 20 — GLOBAL VALIDATION ENGINE


## Dependency §21.5 — Master-Zeilen 4885–4921

21.5 SessionTemplate, SessionInstance und konkrete Setup-Bindung

`Session` in einer PlanVersion ist ein wiederverwendbares Template. Jede geplante Ausführung
materialisiert genau eine `SessionInstance`. Für jeden tatsächlich berücksichtigten PlanSlot
materialisiert die Instance genau ein `SlotExecution` mit `plan_slot_id`, Ausführungsmodus und
der für diese konkrete Session aufgelösten `ResolvedSetupBinding`. Der Instance-Zustand lautet
`SCHEDULED | STARTED | COMPLETED | SKIPPED | CANCELLED | BLOCKED | ABORTED`.

`SlotExecution.mode = WORKING | CALIBRATION_ONLY | SKIPPED | ABORTED`. `CALIBRATION_ONLY`
ist nur zulässig, wenn Phase 11 nicht zwingende Arbeitssets zugunsten der erforderlichen
Findung verschiebt; es erzeugt keinen rep-basierten Progressions-/Stall-Exposure.

- Ein Verschieben ändert `scheduled_for` derselben noch nicht gestarteten Instance und erzeugt keine PlanVersion.
- `SCHEDULED -> STARTED | SKIPPED | CANCELLED | BLOCKED`; `BLOCKED -> SCHEDULED` nur nach erfolgreicher Revalidation oder `-> CANCELLED`; `STARTED -> COMPLETED | ABORTED`.
- `SKIPPED`/`CANCELLED` gelten nur für nie gestartete Ausführungen und erzeugen kein WorkoutLog, kein MISS und keine qualifizierte Progressions-Exposure.
- `ABORTED` bedeutet: Session wurde gestartet, aber nicht regulär beendet. Bereits gültig geloggte Sets bleiben factual; die betroffene Multi-Set-Auswertung ist `PARTIAL` und kann keine positive Progressionsentscheidung erzeugen.
- Es gibt kein automatisches Carry-forward einer verpassten Session. Der Nutzer kann eine noch nicht begonnene Instance explizit verschieben.
- Vor `STARTED` werden effektiver Ort, Availability, `ResolvedSetupBinding`, Time-Override und P0-P2 erneut geprüft.
- Ein Orts-Override erzeugt session-lokale Bindings; die Default-PlanSlot-Bindung bleibt unverändert.
- Recovery/Calendar-Validierung verwendet die tatsächlich geplanten/abgeschlossenen SessionInstances. Bei V17-ERROR wird die Instance `BLOCKED/NEEDS_USER_DECISION`; das System löscht oder fusioniert keine Nachbarsession automatisch.
- Plan-Volumenziele bleiben auf Planwoche/Template bezogen; Fatigue, Adhärenz und tatsächliche Belastung verwenden `performed_at` der SessionInstance/Logs.

`ResolvedSetupBinding` bindet eine ExerciseSetup-OR-Branch an konkrete reale Ressourcen:
`exercise_setup_id`, `location_id`, `equipment_instance_ids[]`, `attachment_instance_ids[]`,
`load_bearing_instance_id?`, `load_profile_version_id?`, `station_group_ids[]` und Capability-/Load-Snapshot.
`station_group_ids[]` ist die sortierte, deduplizierte Menge aller nicht-null `EquipmentInstance.station_group_id` der Bindung.
Support-Equipment (z. B. Bench) ist Teil der Feasibility-Bindung, ohne automatisch Load-History-Identity zu werden.

`station_group_sort_key(binding)` = kleinstes `station_group_id`, falls vorhanden; sonst `"~" +` lexikografisch kleinste gebundene `equipment_instance_id`; falls die Bindung keine EquipmentInstance besitzt, `"~~BODYWEIGHT"`. Dieser Key dient nur deterministischer Reihenfolge/Time-Planung und behauptet keine Lastäquivalenz.

INVARIANT LC-S1: Jede gestartete Slot-Ausführung besitzt genau einen vollständigen Setup-Binding-Snapshot.
INVARIANT LC-S2: Ein temporärer Orts-/Equipment-Override überschreibt nie stillschweigend die persistente Default-Bindung.
INVARIANT LC-S3: SKIPPED/CANCELLED zählt weder als Failure noch als Progressions-/Fatigue-Exposure.
INVARIANT LC-S4: `CALIBRATION_ONLY` enthält keine erfundenen Arbeitssätze und zählt nicht als Progressions-/Stall-Exposure.
INVARIANT LC-S5: Eine nie gestartete `CANCELLED/SKIPPED` Session und eine gestartete `ABORTED` Session sind semantisch verschieden; nur ABORTED kann factual Set-Logs enthalten.
INVARIANT LC-S6: `BLOCKED` besitzt einen definierten Recovery-Pfad über erneute vollständige Revalidation; es ist kein Dead-End.


## Dependency §23.0 — Master-Zeilen 5018–5037

23.0 Cross-Engine Context und Failure Contract

```
EvaluationContext {
  evaluation_at, user_timezone, config_version, catalog_version
  source_event_revision, plan_version_id?, equipment_profile_versions[]
}

FailureResult {
  code
  category: USER_RESOLVABLE | SYSTEM_REPAIRABLE | TEMPORARY | BLOCKING | INFEASIBLE | NEEDS_CONFIRMATION | DATA_QUALITY | CALIBRATION_REQUIRED
  severity: INFO | WARNING | ERROR | BLOCKING
  user_message_key
  repair_options[]
  blocking: bool
  retry_semantics: NONE | RETRY_SAME_INPUT | RETRY_AFTER_FACT_CHANGE | RETRY_AFTER_USER_DECISION | REBASE_AND_RETRY
  source_engine
}
```



---

# PACK-ABSCHLUSSCHECK

Vor Abschluss dieses Implementierungsschritts prüfen:

1. Primary Scope vollständig umgesetzt bzw. bestehende äquivalente App-Logik nachweislich erhalten.
2. Keine enthaltene Bedingung, Validierung, Failure-/Fallback-Regel, State-/Event-Semantik oder Sonderfall still ausgelassen.
3. Dependency Contracts an allen berührten Schnittstellen eingehalten.
4. Keine spätere Pack-Logik unnötig vorgezogen.
5. Keine neuen freien Identifier/Magic Numbers eingeführt, wenn v1.4.1 Registry/Config vorgibt.
6. Build/Typprüfung/Tests des betroffenen Bereichs tatsächlich ausgeführt.
7. Bestehende relevante Tests bleiben grün.
8. Offene echte Konflikte explizit melden; nicht still interpretieren.

Stoppe danach. Nicht mit dem nächsten Pack beginnen.
