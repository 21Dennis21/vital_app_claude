/* storage.js — generischer localStorage-Wrapper.
   Phase 1 des Migrationsplans: physisch aus index.html ausgelagert, ohne
   Verhaltensaenderung (Funktionskoerper 1:1 uebernommen). Wird per normalem
   <script src="storage.js"> VOR dem <script type="text/babel">-App-Code
   geladen und ist dadurch global verfuegbar (keine ES-Module).

   load()/save() waren bereits vorher die einzigen zwei Stellen im ganzen
   Projekt mit direktem localStorage.getItem/setItem-Zugriff — daran aendert
   sich nichts. */
function load(k,d){try{const v=localStorage.getItem(k);return v?JSON.parse(v):d;}catch(e){return d;}}
function save(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}}

/* Referenz auf alle bestehenden localStorage-Key-Namen — rein informativ
   fuer spaetere Phasen. Bestehende Aufrufstellen von load()/save() in
   index.html wurden bewusst NICHT auf STORAGE_KEYS umgestellt (siehe
   Abschlussbericht Phase 1): das haette ~24 Stellen in App()/DatenexportPage/
   VerlaufView/etc. angefasst, ohne Verhaltensgewinn, und war fuer Phase 1
   nicht zwingend. Keine der bestehenden Keys wurde umbenannt. */
const STORAGE_KEYS={
  DATA:"tracker_data",
  MONTHLY_SETTINGS:"tracker_mset",
  GOALS:"tracker_goals",
  THEME:"tracker_theme",
  WEIGHT_CONFIRMATIONS:"tracker_weight_confirmations",
  FORECAST_CALIBRATION:"tracker_forecast_calibration",
  DASHBOARD:"tracker_dashboard",
  PRODUCTS:"tracker_products",
  MEAL_PRESETS:"tracker_mealpresets",
  RECIPES:"tracker_recipes",
  WEIGHT_RANGE:"tracker_weight_range",
};
