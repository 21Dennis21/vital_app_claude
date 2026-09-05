const { createApp, flush } = require("./browser-test-harness.js");
const { clickByText, setNativeInputValue } = require("./dom-test-helpers.js");

/* Test fuer TRAINING SYSTEM v1.4.1, Implementation Pack 02/14 (+ UX-
   Redesign 02.1) — echte, simulierte Klick-/Eingabe-Durchlaeufe durch den
   kompletten Onboarding-/Bearbeiten-/Split-Praeferenz-Flow im TRAINING-Tab,
   gegen den echten kompilierten App-Code (kein echter Browser verfuegbar,
   jsdom-Simulation mit echter React-Ausfuehrung inkl. DOM/localStorage,
   siehe CLAUDE.md).

   Selektions-Strategie: ChoiceList/ChipMultiSelect tragen stabile
   data-choice/data-chip-Attribute (reine Test-Hooks, kein visueller/
   fachlicher Effekt) — robuster als Text-Matching, seit Paket 02.1 Karten
   mit zusaetzlichem Beschreibungstext und einem Check-Icon verschachtelt
   rendern.

   Deckt ab: die 7 REQUIRED-Onboarding-Felder (§1.2) end-to-end inkl.
   Persistenz, INVARIANT P-1 (Abschluss blockiert bis alle 7 vorhanden),
   optionale Felder blockieren nicht, BODYWEIGHT_ONLY-Equipment-Guard
   (§1.4), Bearbeiten eines bestehenden Profils ohne stilles Ueberschreiben
   von experience_level/user_skill_level (INVARIANT P-EX1/P-2), separate
   Split-Praeferenz-Aenderung, Zurueck-Navigation zwischen Schritten (neu
   in 02.1), sowie Regression der bestehenden "Aktivitäten"-Sektion. */

let passed=0, failed=0;
function check(cond, label){
  if(cond){ passed++; console.log("  ✅", label); }
  else { failed++; console.error("  ❌", label); }
}

function findByExactText(d, text, tag){
  const els = [...d.querySelectorAll(tag||"*")];
  return els.find(e=>e.children.length===0 && e.textContent && e.textContent.trim()===text);
}
function choiceBtn(d, value){ return d.querySelector('[data-choice="'+value+'"]'); }
function chipBtn(d, value){ return d.querySelector('[data-chip="'+value+'"]'); }
/* Seit STEP06.1 loest der Equipment-Schritt gegen die echte §29.1-Registry
   auf (EquipmentPickerPanel) statt gegen die alte 10-Preset-Demo-Liste —
   data-equipment-toggle traegt "family|subtype|machineFunctionalSubtype". */
function equipmentBtn(d, family, subtype, mfs){ return d.querySelector('[data-equipment-toggle="'+family+"|"+subtype+"|"+(mfs||"")+'"]'); }
function click(el, win){ el.dispatchEvent(new win.MouseEvent("click",{bubbles:true,cancelable:true})); }
function isOn(el){ return !!el && el.className && el.className.indexOf(" on")!==-1; }
/* Der Haupt-Flow-CTA ("Weiter"/"Fertig" im Page-Footer) traegt ein eigenes
   Test-Attribut, weil Sub-Sheets (Fokus/Split-Präferenz/Trainingseinstell-
   ungen) auf Schritt 8 GLEICHZEITIG einen eigenen "Fertig"-Button zeigen —
   Text-Matching allein waere hier mehrdeutig. */
function weiterBtn(d){ return d.querySelector('[data-onboarding-cta="true"]'); }
/* Der "Fertig"-Button INNERHALB eines geoeffneten Sub-Sheets: das Sheet
   wird im JSX NACH der Page gerendert, steht also im Dokument HINTER dem
   Haupt-Flow-CTA — das LETZTE Element mit diesem Text ist daher zuverlaessig
   der Sub-Sheet-Button. */
function subSheetFinishBtn(d){
  const matches=[...d.querySelectorAll("button")].filter(b=>b.textContent.trim()==="Fertig");
  return matches[matches.length-1];
}
function readJson(win, key){
  const raw = win.localStorage.getItem(key);
  return raw==null ? null : JSON.parse(raw);
}

