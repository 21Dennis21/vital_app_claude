const { createApp, flush } = require("./browser-test-harness.js");
const { clickByText, setNativeInputValue } = require("./dom-test-helpers.js");
/* Registries direkt aus der Domain-Quelle (Node-Modus des Dual-Mode-Patterns)
   statt aus dem jsdom-Fenster: ein zweiter dom.window.eval()-Aufruf sieht die
   Top-Level-"const"-Bindungen des ERSTEN kombinierten eval()-Laufs in
   browser-test-harness.js (jsdom-eval erzeugt pro Aufruf ein eigenes globales
   Scope) nicht — die Registries sind aber exakt dieselbe Single Source of
   Truth, ob per require() oder per <script>-Tag geladen. */
const { EQUIPMENT_FAMILY_SUBTYPE_REGISTRY, MACHINE_FUNCTIONAL_SUBTYPE_REGISTRY } = require("./training-domain.js");

/* Test fuer STEP 06.1 — Complete STEP 01-06 Integration / Missing-Scope
   Audit: schliesst die "vorhanden aber nicht integriert"-Luecke zwischen
   der seit STEP01/06 bestehenden Equipment-Domain (EquipmentDefinitionVersion/
   EquipmentInstance/EquipmentProfileVersion/LoadProfileVersion, §29.1-§29.3
   Registries) und der App-UI, die bis STEP06.1 nur eine 10-Item-Demo-Liste
   (TRAINING_EQUIPMENT_PRESETS) anbot.

   Deckt exakt Aufgabentext-Abschnitt 14 A-F ab:
   A. UI/Data Coverage — jede §29.1-baseline-ID + jeder Machine Functional
      Subtype ist ueber die UI erreichbar, EXTENDED bewusst ausgenommen.
   B. Machines — konkrete Maschinen auswaehlbar + inkl. LoadProfileVersion
      persistiert (ohne die kein MACHINE(X) je satisfied=true liefern kann).
   C. Capabilities — keine impliziten Ableitungen (Rack ohne PULLUP_BAR
      bleibt ohne, Adjustable Bench ohne DECLINE_CAPABLE bleibt ohne,
      High-only Cable bleibt high-only), Nutzer-Angaben persistieren.
   D. Locations — zwei Orte behalten strikt getrennte Inventories.
   E. Presets — nichts ist vorausgewaehlt (echte editierbare Startschaetzung,
      keine versteckte Default-Praeferenz).
   F. Migration — Alt-Nutzer mit der frueheren <10-Geraete-Presets-Auswahl
      verlieren keine Daten; Re-Speichern hebt sie deterministisch auf
      STEP06-Feasibility-Niveau (LoadProfileVersion ergaenzt), keine
      Parallel-Instanz/-Architektur. */

let passed=0, failed=0;
function check(cond, label){
  if(cond){ passed++; console.log("  ✅", label); }
  else { failed++; console.error("  ❌", label); }
}
function click(el, win){ el.dispatchEvent(new win.MouseEvent("click",{bubbles:true,cancelable:true})); }
/* Findet einen Detail-Button (z.B. "Gesamt"/"Pro Seite") NUR innerhalb der
   Zeile eines bestimmten Equipment-Toggles — noetig, weil bei mehreren
   gleichzeitig ausgewaehlten Geraeten desselben Typs (z.B. mehrere
   PLATE_LOADED_MACHINE-Instanzen) mehrere gleichlautende Detail-Buttons
   parallel im DOM stehen und ein globales clickByText(d,"Gesamt") sonst
   immer nur den ERSTEN treffen wuerde, nicht den zur gewuenschten Maschine
   gehoerenden. */
/* clickByText verlangt fuer einen Volltreffer einen LEAF-Knoten mit exakt
   passendem Text — ein Button mit einem verschachtelten Icon-<span> (z.B.
   "+" plus Textknoten) ist kein Leaf, daher matcht sonst nur der naechste
   per "includes()" gefundene AEUSSERE Container-Ancestor (der erste Treffer
   in Dokumentreihenfolge), auf dem ein Klick keinen Handler ausloest.
   exactButton() sucht stattdessen gezielt unter <button>-Elementen nach
   vollstaendigem Text-Match. */
