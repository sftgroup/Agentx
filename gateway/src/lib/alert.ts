// ---------------------------------------------------------------------------
// AgentX Gateway — 通用告警（webhook / log 兜底）
// ---------------------------------------------------------------------------
// 供自动续订（e4 资金巡检、失败护栏）与 escrow 对账（e5）等模块复用，
// 避免各服务各自实现、也避免对账服务反向依赖重型 AA 编排模块。
// 行为：配置了 AA_ALERT_WEBHOOK_URL 则 POST JSON（10s 超时）；未配置仅 log.error。
// ---------------------------------------------------------------------------

import { config } from '../config'
import { log } from '../services/chain-data-reader'

export async function sendAlert(subject: string, detail: Record<string, unknown>): Promise<void> {
  const msg = { subject, time: new Date().toISOString(), ...detail }
  if (!config.aaAlertWebhookUrl) {
    log.error(`[alert] ${subject} ${JSON.stringify(detail)}`)
    return
  }
  try {
    await fetch(config.aaAlertWebhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(msg),
      signal: AbortSignal.timeout(10_000),
    })
  } catch (err) {
    log.error(`[alert] webhook failed: ${(err as Error).message}`)
  }
}
