#!/usr/bin/env node
/*
 * run-all-tests.js — zentraler Test-Runner (Phase 0 des Migrationsplans).
 *
 * Fuehrt in fester, nachvollziehbarer Reihenfolge aus:
 *   1. Manifest-Check: entspricht die Liste unten exakt den tatsaechlich
 *      vorhandenen *.test.js-Dateien? (verhindert, dass eine neue/geloeschte
 *      Testdatei versehentlich uebersprungen wird, ohne dass es auffaellt)
 *   2. sync-engine.py --check (forecast-engine.js <-> index.html synchron?)
 *   3. Syntax-Check von index.html (Babel-Block extrahieren, kompilieren,
 *      node --check auf das Ergebnis)
 *   4. Alle forecast-engine.*.test.js (reine Node-Unit-Tests der Engine)
 *   5. Alle browser-*.test.js (jsdom-End-to-End-Tests gegen den aus
 *      index.html kompilierten App-Code, APP_SOURCE_PATH wird automatisch
 *      gesetzt)
 *
 * Kein neues Testframework: ruft die bestehenden Testdateien weiterhin als
 * einfache Node-Skripte auf, die selbst per process.exit(code) signalisieren,
 * ob sie bestanden haben — genau wie beim manuellen Einzelaufruf bisher.
 *
 * Exit-Code: 0 nur wenn WIRKLICH alle Schritte bestanden haben, sonst 1.
 */
const {execFileSync,spawnSync}=require("child_process");
const fs=require("fs");
const path=require("path");
const os=require("os");

const ROOT=__dirname;

/* Feste, nachvollziehbare Reihenfolge. Wird gegen die tatsaechlich
   vorhandenen *.test.js-Dateien geprueft (Schritt "Manifest-Check") — bei
   Abweichung schlaegt der Gesamtlauf hart fehl, statt still etwas zu
   uebergehen. */
const ENGINE_TESTS=[
  "forecast-engine.test.js",
  "forecast-engine.confirmations.test.js",
  "forecast-engine.finalization.test.js",
  "forecast-engine.integration2.test.js",
  "forecast-engine.usagegap.test.js",
  "forecast-engine.weightvalidation.test.js",
];
const BROWSER_TESTS=[
  "browser-scenarios-1to4.test.js",
  "browser-scenarios-5to10.test.js",
  "browser-finalization.test.js",
  "browser-weekcard-goals.test.js",
  "browser-weeklogged-consistency.test.js",
  "browser-weekcard-reactivity.test.js",
  "browser-weekcard-acceptance-kw31.test.js",
  "browser-retroactive-tdee-setup.test.js",
];

const results=[]; // {name,ok,ms,detail,summaryLine}

function section(title){
  console.log("\n"+"=".repeat(70));
  console.log(title);
  console.log("=".repeat(70));
}

/* Extrahiert "N bestanden, M fehlgeschlagen" aus der Ausgabe einer
   Testdatei, falls vorhanden — rein informativ fuer die
   Gesamtzusammenfassung, die Pass/Fail-Entscheidung selbst kommt
   ausschliesslich vom Exit-Code des Kindprozesses. */
function extractSummaryLine(output){
  const m=output.match(/(\d+)\s+bestanden,\s+(\d+)\s+fehlgeschlagen/);
  return m?{passed:Number(m[1]),failed:Number(m[2])}:null;
}

function runStep(name,fn){
  const start=Date.now();
  let ok=false,detail="",summaryLine=null;
  try{
    const out=fn();
    ok=true;
    if(typeof out==="string")summaryLine=extractSummaryLine(out);
  }catch(e){
    detail=(e&&e.message)||String(e);
    if(e&&e.stdout)summaryLine=extractSummaryLine(String(e.stdout));
  }
  const ms=Date.now()-start;
  results.push({name,ok,ms,detail,summaryLine});
  const tag=ok?"✅":"❌";
  const suffix=summaryLine?"  ("+summaryLine.passed+" bestanden, "+summaryLine.failed+" fehlgeschlagen)":"";
  console.log(tag+"  "+name+"  ["+ms+"ms]"+suffix);
  if(!ok)console.log("     -> "+detail.split("\n")[0]);
  return ok;
}

function runNodeScript(file,env){
  const r=spawnSync(process.execPath,[file],{cwd:ROOT,encoding:"utf8",env:env||process.env});
  const output=(r.stdout||"")+(r.stderr||"");
  process.stdout.write(output.endsWith("\n")?output:output+"\n");
  if(r.status!==0){
    const err=new Error(file+" endete mit Exit-Code "+r.status);
    err.stdout=output;
    throw err;
  }
  return output;
}

