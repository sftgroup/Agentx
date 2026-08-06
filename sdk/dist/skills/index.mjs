// src/skills/browser.ts
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function extractAccessibleDOM() {
  if (typeof document === "undefined") {
    return "Browser DOM not available (not running in browser)";
  }
  const interactiveTags = /* @__PURE__ */ new Set([
    "A",
    "BUTTON",
    "INPUT",
    "SELECT",
    "TEXTAREA",
    "FORM",
    "H1",
    "H2",
    "H3",
    "H4",
    "H5",
    "H6",
    "P",
    "SPAN",
    "DIV",
    "LI",
    "TD",
    "TH",
    "LABEL"
  ]);
  const elements = [];
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_ELEMENT,
    {
      acceptNode: (node2) => {
        if (!(node2 instanceof HTMLElement)) return NodeFilter.FILTER_REJECT;
        if (!interactiveTags.has(node2.tagName)) return NodeFilter.FILTER_REJECT;
        if (node2.offsetParent === null && node2.tagName !== "A") return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );
  let node;
  while (node = walker.nextNode()) {
    const el = node;
    const tag = el.tagName.toLowerCase();
    const text = (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 80);
    const id = el.id ? `#${el.id}` : "";
    const classes = el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : "";
    const href = el.getAttribute("href");
    const placeholder = el.getAttribute("placeholder");
    const type = el.getAttribute("type");
    const name = el.getAttribute("name");
    const role = el.getAttribute("role");
    const ariaLabel = el.getAttribute("aria-label");
    let desc = `<${tag}${id}${classes}`;
    if (href) desc += ` href="${href}"`;
    if (placeholder) desc += ` placeholder="${placeholder}"`;
    if (type) desc += ` type="${type}"`;
    if (name) desc += ` name="${name}"`;
    if (role) desc += ` role="${role}"`;
    if (ariaLabel) desc += ` aria-label="${ariaLabel}"`;
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      if (el.value) desc += ` value="${String(el.value).slice(0, 60)}"`;
      if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) {
        desc += ` checked="${el.checked}"`;
      }
    } else if (el instanceof HTMLSelectElement && el.value) {
      desc += ` value="${el.value}"`;
    } else if (el instanceof HTMLAnchorElement) {
      desc += ` target="${el.target || "_self"}"`;
    }
    desc += ">";
    if (text) desc += `${text}`;
    desc += `</${tag}>`;
    elements.push(desc);
  }
  return elements.join("\n").slice(0, 8e3);
}
function executeBrowserAction(action) {
  if (typeof document === "undefined") {
    return { success: false, error: "Not running in browser environment" };
  }
  try {
    const el = findElement(action.selector, action.description);
    const needsEl = !["navigate", "extract", "getInfo", "back", "forward", "scroll"].includes(action.type);
    if (!el && needsEl) {
      return { success: false, error: `Element not found: ${action.selector || action.description}` };
    }
    switch (action.type) {
      case "click": {
        el.click();
        return { success: true, result: "Clicked" };
      }
      case "type": {
        const input = el;
        input.focus();
        input.value = action.value || "";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        return { success: true, result: `Typed: ${action.value}` };
      }
      case "press": {
        const key = action.value || action.selector || "";
        if (!key) return { success: false, error: "No key provided for press" };
        const target = el || document.activeElement || document.body;
        const opts = { bubbles: true, cancelable: true, key };
        target.dispatchEvent(new KeyboardEvent("keydown", opts));
        target.dispatchEvent(new KeyboardEvent("keyup", opts));
        return { success: true, result: `Pressed: ${key}` };
      }
      case "hover": {
        const target = el;
        target.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
        target.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
        target.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
        return { success: true, result: `Hovered: ${action.selector || action.description || target.tagName}` };
      }
      case "select": {
        const value = action.value || "";
        if (el instanceof HTMLSelectElement) {
          el.value = value;
          el.dispatchEvent(new Event("change", { bubbles: true }));
          return { success: true, result: `Selected: ${value}` };
        }
        if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) {
          const checked = value === "" ? !el.checked : value.toLowerCase() === "true" || value === "1";
          el.checked = checked;
          el.dispatchEvent(new Event("change", { bubbles: true }));
          return { success: true, result: `Checked: ${checked}` };
        }
        return { success: false, error: `Element is not a select/checkbox/radio: ${action.selector}` };
      }
      case "extract": {
        if (action.selector) {
          const content = el?.textContent || "";
          return { success: true, result: content.slice(0, 5e3) };
        }
        return { success: true, result: extractAccessibleDOM() };
      }
      case "getInfo": {
        return {
          success: true,
          result: JSON.stringify({
            url: window.location.href,
            title: document.title,
            readyState: document.readyState,
            viewport: { width: window.innerWidth, height: window.innerHeight },
            scrollY: Math.round(window.scrollY)
          })
        };
      }
      case "scroll": {
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        } else {
          window.scrollBy({ top: action.value ? parseInt(action.value) || 500 : 500, behavior: "smooth" });
        }
        return { success: true, result: "Scrolled" };
      }
      case "navigate": {
        const url = action.value || action.selector;
        if (!url) return { success: false, error: "No URL provided" };
        window.location.href = url;
        return { success: true, result: `Navigating to ${url}` };
      }
      case "back": {
        window.history.back();
        return { success: true, result: "Navigated back" };
      }
      case "forward": {
        window.history.forward();
        return { success: true, result: "Navigated forward" };
      }
      default:
        return { success: false, error: `Unknown action type: ${action.type}` };
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
function findElement(selector, description) {
  if (selector) {
    try {
      const el = document.querySelector(selector);
      if (el) return el;
    } catch {
    }
  }
  const searchText = description || selector;
  if (!searchText) return null;
  const all = document.querySelectorAll('a, button, input, select, textarea, [role="button"]');
  const lower = searchText.toLowerCase();
  for (const el of all) {
    const text = (el.textContent || "").toLowerCase();
    const placeholder = (el.getAttribute("placeholder") || "").toLowerCase();
    const ariaLabel = (el.getAttribute("aria-label") || "").toLowerCase();
    const name = (el.getAttribute("name") || "").toLowerCase();
    if (text.includes(lower) || placeholder.includes(lower) || ariaLabel.includes(lower) || name.includes(lower)) {
      return el;
    }
  }
  return null;
}
export {
  executeBrowserAction,
  extractAccessibleDOM,
  sleep
};
//# sourceMappingURL=index.mjs.map