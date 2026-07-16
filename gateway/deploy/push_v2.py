import paramiko, base64, tarfile, os

HOST = '43.156.78.59'
PWD = 'Asdf1234!'

root = r'c:\Users\apply\Downloads\code\agentx\extracted\Agentx'
tar_path = r'c:\Users\apply\Downloads\code\agentx_docs_push.tar.gz'

# Create tar of all files to push
files_to_push = [
    'README.md',
    'INTEGRATION.md',
    'DEPLOYMENT.md',
    'MCP_SETUP.md',
    'memory/AGENTX_PROGRESS.md',
    'sdk/README.md',
    'sdk/package.json',
    'sdk/src/config/config.ts',
    'frontend/next.config.js',
    'frontend/.env.production',
    'frontend/app/a2a/page.tsx',
    'frontend/app/user/chat/[agentId]/page.tsx',
    'contracts/src/erc8004-extensions/A2AProtocolRegistry.sol',
]

print("Creating tar...")
with tarfile.open(tar_path, 'w:gz') as tar:
    for f in files_to_push:
        full = os.path.join(root, f)
        if os.path.exists(full):
            tar.add(full, arcname=f)
            print(f"  + {f}")

print(f"\n{os.path.getsize(tar_path)//1024} KB. Uploading...")

t = paramiko.Transport((HOST, 22))
t.connect(username='ubuntu', password=PWD)
s = paramiko.SFTPClient.from_transport(t)
s.put(tar_path, '/tmp/agentx_push.tar.gz')
s.close()
t.close()

# Clone fresh, overwrite with our files, push
push_script = r'''#!/bin/bash
set -e
cd /tmp
rm -rf agentx-push
git clone https://github.com/sftgroup/Agentx.git agentx-push 2>&1 | tail -3
cd agentx-push
tar xzf /tmp/agentx_push.tar.gz --overwrite
git add -A
git diff --cached --stat
git commit -m "docs: v0.6.2 — production 164 full-stack, A2A v2 dual-chain, MCP setup, deployment guide" 2>&1
git push origin main 2>&1
echo "PUSH_SUCCESS"
'''

b64 = base64.b64encode(push_script.encode()).decode()
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username='ubuntu', password=PWD, timeout=30)

stdin, stdout, stderr = c.exec_command(
    f"echo '{b64}' | base64 -d > /tmp/base_push.sh && chmod +x /tmp/base_push.sh && bash /tmp/base_push.sh 2>&1"
)
out = stdout.read().decode()
err = stderr.read().decode()
print("\n=== Push Result ===")
print(out)
if err: print("E:", err[-500:])
c.close()
