// ---------------------------------------------------------------------------
// AgentX — Unified Gateway client
// ---------------------------------------------------------------------------
// Single source of truth for the Gateway base URL and authenticated fetches.
// All frontend Gateway access should import from here instead of reading
// NEXT_PUBLIC_AGENTX_GATEWAY_URL directly.
// ---------------------------------------------------------------------------

const RAW_GATEWAY_URL = process.env.NEXT_PUBLIC_AGENTX_GATEWAY_URL || ''

/** Canonical Gateway base URL — falls back to the default local Gateway. */
export const GATEWAY_URL = RAW_GATEWAY_URL || 'http://localhost:3090'

/**
 * Gateway base URL as configured ('' when unset). Use at feature-detect call
 * sites that must distinguish "configured" from "offline / not configured".
 */
export const GATEWAY_URL_OPTIONAL = RAW_GATEWAY_URL

/** Fetch helper bound to the Gateway base URL (path must not include the origin). */
export function gatewayFetch(path: string, init?: RequestInit): Promise<Response> {
  const url = path.startsWith('/') ? path : `/${path}`
  return fetch(`${GATEWAY_URL}${url}`, init)
}