async function main(){
  console.log("############################################");
  console.log("# TRAINING: Onboarding/Profil/Split-Präferenz-UX (Paket 02 + 02.1 UX-Redesign)");
  console.log("############################################\n");

  const dom = createApp(()=>{}, {now:new Date(2026,7,15,12,0,0)});
  await flush(dom);
  const d = dom.window.document;
  const win = dom.window;

  clickByText(d, "Training");
  await flush(dom);

  console.log("\n--- 1. Ohne Profil: CTA 'Trainingsprofil einrichten' sichtbar ---");
  check(!!findByExactText(d,"Trainingsprofil einrichten"), "CTA-Karte ist sichtbar, solange kein Profil existiert");
  check(!!findByExactText(d,"Aktivitäten","div"), "bestehende 'Aktivitäten'-Sektion ist weiterhin vorhanden (Regression)");

  clickByText(d, "Trainingsprofil einrichten");
  await flush(dom);
  check(!!findByExactText(d,"Was ist dein Trainingsziel?"), "Onboarding-Flow öffnet sich bei Schritt 'Trainingsziel' (grosse Screen-Ueberschrift statt Titel-Leiste)");
  check(!d.querySelector("button")||![...d.querySelectorAll("button")].some(b=>b.textContent.trim()==="✕"), "kein rundes X mehr als Schritt-Navigation (nur Zurueck-Chevron)");

  console.log("\n--- 2. Schritt 1/8: Trainingsziel (REQUIRED) ---");
  check(weiterBtn(d).disabled===true, "'Weiter' ist deaktiviert, solange kein Ziel gewählt ist");
  click(choiceBtn(d,"HYPERTROPHY"), win);
  await flush(dom);
  check(isOn(choiceBtn(d,"HYPERTROPHY")), "'Muskelaufbau' ist als ausgewählt markiert");
  check(weiterBtn(d).disabled===false, "'Weiter' ist jetzt aktiv");
  click(weiterBtn(d), win); await flush(dom);

  console.log("\n--- 3. Schritt 2/8: Erfahrung (REQUIRED) ---");
  check(!!findByExactText(d,"Wie viel Trainingserfahrung hast du?"), "Schritt 'Erfahrung' erreicht");
  click(choiceBtn(d,"SOME"), win); await flush(dom);
  click(weiterBtn(d), win); await flush(dom);

  console.log("\n--- 4. Schritt 3/8: Trainingstage pro Woche (REQUIRED, Auswahlkarten 2–6) ---");
  check(!!findByExactText(d,"Wie oft möchtest du trainieren?"), "Schritt 'Trainingstage' erreicht");
  check(isOn(choiceBtn(d,"4")), "Default (4 Tage/Woche) ist vorausgewählt");
  click(choiceBtn(d,"6"), win); await flush(dom);
  check(isOn(choiceBtn(d,"6")), "Trainingstage auf 6 gesetzt");
  click(weiterBtn(d), win); await flush(dom);

  console.log("\n--- 5. Schritt 4/8: Zeitbudget pro Session (REQUIRED, Presets + Fein-Stepper, 20–120) ---");
  check(!!findByExactText(d,"Wie viel Zeit hast du pro Training?"), "Schritt 'Zeitbudget' erreicht");
  click(choiceBtn(d,"45"), win); await flush(dom);
  check(isOn(choiceBtn(d,"45")), "45-Minuten-Preset ausgewählt");
  click(weiterBtn(d), win); await flush(dom);

  console.log("\n--- 6. Schritt 5/8: Trainingsort (REQUIRED: Name + Typ) ---");
  check(!!findByExactText(d,"Wo trainierst du meistens?"), "Schritt 'Trainingsort' erreicht");
  check(weiterBtn(d).disabled===true, "'Weiter' deaktiviert ohne Ortsnamen");
  const nameInput = d.querySelector('input[type="text"]');
  setNativeInputValue(nameInput, "Zuhause");
  await flush(dom);
  check(weiterBtn(d).disabled===true, "'Weiter' weiterhin deaktiviert ohne gewählten Ort-Typ");
  click(choiceBtn(d,"HOME_GYM"), win); await flush(dom);
  check(weiterBtn(d).disabled===false, "'Weiter' aktiv sobald Name + Typ gesetzt sind");
  click(weiterBtn(d), win); await flush(dom);

  console.log("\n--- 7. Schritt 6/8: Equipment (REQUIRED: equipment_profile_confirmed, §1.4 nur Startschätzungen, echte §29.1-Registry) ---");
  check(!!findByExactText(d,"Welches Equipment hast du?"), "Schritt 'Equipment' erreicht");
  click(equipmentBtn(d,"FREE_WEIGHT","OLYMPIC_BARBELL"), win); await flush(dom);
  click(equipmentBtn(d,"FREE_WEIGHT","FIXED_DUMBBELL"), win); await flush(dom);
  check(isOn(equipmentBtn(d,"FREE_WEIGHT","OLYMPIC_BARBELL"))&&isOn(equipmentBtn(d,"FREE_WEIGHT","FIXED_DUMBBELL")), "beide Geräte aus der echten §29.1-Registry ausgewählt");
  check(weiterBtn(d).disabled===false, "'Weiter' aktiv nach Equipment-Auswahl");
  click(weiterBtn(d), win); await flush(dom);

  console.log("\n--- 8. Schritt 7/8: Körpergewicht (REQUIRED, 30–250) ---");
  check(!!findByExactText(d,"Wie viel wiegst du?"), "Schritt 'Körpergewicht' erreicht");
  check(weiterBtn(d).disabled===true, "'Weiter' deaktiviert ohne Gewichtseingabe");
  const bwInput = d.querySelector('input[inputmode="decimal"]');
  setNativeInputValue(bwInput, "82");
  await flush(dom);
  check(weiterBtn(d).disabled===false, "'Weiter' aktiv nach gültiger Gewichtseingabe");
  click(weiterBtn(d), win); await flush(dom);

  console.log("\n--- 9. Optionaler Abschluss-Schritt (Einstellungen-Menü) blockiert den Abschluss nicht ---");
  check(!!findByExactText(d,"Noch etwas Feintuning?"), "optionaler Schritt erreicht (alle 7 Pflichtfelder bereits vollständig)");
  check(weiterBtn(d).disabled===false, "'Fertig' ist sofort aktiv, ohne dass eine optionale Angabe gemacht wurde");

  console.log("\n--- 10. Fokus/Split-Präferenz/Trainingseinstellungen als Sub-Sheets ---");
  clickByText(d,"Fokus"); await flush(dom);
  check(!!findByExactText(d,"Wo möchtest du deinen Fokus setzen?"), "Fokus-Sheet ist geöffnet");
  click(chipBtn(d,"CHEST"), win); await flush(dom);
  click(chipBtn(d,"LATS"), win); await flush(dom);
  check(!!chipBtn(d,"BICEPS").disabled, "dritte Muskelgruppe ist deaktiviert (max. 2, §4.5)");
  click(subSheetFinishBtn(d), win); await flush(dom); // Sub-Sheet schliessen (Hauptschritt-CTA heisst ebenfalls "Fertig", aber steht frueher im Dokument)
  check(!findByExactText(d,"Wo möchtest du deinen Fokus setzen?"), "Fokus-Sheet ist wieder geschlossen");
  check(!!findByExactText(d,"Brust, Latissimus"), "Fokus-Auswahl erscheint als Zusammenfassung in der Einstellungen-Zeile");

  clickByText(d,"Split-Präferenz"); await flush(dom);
  check(!!findByExactText(d,"Hast du einen bevorzugten Trainingssplit?"), "Split-Präferenz-Sheet ist geöffnet");
  click(choiceBtn(d,"PPL"), win); await flush(dom);
  click(subSheetFinishBtn(d), win); await flush(dom);

  clickByText(d,"Trainingseinstellungen"); await flush(dom);
  check(!!findByExactText(d,"Trainingseinstellungen","div"), "Trainingseinstellungen-Sheet ist geöffnet");
  click(choiceBtn(d,"LONG"), win); await flush(dom);
  click(choiceBtn(d,"YES"), win); await flush(dom);
  click(subSheetFinishBtn(d), win); await flush(dom);

  console.log("\n--- 11. Abschluss ---");
  click(weiterBtn(d), win); await flush(dom);

  console.log("\n--- 12. Nach Abschluss: Profil-Zusammenfassung + Persistenz ---");
  check(!d.querySelector(".sheet")&&!findByExactText(d,"Noch etwas Feintuning?"), "Onboarding-Flow ist geschlossen");
  check(!!findByExactText(d,"Trainingsprofil"), "Profil-Zusammenfassungskarte wird angezeigt");
  check(!findByExactText(d,"Trainingsprofil einrichten"), "CTA-Karte verschwindet, sobald das Profil vollständig ist");

  let profile = readJson(win,"tracker_training_profile");
  check(!!profile, "UserTrainingProfile wurde persistiert");
  check(profile.goal==="HYPERTROPHY","goal korrekt persistiert");
  check(profile.experience_self==="SOME","experience_self korrekt persistiert");
  check(profile.training_days_per_week===6,"training_days_per_week korrekt persistiert (6)");
  check(profile.session_time_budget_min===45,"session_time_budget_min korrekt persistiert (45)");
  check(profile.bodyweight_kg===82,"bodyweight_kg korrekt persistiert (82)");
  check(JSON.stringify(profile.priority_muscles)===JSON.stringify(["CHEST","LATS"]),"priority_muscles korrekt persistiert (max. 2)");
  check(profile.preferred_split==="PPL","preferred_split korrekt persistiert");
  check(profile.rest_preference==="LONG","rest_preference korrekt persistiert");
  check(profile.uses_rir===true,"uses_rir korrekt persistiert");
  check(profile.experience_level_eligible==="INTERMEDIATE","experience_level_eligible vor 12 Sessions = gemapptes experience_self (SOME -> INTERMEDIATE)");
  check(profile.experience_level==="INTERMEDIATE","experience_level (planwirksamer Snapshot) bei Erstanlage = initiale Eligibility");
  check(profile.user_skill_level===3,"user_skill_level-Startwert bei SOME = 3 (§1.3)");
  const initialExperienceLevel = profile.experience_level;
  const initialSkillLevel = profile.user_skill_level;

  const locations = readJson(win,"tracker_training_locations")||[];
  check(locations.length===1,"genau eine TrainingLocation wurde angelegt");
  const location = locations[0];
  check(location.name==="Zuhause"&&location.type==="HOME_GYM","TrainingLocation Name/Typ korrekt");
  check(location.id===profile.primary_location_id,"UserTrainingProfile.primary_location_id verweist auf die angelegte Location");
  check(!!location.current_equipment_profile_version_id,"TrainingLocation.current_equipment_profile_version_id ist gesetzt");

  const instances = (readJson(win,"tracker_training_equipment_instances")||[]).filter(i=>i.location_id===location.id);
  check(instances.length===2&&instances.every(i=>i.inventory_state==="PRESENT"),"beide ausgewählten Equipment-Presets sind als PRESENT-Instanzen gespeichert");
  const equipmentProfileV1 = (readJson(win,"tracker_training_equipment_profile_versions")||[]).find(v=>v.id===location.current_equipment_profile_version_id);
  check(!!equipmentProfileV1&&equipmentProfileV1.equipment_instance_ids.length===2&&instances.every(i=>equipmentProfileV1.equipment_instance_ids.indexOf(i.id)!==-1),"EquipmentProfileVersion.equipment_instance_ids referenziert beide angelegten Instanzen");

  const bwEvents = readJson(win,"tracker_training_bodyweight_events")||[];
  check(bwEvents.length===1&&bwEvents[0].bodyweight_kg===82,"genau ein BodyweightEvent (82kg) wurde angehängt");

  check(!!findByExactText(d,"Aktivitäten","div"), "'Aktivitäten'-Sektion weiterhin unverändert vorhanden (Regression)");

  console.log("\n--- 13. Zurück-Navigation zwischen Schritten funktioniert ---");
  clickByText(d,"Bearbeiten"); await flush(dom);
  check(!!findByExactText(d,"Was ist dein Trainingsziel?"), "Bearbeiten öffnet den Flow wieder bei Schritt 1");
  check(isOn(choiceBtn(d,"HYPERTROPHY")), "Schritt 'Trainingsziel' zeigt den gespeicherten Wert vorausgewählt");
  click(weiterBtn(d), win); await flush(dom);
  check(!!findByExactText(d,"Wie viel Trainingserfahrung hast du?"), "Vorwärts zu Schritt 'Erfahrung' navigiert");
  const backBtn=[...d.querySelectorAll("button")].find(b=>b.textContent.trim()==="‹");
  click(backBtn, win); await flush(dom);
  check(!!findByExactText(d,"Was ist dein Trainingsziel?"), "Zurück-Chevron navigiert eine Schritt zurück zu 'Trainingsziel'");
  click(weiterBtn(d), win); await flush(dom);
  check(isOn(choiceBtn(d,"SOME")), "Schritt 'Erfahrung' zeigt weiterhin den gespeicherten Wert vorausgewählt");

  console.log("\n--- 14. Bearbeiten: Werte bleiben vorausgefüllt, experience_level/skill bleiben unverändert ---");
  click(weiterBtn(d), win); await flush(dom); // Erfahrung -> Trainingstage
  check(isOn(choiceBtn(d,"6")), "Schritt 'Trainingstage' zeigt den gespeicherten Wert (6) vorausgefüllt");
  click(choiceBtn(d,"5"), win); await flush(dom); // Trainingstage 6 -> 5
  click(weiterBtn(d), win); await flush(dom); // -> Zeitbudget
  check(isOn(choiceBtn(d,"45")), "Zeitbudget-Preset bleibt vorausgewählt");
  click(weiterBtn(d), win); await flush(dom); // -> Trainingsort
  check(d.querySelector('input[type="text"]').value==="Zuhause", "Ortsname vorausgefüllt");
  check(isOn(choiceBtn(d,"HOME_GYM")), "Ort-Typ vorausgefüllt");
  click(weiterBtn(d), win); await flush(dom); // -> Equipment
  check(isOn(equipmentBtn(d,"FREE_WEIGHT","OLYMPIC_BARBELL"))&&isOn(equipmentBtn(d,"FREE_WEIGHT","FIXED_DUMBBELL")), "beide Geräte bleiben vorausgewählt (buildEquipmentEntriesFromLocation rekonstruiert aus echten Instanzen)");
  click(weiterBtn(d), win); await flush(dom); // -> Koerpergewicht
  check(d.querySelector('input[inputmode="decimal"]').value==="82", "Körpergewicht vorausgefüllt");
  setNativeInputValue(d.querySelector('input[inputmode="decimal"]'), "83");
  await flush(dom);
  click(weiterBtn(d), win); await flush(dom); // -> Optional
  check(!!findByExactText(d,"Brust, Latissimus"), "Fokus-Zusammenfassung bleibt erhalten");
  check(!!findByExactText(d,"Push / Pull / Legs"), "Split-Präferenz-Zusammenfassung bleibt erhalten");
  click(weiterBtn(d), win); await flush(dom);

  profile = readJson(win,"tracker_training_profile");
  check(profile.training_days_per_week===5,"training_days_per_week nach Bearbeitung = 5");
  check(profile.bodyweight_kg===83,"bodyweight_kg nach Bearbeitung = 83");
  check(profile.experience_level===initialExperienceLevel,"INVARIANT P-EX1: experience_level (planwirksamer Snapshot) wird beim Bearbeiten NICHT still überschrieben");
  check(profile.user_skill_level===initialSkillLevel,"INVARIANT P-2: user_skill_level wird beim Bearbeiten NICHT zurückgesetzt/verändert");
  const bwEventsAfterEdit = readJson(win,"tracker_training_bodyweight_events")||[];
  check(bwEventsAfterEdit.length===2,"ein neues BodyweightEvent wurde angehängt, weil sich der Wert geändert hat (append-only, kein Duplikat)");

  console.log("\n--- 15. Split-Präferenz separat änderbar (ohne vollen Onboarding-Flow) ---");
  check([...d.querySelectorAll("span")].some(e=>e.textContent.indexOf("Push / Pull / Legs")!==-1), "Zusammenfassung zeigt aktuelle Split-Präferenz");
  clickByText(d,"Split-Präferenz"); await flush(dom);
  check(!!findByExactText(d,"Hast du einen bevorzugten Trainingssplit?"), "Split-Präferenz-Sheet ist geöffnet");
  check(isOn(choiceBtn(d,"PPL")), "aktuell gespeicherte Präferenz ist vorausgewählt");
  click(choiceBtn(d,"AUTOMATIC"), win); await flush(dom);
  clickByText(d,"Speichern"); await flush(dom);
  profile = readJson(win,"tracker_training_profile");
  check(profile.preferred_split===null,"preferred_split wurde auf null (Automatisch) gesetzt");
  check([...d.querySelectorAll("span")].some(e=>e.textContent.indexOf("Automatisch")!==-1), "Zusammenfassung zeigt jetzt 'Automatisch'");

  console.log("\n--- 16. Wechsel zu BODYWEIGHT_ONLY: kein Equipment wird erfunden (§1.4-Guard) ---");
  clickByText(d,"Bearbeiten"); await flush(dom);
  click(weiterBtn(d), win); await flush(dom); // Ziel -> Erfahrung
  click(weiterBtn(d), win); await flush(dom); // Erfahrung -> Trainingstage
  click(weiterBtn(d), win); await flush(dom); // Trainingstage -> Zeitbudget
  click(weiterBtn(d), win); await flush(dom); // Zeitbudget -> Trainingsort
  check(!!findByExactText(d,"Wo trainierst du meistens?"), "Schritt 'Trainingsort' erreicht");
  click(choiceBtn(d,"BODYWEIGHT_ONLY"), win); await flush(dom);
  click(weiterBtn(d), win); await flush(dom);
  check(!equipmentBtn(d,"FREE_WEIGHT","OLYMPIC_BARBELL"), "Equipment-Registry wird für BODYWEIGHT_ONLY gar nicht erst angeboten");
  check(weiterBtn(d).disabled===false, "'Weiter' ist für BODYWEIGHT_ONLY sofort aktiv (equipment_profile_confirmed automatisch)");
  click(weiterBtn(d), win); await flush(dom); // Koerpergewicht (bereits vorausgefuellt)
  click(weiterBtn(d), win); await flush(dom); // Optional
  click(weiterBtn(d), win); await flush(dom);

  const locationsAfterBW = readJson(win,"tracker_training_locations")||[];
  const locAfterBW = locationsAfterBW.find(l=>l.id===location.id);
  check(locAfterBW.type==="BODYWEIGHT_ONLY","TrainingLocation.type auf BODYWEIGHT_ONLY aktualisiert");
  const instancesAfterBW = (readJson(win,"tracker_training_equipment_instances")||[]).filter(i=>i.location_id===location.id);
  check(instancesAfterBW.every(i=>i.inventory_state==="NOT_PRESENT"),"vormals vorhandene Equipment-Instanzen wurden auf NOT_PRESENT gesetzt, nicht gelöscht (persistente Achse §1.4)");
  const equipmentProfiles = (readJson(win,"tracker_training_equipment_profile_versions")||[]).filter(v=>v.location_id===location.id);
  const latestEquipmentProfile = equipmentProfiles.reduce((a,b)=>a.version>b.version?a:b);
  check(JSON.stringify(latestEquipmentProfile.equipment_instance_ids)==="[]","neueste EquipmentProfileVersion für BODYWEIGHT_ONLY hat leere equipment_instance_ids (kein erfundenes Equipment)");

  console.log("\n"+passed+" bestanden, "+failed+" fehlgeschlagen");
  process.exit(failed>0?1:0);
}

main().catch(e=>{ console.error("FEHLER:", e.message); console.error(e.stack); process.exit(1); });
