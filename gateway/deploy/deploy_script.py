import paramiko, os

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('43.156.78.59', username='ubuntu', password='Asdf1234!', timeout=30)

def run(cmd):
    print(f"> {cmd[:120]}")
    stdin, stdout, stderr = c.exec_command(cmd, timeout=600)
    out = stdout.read().decode()
    err = stderr.read().decode()
    ec = stdout.channel.recv_exit_status()
    if out: print(out[-600:])
    if err: print("E:", err[-400:])
    return ec, out, err

# Ensure symlink
run("export PATH=$HOME/.foundry/bin:$PATH && cd /tmp/a2a_build/src && ln -sf erc8004-interfaces interfaces")

# Try forge script approach - pass IDENTITY_REGISTRY and PRIVATE_KEY as env
# Write .env file for the script
env_sep = """IDENTITY_REGISTRY=0xe94ad380d3F8d08a7590eda0C84f354a93F96e5F
PRIVATE_KEY=0x872c3190b82d17b29bb046c9c55a7f7390c7f74bd6d592ba8d211f20f896f28e
"""
env_ox = """IDENTITY_REGISTRY=0xbf5F9db266c8c97E3334466C88597Eb758AfE212
PRIVATE_KEY=0x872c3190b82d17b29bb046c9c55a7f7390c7f74bd6d592ba8d211f20f896f28e
"""
import base64
b64 = base64.b64encode(env_sep.encode()).decode()
run(f"echo '{b64}' | base64 -d > /tmp/a2a_build/.env && echo 'env written'")

# Sepolia deploy via forge script
print("\n=== SEPOLIA DEPLOY ===")
ec, out, err = run(
    "export PATH=$HOME/.foundry/bin:$PATH && cd /tmp/a2a_build && "
    "source .env && "
    "forge script script/DeployA2A.s.sol:DeployA2A "
    "--rpc-url https://ethereum-sepolia-rpc.publicnode.com "
    "--broadcast --legacy 2>&1 | tail -30"
)

# Check for deployed address
for line in (out+err).split('\n'):
    if 'Deployed at' in line or '0x' in line[:10]:
        print(f"  >> {line.strip()}")

# OxaChain deploy
print("\n=== OXACHAIN DEPLOY ===")
b64 = base64.b64encode(env_ox.encode()).decode()
run(f"echo '{b64}' | base64 -d > /tmp/a2a_build/.env && echo 'env written'")

ec, out, err = run(
    "export PATH=$HOME/.foundry/bin:$PATH && cd /tmp/a2a_build && "
    "source .env && "
    "forge script script/DeployA2A.s.sol:DeployA2A "
    "--rpc-url http://43.156.99.215:18545 "
    "--broadcast --legacy 2>&1 | tail -30"
)

for line in (out+err).split('\n'):
    if 'Deployed at' in line or '0x' in line[:10]:
        print(f"  >> {line.strip()}")

c.close()
