// ---------------------------------------------------------------------------
// AgentX Gateway — shared constants
// ---------------------------------------------------------------------------

/** address(0) — native token / ETH sentinel (payToken, asset, etc.). */
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

/** Known ERC20 token symbols for platform-fee display (per chain). */
export const KNOWN_ERC20_SYMBOLS: Record<string, string> = {
  '0x1c7d4b196cb0c7b01d743fbc6116a902379c7238': 'USDC', // Sepolia USDC
}