// ========== 0. Manifest-Check ==========
section("0. Manifest-Check: sind alle *.test.js-Dateien registriert?");
runStep("Manifest stimmt mit vorhandenen Testdateien ueberein", ()=>{
  const onDisk=fs.readdirSync(ROOT).filter(f=>f.endsWith(".test.js")).sort();
  const registered=[...ENGINE_TESTS,...BROWSER_TESTS].sort();
  const missingFromRunner=onDisk.filter(f=>!registered.includes(f));
  const missingOnDisk=registered.filter(f=>!onDisk.includes(f));
  if(missingFromRunner.length||missingOnDisk.length){
    let msg="Manifest weicht von den tatsaechlichen Testdateien ab.";
    if(missingFromRunner.length)msg+="\n  Auf der Platte, aber NICHT im Runner registriert: "+missingFromRunner.join(", ");
    if(missingOnDisk.length)msg+="\n  Im Runner registriert, aber NICHT vorhanden: "+missingOnDisk.join(", ");
    throw new Error(msg);
  }
  return onDisk.length+" Testdateien gefunden, alle im Runner registriert.";
});

// ========== 1. Engine-Sync-Check ==========
section("1. Engine-Sync-Check (sync-engine.py --check)");
runStep("sync-engine.py --check", ()=>{
  const r=spawnSync("python3",["sync-engine.py","--check"],{cwd:ROOT,encoding:"utf8"});
  const output=(r.stdout||"")+(r.stderr||"");
  process.stdout.write(output.endsWith("\n")||output===""?output:output+"\n");
  if(r.status!==0){
    const err=new Error("forecast-engine.js und index.html sind NICHT synchron (oder python3/sync-engine.py nicht ausfuehrbar)");
    err.stdout=output;
    throw err;
  }
});

// ========== 2. Syntax-Check index.html ==========
section("2. Syntax-Check index.html (Babel-Block kompilieren + node --check)");
let compiledAppPath=null;
runStep("index.html: <script type=\"text/babel\">-Block kompiliert fehlerfrei", ()=>{
  const html=fs.readFileSync(path.join(ROOT,"index.html"),"utf8");
  const m=html.match(/<script type="text\/babel">([\s\S]*)<\/script>/);
  if(!m)throw new Error("Kein <script type=\"text/babel\">-Block in index.html gefunden");
  const Babel=require("@babel/standalone");
  const compiled=Babel.transform(m[1],{presets:[["react",{runtime:"classic"}]]}).code;
  const tmpDir=fs.mkdtempSync(path.join(os.tmpdir(),"vital-test-"));
  compiledAppPath=path.join(tmpDir,"app_compiled.js");
  fs.writeFileSync(compiledAppPath,compiled);
  execFileSync(process.execPath,["--check",compiledAppPath],{stdio:"pipe"});
});

// ========== 2b. Syntax-Check ausgelagerte Utility-/Engine-Skripte ==========
section("2b. Syntax-Check date-utils.js / format.js / storage.js / weight-engine.js / sport-engine.js / calendar-engine.js / week-engine.js / goal-engine.js");
["date-utils.js","format.js","storage.js","weight-engine.js","sport-engine.js","calendar-engine.js","week-engine.js","goal-engine.js"].forEach(file=>{
  runStep(file+": Syntax ok (node --check)", ()=>{
    execFileSync(process.execPath,["--check",path.join(ROOT,file)],{stdio:"pipe"});
  });
});

// ========== 3. Forecast-Engine Node-Unit-Tests ==========
section("3. Forecast-Engine Node-Unit-Tests");
ENGINE_TESTS.forEach(file=>{
  runStep(file, ()=>runNodeScript(file));
});

// ========== 4. Browser-/jsdom-End-to-End-Tests ==========
section("4. Browser-/jsdom-End-to-End-Tests");
BROWSER_TESTS.forEach(file=>{
  runStep(file, ()=>{
    if(!compiledAppPath)throw new Error("uebersprungen: index.html wurde in Schritt 2 nicht erfolgreich kompiliert");
    return runNodeScript(file,{...process.env,APP_SOURCE_PATH:compiledAppPath});
  });
});

// ========== Zusammenfassung ==========
section("Zusammenfassung");
results.forEach(r=>console.log((r.ok?"✅":"❌")+" "+r.name));

const failedSteps=results.filter(r=>!r.ok);
const withCounts=results.filter(r=>r.summaryLine);
const totalPassedChecks=withCounts.reduce((s,r)=>s+r.summaryLine.passed,0);
const totalFailedChecks=withCounts.reduce((s,r)=>s+r.summaryLine.failed,0);

console.log("\n"+(results.length-failedSteps.length)+"/"+results.length+" Schritte (Dateien/Checks) bestanden.");
if(withCounts.length){
  console.log("Davon mit auswertbarer Einzelpruefungs-Zusammenfassung: "+totalPassedChecks+" bestanden, "+totalFailedChecks+" fehlgeschlagen (ueber "+withCounts.length+" Dateien).");
}
if(failedSteps.length){
  console.log("\n"+failedSteps.length+" Schritt(e) fehlgeschlagen:");
  failedSteps.forEach(r=>console.log("  - "+r.name+": "+r.detail.split("\n")[0]));
  console.log("\nGESAMTERGEBNIS: FEHLGESCHLAGEN");
  process.exit(1);
}
console.log("\nGESAMTERGEBNIS: ERFOLGREICH");
process.exit(0);
