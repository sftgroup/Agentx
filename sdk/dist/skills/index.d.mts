interface BrowserAction {
    type: 'click' | 'type' | 'extract' | 'scroll' | 'navigate' | 'hover' | 'press' | 'select' | 'back' | 'forward' | 'getInfo';
    /** CSS selector or text content of the target element */
    selector?: string;
    /** Value for 'type' / 'select' actions, URL for 'navigate', key for 'press', px for 'scroll' */
    value?: string;
    /** Natural language description (fallback when no selector) */
    description?: string;
}
interface BrowserActionResult {
    success: boolean;
    result?: string;
    error?: string;
}
/** Wait for a delay (async pacing helper for agent loops). */
declare function sleep(ms: number): Promise<void>;
/**
 * Extract a text-based DOM representation from the current page.
 * Returns a simplified DOM tree with only interactive and text-containing elements.
 */
declare function extractAccessibleDOM(): string;
/**
 * Execute a single browser action directly in the DOM.
 */
declare function executeBrowserAction(action: BrowserAction): BrowserActionResult;

export { type BrowserAction, type BrowserActionResult, executeBrowserAction, extractAccessibleDOM, sleep };
