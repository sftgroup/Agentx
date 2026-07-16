import paramiko
import tarfile
import os
import base64
import time

HOST = '43.156.225.164'
PWD = 'Asdf1234!'
PORT = '3000'
APP_DIR = '/home/ubuntu/agentx-platform'

# Step 1: Create tar of frontend source
local_dir = r'c:\Users\apply\Downloads\code\agentx\extracted\Agentx\frontend'
tar_path = r'c:\Users\apply\Downloads\code\agentx_fe_prod.tar.gz'

print("=== Creating tar ===")
count = 0
with tarfile.open(tar_path, 'w:gz') as tar:
    for root, dirs, files in os.walk(local_dir):
        dirs[:] = [d for d in dirs if d not in ('node_modules', '.next', '.git', '__pycache__')]
        for f in files:
            if f.endswith('.tsbuildinfo'): continue
            if f == 'pnpm-lock.yaml': continue
            full = os.path.join(root, f)
            arc = os.path.relpath(full, local_dir).replace('\\', '/')
            tar.add(full, arcname=arc)
            count += 1
size_kb = os.path.getsize(tar_path) / 1024
print(f"{count} files, {size_kb:.0f} KB")

# Step 2: Upload via SFTP
print("\n=== Uploading tar ===")
transport = paramiko.Transport((HOST, 22))
transport.connect(username='ubuntu', password=PWD)
sftp = paramiko.SFTPClient.from_transport(transport)
sftp.put(tar_path, '/tmp/agentx_fe.tar.gz')
sftp.close()
transport.close()

# Step 3: SSH operations
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username='ubuntu', password=PWD, timeout=30)

def run(ssh_client, cmd, timeout=600):
    print(f"> {cmd[:120]}")
    stdin, stdout, stderr = ssh_client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode()
    err = stderr.read().decode()
    ec = stdout.channel.recv_exit_status()
    if out: print(out[-500:])
    if err and 'warn' not in err.lower() and 'deprecated' not in err.lower(): print("E:", err[-300:])
    return ec, out, err

# Extract
run(c, f"rm -rf {APP_DIR} && mkdir -p {APP_DIR} && cd {APP_DIR} && tar xzf /tmp/agentx_fe.tar.gz && echo 'extracted'")

