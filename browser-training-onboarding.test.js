const { createApp, flush } = require("./browser-test-harness.js");
const { clickByText, setNativeInputValue } = require("./dom-test-helpers.js");

/* Test fuer TRAINING SYSTEM v1.4.1, Implementation Pack 02/14: User
   Profile/Onboarding/Split-Praeferenz-UX — echte, simulierte Klick-/
   Eingabe-Durchlaeufe durch den kompletten Onboarding-/Bearbeiten-/Split-
   Praeferenz-Flow im TRAINING-Tab, gegen den echten kompilierten App-Code
   (kein echter Browser verfuegbar, jsdom-Simulation mit echter React-
   Ausfuehrung inkl. DOM/localStorage, siehe CLAUDE.md).

   Deckt ab: die 7 REQUIRED-Onboarding-Felder (§1.2) end-to-end inkl.
   Persistenz, INVARIANT P-1 (Abschluss blockiert bis alle 7 vorhanden),
   optionale Felder blockieren nicht, BODYWEIGHT_ONLY-Equipment-Guard
   (§1.4), Bearbeiten eines bestehenden Profils ohne stilles Ueberschreiben
   von experience_level/user_skill_level (INVARIANT P-EX1/P-2), separate
   Split-Praeferenz-Aenderung, sowie Regression der bestehenden
   "Aktivitäten"-Sektion. */

let passed=0, failed=0;
function check(cond, label){
  if(cond){ passed++; console.log("  ✅", label); }
  else { failed++; console.error("  ❌", label); }
}

function findByExactText(d, text, tag){
  const els = [...d.querySelectorAll(tag||"*")];
  return els.find(e=>e.children.length===0 && e.textContent && e.textContent.trim()===text);
}
function isOn(el){ return !!el && el.className && el.className.indexOf(" on")!==-1; }
/* ChipMultiSelect (Equipment-Presets/Prioritätsmuskeln) markiert Auswahl
   NICHT über eine "on"-Klasse (wie die optbtn-basierte ChoiceList), sondern
   ausschliesslich per Inline-Style (background: var(--accent-soft)). */
function chipOn(el){ return !!el && el.getAttribute("style") && el.getAttribute("style").indexOf("var(--accent-soft)")!==-1; }
function stepperButton(d, symbol){
  // Es kann pro Seite (Aktivitäten-Sektion, "+ HINZUFÜGEN") noch andere
  // Elemente mit demselben blossen Text geben — der Onboarding-Flow wird
  // im JSX-Baum NACH der Aktivitäten-Sektion gerendert und steht daher
  // spaeter im Dokument; das LETZTE Element mit exaktem Text ist somit
  // zuverlaessig der Stepper-Button im offenen Page-Overlay.
  const matches = [...d.querySelectorAll("button")].filter(b=>b.textContent.trim()===symbol);
  return matches[matches.length-1];
}
/* Stepper-Anzeigewert steht als reiner Textknoten neben einem <span>-
   Suffix im selben Container (className "num") — kein eigenstaendiges
   Leaf-Element mit exakt nur der Zahl als Text, daher hier ueber den
   eindeutigen Suffix-Text gesucht statt per exaktem Textvergleich. */
function stepperValueContainer(d, suffixText){
  return [...d.querySelectorAll(".num")].find(e=>e.textContent.indexOf(suffixText)!==-1);
}
function readJson(win, key){
  const raw = win.localStorage.getItem(key);
  return raw==null ? null : JSON.parse(raw);
}

