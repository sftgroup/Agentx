#!/usr/bin/env python
import paramiko, tarfile, os, base64

HOST = '43.156.78.59'
PWD = 'Asdf1234!'
ROOT = r'c:\Users\apply\Downloads\code\agentx\extracted\Agentx'
TARPATH = r'c:\Users\apply\Downloads\code\agentx_full.tar.gz'

EXCLUDE = {'node_modules', '.next', '.git', 'dist', 'archive', '__pycache__', '.turbo'}

# Files containing secrets (passwords, tokens, private keys) — exclude
SECRET_FILES = {
    'git_push.py', 'restore_gateway.py', 'restore_quick.py', 'restore_frontend.py',
    'restore_frontend2.py', 'server_prepare.py', 'server_setup.py', 'upload_and_start.py',
    'start_deploy.py', 'start_frontend.py', 'start_v2.py', 'deploy_frontend.py',
    'build_on_gw.py', 'build_on_fe.py', 'one_shot.py', 'final_check.py',
    'final_deploy.py', 'final_fix.py', 'fix_and_verify.py', 'fix_build.py',
    'fix_frontend.py', 'find_frontend.py', 'inline_build.py', 'rebuild_frontend.py',
    'deploy_script.py', 'deploy_final.py', 'deploy_now.py', 'dev_mode.py',
    'check_frontend.py', 'check_frontend2.py'
}

print("=== Creating full-source tar ===")
count = 0
with tarfile.open(TARPATH, 'w:gz') as tar:
    for root, dirs, files in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in EXCLUDE]
        for f in files:
            if any(s in f for s in ['.tsbuildinfo', 'pnpm-lock.yaml', '.tar.gz', '.tgz']):
                continue
            if f in SECRET_FILES:
                continue
            full = os.path.join(root, f)
            arc = os.path.relpath(full, ROOT).replace('\\', '/')
            tar.add(full, arcname=arc)
            count += 1

size_mb = os.path.getsize(TARPATH) / (1024*1024)
print(f"{count} files, {size_mb:.1f} MB")

# Upload
print("\n=== Uploading ===")
t = paramiko.Transport((HOST, 22))
t.connect(username='ubuntu', password=PWD)
s = paramiko.SFTPClient.from_transport(t)
s.put(TARPATH, '/tmp/agentx_full.tar.gz')
s.close()
t.close()
print("Uploaded")

# Push + tag
push_script = r'''#!/bin/bash
set -e
cd /tmp
rm -rf agentx-full-push
git clone git@github.com:sftgroup/Agentx.git agentx-full-push
cd agentx-full-push
find . -mindepth 1 -maxdepth 1 -not -name '.git' -exec rm -rf {} \; 2>/dev/null || true
tar xzf /tmp/agentx_full.tar.gz
echo "Files: $(find . -type f -not -path './.git/*' | wc -l)"
git add -A
echo "=== STATS ==="
git diff --cached --stat --stat=120 | tail -25
git commit -m "release: v0.6.2 — full-stack production (164), A2A v2 dual-chain, Gateway, AgentLoop, MCP

Core changes:
- A2AProtocolRegistry v2 with getUserTasks(address) (Sepolia + OxaChain L1)
- SDK @agentxv2/sdk@0.6.2 (13 modules, dual-chain A2A addresses)
- Gateway Express TypeScript (EIP-191 auth, dual-mode LLM proxy, 3-layer rate limit)
- PostgreSQL 6-table schema with seed data
- Frontend Next.js 16.2 Turbopack (A2A page fix, AgentLoop chat, GatewayProvider)
- Docs: README, INTEGRATION, DEPLOYMENT, MCP_SETUP, PROGRESS
- Bug fixes: A2A wrong contract, missing getUserTasks, deprecated PaymentGateway

Production: 43.156.225.164 (Frontend :3000, Gateway :3090, PG :5432)
" 2>&1

git push origin main 2>&1
echo "=== PUSH OK ==="

git tag -a v0.6.2 -m "v0.6.2 — Full-stack production release
- A2AProtocolRegistry v2: Sepolia 0x309C7447d89f3087A9924BB686d88df020F7e9cB, OxaChain 0xDF2939EFafEe6439eB2226DbEd07AD6F5Ae2112B
- SDK @agentxv2/sdk@0.6.2
- Gateway on 43.156.225.164:3090
- Frontend on 43.156.225.164:3000
- MCP remote tool setup guide
" 2>&1

git push origin v0.6.2 2>&1
echo "=== TAG PUSHED ==="
'''

b64 = base64.b64encode(push_script.encode()).decode()
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username='ubuntu', password=PWD, timeout=30)

stdin, stdout, stderr = c.exec_command(
    f"echo '{b64}' | base64 -d > /tmp/full_push2.sh && chmod +x /tmp/full_push2.sh && bash /tmp/full_push2.sh 2>&1"
)
out = stdout.read().decode()
err = stderr.read().decode()
print("\n=== RESULT ===")
print(out)
if err: print("E:", err[-500:])
c.close()
