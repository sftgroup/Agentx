// abis/ReputationRegistry.ts — ReputationRegistry ABI (canonical)
//
// Single source of truth for on-chain ReputationRegistry reads/writes.
// Consumers MUST import from here instead of defining inline ABIs.

export const REPUTATION_REGISTRY_ABI = [
  // ── Feedback functions ──────────────────────────────────────────────────
  {
    name: 'giveFeedback',
    type: 'function',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'score', type: 'uint8' },
      { name: 'tag1', type: 'bytes32' },
      { name: 'tag2', type: 'bytes32' },
      { name: 'fileuri', type: 'string' },
      { name: 'filehash', type: 'bytes32' },
      { name: 'feedbackAuth', type: 'bytes' }
    ],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    name: 'revokeFeedback',
    type: 'function',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'feedbackIndex', type: 'uint64' }
    ],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    name: 'appendResponse',
    type: 'function',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'clientAddress', type: 'address' },
      { name: 'feedbackIndex', type: 'uint64' },
      { name: 'responseUri', type: 'string' },
      { name: 'responseHash', type: 'bytes32' }
    ],
    outputs: [],
    stateMutability: 'nonpayable'
  },

  // ── Query functions ─────────────────────────────────────────────────────
  {
    name: 'getReputationSummary',
    type: 'function',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'clientAddresses', type: 'address[]' },
      { name: 'tag1', type: 'bytes32' },
      { name: 'tag2', type: 'bytes32' }
    ],
    outputs: [
      { name: 'count', type: 'uint64' },
      { name: 'averageScore', type: 'uint8' }
    ],
    stateMutability: 'view'
  },
  {
    name: 'getReputationSummaryDetailed',
    type: 'function',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'clientAddresses', type: 'address[]' },
      { name: 'tag1', type: 'bytes32' },
      { name: 'tag2', type: 'bytes32' }
    ],
    outputs: [
      { name: 'count', type: 'uint64' },
      { name: 'totalScore', type: 'uint256' },
      { name: 'averageScorePrecise', type: 'uint16' }
    ],
    stateMutability: 'view'
  },
  {
    name: 'readFeedback',
    type: 'function',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'clientAddress', type: 'address' },
      { name: 'index', type: 'uint64' }
    ],
    outputs: [
      { name: 'score', type: 'uint8' },
      { name: 'tag1', type: 'bytes32' },
      { name: 'tag2', type: 'bytes32' },
      { name: 'isRevoked', type: 'bool' }
    ],
    stateMutability: 'view'
  },
  {
    name: 'getClients',
    type: 'function',
    inputs: [{ name: 'agentId', type: 'uint256' }],
    outputs: [{ name: '', type: 'address[]' }],
    stateMutability: 'view'
  },
  {
    name: 'getLastIndex',
    type: 'function',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'clientAddress', type: 'address' }
    ],
    outputs: [{ name: '', type: 'uint64' }],
    stateMutability: 'view'
  }
] as const
