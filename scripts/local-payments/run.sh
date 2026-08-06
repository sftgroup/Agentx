#!/usr/bin/env bash
# =============================================================================
# AgentX — 本地三套支付流程完整链路 (chain / fiat / x402)
#
# 一键脚本：起本地基础设施（Postgres + anvil）→ 部署 SubscriptionManager 并
# 创建 plan → 应用 Gateway 迁移 → 启动 mock Stripe + 本地 Gateway →
# 依次跑通三套支付流程并做统一访问控制断言。
#
# 前置：docker（含 docker compose）。无需 Stripe 账号、无需真实链。
#
# 用法：
#   ./run.sh                 # 完整运行（首次会拉镜像 + 编译合约，较慢）
#   ./run.sh --stop          # 停止本次启动的本地服务（gateway / mock-stripe / 容器）
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG="$DIR/logs"
mkdir -p "$LOG"

# 端口（可用环境变量覆盖，便于在已占用 5433/8545 的机器上换端口运行）
GW_PORT="${GW_PORT:-3091}"
ANVIL_PORT="${ANVIL_PORT:-8545}"
MOCK_STRIPE_PORT="${MOCK_STRIPE_PORT:-8777}"
PG_PORT="${PG_PORT:-5433}"

# anvil 确定性账号
PK0="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"   # 订阅者 (anvil #0)
PK1="0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"   # 平台钱包 (anvil #1)
PAY_TO="0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
PLAN_PRICE_WEI="1000000000000000000"  # 1 native → fiat 自动定价 $1=100¢（≥ Stripe 50¢ 下限）

# ── 停止模式 ─────────────────────────────────────────────────────────────────
if [[ "${1:-}" == "--stop" ]]; then
  echo "[stop] 停止 gateway / mock-stripe / 本地容器 ..."
  [[ -f "$LOG/gateway.pid" ]] && kill "$(cat "$LOG/gateway.pid")" 2>/dev/null || true
  [[ -f "$LOG/mock-stripe.pid" ]] && kill "$(cat "$LOG/mock-stripe.pid")" 2>/dev/null || true
  sudo docker compose -f "$DIR/docker-compose.yml" down --remove-orphans 2>/dev/null || \
    docker compose -f "$DIR/docker-compose.yml" down --remove-orphans 2>/dev/null || true
  echo "[stop] 完成。"
  exit 0
fi

command -v docker >/dev/null || { echo "需要安装 docker"; exit 1; }

# 当前用户可能不在 docker 组 → 用 passwordless sudo 访问 docker daemon
if docker info >/dev/null 2>&1; then
  DOCKER="docker"
else
  DOCKER="sudo docker"
  echo "[sudo] 使用 sudo 访问 docker daemon"
fi
DC() { $DOCKER compose -f "$DIR/docker-compose.yml" "$@"; }

echo "==> [1/7] 启动本地基础设施 (postgres + anvil)"
DC up -d db anvil
DC ps --format 'table {{.Name}}\t{{.Status}}'

echo "==> [2/7] 等待 db / anvil 就绪"
until $DOCKER inspect -f '{{.State.Health.Status}}' agentx-local-db 2>/dev/null | grep -q healthy; do sleep 1; done
until $DOCKER inspect -f '{{.State.Health.Status}}' agentx-local-anvil 2>/dev/null | grep -q healthy; do sleep 1; done
echo "    db + anvil healthy"

echo "==> [3/7] 编译并部署合约（IdentityRegistry + SubscriptionManager + plan#1）"
# 初始化 forge 依赖（首次 clone；lib 目录是空占位）
if [ ! -f "$ROOT/contracts/lib/forge-std/src/Script.sol" ]; then
  echo "    clone forge-std + openzeppelin-contracts ..."
  git clone --depth 1 --branch v1.9.6 https://github.com/foundry-rs/forge-std.git "$ROOT/contracts/lib/forge-std"
  git clone --depth 1 --branch v5.1.0 https://github.com/OpenZeppelin/openzeppelin-contracts.git "$ROOT/contracts/lib/openzeppelin-contracts"
fi
FORGE_IMAGE="ghcr.io/foundry-rs/foundry:stable"
DEPLOY_OUT="$LOG/deploy.txt"
if ! $DOCKER image inspect "$FORGE_IMAGE" >/dev/null 2>&1; then
  echo "    拉取 foundry 镜像（首次较慢）..."
  $DOCKER pull "$FORGE_IMAGE"
