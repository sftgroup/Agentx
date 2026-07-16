import paramiko
import tarfile, os

HOST = '43.156.225.164'
PWD = 'Asdf1234!'

# Upload fresh tar
local_dir = r'c:\Users\apply\Downloads\code\agentx\extracted\Agentx\frontend'
tar_path = r'c:\Users\apply\Downloads\code\agentx_fe_prod.tar.gz'

print("=== Creating tar ===")
with tarfile.open(tar_path, 'w:gz') as tar:
    for root, dirs, files in os.walk(local_dir):
        dirs[:] = [d for d in dirs if d not in ('node_modules', '.next', '.git', '__pycache__')]
        for f in files:
            if f.endswith('.tsbuildinfo') or f == 'pnpm-lock.yaml': continue
            full = os.path.join(root, f)
            arc = os.path.relpath(full, local_dir).replace('\\', '/')
            tar.add(full, arcname=arc)

print("Uploading...")
t = paramiko.Transport((HOST, 22))
t.connect(username='ubuntu', password=PWD)
s = paramiko.SFTPClient.from_transport(t)
s.put(tar_path, '/tmp/agentx_fe.tar.gz')
s.close()
t.close()

print("Extracting + building...")
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username='ubuntu', password=PWD, timeout=30)

# Extract
stdin, stdout, stderr = c.exec_command(
    "rm -rf /home/ubuntu/agentx-platform && mkdir -p /home/ubuntu/agentx-platform && "
    "cd /home/ubuntu/agentx-platform && tar xzf /tmp/agentx_fe.tar.gz && "
    "ls app/page.tsx && echo 'EXTRACT OK' || echo 'EXTRACT FAILED'",
    timeout=30
)
print(stdout.read().decode().strip())

# Write .env
env = '''NEXT_PUBLIC_APP_NAME="AgentX"
NEXT_PUBLIC_APP_URL=http://43.156.225.164:3000
NEXT_PUBLIC_DEFAULT_CHAIN_ID=11155111
NEXT_PUBLIC_SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/63ee183a3afa43208e99d6f3f1e7c5fb
NEXT_PUBLIC_SEPOLIA_IDENTITY_REGISTRY=0xe94ad380d3F8d08a7590eda0C84f354a93F96e5F
NEXT_PUBLIC_SEPOLIA_SUBSCRIPTION_MANAGER=0xC15fE80b9d800abb72121F353a6ae6d6E9077E63
NEXT_PUBLIC_SEPOLIA_REPUTATION_REGISTRY=0xeb6B410ea71b8d9dA0c96f6A91d35027CE143DC9
NEXT_PUBLIC_SEPOLIA_CONFIGURATION_REGISTRY=0x68DcE00e4C9077c94BC68016cD14B09557faEA6c
NEXT_PUBLIC_SEPOLIA_MULTI_ENDPOINT=0xEB5e866f186d4B73F97aa0d70B86f2C6e2e21Cb7
NEXT_PUBLIC_SEPOLIA_A2A_PROTOCOL=0x309C7447d89f3087A9924BB686d88df020F7e9cB
NEXT_PUBLIC_OXACHAIN_RPC_URL=http://43.156.99.215:18545
NEXT_PUBLIC_OXACHAIN_EXPLORER=http://43.156.99.215:18400
NEXT_PUBLIC_OXACHAIN_IDENTITY_REGISTRY=0xbf5F9db266c8c97E3334466C88597Eb758AfE212
NEXT_PUBLIC_OXACHAIN_SUBSCRIPTION_MANAGER=0x019AC9d945467478Dd371CDbD70cb2f325800E6B
NEXT_PUBLIC_OXACHAIN_REPUTATION_REGISTRY=0x6a18C2664E1b42063860d864b6448b824d7B843F
NEXT_PUBLIC_OXACHAIN_CONFIGURATION_REGISTRY=0x07280674ccc2898Fd038A9e3C22005CA83ffD2F8
NEXT_PUBLIC_OXACHAIN_MULTI_ENDPOINT=0xB361d04F49000013FC131D3C59C41c8486C64f8c
NEXT_PUBLIC_OXACHAIN_A2A_PROTOCOL=0xDF2939EFafEe6439eB2226DbEd07AD6F5Ae2112B
NEXT_PUBLIC_IDENTITY_REGISTRY_ADDRESS=0xe94ad380d3F8d08a7590eda0C84f354a93F96e5F
NEXT_PUBLIC_SUBSCRIPTION_MANAGER_ADDRESS=0xC15fE80b9d800abb72121F353a6ae6d6E9077E63
NEXT_PUBLIC_REPUTATION_REGISTRY_ADDRESS=0xeb6B410ea71b8d9dA0c96f6A91d35027CE143DC9
NEXT_PUBLIC_CONFIGURATION_REGISTRY_ADDRESS=0x68DcE00e4C9077c94BC68016cD14B09557faEA6c
NEXT_PUBLIC_MULTI_ENDPOINT_ADDRESS=0xEB5e866f186d4B73F97aa0d70B86f2C6e2e21Cb7
NEXT_PUBLIC_A2A_PROTOCOL_ADDRESS=0x309C7447d89f3087A9924BB686d88df020F7e9cB
NEXT_PUBLIC_AGENTX_GATEWAY_URL=http://101.33.109.117:3090
'''
import base64
b64 = base64.b64encode(env.encode()).decode()
c.exec_command(f"echo '{b64}' | base64 -d > /home/ubuntu/agentx-platform/.env.production", timeout=10)

