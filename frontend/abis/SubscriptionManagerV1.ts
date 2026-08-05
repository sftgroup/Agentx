// abis/SubscriptionManagerV1.ts — v1 SubscriptionManager ABI (LEGACY)
//
// ⚠️ Compatibility layer ONLY. The current on-chain SubscriptionManager is v2
// (see `abis/SubscriptionManager.ts`). v1 differs in struct shape:
//   - getPlan returns 10 fields (name/description/token/billingPeriod/maxUsage)
//   - getUserSubscriptions returns tuple[] (not uint256[] of ids)
//
// This ABI is kept ONLY for the legacy user-dashboard hooks
// (hooks/user/useUserSubscriptions.ts). New code MUST use the v2 ABI.

export const SUBSCRIPTION_MANAGER_V1_ABI = [
  {
    name: 'getUserSubscriptions',
    type: 'function',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [
      {
        name: '',
        type: 'tuple[]',
        components: [
          { name: 'subscriptionId', type: 'uint256' },
          { name: 'planId', type: 'uint256' },
          { name: 'agentId', type: 'uint256' },
          { name: 'subscriber', type: 'address' },
          { name: 'status', type: 'uint8' },
          { name: 'startDate', type: 'uint256' },
          { name: 'nextBillingDate', type: 'uint256' },
          { name: 'endDate', type: 'uint256' },
          { name: 'currentUsage', type: 'uint256' },
          { name: 'totalPaid', type: 'uint256' },
          { name: 'createdAt', type: 'uint256' }
        ]
      }
    ],
    stateMutability: 'view'
  },
  {
    name: 'getSubscription',
    type: 'function',
    inputs: [{ name: 'subscriptionId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'subscriptionId', type: 'uint256' },
          { name: 'planId', type: 'uint256' },
          { name: 'agentId', type: 'uint256' },
          { name: 'subscriber', type: 'address' },
          { name: 'status', type: 'uint8' },
          { name: 'startDate', type: 'uint256' },
          { name: 'nextBillingDate', type: 'uint256' },
          { name: 'endDate', type: 'uint256' },
          { name: 'currentUsage', type: 'uint256' },
          { name: 'totalPaid', type: 'uint256' },
          { name: 'createdAt', type: 'uint256' }
        ]
      }
    ],
    stateMutability: 'view'
  },
  {
    name: 'getPlan',
    type: 'function',
    inputs: [{ name: 'planId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'planId', type: 'uint256' },
          { name: 'agentId', type: 'uint256' },
          { name: 'name', type: 'string' },
          { name: 'description', type: 'string' },
          { name: 'token', type: 'address' },
          { name: 'price', type: 'uint256' },
          { name: 'billingPeriod', type: 'uint8' },
          { name: 'maxUsage', type: 'uint256' },
          { name: 'isActive', type: 'bool' },
          { name: 'createdAt', type: 'uint256' }
        ]
      }
    ],
    stateMutability: 'view'
  },
  {
    name: 'processPayment',
    type: 'function',
    inputs: [{ name: 'subscriptionId', type: 'uint256' }],
    outputs: [],
    stateMutability: 'payable'
  },
  {
    name: 'cancelSubscription',
    type: 'function',
    inputs: [{ name: 'subscriptionId', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    name: 'isSubscriptionActive',
    type: 'function',
    inputs: [{ name: 'subscriptionId', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view'
  }
] as const