function exactButton(d, text){
  return [...d.querySelectorAll("button")].find(b=>b.textContent.trim()===text);
}
function clickInRow(toggleEl, text){
  const row = toggleEl.parentElement;
  const btn = [...row.querySelectorAll("button")].find(b=>b.textContent.trim()===text);
  if(!btn) throw new Error("Button '"+text+"' nicht in der Zeile des Toggles gefunden");
  return btn;
}
function isOn(el){ return !!el && el.className && el.className.indexOf(" on")!==-1; }
function findByExactText(d, text, tag){
  const els = [...d.querySelectorAll(tag||"*")];
  return els.find(e=>e.children.length===0 && e.textContent && e.textContent.trim()===text);
}
function choiceBtn(d, value){ return d.querySelector('[data-choice="'+value+'"]'); }
function equipmentBtn(d, family, subtype, mfs){ return d.querySelector('[data-equipment-toggle="'+family+"|"+subtype+"|"+(mfs||"")+'"]'); }
function weiterBtn(d){ return d.querySelector('[data-onboarding-cta="true"]'); }
function readJson(win, key){
  const raw = win.localStorage.getItem(key);
  return raw==null ? null : JSON.parse(raw);
}
/* Robust gegenueber mehreren gleichzeitig sichtbaren Orten-Karten: findet
   den "Equipment"-Zeilen-Button INNERHALB der Karte, die den Orts-Namen als
   Titel traegt, statt ueber den (mehrdeutigen) Zusammenfassungstext. Der
   Hauptort traegt zusaetzlich den Suffix " · Hauptort" im selben Titel-Div
   (LocationsManagerScreen), daher Praefix- statt Exakt-Match. */
function equipmentRowForLocationCard(d, locationName){
  const titleEl=[...d.querySelectorAll("div")].find(e=>e.children.length===0 && e.textContent && (e.textContent.trim()===locationName || e.textContent.trim().indexOf(locationName+" · ")===0));
  const card=titleEl.closest(".card");
  return [...card.querySelectorAll("button")].find(b=>{
    const span=b.querySelector("span.sub");
    return span&&span.textContent.trim()==="Equipment";
  });
}

/* Fuehrt einen frischen Onboarding-Flow bis Schritt "Equipment" (Index 5)
   durch — Schritte 0-4 mit minimalen gueltigen Werten. */
async function driveToEquipmentStep(dom, locationName, locationType){
  const d=dom.window.document, win=dom.window;
  clickByText(d,"Training"); await flush(dom);
  clickByText(d,"Trainingsprofil einrichten"); await flush(dom);
  click(choiceBtn(d,"HYPERTROPHY"),win); await flush(dom);
  click(weiterBtn(d),win); await flush(dom); // -> Erfahrung
  click(choiceBtn(d,"SOME"),win); await flush(dom);
  click(weiterBtn(d),win); await flush(dom); // -> Trainingstage (Default 4 gueltig)
  click(weiterBtn(d),win); await flush(dom); // -> Zeitbudget (Default 60 gueltig)
  click(weiterBtn(d),win); await flush(dom); // -> Trainingsort
  setNativeInputValue(d.querySelector('input[type="text"]'), locationName);
  await flush(dom);
  click(choiceBtn(d,locationType),win); await flush(dom);
  click(weiterBtn(d),win); await flush(dom); // -> Equipment
  return {d,win};
}
async function finishFromEquipmentStep(dom, bodyweight){
  const d=dom.window.document, win=dom.window;
  click(weiterBtn(d),win); await flush(dom); // -> Koerpergewicht
  setNativeInputValue(d.querySelector('input[inputmode="decimal"]'), String(bodyweight));
  await flush(dom);
  click(weiterBtn(d),win); await flush(dom); // -> Optional
  click(weiterBtn(d),win); await flush(dom); // Fertig
}

