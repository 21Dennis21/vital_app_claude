const { JSDOM, VirtualConsole } = require("jsdom");
const fs = require("fs");
const { installFixedDate } = require("./test-utils/fixed-date.js");

const appSource = fs.readFileSync(process.env.APP_SOURCE_PATH||"/tmp/app_compiled.js", "utf-8");

/* opts.now (optional): fixiert die Systemzeit dieses Windows auf einen
   festen Zeitpunkt (new Date(2026,7,2,12,0,0) statt der echten
   Container-Uhr) — fuer Tests, die ein bestimmtes Kalenderdatum als
   "heute" voraussetzen und deshalb unabhaengig vom tatsaechlichen
   Ausfuehrungstag deterministisch bleiben muessen. Ohne opts.now verhaelt
   sich createApp exakt wie zuvor (echte Systemzeit). */
function createApp(seedFn, opts){
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("error", (e)=>console.error("[jsdom console.error]", e));
  virtualConsole.on("jsdomError", (e)=>console.error("[jsdom internal error]", e.message, e.detail||""));
  virtualConsole.on("log", (...a)=>console.log("[app]", ...a));

  const dom = new JSDOM(
    `<!DOCTYPE html><html><head></head><body><div id="root"></div></body></html>`,
    { url: "http://localhost/", pretendToBeVisual: true, storageQuota: 50_000_000, virtualConsole, runScripts:"outside-only" }
  );
  const { window } = dom;
  /* Muss VOR dem App-Eval passieren (siehe Kommentar an installFixedDate) —
     window.Date wird hier ueberschrieben, bevor irgendein App-Code laeuft. */
  if(opts && opts.now) installFixedDate(window, opts.now);
  window.addEventListener("error", (e)=>{
    console.error("[window error]", e.error ? e.error.stack : e.message);
  });
  window.requestAnimationFrame = (cb)=>setTimeout(cb,0);
  window.navigator.vibrate = ()=>{};
  window.HTMLElement.prototype.attachEvent = window.HTMLElement.prototype.attachEvent || function(){};
  window.HTMLElement.prototype.detachEvent = window.HTMLElement.prototype.detachEvent || function(){};

  /* WICHTIG: global.window MUSS gesetzt sein, BEVOR react-dom ueberhaupt
     zum ersten Mal per require() geladen wird — react-dom prueft beim
     Modul-Laden einmalig canUseDOM anhand des globalen "window" und
     initialisiert bei fehlendem window einen eingeschraenkten Modus, in
     dem die native Root-Event-Verkabelung nicht richtig greift. Node
     cached require()-Ergebnisse, daher reicht es NICHT, das nur beim
     ALLERERSTEN Aufruf zu tun — es muss vor JEDEM ersten Laden des Moduls
     im Prozess passieren, deshalb hier drin statt am Dateianfang. */
  global.window = window;
  global.document = window.document;
  global.navigator = window.navigator;
  const React = require("react");
  const ReactDOMClient = require("react-dom/client");
  window.React = React;
  window.ReactDOM = ReactDOMClient;

  if(seedFn) seedFn(window);

  try{
    dom.window.eval(appSource);
  }catch(e){
    console.error("[eval error]", e.message);
    console.error(e.stack.split("\n").slice(0,15).join("\n"));
  }

  return dom;
}

function flush(dom){
  return new Promise(resolve=>setTimeout(resolve,20));
}

module.exports = { createApp, flush };