# Upload .env.production with correct APP_URL
env_content = """# ============================================================
# AgentX Platform — PRODUCTION Environment Configuration
# ============================================================
NEXT_PUBLIC_APP_NAME="AgentX"
NEXT_PUBLIC_APP_URL=http://43.156.225.164:3000
NEXT_PUBLIC_DEFAULT_CHAIN_ID=11155111

# ── Sepolia (11155111) ──────────────────────────────────────
NEXT_PUBLIC_SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/63ee183a3afa43208e99d6f3f1e7c5fb
NEXT_PUBLIC_SEPOLIA_IDENTITY_REGISTRY=0xe94ad380d3F8d08a7590eda0C84f354a93F96e5F
NEXT_PUBLIC_SEPOLIA_SUBSCRIPTION_MANAGER=0xC15fE80b9d800abb72121F353a6ae6d6E9077E63
NEXT_PUBLIC_SEPOLIA_REPUTATION_REGISTRY=0xeb6B410ea71b8d9dA0c96f6A91d35027CE143DC9
NEXT_PUBLIC_SEPOLIA_CONFIGURATION_REGISTRY=0x68DcE00e4C9077c94BC68016cD14B09557faEA6c
NEXT_PUBLIC_SEPOLIA_MULTI_ENDPOINT=0xEB5e866f186d4B73F97aa0d70B86f2C6e2e21Cb7
NEXT_PUBLIC_SEPOLIA_A2A_PROTOCOL=0x309C7447d89f3087A9924BB686d88df020F7e9cB

# ── OxaChain L1 (19505) ────────────────────────────────────
NEXT_PUBLIC_OXACHAIN_RPC_URL=http://43.156.99.215:18545
NEXT_PUBLIC_OXACHAIN_EXPLORER=http://43.156.99.215:18400
NEXT_PUBLIC_OXACHAIN_IDENTITY_REGISTRY=0xbf5F9db266c8c97E3334466C88597Eb758AfE212
NEXT_PUBLIC_OXACHAIN_SUBSCRIPTION_MANAGER=0x019AC9d945467478Dd371CDbD70cb2f325800E6B
NEXT_PUBLIC_OXACHAIN_REPUTATION_REGISTRY=0x6a18C2664E1b42063860d864b6448b824d7B843F
NEXT_PUBLIC_OXACHAIN_CONFIGURATION_REGISTRY=0x07280674ccc2898Fd038A9e3C22005CA83ffD2F8
NEXT_PUBLIC_OXACHAIN_MULTI_ENDPOINT=0xB361d04F49000013FC131D3C59C41c8486C64f8c
NEXT_PUBLIC_OXACHAIN_A2A_PROTOCOL=0xDF2939EFafEe6439eB2226DbEd07AD6F5Ae2112B

# ── Legacy (compat) ────────────────────────────────────────
NEXT_PUBLIC_IDENTITY_REGISTRY_ADDRESS=0xe94ad380d3F8d08a7590eda0C84f354a93F96e5F
NEXT_PUBLIC_SUBSCRIPTION_MANAGER_ADDRESS=0xC15fE80b9d800abb72121F353a6ae6d6E9077E63
NEXT_PUBLIC_REPUTATION_REGISTRY_ADDRESS=0xeb6B410ea71b8d9dA0c96f6A91d35027CE143DC9
NEXT_PUBLIC_CONFIGURATION_REGISTRY_ADDRESS=0x68DcE00e4C9077c94BC68016cD14B09557faEA6c
NEXT_PUBLIC_MULTI_ENDPOINT_ADDRESS=0xEB5e866f186d4B73F97aa0d70B86f2C6e2e21Cb7
NEXT_PUBLIC_A2A_PROTOCOL_ADDRESS=0x309C7447d89f3087A9924BB686d88df020F7e9cB

# ── Gateway ─────────────────────────────────────────────────
NEXT_PUBLIC_AGENTX_GATEWAY_URL=http://101.33.109.117:3090
"""
b64 = base64.b64encode(env_content.encode()).decode()
run(c, f"echo '{b64}' | base64 -d > {APP_DIR}/.env.production && echo 'env written'")
run(c, f"cat > {APP_DIR}/.env.local << 'EOF'\nNEXT_PUBLIC_AGENTX_GATEWAY_URL=http://101.33.109.117:3090\nEOF\necho 'env.local written'")

# npm install
print("\n=== npm install ===")
ec, out, err = run(c, f"cd {APP_DIR} && npm install 2>&1 | tail -10", timeout=300)

# Build
print("\n=== next build (this takes 2-4 min) ===")
ec, out, err = run(c, f"cd {APP_DIR} && NODE_OPTIONS='--max-old-space-size=2560' npx next build 2>&1 | tail -25", timeout=600)
print(f"\nBuild exit: {ec}")

if ec != 0:
    print("BUILD FAILED!")
    run(c, "free -h")
    c.close()
    exit(1)

# Start
print(f"\n=== Starting on port {PORT} ===")
run(c, f"fuser -k {PORT}/tcp 2>/dev/null; sleep 1")
# Use pm2 if not available, use nohup
run(c, f"cd {APP_DIR} && nohup npx next start -p {PORT} > /tmp/agentx-prod.log 2>&1 &", timeout=5)
time.sleep(6)
run(c, f"ss -tlnp | grep {PORT}")
run(c, "tail -3 /tmp/agentx-prod.log")
run(c, f"curl -sI http://localhost:{PORT}/ 2>&1 | head -5")

c.close()
print("\n=== DEPLOYMENT DONE ===")
