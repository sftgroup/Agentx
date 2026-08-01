export const PAYMENT_GATEWAY_ABI = [
  // 支付操作
  {
    name: 'createPayment',
    type: 'function',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'serviceDescription', type: 'string' },
      { name: 'useEscrow', type: 'bool' }
    ],
    outputs: [{ name: 'paymentId', type: 'uint256' }],
    stateMutability: 'payable'
  },
  {
    name: 'completePayment',
    type: 'function',
    inputs: [{ name: 'paymentId', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    name: 'releaseEscrow',
    type: 'function',
    inputs: [{ name: 'paymentId', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    name: 'raiseDispute',
    type: 'function',
    inputs: [
      { name: 'paymentId', type: 'uint256' },
      { name: 'reason', type: 'string' }
    ],
    outputs: [{ name: 'disputeId', type: 'uint256' }],
    stateMutability: 'nonpayable'
  },
  {
    name: 'resolveDispute',
    type: 'function',
    inputs: [
      { name: 'disputeId', type: 'uint256' },
      { name: 'refundApproved', type: 'bool' }
    ],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  
  // 查询函数 - 修复：确保所有函数都有正确的参数
  {
    name: 'getPayment',
    type: 'function',
    inputs: [{ name: 'paymentId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'paymentId', type: 'uint256' },
          { name: 'agentId', type: 'uint256' },
          { name: 'client', type: 'address' },
          { name: 'token', type: 'address' },
          { name: 'amount', type: 'uint256' },
          { name: 'serviceDescription', type: 'string' },
          { name: 'status', type: 'uint8' },
          { name: 'createdAt', type: 'uint256' },
          { name: 'completedAt', type: 'uint256' },
          { name: 'escrowReleaseTime', type: 'uint256' },
          { name: 'isEscrowed', type: 'bool' },
          { name: 'escrowHolder', type: 'address' }
        ]
      }
    ],
    stateMutability: 'view'
  },
  {
    name: 'getAgentPayments',
    type: 'function',
    inputs: [{ name: 'agentId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple[]',
        components: [
          { name: 'paymentId', type: 'uint256' },
          { name: 'agentId', type: 'uint256' },
          { name: 'client', type: 'address' },
          { name: 'token', type: 'address' },
          { name: 'amount', type: 'uint256' },
          { name: 'serviceDescription', type: 'string' },
          { name: 'status', type: 'uint8' },
          { name: 'createdAt', type: 'uint256' },
          { name: 'completedAt', type: 'uint256' },
          { name: 'escrowReleaseTime', type: 'uint256' },
          { name: 'isEscrowed', type: 'bool' },
          { name: 'escrowHolder', type: 'address' }
        ]
      }
    ],
    stateMutability: 'view'
  },
  {
    name: 'getClientPayments',
    type: 'function',
    inputs: [{ name: 'client', type: 'address' }],
    outputs: [
      {
        name: '',
        type: 'tuple[]',
        components: [
          { name: 'paymentId', type: 'uint256' },
          { name: 'agentId', type: 'uint256' },
          { name: 'client', type: 'address' },
          { name: 'token', type: 'address' },
          { name: 'amount', type: 'uint256' },
          { name: 'serviceDescription', type: 'string' },
          { name: 'status', type: 'uint8' },
          { name: 'createdAt', type: 'uint256' },
          { name: 'completedAt', type: 'uint256' },
          { name: 'escrowReleaseTime', type: 'uint256' },
          { name: 'isEscrowed', type: 'bool' },
          { name: 'escrowHolder', type: 'address' }
        ]
      }
    ],
    stateMutability: 'view'
  },
  {
    name: 'getAgentEarnings',
    type: 'function',
    inputs: [{ name: 'agentOwner', type: 'address' }],
    outputs: [{ name: 'totalEarnings', type: 'uint256' }],
    stateMutability: 'view'
  },
  {
    name: 'getTotalPaymentCount',
    type: 'function',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view'
  },
  {
    name: 'getDispute',
    type: 'function',
    inputs: [{ name: 'disputeId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'paymentId', type: 'uint256' },
          { name: 'raisedBy', type: 'address' },
          { name: 'reason', type: 'string' },
          { name: 'raisedAt', type: 'uint256' },
          { name: 'resolved', type: 'bool' },
          { name: 'resolver', type: 'address' },
          { name: 'resolvedAt', type: 'uint256' }
        ]
      }
    ],
    stateMutability: 'view'
  },
  
  // 管理函数
  {
    name: 'setPlatformFee',
    type: 'function',
    inputs: [{ name: 'newFee', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    name: 'setFeeCollector',
    type: 'function',
    inputs: [{ name: 'newCollector', type: 'address' }],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    name: 'setEscrowPeriod',
    type: 'function',
    inputs: [{ name: 'newPeriod', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  
  // 事件定义
  {
    name: 'PaymentCreated',
    type: 'event',
    inputs: [
      { name: 'paymentId', type: 'uint256', indexed: true },
      { name: 'agentId', type: 'uint256', indexed: true },
      { name: 'client', type: 'address', indexed: true },
      { name: 'token', type: 'address', indexed: false },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'serviceDescription', type: 'string', indexed: false },
      { name: 'isEscrowed', type: 'bool', indexed: false }
    ]
  },
  {
    name: 'PaymentCompleted',
    type: 'event',
    inputs: [
      { name: 'paymentId', type: 'uint256', indexed: true },
      { name: 'agentId', type: 'uint256', indexed: true },
      { name: 'client', type: 'address', indexed: false },
      { name: 'token', type: 'address', indexed: false },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'completedAt', type: 'uint256', indexed: false }
    ]
  },
  {
    name: 'PaymentRefunded',
    type: 'event',
    inputs: [
      { name: 'paymentId', type: 'uint256', indexed: true },
      { name: 'agentId', type: 'uint256', indexed: true },
      { name: 'client', type: 'address', indexed: false },
      { name: 'token', type: 'address', indexed: false },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'refundedAt', type: 'uint256', indexed: false }
    ]
  },
  {
    name: 'DisputeRaised',
    type: 'event',
    inputs: [
      { name: 'disputeId', type: 'uint256', indexed: true },
      { name: 'paymentId', type: 'uint256', indexed: true },
      { name: 'raisedBy', type: 'address', indexed: false },
      { name: 'reason', type: 'string', indexed: false },
      { name: 'raisedAt', type: 'uint256', indexed: false }
    ]
  },
  {
    name: 'DisputeResolved',
    type: 'event',
    inputs: [
      { name: 'disputeId', type: 'uint256', indexed: true },
      { name: 'paymentId', type: 'uint256', indexed: true },
      { name: 'resolver', type: 'address', indexed: false },
      { name: 'refundApproved', type: 'bool', indexed: false },
      { name: 'resolvedAt', type: 'uint256', indexed: false }
    ]
  },
  {
    name: 'EscrowReleased',
    type: 'event',
    inputs: [
      { name: 'paymentId', type: 'uint256', indexed: true },
      { name: 'agentId', type: 'uint256', indexed: true },
      { name: 'token', type: 'address', indexed: false },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'releasedAt', type: 'uint256', indexed: false }
    ]
  }
];
