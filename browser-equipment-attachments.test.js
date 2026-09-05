const { createApp, flush } = require("./browser-test-harness.js");
const { clickByText, setNativeInputValue } = require("./dom-test-helpers.js");

/* Test fuer STEP 06.1 — FINAL PREDICATE/CAPABILITY COVERAGE CORRECTION,
   Aufgabentext Abschnitt 6 ("mindestens zusaetzliche Browser-/Roundtrip-
   Tests"). Ergaenzt browser-equipment-manager.test.js (das die generische
   Registry-/Machine-/Capability-/Location-/Preset-/Migrations-Abdeckung
   bereits deckt) um die hier explizit verlangten Attachment-/Anchor-/
   Assistance-spezifischen UI-Roundtrips:

   - Cable + ROPE / SINGLE_D_HANDLE / PAIR_D_HANDLES / NEUTRAL_ROW_HANDLE /
     WIDE_BAR|NEUTRAL_PULLDOWN_HANDLE einzeln erfassbar + persistiert
   - LOW/MID/HIGH-Anchors (ANCHOR_POINT) erfassbar + persistiert
   - Rack PULLUP_BAR bleibt explizit (keine implizite Ableitung)
   - LOWER_BODY_ANCHOR (GHD) bleibt explizit
   - Assisted-Machine-Capability: ASSISTED_PULLUP_DIP bekommt die
     korrigierte ASSISTANCE/LOWER_IS_MORE-LoadProfileVersion statt der
     generischen STACK_LABEL/HIGHER_IS_MORE-Maschinen-Form
   - Reload erhaelt Attachment-/Capability-Facts (Equipment-Manager erneut
     oeffnen zeigt dieselben Haken)
   - zwei Locations halten Attachment-Capabilities getrennt
   - Cable ohne Attachment-Auswahl persistiert keine CABLE_ATTACHMENT-Werte
     (die eigentliche "erfuellt ATTACHMENT_* NICHT"-Resolver-Pruefung liegt
     domainseitig in training-catalog-predicate-coverage.test.js — hier wird
     nur die UI-Seite verifiziert: kein Wert wird ohne Nutzerklick
     geschrieben). */

let passed=0, failed=0;
function check(cond, label){
  if(cond){ passed++; console.log("  ✅", label); }
  else { failed++; console.error("  ❌", label); }
}
function click(el, win){ el.dispatchEvent(new win.MouseEvent("click",{bubbles:true,cancelable:true})); }
/* Bereits angehakte Detail-Buttons rendern ein "✓ "-Praefix vor dem Label
   (EquipmentTypeRow), ein bereits ausgewaehlter Chip-Toggle selbst hat
   stattdessen ein eigenes <span>✓</span> VOR dem Label-<span> (Label bleibt
   dort unveraendert) — clickInRow() muss deshalb fuer Detail-Buttons
   tolerant gegenueber dem Praefix sein, sowohl zum Klicken als auch zum
   spaeteren Wiederfinden/Pruefen desselben Buttons nach dem Klick. */
function clickInRow(toggleEl, text){
  const row = toggleEl.parentElement;
  const btn = [...row.querySelectorAll("button")].find(b=>{
    const t=b.textContent.trim();
    return t===text||t==="✓ "+text;
  });
  if(!btn) throw new Error("Button '"+text+"' nicht in der Zeile des Toggles gefunden");
  return btn;
}
function isOn(el){ return !!el && el.className && el.className.indexOf(" on")!==-1; }
/* Detail-Capability-Buttons (EquipmentTypeRow) tragen KEINE eigene
   "on"-CSS-Klasse, nur inline style — angehakt zeigt sich ausschliesslich
   am "✓ "-Textpraefix vor dem Label. */
