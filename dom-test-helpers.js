function clickByText(doc, text, tag){
  const els = [...doc.querySelectorAll(tag||"*")];
  const el = els.find(e=>e.children.length===0 && e.textContent && e.textContent.trim()===text)
    || els.find(e=>e.getAttribute && e.getAttribute("aria-label")===text)
    || els.find(e=>e.textContent && e.textContent.includes(text) && (tag?e.tagName.toLowerCase()===tag:true));
  if(!el) throw new Error("Element mit Text nicht gefunden: "+text);
  const clickable = el.closest("[class*='dc'],button") || el;
  clickable.dispatchEvent(new (el.ownerDocument.defaultView.MouseEvent)("click",{bubbles:true,cancelable:true}));
  return clickable;
}

function setNativeInputValue(input, value){
  const proto = input.tagName.toLowerCase()==="textarea"
    ? input.ownerDocument.defaultView.HTMLTextAreaElement.prototype
    : input.ownerDocument.defaultView.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
  setter.call(input, value);
  const win = input.ownerDocument.defaultView;
  input.dispatchEvent(new win.Event("input", {bubbles:true}));
}

function blurInput(input){
  const win = input.ownerDocument.defaultView;
  // WICHTIG: "blur" selbst bubbelt nicht im DOM und erreicht daher nie
  // Reacts am Root delegierten Event-Listener. React implementiert sein
  // synthetisches onBlur intern ueber das nativ bubbelnde "focusout".
  input.dispatchEvent(new win.FocusEvent("focusout", {bubbles:true}));
}

function findInput(doc){
  return doc.querySelector("input[inputmode=decimal]") || doc.querySelector("input");
}

module.exports = { clickByText, setNativeInputValue, blurInput, findInput };
