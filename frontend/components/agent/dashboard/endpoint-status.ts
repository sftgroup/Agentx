// components/agent/dashboard/endpoint-status.ts
// R7 拆分：端点健康检查逻辑（纯函数，不依赖组件状态）
import type { Endpoint } from '../hooks/useMultiEndpoint'

export const checkEndpointStatus = async (endpoint: Endpoint): Promise<string> => {
  if (!endpoint.isActive) {
    return '未激活'
  }

  try {
    switch (endpoint.protocol.toUpperCase()) {
      case 'HTTP':
      case 'HTTPS':
        return await checkHttpEndpoint(endpoint.url)
      case 'WEBSOCKET':
        return await checkWebSocketEndpoint(endpoint.url)
      case 'GRPC':
        return await checkGrpcEndpoint(endpoint.url)
      case 'IPFS':
        return await checkIpfsEndpoint(endpoint.url)
      default:
        return '未测试'
    }
  } catch (error) {
    console.error(`Endpoint ${endpoint.endpointId} status check failed:`, error)
    return '检查失败'
  }
}

export const checkHttpEndpoint = async (url: string): Promise<string> => {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000)

    const response = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      headers: {
        'User-Agent': 'AI-Agent-Endpoint-Manager/1.0'
      }
    })

    clearTimeout(timeoutId)

    if (response.ok) {
      return '运行正常'
    } else {
      return `HTTP ${response.status}`
    }
  } catch (error: any) {
    if (error.name === 'AbortError') {
      return '请求超时'
    }
    return '连接失败'
  }
}

export const checkWebSocketEndpoint = async (url: string): Promise<string> => {
  return new Promise((resolve) => {
    try {
      const ws = new WebSocket(url)
      let resolved = false

      const timeoutId = setTimeout(() => {
        if (!resolved) {
          ws.close()
          resolve('连接超时')
        }
      }, 5000)

      ws.onopen = () => {
        resolved = true
        clearTimeout(timeoutId)
        ws.close()
        resolve('运行正常')
      }

      ws.onerror = () => {
        resolved = true
        clearTimeout(timeoutId)
        resolve('连接失败')
      }

      ws.onclose = () => {
        if (!resolved) {
          resolved = true
          clearTimeout(timeoutId)
          resolve('连接关闭')
        }
      }
    } catch (error) {
      resolve('连接失败')
    }
  })
}

export const checkGrpcEndpoint = async (url: string): Promise<string> => {
  return '未测试'
}

export const checkIpfsEndpoint = async (url: string): Promise<string> => {
  try {
    const testUrl = url.replace(/\/ipfs\/[^/]+$/, '/ipfs/QmUNLLsPACCz1vLxQVkXqqLX5R1X345qqfHbsf67hvA3Nn')
    const response = await fetch(testUrl, { method: 'HEAD' })
    return response.ok ? '运行正常' : '连接失败'
  } catch (error) {
    return '连接失败'
  }
}
