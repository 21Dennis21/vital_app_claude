/* nutrition-engine.js — reine Ernaehrungslogik (Phase 2F des
   Migrationsplans). Physisch aus index.html ausgelagert, ohne
   Verhaltensaenderung (Funktionskoerper 1:1 uebernommen). Wird per
   normalem <script src="nutrition-engine.js"> nach goal-engine.js und vor
   dem <script type="text/babel">-App-Code geladen und ist dadurch global
   verfuegbar (keine ES-Module).

   Oeffentliche API (von FoodSearchSheet, MealBuilderPage, CreateFoodFlow,
   MealDetailSheet, AmountPage, EigeneRezeptePage, CalorieBreakdownSheet
   verwendet):
     macroTargets(weight,fat,budgetKcal)
     matchesQuery(item,q)
     relevanceRank(item,q)
     sortByRelevance(list,q)
     servingOptions(p)
     nutrientsFor(p,amount,unitKey)
     mealTotals(meal,products)
     portionLabel(p)
     displayKcal(p)

   Keine JSX-Komponenten, keine React-Hooks, keine DOM-Zugriffe.
   macroTargets() nutzt zur Laufzeit die globale Funktion leanMass()
   (weight-engine.js); servingOptions()/nutrientsFor()/portionLabel() nutzen
   parseNum()/fmtNum() (format.js) sowie die globale Konstante NUT_ALL aus
   index.html (dort auch fuer die Formular-Generierung in JSX verwendet,
   bleibt daher dort). Deren tatsaechlicher Aufruf erfolgt erst beim
   React-Render, nachdem alle Skripte vollstaendig geladen sind, daher
   spielt die Ladereihenfolge dafuer keine Rolle. */

/* Makro-Ziele: Eiweiss und Fett nach Koerpergewicht (evidenzbasierte Spanne
   aus der Sporternaehrung), Kohlenhydrate fuellen den Rest des Budgets.
   - Eiweiss: 2,0 g/kg Magermasse (Spanne 1,6-2,2 g/kg im Kaloriendefizit)
   - Fett: 0,9 g/kg Gesamtgewicht (Spanne 0,8-1,0 g/kg, Minimum fuers Hormonsystem)
   - Kohlenhydrate: Rest des Budgets in Gramm (4 kcal/g) */
function macroTargets(weight,fat,budgetKcal){
  if(!weight||!budgetKcal)return {carbs:0,protein:0,fat:0};
  const protein=Math.round(leanMass(weight,fat)*2.0);
  const fatG=Math.round(weight*0.9);
  const remainingKcal=Math.max(0,budgetKcal-protein*4-fatG*9);
  const carbs=Math.round(remainingKcal/4);
  return {carbs,protein,fat:fatG};
}

/* ===== INTELLIGENTE SUCHE =====
   Sortiert Treffer nach Relevanz statt nur alphabetisch/Einfuegereihenfolge:
   Favoriten > Zuletzt verwendet > Haeufig verwendet > exakte Treffer >
   aehnliche Treffer. matchesQuery() prueft weiterhin volle Woerter,
   Teilbegriffe, Marke, Kategorie UND Barcode. */
function matchesQuery(item,q){
  if(!q)return true;
  const hay=[item.name,item.brand,item.category,item.barcode].filter(Boolean).join(" ").toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every(t=>hay.includes(t));
}
function relevanceRank(item,q){
  const ql=(q||"").toLowerCase().trim();
  const nameL=(item.name||"").toLowerCase();
  const exact=ql&&nameL===ql;
  const startsWith=ql&&nameL.startsWith(ql);
  // Niedriger Wert = weiter oben. Reihenfolge exakt wie gefordert.
  if(item.favorite)return 0;
  if(item.lastUsed)return 1;
  if((item.useCount||0)>0)return 2;
  if(exact||startsWith)return 3;
  return 4;
}
function sortByRelevance(list,q){
  return [...list].sort((a,b)=>{
    const ra=relevanceRank(a,q),rb=relevanceRank(b,q);
    if(ra!==rb)return ra-rb;
    // Innerhalb derselben Stufe: haeufiger genutzt / zuletzt genutzt zuerst
    if((b.useCount||0)!==(a.useCount||0))return (b.useCount||0)-(a.useCount||0);
    return (b.lastUsed||0)-(a.lastUsed||0);
  });
}

/* ===== EINHEITEN & BERECHNUNG =====
   Liefert die waehlbaren Einheiten eines Produkts. factorPer = wie viele
   "Basis-Einheiten" eine eingegebene Einheit entspricht. */
function servingOptions(p){
  const opts=[];
  if(p.basis==="100ml")opts.push({key:"ml",label:"ml",factor:1/100});
  else if(p.basis==="piece")opts.push({key:"piece",label:"Stück",factor:1});
  else if(p.basis==="portion")opts.push({key:"portion",label:p.portionName||"Portion",factor:1});
  else opts.push({key:"g",label:"g",factor:1/100});
  const ps=parseNum(p.portionSize);
  if((p.basis==="100g"||p.basis==="100ml")&&ps)
    opts.push({key:"portion",label:p.portionName||"Portion",factor:ps/100});
  return opts;
}
/* Rechnet alle Naehrwerte eines Produkts auf eine Menge hoch. */
function nutrientsFor(p,amount,unitKey){
  const opt=servingOptions(p).find(o=>o.key===unitKey)||servingOptions(p)[0];
  const f=(parseNum(amount)||0)*opt.factor;
  const out={};
  NUT_ALL.forEach(n=>{
    const base=parseNum(p[n.k]);
    if(base!=null)out[n.k]=Math.round(base*f*100)/100;
  });
  out.kcal=Math.round((parseNum(p.kcal)||0)*f);
  return out;
}
/* Gesamtwerte einer eigenen Mahlzeit aus ihren Bestandteilen. */
function mealTotals(meal,products){
  const t={kcal:0,carbs:0,protein:0,fat:0};
  (meal.items||[]).forEach(it=>{
    const p=products.find(x=>x.id===it.productId);
    if(!p)return;
    const n=nutrientsFor(p,it.amount,it.unit);
    t.kcal+=n.kcal||0;t.carbs+=n.carbs||0;t.protein+=n.protein||0;t.fat+=n.fat||0;
  });
  return {kcal:Math.round(t.kcal),carbs:Math.round(t.carbs*10)/10,
    protein:Math.round(t.protein*10)/10,fat:Math.round(t.fat*10)/10};
}
/* Kurzbeschreibung der Standardportion, z.B. "Riegel (25 g)" oder "100 g" */
function portionLabel(p){
  const ps=parseNum(p.portionSize);
  if(p.basis==="piece")return "1 Stück";
  if(p.basis==="portion")return p.portionName||"1 Portion";
  const unit=p.basis==="100ml"?"ml":"g";
  if(ps)return (p.portionName||"Portion")+" ("+fmtNum(ps,0)+" "+unit+")";
  return "100 "+unit;
}
/* Kalorien der Standardportion — fuer die Anzeige in Trefferlisten. */
function displayKcal(p){
  const opts=servingOptions(p);
  const opt=opts.find(o=>o.key==="portion")||opts[0];
  const amount=opt.key==="portion"||opt.key==="piece"?1:100;
  return nutrientsFor(p,amount,opt.key).kcal;
}
