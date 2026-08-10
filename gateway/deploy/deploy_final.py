import paramiko
from deploy_config import HOST, USER, PASSWORD, PK

if not PK:
    raise SystemExit("FATAL: AGENTX_DEPLOY_PRIVATE_KEY 未设置，请先 source gateway/deploy/.env.deploy")

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASSWORD, timeout=30)

def run(cmd):
    print(f"> {cmd[:130]}")
    stdin, stdout, stderr = c.exec_command(cmd, timeout=600)
    out = stdout.read().decode()
    err = stderr.read().decode()
    ec = stdout.channel.recv_exit_status()
    if out: print(out[-600:])
    if err: print("E:", err[-400:])
    return ec, out, err

# symlink
run("export PATH=$HOME/.foundry/bin:$PATH && cd /tmp/a2a_build/src && ln -sf erc8004-interfaces interfaces")

# Sepolia - address as positional arg
print("\n===== SEPOLIA =====")
ec, out, err = run(
    "export PATH=$HOME/.foundry/bin:$PATH && cd /tmp/a2a_build && "
    "forge create src/erc8004-extensions/A2AProtocolRegistry.sol:A2AProtocolRegistry "
    "--rpc-url https://ethereum-sepolia-rpc.publicnode.com "
    f"--private-key {PK} "
    "--legacy "
    "0xe94ad380d3F8d08a7590eda0C84f354a93F96e5F 2>&1"
)

# OxaChain
print("\n===== OXACHAIN L1 =====")
ec, out, err = run(
    "export PATH=$HOME/.foundry/bin:$PATH && cd /tmp/a2a_build && "
    "forge create src/erc8004-extensions/A2AProtocolRegistry.sol:A2AProtocolRegistry "
    "--rpc-url http://43.156.99.215:18545 "
    f"--private-key {PK} "
    "--legacy "
    "0xbf5F9db266c8c97E3334466C88597Eb758AfE212 2>&1"
)

c.close()
