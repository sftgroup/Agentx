import paramiko, tarfile, os, base64, time

HOST = '43.156.225.164'
PWD = 'Asdf1234!'

# 1. Create fresh tar
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
print(f"{os.path.getsize(tar_path)//1024} KB")

# 2. Upload
print("Uploading...")
t = paramiko.Transport((HOST, 22))
t.connect(username='ubuntu', password=PWD)
s = paramiko.SFTPClient.from_transport(t)
s.put(tar_path, '/tmp/agentx_fe.tar.gz')
s.close()
t.close()

# 3. Deploy script (all in one)
script = '''#!/bin/bash
set -e
export NODE_OPTIONS="--max-old-space-size=2560"
APP=/home/ubuntu/agentx-platform
LOG=/tmp/agentx-deploy.log
rm -rf $APP && mkdir -p $APP

echo "=== extract ===" >> $LOG
cd $APP && tar xzf /tmp/agentx_fe.tar.gz

cat > $APP/.env.production << 'EOF'
NEXT_PUBLIC_APP_NAME="AgentX"
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
EOF

cat > $APP/.env.local << 'EOF'
NEXT_PUBLIC_AGENTX_GATEWAY_URL=http://101.33.109.117:3090
EOF

echo "=== npm install ===" >> $LOG
cd $APP && npm install --legacy-peer-deps 2>&1 | tail -5 >> $LOG

echo "=== build ===" >> $LOG
cd $APP && ./node_modules/.bin/next build 2>&1 | tail -25 >> $LOG
BUILD_EXIT=${PIPESTATUS[0]}

echo "BUILD_EXIT=$BUILD_EXIT" >> $LOG

echo "=== start ===" >> $LOG
fuser -k 3000/tcp 2>/dev/null || true
sleep 2
cd $APP && nohup ./node_modules/.bin/next start -p 3000 > /tmp/agentx-run.log 2>&1 &
sleep 6
ss -tlnp | grep 3000 >> $LOG
echo "DONE $(date)" >> $LOG
'''

b64 = base64.b64encode(script.encode()).decode()
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username='ubuntu', password=PWD, timeout=15)

stdin, stdout, stderr = c.exec_command(f"echo '{b64}' | base64 -d > /tmp/go.sh && chmod +x /tmp/go.sh && echo OK")
print(stdout.read().decode().strip())

# Start in background
channel = c.get_transport().open_session()
channel.exec_command("nohup bash /tmp/go.sh &>/dev/null & disown")
time.sleep(2)
c.close()

print("=== Build started. Polling log... ===")

# Poll
for i in range(50):
    time.sleep(15)
    try:
        c2 = paramiko.SSHClient()
        c2.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        c2.connect(HOST, username='ubuntu', password=PWD, timeout=10)
        stdin2, stdout2, stderr2 = c2.exec_command("tail -5 /tmp/agentx-deploy.log 2>/dev/null")
        tail = stdout2.read().decode()
        lines = [l for l in tail.split('\n') if l.strip()]
        
        for line in lines:
            if 'DONE' in line:
                print(f"\n✅ {line}")
                c2.close()
                # Verify
                stdin3, stdout3, stderr3 = c2.exec_command("ss -tlnp | grep 3000 && curl -sI http://localhost:3000/ 2>&1 | head -3")
                print(stdout3.read().decode())
                exit(0)
            if 'FAIL' in line or 'Error' in line:
                print(f"  ⚠️ {line[:200]}")
        
        # Status line
        if lines and '===' in lines[-1]:
            print(f"  [{i*15}s] {lines[-1][:100]}")
        elif lines and ('Compiling' in tail or 'Route' in tail or 'Static' in tail or 'BUILD' in tail):
            print(f"  [{i*15}s] {lines[-1][:150]}")
            
        c2.close()
    except:
        continue

print("\nCheck: http://43.156.225.164:3000")
