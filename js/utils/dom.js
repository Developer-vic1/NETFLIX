export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === false || value == null) continue;
    if (key === "text") node.textContent = String(value);
    else if (key === "class") node.className = value;
    else if (key.startsWith("on") && typeof value === "function")
      node.addEventListener(key.slice(2).toLowerCase(), value);
    else node.setAttribute(key, value === true ? "" : String(value));
  }
  for (const child of [children].flat()) {
    if (child != null)
      node.append(
        child instanceof Node ? child : document.createTextNode(String(child)),
      );
  }
  return node;
}
export function button(text, onClick, className = "button", attrs = {}) {
  return el(
    "button",
    { type: "button", class: className, onclick: onClick, ...attrs },
    text,
  );
}
export function field(label, input, hint) {
  return el("label", { class: "field" }, [
    label,
    input,
    hint ? el("span", { text: hint }) : null,
  ]);
}
export function select(options, value, attrs = {}) {
  const node = el(
    "select",
    attrs,
    options.map(([key, name]) => el("option", { value: key, text: name })),
  );
  node.value = value;
  return node;
}
export function debounce(callback, delay) {
  let timer;
  const run = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => callback(...args), delay);
  };
  run.cancel = () => clearTimeout(timer);
  return run;
}
