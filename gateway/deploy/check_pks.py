import paramiko
import os
from deploy_config import HOST, USER, PASSWORD

# 待查余额的部署私钥从环境变量读取（禁止硬编码入库）
pks = [
    k for k in (
        os.environ.get("AGENTX_DEPLOY_PRIVATE_KEY", ""),
        os.environ.get("AGENTX_DEPLOY_PRIVATE_KEY_2", ""),
    ) if k
]
if not pks:
    raise SystemExit("FATAL: AGENTX_DEPLOY_PRIVATE_KEY / AGENTX_DEPLOY_PRIVATE_KEY_2 未设置，请先 source gateway/deploy/.env.deploy")

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASSWORD, timeout=10)

for i, pk in enumerate(pks):
    print(f"\n=== PK {i+1} ===")
    stdin, stdout, stderr = c.exec_command(
        f"export PATH=$HOME/.foundry/bin:$PATH && "
        f"cast w a {pk} 2>&1"
    )
    addr = stdout.read().decode().strip()
    err = stderr.read().decode().strip()
    if err:
        print(f"  Error: {err}")
        continue
    print(f"  Address: {addr}")
    
    stdin, stdout, stderr = c.exec_command(
        f"export PATH=$HOME/.foundry/bin:$PATH && "
        f"cast balance {addr} --rpc-url https://ethereum-sepolia-rpc.publicnode.com 2>&1"
    )
    bal = stdout.read().decode().strip()
    err = stderr.read().decode().strip()
    print(f"  Sepolia wei: {bal}")

c.close()
