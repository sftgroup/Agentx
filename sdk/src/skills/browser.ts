// @agentx/sdk — Browser Control Skill
// Text-based DOM manipulation for browser-side agent execution.
// No external dependencies — uses native browser APIs only.
//
// Usage:
//   import { executeBrowserAction } from '@agentxv2/sdk/skills'
//   const result = executeBrowserAction({ type: 'click', selector: '#submit' })

export interface BrowserAction {
  type: 'click' | 'type' | 'extract' | 'scroll' | 'navigate'
  /** CSS selector or text content of the target element */
  selector?: string
  /** Value for 'type' action */
  value?: string
  /** Natural language description (fallback when no selector) */
  description?: string
}

export interface BrowserActionResult {
  success: boolean
  result?: string
  error?: string
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
    const text = (el.textContent || '').trim().slice(0, 80)
    const id = el.id ? `#${el.id}` : ''
    const classes = el.className && typeof el.className === 'string'
      ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.')
      : ''
    const href = el.getAttribute('href')
    const placeholder = el.getAttribute('placeholder')
    const type = el.getAttribute('type')

    let desc = `<${tag}${id}${classes}`
    if (href) desc += ` href="${href}"`
    if (placeholder) desc += ` placeholder="${placeholder}"`
    if (type) desc += ` type="${type}"`
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
    if (!el && action.type !== 'navigate' && action.type !== 'extract') {
      return { success: false, error: `Element not found: ${action.selector || action.description}` }
    }

    switch (action.type) {
      case 'click': {
        (el as HTMLElement).click()
        return { success: true, result: 'Clicked' }
      }

      case 'type': {
        const input = el as HTMLInputElement
        input.focus()
        input.value = action.value || ''
        input.dispatchEvent(new Event('input', { bubbles: true }))
        return { success: true, result: `Typed: ${action.value}` }
      }

      case 'extract': {
        if (action.selector) {
          const content = el?.textContent || ''
          return { success: true, result: content.slice(0, 5000) }
        }
        // Extract full page accessible DOM
        return { success: true, result: extractAccessibleDOM() }
      }

      case 'scroll': {
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        } else {
          window.scrollBy({ top: action.value ? parseInt(action.value) : 500, behavior: 'smooth' })
        }
        return { success: true, result: 'Scrolled' }
      }

      case 'navigate': {
        const url = action.value || action.selector
        if (!url) return { success: false, error: 'No URL provided' }
        window.location.href = url
        return { success: true, result: `Navigating to ${url}` }
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
    if (text.includes(lower) || placeholder.includes(lower) || ariaLabel.includes(lower)) {
      return el
    }
  }

  return null
}