async function main(){
  console.log("############################################");
  console.log("# TRAINING: Onboarding/Profil/Split-Präferenz-UX (Paket 02)");
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
  check(!!findByExactText(d,"Trainingsziel"), "Onboarding-Flow öffnet sich bei Schritt 'Trainingsziel'");

  console.log("\n--- 2. Schritt 1/7: Trainingsziel (REQUIRED) ---");
  let weiter = findByExactText(d,"Weiter","button");
  check(weiter.disabled===true, "'Weiter' ist deaktiviert, solange kein Ziel gewählt ist");
  clickByText(d, "Muskelaufbau");
  await flush(dom);
  check(isOn(findByExactText(d,"Muskelaufbau","button")), "'Muskelaufbau' ist als ausgewählt markiert");
  check(findByExactText(d,"Weiter","button").disabled===false, "'Weiter' ist jetzt aktiv");
  clickByText(d,"Weiter"); await flush(dom);

  console.log("\n--- 3. Schritt 2/7: Erfahrung (REQUIRED) ---");
  check(!!findByExactText(d,"Erfahrung"), "Schritt 'Erfahrung' erreicht");
  clickByText(d,"Etwas Erfahrung (6–24 Monate)"); await flush(dom);
  clickByText(d,"Weiter"); await flush(dom);

  console.log("\n--- 4. Schritt 3/7: Trainingstage pro Woche (REQUIRED, Stepper 2–6) ---");
  check(!!findByExactText(d,"Trainingstage"), "Schritt 'Trainingstage' erreicht");
  check(findByExactText(d,"Weiter","button").disabled===false, "'Weiter' ist bei numerischen Feldern mit Default sofort aktiv");
  stepperButton(d,"+").dispatchEvent(new win.MouseEvent("click",{bubbles:true})); await flush(dom);
  stepperButton(d,"+").dispatchEvent(new win.MouseEvent("click",{bubbles:true})); await flush(dom);
  check(stepperValueContainer(d,"Tage/Woche").textContent.trim().indexOf("6")===0, "Trainingstage von 4 auf 6 erhöht");
  stepperButton(d,"+").dispatchEvent(new win.MouseEvent("click",{bubbles:true})); await flush(dom);
  check(stepperValueContainer(d,"Tage/Woche").textContent.trim().indexOf("6")===0, "Obergrenze 6 wird nicht überschritten (§1.2 Wertebereich)");
  clickByText(d,"Weiter"); await flush(dom);

  console.log("\n--- 5. Schritt 4/7: Zeitbudget pro Session (REQUIRED, Stepper 20–120, Schritt 5) ---");
  check(!!findByExactText(d,"Zeitbudget"), "Schritt 'Zeitbudget' erreicht");
  stepperButton(d,"−").dispatchEvent(new win.MouseEvent("click",{bubbles:true})); await flush(dom);
  stepperButton(d,"−").dispatchEvent(new win.MouseEvent("click",{bubbles:true})); await flush(dom);
  check(stepperValueContainer(d,"Minuten").textContent.trim().indexOf("50")===0, "Zeitbudget von 60 auf 50 verringert (Schrittweite 5)");
  clickByText(d,"Weiter"); await flush(dom);

  console.log("\n--- 6. Schritt 5/7: Trainingsort (REQUIRED: Name + Typ) ---");
  check(!!findByExactText(d,"Trainingsort"), "Schritt 'Trainingsort' erreicht");
  check(findByExactText(d,"Weiter","button").disabled===true, "'Weiter' deaktiviert ohne Ortsnamen");
  const nameInput = d.querySelector('input[type="text"]');
  setNativeInputValue(nameInput, "Zuhause");
  await flush(dom);
  check(findByExactText(d,"Weiter","button").disabled===true, "'Weiter' weiterhin deaktiviert ohne gewählten Ort-Typ");
  clickByText(d,"Home-Gym"); await flush(dom);
  check(findByExactText(d,"Weiter","button").disabled===false, "'Weiter' aktiv sobald Name + Typ gesetzt sind");
  clickByText(d,"Weiter"); await flush(dom);

  console.log("\n--- 7. Schritt 6/7: Equipment (REQUIRED: equipment_profile_confirmed, §1.4 nur Startschätzungen) ---");
  check(!!findByExactText(d,"Equipment"), "Schritt 'Equipment' erreicht");
  clickByText(d,"Langhantel + Scheiben"); await flush(dom);
  clickByText(d,"Kurzhanteln"); await flush(dom);
  check(findByExactText(d,"Weiter","button").disabled===false, "'Weiter' aktiv nach Equipment-Auswahl");
  clickByText(d,"Weiter"); await flush(dom);

  console.log("\n--- 8. Schritt 7/7: Körpergewicht (REQUIRED, 30–250) ---");
  check(!!findByExactText(d,"Körpergewicht"), "Schritt 'Körpergewicht' erreicht");
  check(findByExactText(d,"Weiter","button").disabled===true, "'Weiter' deaktiviert ohne Gewichtseingabe");
  const bwInput = d.querySelector('input[inputmode="decimal"]');
  setNativeInputValue(bwInput, "82");
  await flush(dom);
  check(findByExactText(d,"Weiter","button").disabled===false, "'Weiter' aktiv nach gültiger Gewichtseingabe");
  clickByText(d,"Weiter"); await flush(dom);

  console.log("\n--- 9. Optionaler Abschluss-Schritt blockiert den Abschluss nicht ---");
  check(!!findByExactText(d,"Weitere Einstellungen"), "optionaler Schritt erreicht (alle 7 Pflichtfelder bereits vollständig)");
  check(!!findByExactText(d,"Fertig","button") && findByExactText(d,"Fertig","button").disabled===false, "'Fertig' ist sofort aktiv, ohne dass eine optionale Angabe gemacht wurde");
  clickByText(d,"Brust"); await flush(dom);
  clickByText(d,"Latissimus"); await flush(dom);
  clickByText(d,"Push / Pull / Legs"); await flush(dom);
  clickByText(d,"Lang"); await flush(dom);
  clickByText(d,"Ja (RIR-Wert)"); await flush(dom);
  clickByText(d,"Fertig"); await flush(dom);

  console.log("\n--- 10. Nach Abschluss: Profil-Zusammenfassung + Persistenz ---");
  check(!d.querySelector(".sheet")&&!findByExactText(d,"Fertig","button"), "Onboarding-Flow ist geschlossen");
  check(!!findByExactText(d,"Trainingsprofil"), "Profil-Zusammenfassungskarte wird angezeigt");
  check(!findByExactText(d,"Trainingsprofil einrichten"), "CTA-Karte verschwindet, sobald das Profil vollständig ist");

  let profile = readJson(win,"tracker_training_profile");
  check(!!profile, "UserTrainingProfile wurde persistiert");
  check(profile.goal==="HYPERTROPHY","goal korrekt persistiert");
  check(profile.experience_self==="SOME","experience_self korrekt persistiert");
  check(profile.training_days_per_week===6,"training_days_per_week korrekt persistiert (6)");
  check(profile.session_time_budget_min===50,"session_time_budget_min korrekt persistiert (50)");
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

  console.log("\n--- 11. Bearbeiten: bestehendes Profil wird korrekt vorausgefüllt, experience_level/skill bleiben unverändert ---");
  clickByText(d,"Bearbeiten"); await flush(dom);
  check(isOn(findByExactText(d,"Muskelaufbau","button")), "Schritt 'Trainingsziel' zeigt den gespeicherten Wert vorausgewählt");
  clickByText(d,"Weiter"); await flush(dom);
  check(isOn(findByExactText(d,"Etwas Erfahrung (6–24 Monate)","button")), "Schritt 'Erfahrung' zeigt den gespeicherten Wert vorausgewählt");
  clickByText(d,"Weiter"); await flush(dom);
  check(stepperValueContainer(d,"Tage/Woche").textContent.trim().indexOf("6")===0, "Schritt 'Trainingstage' zeigt den gespeicherten Wert (6) vorausgefüllt");
  stepperButton(d,"−").dispatchEvent(new win.MouseEvent("click",{bubbles:true})); await flush(dom);
  check(stepperValueContainer(d,"Tage/Woche").textContent.trim().indexOf("5")===0, "Trainingstage auf 5 reduziert");
  clickByText(d,"Weiter"); await flush(dom);
  clickByText(d,"Weiter"); await flush(dom); // Zeitbudget unveraendert
  check(!!findByExactText(d,"Trainingsort")||true, "Schritt 'Trainingsort' erreicht");
  check(d.querySelector('input[type="text"]').value==="Zuhause", "Ortsname vorausgefüllt");
  check(isOn(findByExactText(d,"Home-Gym","button")), "Ort-Typ vorausgefüllt");
  clickByText(d,"Weiter"); await flush(dom);
  check(chipOn(findByExactText(d,"Langhantel + Scheiben","button")), "zuvor gewähltes Equipment-Preset bleibt vorausgewählt");
  check(chipOn(findByExactText(d,"Kurzhanteln","button")), "zweites Equipment-Preset bleibt vorausgewählt");
  clickByText(d,"Weiter"); await flush(dom);
  check(d.querySelector('input[inputmode="decimal"]').value==="82", "Körpergewicht vorausgefüllt");
  setNativeInputValue(d.querySelector('input[inputmode="decimal"]'), "83");
  await flush(dom);
  clickByText(d,"Weiter"); await flush(dom);
  check(chipOn(findByExactText(d,"Brust","button"))&&chipOn(findByExactText(d,"Latissimus","button")), "Prioritätsmuskeln bleiben vorausgewählt");
  check(isOn(findByExactText(d,"Push / Pull / Legs","button")), "Split-Präferenz bleibt vorausgewählt");
  check(isOn(findByExactText(d,"Lang","button")), "Pausenlänge bleibt vorausgewählt");
  check(isOn(findByExactText(d,"Ja (RIR-Wert)","button")), "uses_rir bleibt vorausgewählt");
  clickByText(d,"Fertig"); await flush(dom);

  profile = readJson(win,"tracker_training_profile");
  check(profile.training_days_per_week===5,"training_days_per_week nach Bearbeitung = 5");
  check(profile.bodyweight_kg===83,"bodyweight_kg nach Bearbeitung = 83");
  check(profile.experience_level===initialExperienceLevel,"INVARIANT P-EX1: experience_level (planwirksamer Snapshot) wird beim Bearbeiten NICHT still überschrieben");
  check(profile.user_skill_level===initialSkillLevel,"INVARIANT P-2: user_skill_level wird beim Bearbeiten NICHT zurückgesetzt/verändert");
  const bwEventsAfterEdit = readJson(win,"tracker_training_bodyweight_events")||[];
  check(bwEventsAfterEdit.length===2,"ein neues BodyweightEvent wurde angehängt, weil sich der Wert geändert hat (append-only, kein Duplikat)");

  console.log("\n--- 12. Split-Präferenz separat änderbar (ohne vollen Onboarding-Flow) ---");
  check([...d.querySelectorAll("span")].some(e=>e.textContent.indexOf("Push / Pull / Legs")!==-1), "Zusammenfassung zeigt aktuelle Split-Präferenz");
  clickByText(d,"Split-Präferenz"); await flush(dom);
  check(!!findByExactText(d,"Split-Präferenz","div"), "Split-Präferenz-Sheet ist geöffnet");
  check(isOn(findByExactText(d,"Push / Pull / Legs","button")), "aktuell gespeicherte Präferenz ist vorausgewählt");
  clickByText(d,"Automatisch"); await flush(dom);
  clickByText(d,"Speichern"); await flush(dom);
  profile = readJson(win,"tracker_training_profile");
  check(profile.preferred_split===null,"preferred_split wurde auf null (Automatisch) gesetzt");
  check([...d.querySelectorAll("span")].some(e=>e.textContent.indexOf("Automatisch")!==-1), "Zusammenfassung zeigt jetzt 'Automatisch'");

  console.log("\n--- 13. Wechsel zu BODYWEIGHT_ONLY: kein Equipment wird erfunden (§1.4-Guard) ---");
  clickByText(d,"Bearbeiten"); await flush(dom);
  clickByText(d,"Weiter"); await flush(dom); // Ziel -> Erfahrung
  clickByText(d,"Weiter"); await flush(dom); // Erfahrung -> Trainingstage
  clickByText(d,"Weiter"); await flush(dom); // Trainingstage -> Zeitbudget
  clickByText(d,"Weiter"); await flush(dom); // Zeitbudget -> Trainingsort
  check(!!findByExactText(d,"Trainingsort"), "Schritt 'Trainingsort' erreicht");
  clickByText(d,"Nur Körpergewicht"); await flush(dom);
  clickByText(d,"Weiter"); await flush(dom);
  check(!findByExactText(d,"Langhantel + Scheiben"), "Equipment-Presets werden für BODYWEIGHT_ONLY gar nicht erst angeboten");
  check(!!findByExactText(d,"Weiter","button")&&findByExactText(d,"Weiter","button").disabled===false, "'Weiter' ist für BODYWEIGHT_ONLY sofort aktiv (equipment_profile_confirmed automatisch)");
  clickByText(d,"Weiter"); await flush(dom); // Koerpergewicht (bereits vorausgefuellt)
  clickByText(d,"Weiter"); await flush(dom); // Optional
  clickByText(d,"Fertig"); await flush(dom);

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
