// abis/SubscriptionManager.ts — v2 SubscriptionManager ABI (canonical)
//
// Single source of truth for the current on-chain SubscriptionManager.
// All consumers MUST import from here instead of defining inline ABIs.

export const SUBSCRIPTION_MANAGER_ABI = [
  { name: 'platformFeeBps', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'tokenWhitelist', type: 'function', stateMutability: 'view', inputs: [{ name: 'token', type: 'address' }], outputs: [{ name: '', type: 'bool' }] },
  { name: 'createPlan', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'agentId', type: 'uint256' }, { name: 'price', type: 'uint256' }, { name: 'period', type: 'string' }, { name: 'payToken', type: 'address' }, { name: 'trialDays', type: 'uint256' }],
    outputs: [{ name: 'planId', type: 'uint256' }] },
  { name: 'getPlan', type: 'function', stateMutability: 'view', inputs: [{ name: 'planId', type: 'uint256' }],
    outputs: [{ name: '', type: 'tuple', components: [
      { name: 'planId', type: 'uint256' }, { name: 'agentId', type: 'uint256' }, { name: 'creator', type: 'address' }, { name: 'price', type: 'uint256' }, { name: 'period', type: 'string' }, { name: 'active', type: 'bool' }, { name: 'payToken', type: 'address' }, { name: 'trialDays', type: 'uint256' }
    ] }] },
  { name: 'subscribe', type: 'function', stateMutability: 'payable', inputs: [{ name: 'planId', type: 'uint256' }], outputs: [{ name: 'subscriptionId', type: 'uint256' }] },
  { name: 'releaseFunds', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'subscriptionId', type: 'uint256' }], outputs: [] },
  { name: 'cancelSubscription', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'subscriptionId', type: 'uint256' }], outputs: [] },
  { name: 'getSubscription', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'subscriber', type: 'address' }, { name: 'agentId', type: 'uint256' }],
    outputs: [{ name: 'subscriptionId', type: 'uint256' }, { name: 'subscriber', type: 'address' }, { name: 'agentId', type: 'uint256' }, { name: 'status', type: 'uint8' }, { name: 'startedAt', type: 'uint256' }, { name: 'expiresAt', type: 'uint256' }, { name: 'period', type: 'string' }] },
  { name: 'hasActiveSubscription', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'subscriber', type: 'address' }, { name: 'agentId', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },
  { name: 'getUserSubscriptions', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }], outputs: [{ name: '', type: 'uint256[]' }] },
  { name: 'getSubscriptionDetail', type: 'function', stateMutability: 'view', inputs: [{ name: 'subscriptionId', type: 'uint256' }],
    outputs: [{ name: 'subscriptionId', type: 'uint256' }, { name: 'subscriber', type: 'address' }, { name: 'agentId', type: 'uint256' }, { name: 'status', type: 'uint8' }, { name: 'startedAt', type: 'uint256' }, { name: 'expiresAt', type: 'uint256' }, { name: 'period', type: 'string' }, { name: 'payToken', type: 'address' }, { name: 'amountPaid', type: 'uint256' }, { name: 'trialActive', type: 'bool' }, { name: 'trialEndsAt', type: 'uint256' }, { name: 'fundsReleased', type: 'bool' }] },
] as const
