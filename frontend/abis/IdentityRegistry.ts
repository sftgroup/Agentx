export const IDENTITY_REGISTRY_ABI = const IDENTITY_REGISTRY_ABI = [
  // 注册函数 - 三个重载版本
  {
    name: 'register',
    type: 'function',
    inputs: [],
    outputs: [{ name: 'agentId', type: 'uint256' }],
    stateMutability: 'payable'
  },
  {
    name: 'register',
    type: 'function',
    inputs: [{ name: 'tokenURI', type: 'string' }],
    outputs: [{ name: 'agentId', type: 'uint256' }],
    stateMutability: 'payable'
  },
  {
    name: 'registerWithMetadata',
    type: 'function',
    inputs: [
      { name: 'tokenURI', type: 'string' },
      { 
        name: 'metadata', 
        type: 'tuple[]',
        components: [
          { name: 'key', type: 'string' },
          { name: 'value', type: 'bytes' }
        ]
      }
    ],
    outputs: [{ name: 'agentId', type: 'uint256' }],
    stateMutability: 'payable'
  },
  
  // 查询函数
  {
    name: 'getAgentsByOwner',
    type: 'function',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'uint256[]' }],
    stateMutability: 'view'
  },
  {
    name: 'getCurrentAgentId',
    type: 'function',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view'
  },
  {
    name: 'agentExists',
    type: 'function',
    inputs: [{ name: 'agentId', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view'
  },
  
  // 元数据函数
  {
    name: 'setMetadata',
    type: 'function',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'key', type: 'string' },
      { name: 'value', type: 'bytes' }
    ],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    name: 'getMetadata',
    type: 'function',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'key', type: 'string' }
    ],
    outputs: [{ name: 'value', type: 'bytes' }],
    stateMutability: 'view'
  },
  
  // 管理函数
  {
    name: 'setRegistrationFee',
    type: 'function',
    inputs: [{ name: 'fee', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    name: 'withdrawFees',
    type: 'function',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  
  // 事件定义
  {
    name: 'Registered',
    type: 'event',
    inputs: [
      { name: 'agentId', type: 'uint256', indexed: true },
      { name: 'tokenURI', type: 'string', indexed: false },
      { name: 'owner', type: 'address', indexed: true }
    ]
  },
  {
    name: 'MetadataSet',
    type: 'event',
    inputs: [
      { name: 'agentId', type: 'uint256', indexed: true },
      { name: 'indexedKey', type: 'bytes32', indexed: true },
      { name: 'key', type: 'string', indexed: false },
      { name: 'value', type: 'bytes', indexed: false }
    ]
  }
];
