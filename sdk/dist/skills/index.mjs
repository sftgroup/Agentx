// src/skills/browser.ts
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
    const text = (el.textContent || "").trim().slice(0, 80);
    const id = el.id ? `#${el.id}` : "";
    const classes = el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : "";
    const href = el.getAttribute("href");
    const placeholder = el.getAttribute("placeholder");
    const type = el.getAttribute("type");
    let desc = `<${tag}${id}${classes}`;
    if (href) desc += ` href="${href}"`;
    if (placeholder) desc += ` placeholder="${placeholder}"`;
    if (type) desc += ` type="${type}"`;
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
    if (!el && action.type !== "navigate" && action.type !== "extract") {
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
        return { success: true, result: `Typed: ${action.value}` };
      }
      case "extract": {
        if (action.selector) {
          const content = el?.textContent || "";
          return { success: true, result: content.slice(0, 5e3) };
        }
        return { success: true, result: extractAccessibleDOM() };
      }
      case "scroll": {
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        } else {
          window.scrollBy({ top: action.value ? parseInt(action.value) : 500, behavior: "smooth" });
        }
        return { success: true, result: "Scrolled" };
      }
      case "navigate": {
        const url = action.value || action.selector;
        if (!url) return { success: false, error: "No URL provided" };
        window.location.href = url;
        return { success: true, result: `Navigating to ${url}` };
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
    if (text.includes(lower) || placeholder.includes(lower) || ariaLabel.includes(lower)) {
      return el;
    }
  }
  return null;
}
export {
  executeBrowserAction,
  extractAccessibleDOM
};
//# sourceMappingURL=index.mjs.map