fi
set +e
$DOCKER run --rm \
  --entrypoint forge \
  -v "$ROOT/contracts:/work" -w /work --network host \
  -e PRIVATE_KEY="$PK0" \
  -e PLAN_PRICE_WEI="$PLAN_PRICE_WEI" \
  "$FORGE_IMAGE" \
  script script/DeployLocal.s.sol:DeployLocal --rpc-url "http://127.0.0.1:$ANVIL_PORT" --broadcast --legacy \
  > "$DEPLOY_OUT" 2>&1
DEPLOY_RC=$?
set -e
if [ "$DEPLOY_RC" -ne 0 ]; then
  echo "    部署失败，日志尾部："
  tail -40 "$DEPLOY_OUT"
  exit 1
fi
SM_ADDR="$(grep -oE 'SubscriptionManager: 0x[0-9a-fA-F]{40}' "$DEPLOY_OUT" | head -1 | awk '{print $2}')"
IR_ADDR="$(grep -oE 'IdentityRegistry: 0x[0-9a-fA-F]{40}' "$DEPLOY_OUT" | head -1 | awk '{print $2}')"
USDC_ADDR="$(grep -oE 'MockUSDC: 0x[0-9a-fA-F]{40}' "$DEPLOY_OUT" | head -1 | awk '{print $2}')"
[[ -n "$SM_ADDR" ]] || { echo "无法从部署输出解析 SubscriptionManager 地址"; tail -40 "$DEPLOY_OUT"; exit 1; }
[[ -n "$USDC_ADDR" ]] || { echo "无法从部署输出解析 MockUSDC 地址"; tail -40 "$DEPLOY_OUT"; exit 1; }
echo "    SubscriptionManager = $SM_ADDR"
echo "    IdentityRegistry    = $IR_ADDR"
echo "    MockUSDC            = $USDC_ADDR"

echo "==> [3.5/7] 重置本地数据库（幂等迁移）"
$DOCKER exec agentx-local-db psql -U agentx -d postgres -v ON_ERROR_STOP=1 \
  -c "DROP DATABASE IF EXISTS agentx_local WITH (FORCE);" \
  -c "CREATE DATABASE agentx_local OWNER agentx;" >/dev/null

