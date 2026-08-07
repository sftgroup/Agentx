// @agentx/sdk — Browser Control Skill
// Text-based DOM manipulation for browser-side agent execution.
// No external dependencies — uses native browser APIs only.
//
// Usage:
//   import { executeBrowserAction, extractAccessibleDOM, sleep } from '@agentxv2/sdk/skills'
//   const result = executeBrowserAction({ type: 'click', selector: '#submit' })
//   await sleep(300)  // optional pacing between actions

export interface BrowserAction {
  type:
    | 'click' | 'type' | 'extract' | 'scroll' | 'navigate'
    // v0.9.0 additions:
    | 'hover' | 'press' | 'select' | 'back' | 'forward' | 'getInfo'
  /** CSS selector or text content of the target element */
  selector?: string
  /** Value for 'type' / 'select' actions, URL for 'navigate', key for 'press', px for 'scroll' */
  value?: string
  /** Natural language description (fallback when no selector) */
  description?: string
}

export interface BrowserActionResult {
  success: boolean
  result?: string
  error?: string
}

/** Wait for a delay (async pacing helper for agent loops). */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Extract a text-based DOM representation from the current page.
 * Returns a simplified DOM tree with only interactive and text-containing elements.
 */
export function extractAccessibleDOM(): string {
  if (typeof document === 'undefined') {
    return 'Browser DOM not available (not running in browser)'
  }

  const interactiveTags = new Set([
    'A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'FORM',
    'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
    'P', 'SPAN', 'DIV', 'LI', 'TD', 'TH', 'LABEL',
  ])

  const elements: string[] = []
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_ELEMENT,
    {
      acceptNode: (node) => {
        if (!(node instanceof HTMLElement)) return NodeFilter.FILTER_REJECT
        if (!interactiveTags.has(node.tagName)) return NodeFilter.FILTER_REJECT
        // Skip hidden elements
        if (node.offsetParent === null && node.tagName !== 'A') return NodeFilter.FILTER_REJECT
        return NodeFilter.FILTER_ACCEPT
      },
    }
  )

  let node: Node | null
  while ((node = walker.nextNode())) {
    const el = node as HTMLElement
    const tag = el.tagName.toLowerCase()
    const text = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80)
    const id = el.id ? `#${el.id}` : ''
    const classes = el.className && typeof el.className === 'string'
      ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.')
      : ''
    const href = el.getAttribute('href')
    const placeholder = el.getAttribute('placeholder')
    const type = el.getAttribute('type')
    const name = el.getAttribute('name')
    const role = el.getAttribute('role')
    const ariaLabel = el.getAttribute('aria-label')

    let desc = `<${tag}${id}${classes}`
    if (href) desc += ` href="${href}"`
    if (placeholder) desc += ` placeholder="${placeholder}"`
    if (type) desc += ` type="${type}"`
    if (name) desc += ` name="${name}"`
    if (role) desc += ` role="${role}"`
    if (ariaLabel) desc += ` aria-label="${ariaLabel}"`

    // Form value / state — makes the snapshot actionable for the agent.
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      if (el.value) desc += ` value="${String(el.value).slice(0, 60)}"`
      if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
        desc += ` checked="${el.checked}"`
      }
    } else if (el instanceof HTMLSelectElement && el.value) {
      desc += ` value="${el.value}"`
    } else if (el instanceof HTMLAnchorElement) {
      desc += ` target="${el.target || '_self'}"`
    }

    desc += '>'
    if (text) desc += `${text}`
    desc += `</${tag}>`

    elements.push(desc)
  }

  return elements.join('\n').slice(0, 8000)  // cap at ~8K chars
}

/**
 * Execute a single browser action directly in the DOM.
 */
