export const MULTI_ENDPOINT_ABI = [
  // 端点管理函数
  {
    name: 'createEndpoint',
    type: 'function',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'name', type: 'string' },
      { name: 'endpointType', type: 'string' },
      { name: 'protocol', type: 'string' },
      { name: 'url', type: 'string' },
      { name: 'description', type: 'string' }
    ],
    outputs: [{ name: 'endpointId', type: 'uint256' }],
    stateMutability: 'nonpayable'
  },
  {
    name: 'updateEndpoint',
    type: 'function',
    inputs: [
      { name: 'endpointId', type: 'uint256' },
      { name: 'name', type: 'string' },
      { name: 'endpointType', type: 'string' },
      { name: 'protocol', type: 'string' },
      { name: 'url', type: 'string' },
      { name: 'description', type: 'string' }
    ],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    name: 'deactivateEndpoint',
    type: 'function',
    inputs: [{ name: 'endpointId', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    name: 'addProtocolSupport',
    type: 'function',
    inputs: [
      { name: 'protocol', type: 'string' },
      { name: 'maxEndpointsPerAgent', type: 'uint256' },
      { name: 'requiredParams', type: 'string[]' }
    ],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  
  // 查询函数
  {
    name: 'getEndpoint',
    type: 'function',
    inputs: [{ name: 'endpointId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'endpointId', type: 'uint256' },
          { name: 'agentId', type: 'uint256' },
          { name: 'name', type: 'string' },
          { name: 'endpointType', type: 'string' },
          { name: 'protocol', type: 'string' },
          { name: 'url', type: 'string' },
          { name: 'description', type: 'string' },
          { name: 'isActive', type: 'bool' },
          { name: 'createdAt', type: 'uint256' },
          { name: 'updatedAt', type: 'uint256' },
          { name: 'createdBy', type: 'address' }
        ]
      }
    ],
    stateMutability: 'view'
  },
  {
    name: 'getAgentEndpoints',
    type: 'function',
    inputs: [{ name: 'agentId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple[]',
        components: [
          { name: 'endpointId', type: 'uint256' },
          { name: 'agentId', type: 'uint256' },
          { name: 'name', type: 'string' },
          { name: 'endpointType', type: 'string' },
          { name: 'protocol', type: 'string' },
          { name: 'url', type: 'string' },
          { name: 'description', type: 'string' },
          { name: 'isActive', type: 'bool' },
          { name: 'createdAt', type: 'uint256' },
          { name: 'updatedAt', type: 'uint256' },
          { name: 'createdBy', type: 'address' }
        ]
      }
    ],
    stateMutability: 'view'
  },
  {
    name: 'getActiveAgentEndpoints',
    type: 'function',
    inputs: [{ name: 'agentId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple[]',
        components: [
          { name: 'endpointId', type: 'uint256' },
          { name: 'agentId', type: 'uint256' },
          { name: 'name', type: 'string' },
          { name: 'endpointType', type: 'string' },
          { name: 'protocol', type: 'string' },
          { name: 'url', type: 'string' },
          { name: 'description', type: 'string' },
          { name: 'isActive', type: 'bool' },
          { name: 'createdAt', type: 'uint256' },
          { name: 'updatedAt', type: 'uint256' },
          { name: 'createdBy', type: 'address' }
        ]
      }
    ],
    stateMutability: 'view'
  },
  {
    name: 'getEndpointsByProtocol',
    type: 'function',
    inputs: [{ name: 'protocol', type: 'string' }],
    outputs: [
      {
        name: '',
        type: 'tuple[]',
        components: [
          { name: 'endpointId', type: 'uint256' },
          { name: 'agentId', type: 'uint256' },
          { name: 'name', type: 'string' },
          { name: 'endpointType', type: 'string' },
          { name: 'protocol', type: 'string' },
          { name: 'url', type: 'string' },
          { name: 'description', type: 'string' },
          { name: 'isActive', type: 'bool' },
          { name: 'createdAt', type: 'uint256' },
          { name: 'updatedAt', type: 'uint256' },
          { name: 'createdBy', type: 'address' }
        ]
      }
    ],
    stateMutability: 'view'
  },
  {
    name: 'getSupportedProtocols',
    type: 'function',
    inputs: [],
    outputs: [{ name: '', type: 'string[]' }],
    stateMutability: 'view'
  },
  {
    name: 'getProtocolConfig',
    type: 'function',
    inputs: [{ name: 'protocol', type: 'string' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'protocol', type: 'string' },
          { name: 'isSupported', type: 'bool' },
          { name: 'maxEndpointsPerAgent', type: 'uint256' },
          { name: 'requiredParams', type: 'string[]' }
        ]
      }
    ],
    stateMutability: 'view'
  },
  {
    name: 'isProtocolSupported',
    type: 'function',
    inputs: [{ name: 'protocol', type: 'string' }],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view'
  },
  {
    name: 'getAgentEndpointStats',
    type: 'function',
    inputs: [{ name: 'agentId', type: 'uint256' }],
    outputs: [
      { name: 'totalEndpoints', type: 'uint256' },
      { name: 'activeEndpoints', type: 'uint256' },
      { name: 'httpEndpoints', type: 'uint256' },
      { name: 'websocketEndpoints', type: 'uint256' },
      { name: 'grpcEndpoints', type: 'uint256' }
    ],
    stateMutability: 'view'
  },
  {
    name: 'searchEndpoints',
    type: 'function',
    inputs: [
      { name: 'endpointType', type: 'string' },
      { name: 'protocol', type: 'string' }
    ],
    outputs: [
      {
        name: '',
        type: 'tuple[]',
        components: [
          { name: 'endpointId', type: 'uint256' },
          { name: 'agentId', type: 'uint256' },
          { name: 'name', type: 'string' },
          { name: 'endpointType', type: 'string' },
          { name: 'protocol', type: 'string' },
          { name: 'url', type: 'string' },
          { name: 'description', type: 'string' },
          { name: 'isActive', type: 'bool' },
          { name: 'createdAt', type: 'uint256' },
          { name: 'updatedAt', type: 'uint256' },
          { name: 'createdBy', type: 'address' }
        ]
      }
    ],
    stateMutability: 'view'
  },
  
  // 事件定义
  {
    name: 'EndpointCreated',
    type: 'event',
    inputs: [
      { name: 'endpointId', type: 'uint256', indexed: true },
      { name: 'agentId', type: 'uint256', indexed: true },
      { name: 'endpointType', type: 'string', indexed: false },
      { name: 'protocol', type: 'string', indexed: false },
      { name: 'url', type: 'string', indexed: false }
    ]
  },
  {
    name: 'EndpointUpdated',
    type: 'event',
    inputs: [
      { name: 'endpointId', type: 'uint256', indexed: true },
      { name: 'agentId', type: 'uint256', indexed: true },
      { name: 'endpointType', type: 'string', indexed: false },
      { name: 'protocol', type: 'string', indexed: false },
      { name: 'url', type: 'string', indexed: false }
    ]
  },
  {
    name: 'EndpointDeactivated',
    type: 'event',
    inputs: [
      { name: 'endpointId', type: 'uint256', indexed: true },
      { name: 'agentId', type: 'uint256', indexed: true }
    ]
  },
  {
    name: 'ProtocolSupported',
    type: 'event',
    inputs: [
      { name: 'protocol', type: 'string', indexed: false },
      { name: 'maxEndpointsPerAgent', type: 'uint256', indexed: false }
    ]
  }
];