echo "==> [4/7] 应用 Gateway 数据库迁移"
for f in "$ROOT"/gateway/db/migrations/*.sql; do
  $DOCKER exec -i agentx-local-db psql -U agentx -d agentx_local -v ON_ERROR_STOP=1 < "$f" >/dev/null
done
echo "    migrations applied (001-019)"

echo "==> [5/7] 启动 mock Stripe + 本地 Gateway"
ENV_FILE="$DIR/.env.local"
cat > "$ENV_FILE" <<EOF
PORT=$GW_PORT
NODE_ENV=development
DATABASE_URL=postgresql://agentx:agentx@127.0.0.1:$PG_PORT/agentx_local
REDIS_URL=redis://127.0.0.1:6379
RPC_URL=http://127.0.0.1:$ANVIL_PORT
CHAIN_ID=11155111
RPC_URL_OXACHAIN=http://127.0.0.1:$ANVIL_PORT
CHAIN_ID_OXACHAIN=11155111
SUBSCRIPTION_MANAGER=$SM_ADDR
SUBSCRIPTION_MANAGER_OXACHAIN=$SM_ADDR
IDENTITY_REGISTRY=$IR_ADDR
IDENTITY_REGISTRY_OXACHAIN=$IR_ADDR
X402_ENABLED=true
X402_PAY_TO=$PAY_TO
X402_CHAIN=sepolia
X402_PRICE_WEI=1000000000000000
STABLECOIN_ENABLED=true
STABLECOIN_ASSET=$USDC_ADDR
STABLECOIN_DECIMALS=6
STABLECOIN_PRICE_WEI=1000000
STABLECOIN_DOMAIN_NAME="Mock USD Coin"
PERIOD_ENABLED=true
PERIOD_PRICE_WEI=1000000
PERIOD_MAX_PERIODS=12
MPP_ENABLED=true
MPP_DOMAIN=$PAY_TO
MPP_PAYEE=$PAY_TO
MPP_CHAIN=sepolia
MPP_SETTLE_THRESHOLD_WEI=1000000000000000000
STRIPE_SECRET_KEY=sk_test_localmock
STRIPE_WEBHOOK_SECRET=whsec_localmocktest
STRIPE_API_BASE=http://127.0.0.1:$MOCK_STRIPE_PORT/v1
FIAT_TOKEN_USD_PRICE=1
JWT_SECRET=local-dev-secret
CONVERSATION_SERVICE_TOKEN=local-dev-token
A2A_WORKER_PRIVATE_KEY=$PK1
PUBLIC_GATEWAY_URL=http://127.0.0.1:$GW_PORT
EOF
echo "    已生成 $ENV_FILE"

MOCK_STRIPE_PORT="$MOCK_STRIPE_PORT" node "$DIR/mock-stripe.mjs" > "$LOG/mock-stripe.log" 2>&1 &
echo $! > "$LOG/mock-stripe.pid"
echo "    mock-stripe.pid=$(cat "$LOG/mock-stripe.pid")"

(
  cd "$ROOT/gateway"
  set -a
  # shellcheck disable=SC1091
  source "$ENV_FILE"
  set +a
  exec "$ROOT/gateway/node_modules/.bin/tsx" src/index.ts
) > "$LOG/gateway.log" 2>&1 &
echo $! > "$LOG/gateway.pid"
echo "    gateway.pid=$(cat "$LOG/gateway.pid") (日志: $LOG/gateway.log)"

echo "==> [6/7] 等待 Gateway 就绪"
for i in $(seq 1 60); do
  code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$GW_PORT/api/v1/health" || true)"
  if [ "$code" != "000" ] && [ -n "$code" ]; then
    echo "    gateway /api/v1/health → $code"
    break
  fi
  sleep 1
done
[ "$code" != "000" ] && [ -n "$code" ] || { echo "    gateway 未在 60s 内就绪，日志尾部："; tail -30 "$LOG/gateway.log"; exit 1; }

echo "==> [7/7] 跑支付流程 (F1-8: chain/fiat/x402 订阅 + x402 v2 + MPP + 稳定币 + period + a2a)"
# 默认全量；可 FLOWS="f1 f4 f5 f8" 只跑指定子集
FLOWS="${FLOWS:-f1 f4 f5 f6 f7 f8}"
ALL_RC=0
run_flow() {
  local label="$1"; local script="$2"
  echo ""
  echo "########## $label ($script) ##########"
  (
    cd "$DIR"
    GATEWAY_URL="http://127.0.0.1:$GW_PORT" \
    ANVIL_RPC="http://127.0.0.1:$ANVIL_PORT" \
    X402_PAY_TO="$PAY_TO" \
    SUBSCRIPTION_MANAGER="$SM_ADDR" \
    STRIPE_WEBHOOK_SECRET="whsec_localmocktest" \
    USDC_ASSET="$USDC_ADDR" \
    STABLECOIN_DOMAIN_NAME="Mock USD Coin" \
    STABLECOIN_PRICE_WEI="1000000" \
    MPP_DOMAIN="$PAY_TO" \
    PERIOD_PRICE_WEI="1000000" \
    PERIOD_MAX_PERIODS="12" \
    node "$script"
  )
  local rc=$?
  if [ "$rc" -ne 0 ]; then ALL_RC=$rc; fi
  return $rc
}

if [[ " $FLOWS " == *" f1 "* ]]; then run_flow "F1-3 chain/fiat/x402 订阅" run-flows.mjs || true; fi
if [[ " $FLOWS " == *" f4 "* ]]; then run_flow "F4 x402 v2 exact/upto" run-flows-f4.mjs || true; fi
if [[ " $FLOWS " == *" f5 "* ]]; then run_flow "F5 MPP 支付通道" run-flows-f5.mjs || true; fi
if [[ " $FLOWS " == *" f6 "* ]]; then run_flow "F6 稳定币 EIP-3009" run-flows-f6.mjs || true; fi
if [[ " $FLOWS " == *" f7 "* ]]; then run_flow "F7 period 授权制订阅" run-flows-f7.mjs || true; fi
if [[ " $FLOWS " == *" f8 "* ]]; then run_flow "F8 a2a-pay" run-flows-f8.mjs || true; fi
RC=$ALL_RC

echo ""
echo "=============================================================================="
echo " 本地服务仍在运行，可随时查看："
echo "   Gateway      : http://127.0.0.1:$GW_PORT           日志 $LOG/gateway.log"
echo "   Mock Stripe  : http://127.0.0.1:$MOCK_STRIPE_PORT   日志 $LOG/mock-stripe.log"
echo "   anvil RPC    : http://127.0.0.1:$ANVIL_PORT"
echo "   Postgres     : localhost:$PG_PORT (agentx/agentx, db=agentx_local)"
echo "   .env.local   : $ENV_FILE"
echo " 停止：$0 --stop"
echo "=============================================================================="
exit $RC
