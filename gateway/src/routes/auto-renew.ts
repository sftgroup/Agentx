// ---------------------------------------------------------------------------
// AgentX Gateway — Auto-Renew Routes (t9, ERC-4337)
// ---------------------------------------------------------------------------
// 链上订阅自动续订（ERC-4337 session key 授权 + 服务端定时续订）。挂载于
// /billing 受保护路由，subscriber = 已认证钱包（req.tenant.walletAddress）。
//   GET  /billing/auto-renew           我的自动续订列表（含账户资金视图）
//   POST /billing/auto-renew/enable    开启：创建 session + 部署账户 → 返回 digest
//   POST /billing/auto-renew/confirm   提交 eth_sign 签名 → 上链授权生效
//   POST /billing/auto-renew/resume    恢复被暂停（失败护栏/资金不足）的自动续订
//   POST /billing/auto-renew/disable   停用（本地；返回 disableCallData 可选链上撤销）
// ---------------------------------------------------------------------------

import { Router, Request, Response } from 'express'
import {
  createAutoRenew,
  confirmAutoRenew,
  disableAutoRenew,
  resumeAutoRenew,
  listAutoRenew,
  getAccountFunding,
  isAutoRenewEnabled,
} from '../services/aa-autorenew'
import { log } from '../services/chain-data-reader'

const router = Router()

/** 未启用自动续订时统一 503 */
function requireEnabled(req: Request, res: Response, next: () => void): void {
  if (!isAutoRenewEnabled()) {
    res.status(503).json({ error: 'Auto-renew (ERC-4337) is not enabled on this gateway' })
    return
  }
  next()
}

// GET /billing/auto-renew
router.get('/auto-renew', async (req: Request, res: Response) => {
  try {
    if (!req.tenant) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }
    const subscriber = req.tenant.walletAddress as string
    const rows = await listAutoRenew(subscriber)
    // 附加智能账户资金视图（充值引导）
    const withFunding = await Promise.all(
      rows.map(async (row) => {
        const funding = row.account_address
          ? await getAccountFunding(row.account_address).catch(() => null)
          : null
        // BigInt 需转字符串，否则 res.json 抛序列化错误
        return {
          ...row,
          funding: funding
            ? {
                nativeWei: funding.nativeWei.toString(),
                epDepositWei: funding.epDepositWei.toString(),
                escrowWei: funding.escrowWei.toString(),
              }
            : null,
        }
      }),
    )
    res.json({ rows: withFunding })
  } catch (err) {
    log.error(`auto-renew list failed: ${(err as Error).message}`)
    res.status(500).json({ error: (err as Error).message })
  }
})

// POST /billing/auto-renew/enable
router.post('/auto-renew/enable', requireEnabled, async (req: Request, res: Response) => {
  try {
    if (!req.tenant) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }
    const subscriber = req.tenant.walletAddress as string
    const { agentId, planId, subscriptionId, planPriceWei } = req.body ?? {}
    if (!agentId || !planId || !subscriptionId || !planPriceWei) {
      res.status(400).json({ error: 'agentId, planId, subscriptionId, planPriceWei required' })
      return
    }
    const result = await createAutoRenew({
      subscriber,
      agentId: Number(agentId),
      planId: Number(planId),
      subscriptionId: Number(subscriptionId),
      planPriceWei: String(planPriceWei),
    })
    res.json(result)
  } catch (err) {
    log.error(`auto-renew enable failed: ${(err as Error).message}`)
    res.status((err as Error & { status?: number }).status ?? 500).json({ error: (err as Error).message })
  }
})

// POST /billing/auto-renew/confirm
router.post('/auto-renew/confirm', requireEnabled, async (req: Request, res: Response) => {
  try {
    if (!req.tenant) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }
    const subscriber = req.tenant.walletAddress as string
    const { agentId, planId, ownerSignature } = req.body ?? {}
    if (!agentId || !planId || !ownerSignature) {
      res.status(400).json({ error: 'agentId, planId, ownerSignature required' })
      return
    }
    if (!/^0x[0-9a-fA-F]{130}$/.test(String(ownerSignature))) {
      res.status(400).json({ error: 'ownerSignature must be a 65-byte hex signature' })
      return
    }
    const result = await confirmAutoRenew({
      subscriber,
      agentId: Number(agentId),
      planId: Number(planId),
      ownerSignature: String(ownerSignature),
    })
    res.json(result)
  } catch (err) {
    log.error(`auto-renew confirm failed: ${(err as Error).message}`)
    res.status(500).json({ error: (err as Error).message })
  }
})

// POST /billing/auto-renew/resume
router.post('/auto-renew/resume', async (req: Request, res: Response) => {
  try {
    if (!req.tenant) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }
    const subscriber = req.tenant.walletAddress as string
    const { agentId, planId } = req.body ?? {}
    if (!agentId || !planId) {
      res.status(400).json({ error: 'agentId, planId required' })
      return
    }
    await resumeAutoRenew({
      subscriber,
      agentId: Number(agentId),
      planId: Number(planId),
    })
    res.json({ ok: true })
  } catch (err) {
    log.error(`auto-renew resume failed: ${(err as Error).message}`)
    res.status((err as Error & { status?: number }).status ?? 500).json({ error: (err as Error).message })
  }
})

// POST /billing/auto-renew/disable
router.post('/auto-renew/disable', async (req: Request, res: Response) => {
  try {
    if (!req.tenant) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }
    const subscriber = req.tenant.walletAddress as string
    const { agentId, planId } = req.body ?? {}
    if (!agentId || !planId) {
      res.status(400).json({ error: 'agentId, planId required' })
      return
    }
    const result = await disableAutoRenew({
      subscriber,
      agentId: Number(agentId),
      planId: Number(planId),
    })
    res.json(result)
  } catch (err) {
    log.error(`auto-renew disable failed: ${(err as Error).message}`)
    res.status((err as Error & { status?: number }).status ?? 500).json({ error: (err as Error).message })
  }
})

export default router
