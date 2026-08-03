/* Installiert eine feste, deterministische Systemzeit in einem jsdom-Window.

   MUSS aufgerufen werden, BEVOR der App-Code (aus index.html kompiliert) im
   selben Window ausgewertet wird: die App liest beim Laden einmalig
   "const NOW=new Date()" (globale Konstante), und mehrere Stellen (z.B. der
   useCurrentDay()-Hook) rufen ebenfalls new Date() ohne Argumente auf. Nur
   wenn Date bereits VOR dem Laden ueberschrieben ist, sehen alle diese
   Stellen konsistent dieselbe feste Zeit.

   Erweitert die ECHTE Date-Klasse des jeweiligen Windows (statt eine
   eigene Klasse nachzubauen), damit ALLE Instanzmethoden (getFullYear,
   getMonth, getDate, toISOString, ...) UND alle statischen Methoden
   (Date.parse, Date.UTC) unveraendert und korrekt funktionieren — nur der
   ARGUMENTLOSE Konstruktor und Date.now() liefern die feste Zeit. Jeder
   Aufruf mit Argumenten (new Date(2026,7,2), new Date(iso-string), ...)
   verhaelt sich exakt wie das echte Date. */
function installFixedDate(win, fixedDate){
  const RealDate=win.Date;
  const fixedTime=fixedDate.getTime();
  class FixedDate extends RealDate{
    constructor(...args){
      if(args.length===0){
        super(fixedTime);
      }else{
        super(...args);
      }
    }
    static now(){
      return fixedTime;
    }
  }
  win.Date=FixedDate;
  return function restoreRealDate(){
    win.Date=RealDate;
  };
}

module.exports={installFixedDate};
