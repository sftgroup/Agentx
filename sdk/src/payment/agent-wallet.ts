// ---------------------------------------------------------------------------
// @agentxv2/sdk — AgentWalletConfig (t9, P2)
// ---------------------------------------------------------------------------
// agent 自主钱包（InfraX MPC 钱包，Email 2-of-2 TSS）管理客户端。A2A 委派
// 按次付费时，配置了自主钱包的 agent 由 gateway worker 自动代付（agent-payer
// 服务），无需用户钱包弹窗/预充值。本模块封装 gateway 的 agent-payer 管理接口：
//
//   POST   /api/v1/admin/agent-payers                — 绑定 MPC 钱包
//   POST   /api/v1/admin/agent-payers/:agentId/unlock— 邮箱验证码解锁会话
//   GET    /api/v1/admin/agent-payers/:agentId       — 状态 + 链上余额
//   GET    /api/v1/admin/agent-payers                — 列表
//   DELETE /api/v1/admin/agent-payers/:agentId       — 解绑
//
// 全部走 admin 鉴权（gateway ADMIN_KEY，Authorization: Bearer / X-Admin-Key）。
// ---------------------------------------------------------------------------

/** AgentWalletConfig 客户端配置。 */
export interface AgentWalletConfigOptions {
  /** Gateway 地址（如 https://agentx.0xainet.top）。 */
  baseUrl: string
  /** Gateway ADMIN_KEY（admin 路由鉴权）。 */
  adminKey: string
}

export interface AgentWalletInfo {
  agentId: number
  email: string
  walletAddress: string
  chain: string
  sessionUnlocked: boolean
  sessionExpiresAt: string | null
}

export interface BindAgentWalletInput {
  agentId: number
  /** MPC 钱包注册邮箱（sendCode/register 所用）。 */
  email: string
  /** MPC 钱包地址。 */
  walletAddress: string
  /** 链名，默认 'oxachain'。 */
  chain?: string
}

export interface AuthorizePaymentSessionInput {
  agentId: number
  email: string
  /** 邮箱收到的 6 位验证码（MPC session.unlock）。 */
  code: string
}

export interface AuthorizePaymentSessionResult {
  address: string
  expiresAt: string
}

export interface AgentWalletStatus extends AgentWalletInfo {
  chainBalanceWei: string | null
}

async function adminRequest(baseUrl: string, adminKey: string, path: string, init?: RequestInit): Promise<any> {
  const base = baseUrl.replace(/\/$/, '')
  const headers: Record<string, string> = {
    'X-Admin-Key': adminKey,
    ...((init?.headers as Record<string, string>) ?? {}),
  }
  const resp = await fetch(`${base}${path}`, { ...init, headers })
  if (!resp.ok) {
    let message = `AgentWalletConfig request failed (${resp.status}): ${path}`
    try {
      const body = (await resp.json()) as { error?: string }
      if (body.error) message = body.error
    } catch { /* non-JSON */ }
    throw new Error(message)
  }
  return resp.json()
}

/**
 * agent 自主钱包管理客户端：绑定 MPC 钱包 / 授权付款会话 / 查询状态。
 * 绑定 + 解锁完成后，A2A 委派由 gateway 服务端自动代付，SDK 侧无需再参与付款。
 */
export class AgentWalletConfig {
  constructor(private opts: AgentWalletConfigOptions) {}

  /** 绑定 agent 与 MPC 钱包（agent_id 唯一，重复绑定覆盖 email/地址/链）。 */
  async bindWallet(input: BindAgentWalletInput): Promise<{ success: boolean }> {
    return adminRequest(this.opts.baseUrl, this.opts.adminKey, '/api/v1/admin/agent-payers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
  }

  /** 邮箱验证码解锁 MPC 会话（令牌由 gateway 加密存储，服务端自动代付使用）。 */
  async authorizePaymentSession(input: AuthorizePaymentSessionInput): Promise<AuthorizePaymentSessionResult> {
    return adminRequest(
      this.opts.baseUrl,
      this.opts.adminKey,
      `/api/v1/admin/agent-payers/${input.agentId}/unlock`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: input.code }) }
    )
  }

  /** 查询单个 agent 自主钱包状态（含链上原生币余额）。 */
  async status(agentId: number): Promise<AgentWalletStatus> {
    return adminRequest(this.opts.baseUrl, this.opts.adminKey, `/api/v1/admin/agent-payers/${agentId}`)
  }

  /** 列出所有已绑定 agent 钱包。 */
  async list(): Promise<{ wallets: AgentWalletInfo[] }> {
    return adminRequest(this.opts.baseUrl, this.opts.adminKey, '/api/v1/admin/agent-payers')
  }

  /** 解绑（清除钱包绑定与会话）。 */
  async unbind(agentId: number): Promise<{ success: boolean }> {
    return adminRequest(this.opts.baseUrl, this.opts.adminKey, `/api/v1/admin/agent-payers/${agentId}`, { method: 'DELETE' })
  }
}
