// The native select remains the source of truth for forms, validation and listeners.
import { getLocalization } from "../services/localization.service.js";
const text = (key) => ({ es: { choose: "Seleccionar una opción", empty: "Seleccionar", required: "Selecciona una opción para continuar." }, en: { choose: "Select an option", empty: "Select", required: "Select an option to continue." }, it: { choose: "Seleziona un'opzione", empty: "Seleziona", required: "Seleziona un'opzione per continuare." }, ar: { choose: "اختر خيارًا", empty: "اختيار", required: "اختر خيارًا للمتابعة." } }[getLocalization().language] || { choose: "Select an option", empty: "Select", required: "Select an option to continue." })[key];
let sequence = 0;
const owned = new WeakMap();
const enhancedRoots = new WeakMap();

function labelFor(select) {
  if (select.getAttribute("aria-label")) return select.getAttribute("aria-label");
  if (select.getAttribute("aria-labelledby")) return "";
  return [...(select.labels || [])].map((label) => {
    const directText = [...label.childNodes].filter((node) => node.nodeType === 3)
      .map((node) => node.textContent.trim()).filter(Boolean).join(" ");
    return directText || label.textContent.trim();
  }).join(" ") || select.name || text("choose");
}

function createSelect(select) {
  const doc = select.ownerDocument;
  const win = doc.defaultView;
  const abort = new AbortController();
  const listen = (node, type, handler, options = {}) => node.addEventListener(type, handler, { ...options, signal: abort.signal });
  const original = { tabindex: select.getAttribute("tabindex"), ariaHidden: select.getAttribute("aria-hidden") };
  const accessibleLabel = labelFor(select);
  const wrapper = doc.createElement("span");
  wrapper.className = "custom-select";
  const trigger = doc.createElement("button");
  trigger.type = "button";
  trigger.className = "custom-select__trigger";
  if (original.tabindex != null) trigger.tabIndex = Number(original.tabindex);
  trigger.setAttribute("role", "combobox");
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  trigger.id = `custom-select-${++sequence}`;
  const value = doc.createElement("span");
  value.className = "custom-select__value";
  const chevron = doc.createElement("span");
  chevron.className = "custom-select__chevron";
  chevron.setAttribute("aria-hidden", "true");
  trigger.append(value, chevron);
  const error = doc.createElement("span");
  error.id = `${trigger.id}-error`;
  error.className = "custom-select__error";
  error.setAttribute("role", "alert");
  error.hidden = true;
  wrapper.append(trigger, error);
  select.after(wrapper);
  select.classList.add("custom-select__native");
  select.tabIndex = -1;
  select.setAttribute("aria-hidden", "true");
  const list = doc.createElement("div");
  list.className = "custom-select__list";
  list.id = `${trigger.id}-list`;
  list.setAttribute("role", "listbox");
  list.setAttribute("aria-labelledby", trigger.id);
  list.hidden = true;
  trigger.setAttribute("aria-controls", list.id);
  let open = false;
  let activeIndex = -1;
  let optionsSignature = "";
  let typed = "";
  let typingTimer;
  let openAbort;
  let invalidShown = false;

  const disabledOption = (option) => option.disabled || (option.parentElement?.tagName === "OPTGROUP" && option.parentElement.disabled);
  const enabledIndices = () => [...select.options].flatMap((option, index) => disabledOption(option) || option.hidden ? [] : [index]);
  const setActive = (index) => {
    activeIndex = index;
    [...list.querySelectorAll('[role="option"]')].forEach((item) => item.classList.toggle("is-active", Number(item.dataset.index) === index));
    if (index >= 0 && open) {
      trigger.setAttribute("aria-activedescendant", `${trigger.id}-option-${index}`);
      const item = list.querySelector(`[data-index="${index}"]`);
      if (item) {
        // Scroll only the list, so keyboard navigation never moves the page.
        const top = item.offsetTop;
        if (top < list.scrollTop) list.scrollTop = top;
        else if (top + item.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = top + item.offsetHeight - list.clientHeight;
      }
    } else trigger.removeAttribute("aria-activedescendant");
  };
  const position = () => {
    if (!open) return;
    const bounds = trigger.getBoundingClientRect();
    const viewportHeight = win.visualViewport?.height || win.innerHeight;
    const viewportWidth = win.visualViewport?.width || win.innerWidth;
    const below = viewportHeight - bounds.bottom - 12;
    const above = bounds.top - 12;
    const upward = below < Math.min(list.scrollHeight, 260) && above > below;
    const height = Math.max(44, Math.min(320, upward ? above : below));
    const width = Math.min(Math.max(bounds.width, 180), viewportWidth - 24);
    list.style.width = `${width}px`;
    list.style.maxHeight = `${height}px`;
    list.style.left = `${Math.max(12, Math.min(bounds.left, viewportWidth - width - 12))}px`;
    list.style.top = upward ? "auto" : `${bounds.bottom + 6}px`;
    list.style.bottom = upward ? `${win.innerHeight - bounds.top + 6}px` : "auto";
    list.classList.toggle("is-above", upward);
  };
  const close = (focus = false) => {
    open = false;
    list.hidden = true;
    wrapper.classList.remove("is-open");
    trigger.setAttribute("aria-expanded", "false");
    trigger.removeAttribute("aria-activedescendant");
    openAbort?.abort();
    openAbort = null;
    clearTimeout(typingTimer);
    typed = "";
    if (focus && select.isConnected) trigger.focus({ preventScroll: true });
  };
  const sync = () => {
    const signature = JSON.stringify([...select.options].map((option) => [option.label, option.value, option.hidden, disabledOption(option), option.parentElement?.label]));
    if (signature !== optionsSignature) {
      optionsSignature = signature;
      list.replaceChildren();
      let previousGroup;
      [...select.options].forEach((option, index) => {
        if (option.hidden) return;
        const group = option.parentElement?.tagName === "OPTGROUP" ? option.parentElement.label : "";
        if (group && group !== previousGroup) {
          const heading = doc.createElement("div");
          heading.className = "custom-select__group";
          heading.setAttribute("role", "presentation");
          heading.textContent = group;
          list.append(heading);
        }
        previousGroup = group;
        const item = doc.createElement("div");
        item.id = `${trigger.id}-option-${index}`;
        item.dataset.index = String(index);
        item.className = "custom-select__option";
        item.setAttribute("role", "option");
        item.setAttribute("aria-disabled", String(disabledOption(option)));
        item.textContent = option.label;
        list.append(item);
      });
    }
    value.textContent = select.selectedOptions[0]?.label || text("empty");
    trigger.disabled = select.matches(":disabled");
    trigger.setAttribute("aria-required", String(select.required));
    const labelledBy = select.getAttribute("aria-labelledby");
    if (labelledBy) trigger.setAttribute("aria-labelledby", labelledBy);
    else trigger.setAttribute("aria-label", select.getAttribute("aria-label") || accessibleLabel);
    if (select.validity.valid) invalidShown = false;
    error.hidden = !invalidShown;
    if (invalidShown) error.textContent = select.validity.valueMissing ? text("required") : select.validationMessage;
    for (const name of ["aria-invalid"]) {
      if (select.hasAttribute(name)) trigger.setAttribute(name, select.getAttribute(name));
      else if (name !== "aria-invalid" || select.validity.valid) trigger.removeAttribute(name);
    }
    const description = [select.getAttribute("aria-describedby"), invalidShown ? error.id : ""].filter(Boolean).join(" ");
    if (description) trigger.setAttribute("aria-describedby", description);
    else trigger.removeAttribute("aria-describedby");
    if (invalidShown) trigger.setAttribute("aria-invalid", "true");
    [...list.querySelectorAll('[role="option"]')].forEach((item) => item.setAttribute("aria-selected", String(Number(item.dataset.index) === select.selectedIndex)));
    if (trigger.disabled) close();
    else if (open) {
      setActive(enabledIndices().includes(activeIndex) ? activeIndex : enabledIndices()[0] ?? -1);
      position();
    }
  };
  const show = () => {
    sync();
    if (trigger.disabled) return;
    // A modal dialog makes outside descendants inert; keep its list inside it.
    (select.closest("dialog") || doc.body).append(list);
    open = true;
    list.hidden = false;
    wrapper.classList.add("is-open");
    trigger.setAttribute("aria-expanded", "true");
    position();
    setActive(enabledIndices().includes(select.selectedIndex) ? select.selectedIndex : enabledIndices()[0] ?? -1);
    openAbort = new AbortController();
    const signal = openAbort.signal;
    doc.addEventListener("pointerdown", (event) => {
      if (!wrapper.contains(event.target) && !list.contains(event.target)) close();
    }, { signal, capture: true });
    doc.addEventListener("focusin", (event) => {
      if (!wrapper.contains(event.target) && !list.contains(event.target)) close();
    }, { signal });
    win.addEventListener("resize", position, { signal });
    doc.addEventListener("scroll", (event) => { if (event.target !== list) position(); }, { signal, capture: true, passive: true });
  };
  const choose = (index) => {
    if (index < 0 || disabledOption(select.options[index])) return;
    const changed = select.selectedIndex !== index;
    select.selectedIndex = index;
    sync();
    close(true);
    if (changed) {
      select.dispatchEvent(new Event("input", { bubbles: true }));
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
  };
  listen(trigger, "click", (event) => {
    event.preventDefault();
    open ? close() : show();
  });
  listen(trigger, "keydown", (event) => {
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      if (!open) show();
      const indices = enabledIndices();
      const current = indices.indexOf(activeIndex);
      const next = event.key === "Home" ? 0 : event.key === "End" ? indices.length - 1 : Math.max(0, Math.min(indices.length - 1, current + (event.key === "ArrowDown" ? 1 : -1)));
      setActive(indices[next] ?? -1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      open ? choose(activeIndex) : show();
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === "Tab") close();
    else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      if (!open) show();
      clearTimeout(typingTimer);
      typed += event.key.toLocaleLowerCase();
      const query = [...typed].every((character) => character === typed[0]) ? typed[0] : typed;
      const indices = enabledIndices();
      const start = query.length === 1 ? indices.indexOf(activeIndex) + 1 : 0;
      const rotated = indices.slice(start).concat(indices.slice(0, start));
      const found = rotated.find((index) => select.options[index].label.trim().toLocaleLowerCase().startsWith(query));
      if (found != null) setActive(found);
      typingTimer = setTimeout(() => { typed = ""; }, 700);
    }
  });
  listen(list, "pointerdown", (event) => event.preventDefault());
  listen(list, "click", (event) => {
    const item = event.target.closest('[role="option"]');
    if (item && item.getAttribute("aria-disabled") !== "true") choose(Number(item.dataset.index));
  });
  listen(select, "input", sync);
  listen(select, "change", sync);
  listen(select, "focus", () => trigger.focus());
  listen(select, "click", (event) => {
    event.preventDefault();
    trigger.focus();
    if (!open) show();
  });
  const dialog = select.closest("dialog");
  if (dialog) {
    listen(dialog, "close", () => close());
    listen(dialog, "cancel", () => close());
  }
  listen(select, "invalid", (event) => {
    event.preventDefault();
    invalidShown = true;
    sync();
    trigger.focus();
  });
  sync();
  return {
    select, sync,
    destroy() {
      close();
      abort.abort();
      list.remove();
      wrapper.remove();
      select.classList.remove("custom-select__native");
      if (original.tabindex == null) select.removeAttribute("tabindex");
      else select.setAttribute("tabindex", original.tabindex);
      if (original.ariaHidden == null) select.removeAttribute("aria-hidden");
      else select.setAttribute("aria-hidden", original.ariaHidden);
      owned.delete(select);
    },
  };
}

/** Enhance current and later single selects. Call the returned function on teardown. */
export function enhanceSelects(root = document) {
  if (enhancedRoots.has(root)) return enhancedRoots.get(root);
  const controllers = new Map();
  let stopped = false;
  let queued = false;
  const eligible = (select) => !select.multiple && select.size <= 1 && !select.hasAttribute("data-native-select");
  const scan = () => {
    if (stopped) return;
    for (const [select, controller] of controllers) {
      if (!root.contains(select) || !eligible(select)) {
        controller.destroy();
        controllers.delete(select);
      } else controller.sync();
    }
    const selects = [...root.querySelectorAll("select")];
    if (root.matches?.("select")) selects.unshift(root);
    for (const select of selects) {
      if (!eligible(select) || owned.has(select)) continue;
      const controller = createSelect(select);
      controllers.set(select, controller);
      owned.set(select, controller);
    }
  };
  const queue = () => {
    if (queued || stopped) return;
    queued = true;
    queueMicrotask(() => { queued = false; scan(); });
  };
  const observer = new MutationObserver((mutations) => {
    // Ignore our trigger/list rendering and unrelated progress updates. Otherwise
    // synchronizing text would itself schedule another observer pass indefinitely.
    const affectsSelect = mutations.some((mutation) => {
      const target = mutation.target.nodeType === 1 ? mutation.target : mutation.target.parentElement;
      if (target?.matches("select, option, optgroup, fieldset")) return true;
      if (mutation.type !== "childList") return false;
      return [...mutation.addedNodes, ...mutation.removedNodes].some((node) => node.nodeType === 1 && (node.matches("select") || node.querySelector("select")));
    });
    if (affectsSelect) queue();
  });
  scan();
  observer.observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["disabled", "required", "multiple", "size", "selected", "label", "value", "hidden", "data-native-select", "aria-label", "aria-labelledby", "aria-describedby", "aria-invalid"] });
  const onReset = () => setTimeout(queue, 0);
  root.addEventListener("reset", onReset, true);
  const cleanup = () => {
    stopped = true;
    observer.disconnect();
    root.removeEventListener("reset", onReset, true);
    for (const controller of controllers.values()) controller.destroy();
    controllers.clear();
    enhancedRoots.delete(root);
  };
  enhancedRoots.set(root, cleanup);
  return cleanup;
}
