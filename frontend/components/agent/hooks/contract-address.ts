// components/agent/hooks/contract-address.ts
// Shared contract-address validation for all agent hooks. Env vars are
// validated at module load and fall back to address(0) so the app never
// crashes on a misconfigured RPC / missing NEXT_PUBLIC_* address.
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as `0x${string}`

export function validateAddress(address: string | undefined): `0x${string}` {
  if (!address || !address.startsWith('0x') || address.length !== 42) {
    console.error('Invalid contract address:', address)
    return ZERO_ADDRESS
  }
  return address as `0x${string}`
}
