"""
AgentX 部署配置模块
====================
所有凭证和服务器地址从环境变量读取，避免硬编码。
使用时: from deploy_config import HOST, PASSWORD, PK, OX_RPC
"""

import os
import sys

# ── SSH 连接 ──────────────────────────────────────────────────────
HOST = os.environ.get("AGENTX_DEPLOY_HOST", "")
PASSWORD = os.environ.get("AGENTX_DEPLOY_PASSWORD", "")
USER = os.environ.get("AGENTX_DEPLOY_USER", "ubuntu")

# ── Web3 / Chain ──────────────────────────────────────────────────
PK = os.environ.get("AGENTX_DEPLOY_PRIVATE_KEY", "")
OX_RPC = os.environ.get("AGENTX_OX_RPC", "http://43.156.99.215:18545")
SEPOLIA_RPC = os.environ.get("AGENTX_SEPOLIA_RPC", "https://ethereum-sepolia-rpc.publicnode.com")

# ── Paths (no secrets — these are fine as defaults) ───────────────
PROJECT_ROOT = os.environ.get("AGENTX_PROJECT_ROOT", "/home/ubuntu/agentx")

# ── Validation ────────────────────────────────────────────────────
_REQUIRED = {
    "AGENTX_DEPLOY_HOST": HOST,
    "AGENTX_DEPLOY_PASSWORD": PASSWORD,
    "AGENTX_DEPLOY_PRIVATE_KEY": PK,
}

_missing = [k for k, v in _REQUIRED.items() if not v]
if _missing and any("deploy_config" in arg for arg in sys.argv):
    print(f"[deploy_config] WARNING: 以下环境变量未设置: {', '.join(_missing)}")
    print("[deploy_config] 请先 source .env.deploy 或手动 export 这些变量")