async function main(){
  console.log("############################################");
  console.log("# STEP 06.1: Equipment-Domain-UI-Integration (Registry-Coverage/Machines/Capabilities/Locations/Presets/Migration)");
  console.log("############################################\n");

  console.log("--- A. UI/Data Coverage: jede §29.1-baseline-ID + jeder Machine Functional Subtype erreichbar ---");
  {
    const dom=createApp(()=>{});
    await flush(dom);
    const {d}=await driveToEquipmentStep(dom,"Coverage-Test","HOME_GYM");
    const FAMS=EQUIPMENT_FAMILY_SUBTYPE_REGISTRY;
    const MACH=MACHINE_FUNCTIONAL_SUBTYPE_REGISTRY;
    check(!!FAMS&&!!MACH,"Registries sind dieselbe Single Source of Truth wie training-domain.js (keine zweite Liste)");

    const nonMachineFamilies=["FREE_WEIGHT","SUPPORT","RACK_STATION","CABLE","BODYWEIGHT","RESISTANCE_ACCESSORY","SPECIAL_CORE"];
    let missing=[];
    nonMachineFamilies.forEach(family=>{
      (FAMS[family]||[]).forEach(subtype=>{
        if(!equipmentBtn(d,family,subtype))missing.push(family+"/"+subtype);
      });
    });
    check(missing.length===0,"alle §29.1-baseline Subtypes (7 Nicht-Maschinen-Familien) sind über die UI erreichbar"+(missing.length?" — fehlen: "+missing.join(", "):""));

    let missingMachines=[];
    ["SELECTORIZED_MACHINE","PLATE_LOADED_MACHINE"].forEach(family=>{
      MACH.forEach(mfs=>{ if(!equipmentBtn(d,family,mfs,mfs))missingMachines.push(family+"/"+mfs); });
    });
    check(missingMachines.length===0,"jeder der "+MACH.length+" Machine Functional Subtypes ist für BEIDE Maschinen-Familien auswählbar"+(missingMachines.length?" — fehlen: "+missingMachines.join(", "):""));
    const extendedReachable=[...d.querySelectorAll("[data-equipment-toggle]")].some(b=>b.getAttribute("data-equipment-toggle").indexOf("EXTENDED|")===0);
    check(!extendedReachable,"EXTENDED ist bewusst NICHT im Picker erreichbar (§29.1: 'not required for baseline feasibility', dokumentierte Abgrenzung — keine Codelücke)");

    // Keine UI-only Phantom-ID: jeder gerenderte Toggle muss zu einer echten Registry-ID gehoeren.
    const allToggleKeys=[...d.querySelectorAll("[data-equipment-toggle]")].map(b=>b.getAttribute("data-equipment-toggle"));
    const phantom=allToggleKeys.filter(key=>{
      const [family,subtype]=key.split("|");
      if(family==="SELECTORIZED_MACHINE"||family==="PLATE_LOADED_MACHINE")return MACH.indexOf(subtype)===-1;
      return !(FAMS[family]||[]).some(s=>s===subtype);
    });
    check(phantom.length===0,"keine UI-only Phantom-ID: jeder gerenderte Equipment-Toggle entspricht einer echten Registry-ID");
  }

  console.log("\n--- B. Machines: auswählbar + inkl. LoadProfileVersion persistiert ---");
  {
    const dom=createApp(()=>{});
    await flush(dom);
    const {d,win}=await driveToEquipmentStep(dom,"Machine-Test","COMMERCIAL_GYM");
    const machinesToTest=[
      ["PLATE_LOADED_MACHINE","LEG_PRESS_45"],["PLATE_LOADED_MACHINE","LEG_PRESS_HORIZONTAL"],
      ["PLATE_LOADED_MACHINE","HACK_SQUAT"],["SELECTORIZED_MACHINE","CHEST_PRESS_FLAT"],
      ["SELECTORIZED_MACHINE","LEG_EXTENSION"],["SELECTORIZED_MACHINE","LEG_CURL_SEATED"],
      ["SELECTORIZED_MACHINE","PULLDOWN"],["SELECTORIZED_MACHINE","ROW"],
    ];
    for(const [family,mfs] of machinesToTest){
      click(equipmentBtn(d,family,mfs,mfs),win);
      await flush(dom); // je Klick ein eigener Tick, wie bei echten separaten Browser-Click-Events (kein Batching stale-Closure-Overwrites)
    }
    machinesToTest.forEach(([family,mfs])=>{
      check(isOn(equipmentBtn(d,family,mfs,mfs)),family+"/"+mfs+" ist nach Klick als ausgewählt markiert");
    });
    // Plate-loaded Maschine: Anzeige-Semantik explizit auf "Gesamt" umstellen (Nutzerangabe statt Default).
    // Mehrere PLATE_LOADED_MACHINE-Instanzen sind gleichzeitig ausgewählt (Detail-Panels aller offen) —
    // deshalb gezielt INNERHALB der HACK_SQUAT-Zeile klicken statt global per Text (sonst träfe es die erste Maschine).
    click(clickInRow(equipmentBtn(d,"PLATE_LOADED_MACHINE","HACK_SQUAT","HACK_SQUAT"),"Gesamt"),win);
    await flush(dom);

    await finishFromEquipmentStep(dom,80);

    const defs=readJson(win,"tracker_training_equipment_definition_versions")||[];
    const instances=readJson(win,"tracker_training_equipment_instances")||[];
    const loadProfiles=readJson(win,"tracker_training_load_profile_versions")||[];
    machinesToTest.forEach(([family,mfs])=>{
      const def=defs.find(dd=>dd.family===family&&dd.machine_functional_subtype===mfs);
      check(!!def&&def.subtype===mfs,"EquipmentDefinitionVersion für "+family+"/"+mfs+" persistiert — family bleibt erhalten, subtype/machine_functional_subtype korrekt gesetzt (keine Ableitung aus dem Namen)");
      const inst=def&&instances.find(i=>i.equipment_definition_version_id===def.id&&i.inventory_state==="PRESENT");
      check(!!inst,"PRESENT EquipmentInstance für "+family+"/"+mfs+" persistiert");
      const lp=inst&&inst.load_profile_version_id&&loadProfiles.find(l=>l.id===inst.load_profile_version_id);
      check(!!lp,"LoadProfileVersion für "+family+"/"+mfs+" wurde erzeugt (MACHINE(X) hat ohne sie keinen Fallback, training-equipment.js)");
    });
    const hackDef=defs.find(dd=>dd.family==="PLATE_LOADED_MACHINE"&&dd.machine_functional_subtype==="HACK_SQUAT");
    const hackInst=instances.find(i=>i.equipment_definition_version_id===hackDef.id);
    const hackLp=loadProfiles.find(l=>l.id===hackInst.load_profile_version_id);
    check(hackLp.display_semantics==="TOTAL_ADDED"&&hackLp.per_side_semantics==="TOTAL","explizite Nutzerangabe 'Gesamt' wird als TOTAL_ADDED/TOTAL persistiert, kein erfundener Default");
    const chestDef=defs.find(dd=>dd.family==="SELECTORIZED_MACHINE"&&dd.machine_functional_subtype==="CHEST_PRESS_FLAT");
    const chestInst=instances.find(i=>i.equipment_definition_version_id===chestDef.id);
    const chestLp=loadProfiles.find(l=>l.id===chestInst.load_profile_version_id);
    check(chestLp.display_semantics==="STACK_LABEL","Selectorized-Maschine bekommt automatisch STACK_LABEL (§9.1: 'Selectorized/Cable: Instanzlabel', keine Rückfrage nötig)");
  }

  console.log("\n--- C. Capabilities: keine impliziten Ableitungen, Nutzer-Angaben persistieren ---");
  {
    const dom=createApp(()=>{});
    await flush(dom);
    const {d,win}=await driveToEquipmentStep(dom,"Cap-Test","COMMERCIAL_GYM");
    click(equipmentBtn(d,"RACK_STATION","POWER_RACK"),win); await flush(dom);
    clickByText(d,"Kniebeugen-Höhe"); await flush(dom); // PULLUP_BAR bewusst NICHT angehakt
    click(equipmentBtn(d,"SUPPORT","ADJUSTABLE_BENCH"),win); await flush(dom);
    clickByText(d,"Schräg (Incline)"); await flush(dom); // DECLINE_CAPABLE bewusst NICHT angehakt
    click(equipmentBtn(d,"CABLE","SINGLE_ADJUSTABLE_COLUMN"),win); await flush(dom);
    clickByText(d,"Hoch"); await flush(dom); // LOW/MID bewusst NICHT angehakt (high-only)

    await finishFromEquipmentStep(dom,75);

    const instances=readJson(win,"tracker_training_equipment_instances")||[];
    const defs=readJson(win,"tracker_training_equipment_definition_versions")||[];
    function instanceFor(family,subtype){
      const def=defs.find(dd=>dd.family===family&&dd.subtype===subtype);
      return def&&instances.find(i=>i.equipment_definition_version_id===def.id&&i.inventory_state==="PRESENT");
    }
    const rack=instanceFor("RACK_STATION","POWER_RACK");
    check(!!rack&&rack.capability_values.some(c=>c.namespace==="RACK"&&c.value==="SQUAT_HEIGHT"),"SQUAT_HEIGHT wurde als Capability erfasst");
    check(!rack.capability_values.some(c=>c.namespace==="RACK"&&c.value==="PULLUP_BAR"),"Rack OHNE angehaktes PULLUP_BAR bleibt OHNE Pull-up-Capability (keine implizite Ableitung 'RACK ⇒ PULLUP_BAR')");

    const bench=instanceFor("SUPPORT","ADJUSTABLE_BENCH");
    check(!!bench&&bench.capability_values.some(c=>c.namespace==="BENCH"&&c.value==="INCLINE_ADJUSTABLE"),"INCLINE_ADJUSTABLE wurde erfasst");
    check(!bench.capability_values.some(c=>c.namespace==="BENCH"&&c.value==="DECLINE_CAPABLE"),"Adjustable Bench ohne angehaktes DECLINE_CAPABLE bleibt ohne Decline-Capability (keine implizite Ableitung)");

    const cable=instanceFor("CABLE","SINGLE_ADJUSTABLE_COLUMN");
    check(!!cable&&cable.capability_values.some(c=>c.namespace==="PULLEY_POSITION"&&c.value==="HIGH"),"HIGH wurde als Capability erfasst");
    check(!cable.capability_values.some(c=>c.namespace==="PULLEY_POSITION"&&(c.value==="LOW"||c.value==="MID")),"High-only Cable bleibt high-only (kein LOW/MID stillschweigend abgeleitet)");
  }

  console.log("\n--- D. Locations: zwei Orte behalten getrennte Inventories ---");
  {
    const dom=createApp(()=>{});
    await flush(dom);
    const {d,win}=await driveToEquipmentStep(dom,"Ort A","HOME_GYM");
    click(equipmentBtn(d,"FREE_WEIGHT","KETTLEBELL"),win); await flush(dom);
    await finishFromEquipmentStep(dom,78);

    clickByText(d,"Trainingsorte verwalten"); await flush(dom);
    check(!!findByExactText(d,"Trainingsorte"),"Trainingsorte-Verwaltungsscreen geöffnet (§1.4: mehrere Orte pro Nutzer)");
    click(exactButton(d,"+ Trainingsort hinzufügen"),win); await flush(dom);
    setNativeInputValue(d.querySelector('input[type="text"]'),"Ort B"); await flush(dom);
    click(choiceBtn(d,"COMMERCIAL_GYM"),win); await flush(dom);
    clickByText(d,"Anlegen"); await flush(dom);
    check(!!findByExactText(d,"Ort B"),"neuer Trainingsort 'Ort B' erscheint in der Liste, ohne den bestehenden zu ersetzen");

    click(equipmentRowForLocationCard(d,"Ort B"),win); await flush(dom);
    check(!!findByExactText(d,"Equipment · Ort B"),"Equipment-Manager für 'Ort B' geöffnet");
    click(equipmentBtn(d,"FREE_WEIGHT","OLYMPIC_BARBELL"),win); await flush(dom);
    clickByText(d,"Speichern"); await flush(dom);
    check(!!findByExactText(d,"Trainingsorte"),"zurück auf der Trainingsorte-Liste nach Speichern");

    const locations=readJson(win,"tracker_training_locations")||[];
    const locA=locations.find(l=>l.name==="Ort A");
    const locB=locations.find(l=>l.name==="Ort B");
    check(!!locA&&!!locB&&locA.id!==locB.id,"beide Orte als eigenständige TrainingLocations persistiert");
    const instances=readJson(win,"tracker_training_equipment_instances")||[];
    const defs=readJson(win,"tracker_training_equipment_definition_versions")||[];
    const kbDef=defs.find(dd=>dd.family==="FREE_WEIGHT"&&dd.subtype==="KETTLEBELL");
    const barDef=defs.find(dd=>dd.family==="FREE_WEIGHT"&&dd.subtype==="OLYMPIC_BARBELL");
    const presentAt=(locId,defId)=>instances.some(i=>i.location_id===locId&&i.equipment_definition_version_id===defId&&i.inventory_state==="PRESENT");
    check(presentAt(locA.id,kbDef.id)&&!presentAt(locB.id,kbDef.id),"Kettlebell ist NUR in Ort A PRESENT, nicht in Ort B");
    check(presentAt(locB.id,barDef.id)&&!presentAt(locA.id,barDef.id),"Langhantel ist NUR in Ort B PRESENT, nicht in Ort A — Bearbeiten von Ort B mutiert Ort A nicht");

    // Ort A erneut oeffnen und bestaetigen, dass er nach dem Editieren von Ort B unveraendert geblieben ist.
    click(equipmentRowForLocationCard(d,"Ort A"),win); await flush(dom);
    check(!!findByExactText(d,"Equipment · Ort A"),"Equipment-Manager für 'Ort A' geöffnet");
    check(isOn(equipmentBtn(d,"FREE_WEIGHT","KETTLEBELL"))&&!isOn(equipmentBtn(d,"FREE_WEIGHT","OLYMPIC_BARBELL")),"Ort A zeigt weiterhin ausschließlich Kettlebell — Ort B's Bearbeitung hat es nicht mutiert");
  }

  console.log("\n--- E. Presets: nichts vorausgewählt (echte editierbare Startschätzung) ---");
  {
    const dom=createApp(()=>{});
    await flush(dom);
    const {d}=await driveToEquipmentStep(dom,"Preset-Test","HOME_GYM");
    check(!isOn(equipmentBtn(d,"FREE_WEIGHT","OLYMPIC_BARBELL")),"kein Gerät ist beim ersten Erreichen des Equipment-Schritts vorausgewählt (keine versteckte Default-Präferenz)");
    check(!isOn(equipmentBtn(d,"SELECTORIZED_MACHINE","CHEST_PRESS_FLAT","CHEST_PRESS_FLAT")),"auch Maschinen sind nicht vorausgewählt");
    check(!isOn(equipmentBtn(d,"RESISTANCE_ACCESSORY","LOOP_BAND")),"auch Zubehör ist nicht vorausgewählt — jede Auswahl ist eine aktive Nutzerentscheidung, kein Preset-Default");
  }

  console.log("\n--- F. Migration: alte <10-Geräte-Auswahl bleibt vollständig erhalten ---");
  {
    function seedLegacyUser(win){
      const userId="legacy_user_1", locationId="loc_legacy";
      win.localStorage.setItem("tracker_training_profile",JSON.stringify({
        user_id:userId,goal:"HYPERTROPHY",experience_self:"SOME",training_days_per_week:4,session_time_budget_min:60,
        primary_location_id:locationId,bodyweight_kg:80,priority_muscles:[],preferred_split:null,
        training_weekdays:[],weekday_location_map:{},uses_rir:false,rest_preference:"STANDARD",
        experience_level_eligible:"INTERMEDIATE",experience_level:"INTERMEDIATE",user_skill_level:3,
        rir_reliability_tier_by_exercise:{},session_adherence_rate:null,actual_session_duration_factor:null,sex:null,age:null,
      }));
      win.localStorage.setItem("tracker_training_locations",JSON.stringify([
        {id:locationId,user_id:userId,name:"Altes Zuhause",type:"HOME_GYM",current_equipment_profile_version_id:"eqpv_legacy",is_default_for_weekdays:[]},
      ]));
      /* Exakt das Datenformat, das die FRUEHERE (bis STEP06.1) TRAINING_EQUIPMENT_PRESETS-
         basierte finishOnboarding()-Implementierung erzeugt hat: kanonische
         family/subtype (seit der STEP06-Korrektur bereits gueltig), aber
         OHNE load_profile_version_id (wurde vor STEP06.1 nie gesetzt). */
      win.localStorage.setItem("tracker_training_equipment_definition_versions",JSON.stringify([
        {id:"eqdef_barbell_plates",version:1,canonical_name:"Langhantel + Scheiben",family:"FREE_WEIGHT",subtype:"OLYMPIC_BARBELL",machine_functional_subtype:null,default_capability_schema:[],status:"ACTIVE"},
        {id:"eqdef_dumbbells",version:1,canonical_name:"Kurzhanteln",family:"FREE_WEIGHT",subtype:"FIXED_DUMBBELL",machine_functional_subtype:null,default_capability_schema:[],status:"ACTIVE"},
      ]));
      win.localStorage.setItem("tracker_training_equipment_instances",JSON.stringify([
        {id:"eqi_legacy_bar",location_id:locationId,equipment_definition_version_id:"eqdef_barbell_plates",inventory_state:"PRESENT",capability_values:[],load_profile_version_id:null,manufacturer:null,model_name:null,equivalence_group_id:null,station_group_id:null},
        {id:"eqi_legacy_db",location_id:locationId,equipment_definition_version_id:"eqdef_dumbbells",inventory_state:"PRESENT",capability_values:[],load_profile_version_id:null,manufacturer:null,model_name:null,equivalence_group_id:null,station_group_id:null},
      ]));
      win.localStorage.setItem("tracker_training_equipment_profile_versions",JSON.stringify([
        {id:"eqpv_legacy",location_id:locationId,version:1,equipment_instance_ids:["eqi_legacy_bar","eqi_legacy_db"],created_at:"2026-01-01T00:00:00.000Z"},
      ]));
    }
    const dom=createApp(seedLegacyUser);
    await flush(dom);
    const d=dom.window.document, win=dom.window;
    clickByText(d,"Training"); await flush(dom);
    check(!!findByExactText(d,"Trainingsprofil"),"bestehendes Alt-Profil wird sofort als vollständig erkannt (kein erzwungenes Re-Onboarding)");
    check(!findByExactText(d,"Trainingsprofil einrichten"),"kein 'einrichten'-CTA für bereits eingerichtete Alt-Nutzer");
    clickByText(d,"Equipment"); await flush(dom);
    check(!!findByExactText(d,"Equipment · Altes Zuhause"),"Equipment-Manager öffnet sich direkt für den bestehenden Alt-Ort");
    check(isOn(equipmentBtn(d,"FREE_WEIGHT","OLYMPIC_BARBELL")),"alte Langhantel-Auswahl wird korrekt in die neue UI übernommen (kein Datenverlust)");
    check(isOn(equipmentBtn(d,"FREE_WEIGHT","FIXED_DUMBBELL")),"alte Kurzhantel-Auswahl wird korrekt in die neue UI übernommen (kein Datenverlust)");

    clickByText(d,"Speichern"); await flush(dom); // Re-Save ohne inhaltliche Aenderung

    const instances=readJson(win,"tracker_training_equipment_instances")||[];
    const legacyLocInstances=instances.filter(i=>i.location_id==="loc_legacy"&&i.inventory_state==="PRESENT");
    check(legacyLocInstances.length===2,"exakt dieselben 2 Alt-Instanzen bleiben PRESENT — kein Datenverlust, keine Duplikate/Parallel-Instanzen");
    const stillBar=legacyLocInstances.find(i=>i.id==="eqi_legacy_bar");
    const stillDb=legacyLocInstances.find(i=>i.id==="eqi_legacy_db");
    check(!!stillBar&&!!stillDb,"dieselben Instanz-IDs werden weiterverwendet (upsert anhand family/subtype der Alt-Definition, keine Neuanlage) — deterministische Migration statt Parallelarchitektur");
    const defs=readJson(win,"tracker_training_equipment_definition_versions")||[];
    const barDef=defs.find(dd=>dd.id===stillBar.equipment_definition_version_id);
    const dbDef=defs.find(dd=>dd.id===stillDb.equipment_definition_version_id);
    check(!!barDef&&barDef.family==="FREE_WEIGHT"&&barDef.subtype==="OLYMPIC_BARBELL","Alt-Instanz zeigt nach Re-Speichern auf die kanonische deterministische EquipmentDefinitionVersion (§29.1-ID statt Alt-Preset-ID)");
    check(!!dbDef&&dbDef.family==="FREE_WEIGHT"&&dbDef.subtype==="FIXED_DUMBBELL","Alt-Dumbbell-Instanz zeigt nach Re-Speichern ebenfalls auf die kanonische deterministische EquipmentDefinitionVersion");
    const loadProfiles=readJson(win,"tracker_training_load_profile_versions")||[];
    const dbProfile=stillDb.load_profile_version_id&&loadProfiles.find(l=>l.id===stillDb.load_profile_version_id);
    check(!!dbProfile&&dbProfile.pair_semantics==="SINGLE","Re-Speichern ergänzt das vorher fehlende LoadProfileVersion für die Alt-Dumbbell-Instanz (SINGLE als ehrlicher Default) — hebt Alt-Daten auf STEP06-Feasibility-Niveau, ohne Werte zu erfinden");
  }

  console.log("\n"+passed+" bestanden, "+failed+" fehlgeschlagen");
  process.exit(failed>0?1:0);
}

main().catch(e=>{ console.error("FEHLER:", e.message); console.error(e.stack); process.exit(1); });