function detailChecked(el){ return !!el && el.textContent.trim().indexOf("✓")===0; }
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
function equipmentRowForLocationCard(d, locationName){
  const titleEl=[...d.querySelectorAll("div")].find(e=>e.children.length===0 && e.textContent && (e.textContent.trim()===locationName || e.textContent.trim().indexOf(locationName+" · ")===0));
  const card=titleEl.closest(".card");
  return [...card.querySelectorAll("button")].find(b=>{
    const span=b.querySelector("span.sub");
    return span&&span.textContent.trim()==="Equipment";
  });
}
async function driveToEquipmentStep(dom, locationName, locationType){
  const d=dom.window.document, win=dom.window;
  clickByText(d,"Training"); await flush(dom);
  clickByText(d,"Trainingsprofil einrichten"); await flush(dom);
  click(choiceBtn(d,"HYPERTROPHY"),win); await flush(dom);
  click(weiterBtn(d),win); await flush(dom); // -> Erfahrung
  click(choiceBtn(d,"SOME"),win); await flush(dom);
  click(weiterBtn(d),win); await flush(dom); // -> Trainingstage
  click(weiterBtn(d),win); await flush(dom); // -> Zeitbudget
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
  console.log("# STEP 06.1 FINAL CORRECTION: Attachment/Anchor/Assistance-Capability-Coverage");
  console.log("############################################\n");

  console.log("--- Cable-Attachments einzeln erfassbar + persistiert ---");
  {
    const dom=createApp(()=>{});
    await flush(dom);
    const {d,win}=await driveToEquipmentStep(dom,"Attachment-Test","COMMERCIAL_GYM");
    const cableToggle=equipmentBtn(d,"CABLE","FUNCTIONAL_TRAINER");
    click(cableToggle,win); await flush(dom);
    // Je Klick ein eigener Tick (wie separate Browser-Click-Events) — sonst
    // lesen alle Klicks innerhalb derselben Iteration dieselbe stale
    // "entries"-Closure und ueberschreiben sich gegenseitig (siehe die
    // identische Korrektur in browser-equipment-manager.test.js Abschnitt B).
    for(const [label] of [["Seil"],["Einzel-D-Griff"],["Doppel-D-Griffe"],
     ["Neutraler Rudergriff"],["Breite Stange"],["Neutraler Latzug-Griff"]]){
      click(clickInRow(equipmentBtn(d,"CABLE","FUNCTIONAL_TRAINER"),label),win);
      await flush(dom);
    }
    await finishFromEquipmentStep(dom,80);

    const instances=readJson(win,"tracker_training_equipment_instances")||[];
    const defs=readJson(win,"tracker_training_equipment_definition_versions")||[];
    const cableDef=defs.find(dd=>dd.family==="CABLE"&&dd.subtype==="FUNCTIONAL_TRAINER");
    const cableInst=instances.find(i=>i.equipment_definition_version_id===cableDef.id&&i.inventory_state==="PRESENT");
    const attachmentValues=(cableInst.capability_values||[]).filter(c=>c.namespace==="CABLE_ATTACHMENT").map(c=>c.value).sort();
    const expected=["NEUTRAL_PULLDOWN_HANDLE","NEUTRAL_ROW_HANDLE","PAIR_D_HANDLES","ROPE","SINGLE_D_HANDLE","WIDE_BAR"].sort();
    check(JSON.stringify(attachmentValues)===JSON.stringify(expected),"alle 6 angeklickten Cable-Attachments (ROPE/SINGLE_D_HANDLE/PAIR_D_HANDLES/NEUTRAL_ROW_HANDLE/WIDE_BAR/NEUTRAL_PULLDOWN_HANDLE) sind als CABLE_ATTACHMENT-Capability persistiert — erhalten: "+JSON.stringify(attachmentValues));
    check(attachmentValues.indexOf("STRAIGHT_BAR")===-1&&attachmentValues.indexOf("EZ_BAR")===-1&&attachmentValues.indexOf("ANKLE_STRAP")===-1,"NICHT angeklickte Attachments (STRAIGHT_BAR/EZ_BAR/ANKLE_STRAP) werden NICHT stillschweigend mit-persistiert");
  }

  console.log("\n--- Cable ohne jegliche Attachment-Auswahl persistiert keine CABLE_ATTACHMENT-Werte ---");
  {
    const dom=createApp(()=>{});
    await flush(dom);
    const {d,win}=await driveToEquipmentStep(dom,"No-Attachment-Test","COMMERCIAL_GYM");
    click(equipmentBtn(d,"CABLE","CABLE_CROSSOVER"),win); await flush(dom);
    // Bewusst NICHTS im Detailbereich anklicken — nur die Cable-Maschine selbst auswaehlen.
    await finishFromEquipmentStep(dom,80);

    const instances=readJson(win,"tracker_training_equipment_instances")||[];
    const defs=readJson(win,"tracker_training_equipment_definition_versions")||[];
    const cableDef=defs.find(dd=>dd.family==="CABLE"&&dd.subtype==="CABLE_CROSSOVER");
    const cableInst=instances.find(i=>i.equipment_definition_version_id===cableDef.id&&i.inventory_state==="PRESENT");
    const attachmentValues=(cableInst.capability_values||[]).filter(c=>c.namespace==="CABLE_ATTACHMENT");
    check(attachmentValues.length===0,"Cable-Maschine ohne angeklicktes Attachment persistiert KEINE CABLE_ATTACHMENT-Capability (keine implizite 'Kabelzug vorhanden = alle Griffe vorhanden'-Annahme)");
  }

  console.log("\n--- LOW/MID/HIGH-Anchors (ANCHOR_POINT) erfassbar + persistiert ---");
  {
    const dom=createApp(()=>{});
    await flush(dom);
    const {d,win}=await driveToEquipmentStep(dom,"Anchor-Test","HOME_GYM");
    click(equipmentBtn(d,"RESISTANCE_ACCESSORY","ANCHOR_POINT"),win); await flush(dom);
    click(clickInRow(equipmentBtn(d,"RESISTANCE_ACCESSORY","ANCHOR_POINT"),"Tief"),win); await flush(dom);
    click(clickInRow(equipmentBtn(d,"RESISTANCE_ACCESSORY","ANCHOR_POINT"),"Mittig"),win); await flush(dom);
    // "Hoch" bewusst NICHT angehakt.
    await finishFromEquipmentStep(dom,70);

    const instances=readJson(win,"tracker_training_equipment_instances")||[];
    const defs=readJson(win,"tracker_training_equipment_definition_versions")||[];
    const anchorDef=defs.find(dd=>dd.family==="RESISTANCE_ACCESSORY"&&dd.subtype==="ANCHOR_POINT");
    const anchorInst=instances.find(i=>i.equipment_definition_version_id===anchorDef.id&&i.inventory_state==="PRESENT");
    const values=(anchorInst.capability_values||[]).filter(c=>c.namespace==="ANCHOR").map(c=>c.value).sort();
    check(JSON.stringify(values)===JSON.stringify(["LOW","MID"]),"LOW+MID sind als ANCHOR-Capability persistiert, HIGH NICHT (kein implizites 'ein Anchor deckt automatisch alle Hoehen ab') — erhalten: "+JSON.stringify(values));
  }

  console.log("\n--- Rack PULLUP_BAR bleibt explizit (keine implizite Ableitung) ---");
  {
    const dom=createApp(()=>{});
    await flush(dom);
    const {d,win}=await driveToEquipmentStep(dom,"Rack-Pullup-Test","COMMERCIAL_GYM");
    click(equipmentBtn(d,"RACK_STATION","POWER_RACK"),win); await flush(dom);
    click(clickInRow(equipmentBtn(d,"RACK_STATION","POWER_RACK"),"Kniebeugen-Höhe"),win); await flush(dom);
    // "Klimmzugstange integriert" bewusst NICHT angehakt.
    await finishFromEquipmentStep(dom,80);

    const instances=readJson(win,"tracker_training_equipment_instances")||[];
    const defs=readJson(win,"tracker_training_equipment_definition_versions")||[];
    const rackDef=defs.find(dd=>dd.family==="RACK_STATION"&&dd.subtype==="POWER_RACK");
    const rackInst=instances.find(i=>i.equipment_definition_version_id===rackDef.id&&i.inventory_state==="PRESENT");
    check(!(rackInst.capability_values||[]).some(c=>c.namespace==="RACK"&&c.value==="PULLUP_BAR"),"Rack OHNE angehaktes 'Klimmzugstange integriert' persistiert KEINE RACK/PULLUP_BAR-Capability");
    check((rackInst.capability_values||[]).some(c=>c.namespace==="RACK"&&c.value==="SQUAT_HEIGHT"),"die tatsaechlich angehakte SQUAT_HEIGHT-Capability bleibt unabhaengig davon persistiert");
  }

  console.log("\n--- LOWER_BODY_ANCHOR (GHD) bleibt explizit ---");
  {
    const dom=createApp(()=>{});
    await flush(dom);
    const {d,win}=await driveToEquipmentStep(dom,"GHD-Test","COMMERCIAL_GYM");
    click(equipmentBtn(d,"SUPPORT","GHD"),win); await flush(dom);
    // "Unterschenkel-Fixierung" bewusst NICHT angehakt.
    await finishFromEquipmentStep(dom,80);

    const instances=readJson(win,"tracker_training_equipment_instances")||[];
    const defs=readJson(win,"tracker_training_equipment_definition_versions")||[];
    const ghdDef=defs.find(dd=>dd.family==="SUPPORT"&&dd.subtype==="GHD");
    const ghdInst=instances.find(i=>i.equipment_definition_version_id===ghdDef.id&&i.inventory_state==="PRESENT");
    check(!(ghdInst.capability_values||[]).some(c=>c.namespace==="SUPPORT"&&c.value==="LOWER_LEG_ANCHORED"),"GHD OHNE angehakte 'Unterschenkel-Fixierung' persistiert KEINE SUPPORT/LOWER_LEG_ANCHORED-Capability (LOWER_BODY_ANCHOR bleibt explizit)");
  }

  console.log("\n--- Assisted-Machine-Capability: korrigierte ASSISTANCE/LOWER_IS_MORE-LoadProfileVersion ---");
  {
    const dom=createApp(()=>{});
    await flush(dom);
    const {d,win}=await driveToEquipmentStep(dom,"Assisted-Test","COMMERCIAL_GYM");
    click(equipmentBtn(d,"SELECTORIZED_MACHINE","ASSISTED_PULLUP_DIP","ASSISTED_PULLUP_DIP"),win); await flush(dom);
    await finishFromEquipmentStep(dom,80);

    const instances=readJson(win,"tracker_training_equipment_instances")||[];
    const defs=readJson(win,"tracker_training_equipment_definition_versions")||[];
    const loadProfiles=readJson(win,"tracker_training_load_profile_versions")||[];
    const def=defs.find(dd=>dd.family==="SELECTORIZED_MACHINE"&&dd.machine_functional_subtype==="ASSISTED_PULLUP_DIP");
    const inst=instances.find(i=>i.equipment_definition_version_id===def.id&&i.inventory_state==="PRESENT");
    const lp=loadProfiles.find(l=>l.id===inst.load_profile_version_id);
    check(!!lp,"Assisted-Pullup/Dip-Maschine bekommt eine LoadProfileVersion (wie jede andere Maschine)");
    check(lp.display_semantics==="ASSISTANCE","Assisted-Pullup/Dip-Maschine bekommt display_semantics=ASSISTANCE (§9.1), NICHT das generische STACK_LABEL anderer Selectorized-Maschinen — erhalten: "+lp.display_semantics);
    check(lp.direction==="LOWER_IS_MORE","Assisted-Pullup/Dip-Maschine bekommt direction=LOWER_IS_MORE (§9.1: 'Assistance verwendet LOWER_IS_MORE'), NICHT HIGHER_IS_MORE — erhalten: "+lp.direction);
  }

  console.log("\n--- Reload erhaelt Attachment-/Capability-Facts unveraendert ---");
  {
    const dom=createApp(()=>{});
    await flush(dom);
    const {d,win}=await driveToEquipmentStep(dom,"Reload-Test","COMMERCIAL_GYM");
    click(equipmentBtn(d,"CABLE","LAT_PULLDOWN_STATION"),win); await flush(dom);
    click(clickInRow(equipmentBtn(d,"CABLE","LAT_PULLDOWN_STATION"),"Seil"),win); await flush(dom);
    click(clickInRow(equipmentBtn(d,"CABLE","LAT_PULLDOWN_STATION"),"Hoch"),win); await flush(dom);
    await finishFromEquipmentStep(dom,80);

    // Equipment-Manager fuer denselben Ort erneut oeffnen (simuliert Reload/erneuten Besuch,
    // liest ausschliesslich aus localStorage via buildEquipmentEntriesFromLocation).
    clickByText(d,"Equipment"); await flush(dom);
    check(isOn(equipmentBtn(d,"CABLE","LAT_PULLDOWN_STATION")),"Cable-Maschine bleibt nach erneutem Oeffnen ausgewaehlt");
    // Detail-Capability-Buttons tragen anders als der Haupt-Chip KEINE
    // "on"-CSS-Klasse (nur inline style) — angehakt zeigt sich hier am
    // "✓ "-Textpraefix (siehe EquipmentTypeRow), daher detailChecked()
    // statt isOn() fuer diese beiden Pruefungen.
    check(detailChecked(clickInRow(equipmentBtn(d,"CABLE","LAT_PULLDOWN_STATION"),"Seil")),"ROPE-Attachment bleibt nach erneutem Oeffnen angehakt (Reload-Persistenz)");
    check(detailChecked(clickInRow(equipmentBtn(d,"CABLE","LAT_PULLDOWN_STATION"),"Hoch")),"HIGH-Pulley-Position bleibt nach erneutem Oeffnen angehakt (Reload-Persistenz)");
  }

  console.log("\n--- Zwei Locations halten Attachment-Capabilities getrennt ---");
  {
    const dom=createApp(()=>{});
    await flush(dom);
    const {d,win}=await driveToEquipmentStep(dom,"Ort A","COMMERCIAL_GYM");
    click(equipmentBtn(d,"CABLE","CABLE_CROSSOVER"),win); await flush(dom);
    click(clickInRow(equipmentBtn(d,"CABLE","CABLE_CROSSOVER"),"Seil"),win); await flush(dom);
    await finishFromEquipmentStep(dom,78);

    clickByText(d,"Trainingsorte verwalten"); await flush(dom);
    click([...d.querySelectorAll("button")].find(b=>b.textContent.trim()==="+ Trainingsort hinzufügen"),win); await flush(dom);
    setNativeInputValue(d.querySelector('input[type="text"]'),"Ort B"); await flush(dom);
    click(choiceBtn(d,"COMMERCIAL_GYM"),win); await flush(dom);
    click([...d.querySelectorAll("button")].find(b=>b.textContent.trim()==="Anlegen"),win); await flush(dom);

    const titleB=[...d.querySelectorAll("div")].find(e=>e.children.length===0&&e.textContent&&e.textContent.trim()==="Ort B");
    const cardB=titleB.closest(".card");
    click([...cardB.querySelectorAll("button")].find(b=>{const s=b.querySelector("span.sub");return s&&s.textContent.trim()==="Equipment";}),win); await flush(dom);
    click(equipmentBtn(d,"CABLE","CABLE_CROSSOVER"),win); await flush(dom);
    click(clickInRow(equipmentBtn(d,"CABLE","CABLE_CROSSOVER"),"Doppel-D-Griffe"),win); await flush(dom);
    click([...d.querySelectorAll("button")].find(b=>b.textContent.trim()==="Speichern"),win); await flush(dom);

    const instances=readJson(win,"tracker_training_equipment_instances")||[];
    const defs=readJson(win,"tracker_training_equipment_definition_versions")||[];
    const locations=readJson(win,"tracker_training_locations")||[];
    const locA=locations.find(l=>l.name==="Ort A"), locB=locations.find(l=>l.name==="Ort B");
    const cableDef=defs.find(dd=>dd.family==="CABLE"&&dd.subtype==="CABLE_CROSSOVER");
    const instA=instances.find(i=>i.location_id===locA.id&&i.equipment_definition_version_id===cableDef.id&&i.inventory_state==="PRESENT");
    const instB=instances.find(i=>i.location_id===locB.id&&i.equipment_definition_version_id===cableDef.id&&i.inventory_state==="PRESENT");
    const attA=(instA.capability_values||[]).filter(c=>c.namespace==="CABLE_ATTACHMENT").map(c=>c.value);
    const attB=(instB.capability_values||[]).filter(c=>c.namespace==="CABLE_ATTACHMENT").map(c=>c.value);
    check(attA.indexOf("ROPE")!==-1&&attA.indexOf("PAIR_D_HANDLES")===-1,"Ort A hat nur ROPE als Cable-Attachment, nicht PAIR_D_HANDLES");
    check(attB.indexOf("PAIR_D_HANDLES")!==-1&&attB.indexOf("ROPE")===-1,"Ort B hat nur PAIR_D_HANDLES als Cable-Attachment, nicht ROPE — beide Orte bleiben unabhaengig");
  }

  console.log("\n"+passed+" bestanden, "+failed+" fehlgeschlagen");
  process.exit(failed>0?1:0);
}

main().catch(e=>{ console.error("FEHLER:", e.message); console.error(e.stack); process.exit(1); });