# npm install in background
print("\n=== npm install (background) ===")
channel = c.get_transport().open_session()
channel.exec_command(
    "cd /home/ubuntu/agentx-platform && "
    "npm install > /tmp/npm-install.log 2>&1 && echo 'NPM_DONE' >> /tmp/agentx-deploy.log"
)

# Poll for npm install completion
import time
for i in range(30):
    time.sleep(10)
    stdin2, stdout2, stderr2 = c.exec_command("tail -1 /tmp/agentx-deploy.log 2>/dev/null")
    tail = stdout2.read().decode().strip()
    if 'NPM_DONE' in tail:
        print("npm install done")
        break
    print(f"  [{i+1}s] installing...")

# Build in background
print("\n=== next build (background, 2-4 min) ===")
channel2 = c.get_transport().open_session()
channel2.exec_command(
    "cd /home/ubuntu/agentx-platform && "
    "NODE_OPTIONS='--max-old-space-size=2560' npx next build >> /tmp/agentx-deploy.log 2>&1; "
    "echo 'BUILD_EXIT='$? >> /tmp/agentx-deploy.log"
)

for i in range(40):
    time.sleep(15)
    stdin3, stdout3, stderr3 = c.exec_command("tail -3 /tmp/agentx-deploy.log 2>/dev/null")
    tail = stdout3.read().decode()
    if 'BUILD_EXIT' in tail:
        print(f"\nBUILD RESULT: {tail.strip()}")
        break
    # Show progress
    if i % 4 == 0:
        lines = tail.strip().split('\n')
        last = [l for l in lines if l.strip() and not l.startswith('===')]
        if last:
            print(f"  [{i*15}s] {last[-1][:150]}")
else:
    print("Build timeout. Checking...")

# Check result + start
stdin4, stdout4, stderr4 = c.exec_command(
    "grep BUILD_EXIT /tmp/agentx-deploy.log; "
    "ls /home/ubuntu/agentx-platform/.next/BUILD_ID 2>/dev/null && echo BUILD_ID_OK"
)
print(stdout4.read().decode())

# Start
print("\n=== Starting ===")
c.exec_command("fuser -k 3000/tcp 2>/dev/null; sleep 1", timeout=10)
channel3 = c.get_transport().open_session()
channel3.exec_command(
    "cd /home/ubuntu/agentx-platform && "
    "nohup npx next start -p 3000 > /tmp/agentx-run.log 2>&1 & disown; "
    "sleep 5; ss -tlnp | grep 3000 >> /tmp/agentx-deploy.log"
)
time.sleep(8)

stdin5, stdout5, stderr5 = c.exec_command("ss -tlnp | grep 3000 && echo --- && curl -sI http://localhost:3000/ 2>&1 | head -3")
print(stdout5.read().decode())

c.close()
print("\n✅ Done")