export function executeBrowserAction(action: BrowserAction): BrowserActionResult {
  if (typeof document === 'undefined') {
    return { success: false, error: 'Not running in browser environment' }
  }

  try {
    const el = findElement(action.selector, action.description)
    const needsEl = !['navigate', 'extract', 'getInfo', 'back', 'forward', 'scroll'].includes(action.type)
    if (!el && needsEl) {
      return { success: false, error: `Element not found: ${action.selector || action.description}` }
    }

    switch (action.type) {
      case 'click': {
        (el as HTMLElement).click()
        return { success: true, result: 'Clicked' }
      }

      case 'type': {
        const input = el as HTMLInputElement | HTMLTextAreaElement
        input.focus()
        input.value = action.value || ''
        input.dispatchEvent(new Event('input', { bubbles: true }))
        input.dispatchEvent(new Event('change', { bubbles: true }))
        return { success: true, result: `Typed: ${action.value}` }
      }

      case 'press': {
        const key = action.value || action.selector || ''
        if (!key) return { success: false, error: 'No key provided for press' }
        const target = (el || document.activeElement || document.body) as Element
        const opts = { bubbles: true, cancelable: true, key }
        target.dispatchEvent(new KeyboardEvent('keydown', opts))
        target.dispatchEvent(new KeyboardEvent('keyup', opts))
        return { success: true, result: `Pressed: ${key}` }
      }

      case 'hover': {
        const target = el as HTMLElement
        target.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
        target.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
        target.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }))
        return { success: true, result: `Hovered: ${action.selector || action.description || target.tagName}` }
      }

      case 'select': {
        const value = action.value || ''
        if (el instanceof HTMLSelectElement) {
          el.value = value
          el.dispatchEvent(new Event('change', { bubbles: true }))
          return { success: true, result: `Selected: ${value}` }
        }
        if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
          const checked = value === '' ? !el.checked : value.toLowerCase() === 'true' || value === '1'
          el.checked = checked
          el.dispatchEvent(new Event('change', { bubbles: true }))
          return { success: true, result: `Checked: ${checked}` }
        }
        return { success: false, error: `Element is not a select/checkbox/radio: ${action.selector}` }
      }

      case 'extract': {
        if (action.selector) {
          const content = el?.textContent || ''
          return { success: true, result: content.slice(0, 5000) }
        }
        // Extract full page accessible DOM
        return { success: true, result: extractAccessibleDOM() }
      }

      case 'getInfo': {
        return {
          success: true,
          result: JSON.stringify({
            url: window.location.href,
            title: document.title,
            readyState: document.readyState,
            viewport: { width: window.innerWidth, height: window.innerHeight },
            scrollY: Math.round(window.scrollY),
          }),
        }
      }

      case 'scroll': {
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        } else {
          window.scrollBy({ top: action.value ? parseInt(action.value) || 500 : 500, behavior: 'smooth' })
        }
        return { success: true, result: 'Scrolled' }
      }

      case 'navigate': {
        const url = action.value || action.selector
        if (!url) return { success: false, error: 'No URL provided' }
        window.location.href = url
        return { success: true, result: `Navigating to ${url}` }
      }

      case 'back': {
        window.history.back()
        return { success: true, result: 'Navigated back' }
      }

      case 'forward': {
        window.history.forward()
        return { success: true, result: 'Navigated forward' }
      }

      default:
        return { success: false, error: `Unknown action type: ${(action as any).type}` }
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

function findElement(selector?: string, description?: string): Element | null {
  // Try CSS selector first
  if (selector) {
    try {
      const el = document.querySelector(selector)
      if (el) return el
    } catch { /* invalid selector */ }
  }

  // Fallback: text content search
  const searchText = description || selector
  if (!searchText) return null

  const all = document.querySelectorAll('a, button, input, select, textarea, [role="button"]')
  const lower = searchText.toLowerCase()
  for (const el of all) {
    const text = (el.textContent || '').toLowerCase()
    const placeholder = (el.getAttribute('placeholder') || '').toLowerCase()
    const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase()
    const name = (el.getAttribute('name') || '').toLowerCase()
    if (text.includes(lower) || placeholder.includes(lower) || ariaLabel.includes(lower) || name.includes(lower)) {
      return el
    }
  }

  return null
}
