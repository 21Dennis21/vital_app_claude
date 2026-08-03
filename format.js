/* format.js — reine Formatierungsfunktionen (kein Fachlogik-Anteil).
   Phase 1 des Migrationsplans: physisch aus index.html ausgelagert, ohne
   Verhaltensaenderung (Funktionskoerper 1:1 uebernommen). Wird per normalem
   <script src="format.js"> VOR dem <script type="text/babel">-App-Code
   geladen und ist dadurch global verfuegbar (keine ES-Module). */

/* Zahlen-Eingabe: erlaubt Komma UND Punkt, keine negativen Werte. */
function parseNum(v){
  if(v===""||v==null)return null;
  const n=parseFloat(String(v).replace(",","."));
  if(isNaN(n)||n<0)return null;
  return n;
}
function fmtNum(n,dec=1){
  if(n==null)return "0";
  const r=Math.round(n*Math.pow(10,dec))/Math.pow(10,dec);
  return String(r).replace(".",",");
}
function fmtGym(mins){return Math.floor(mins/60)+"h "+Math.round(mins%60)+"min";}
