#!/usr/bin/env python
import paramiko, tarfile, os, base64

HOST = '43.156.78.59'
PWD = 'Asdf1234!'
ROOT = r'c:\Users\apply\Downloads\code\agentx\extracted\Agentx'
TARPATH = r'c:\Users\apply\Downloads\code\agentx_full.tar.gz'

EXCLUDE = {'node_modules', '.next', '.git', 'dist', 'archive', '__pycache__', '.turbo'}

# 1. Create tar
print("=== Creating full-source tar ===")
count = 0
with tarfile.open(TARPATH, 'w:gz') as tar:
    for root, dirs, files in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in EXCLUDE]
        for f in files:
            if any(s in f for s in ['.tsbuildinfo', 'pnpm-lock.yaml', '.tar.gz', '.tgz']):
                continue
            full = os.path.join(root, f)
            arc = os.path.relpath(full, ROOT).replace('\\', '/')
            tar.add(full, arcname=arc)
            count += 1

size_mb = os.path.getsize(TARPATH) / (1024*1024)
print(f"{count} files, {size_mb:.1f} MB")

# 2. Upload
print("\n=== Uploading ===")
t = paramiko.Transport((HOST, 22))
t.connect(username='ubuntu', password=PWD)
s = paramiko.SFTPClient.from_transport(t)
s.put(TARPATH, '/tmp/agentx_full.tar.gz')
s.close()
t.close()
print("Uploaded")

# 3. Git clone + overwrite + push + tag
push_script = r'''#!/bin/bash
set -e
cd /tmp
rm -rf agentx-full-push
git clone git@github.com:sftgroup/Agentx.git agentx-full-push 2>&1 | tail -2

cd agentx-full-push

# Remove everything except .git
find . -mindepth 1 -maxdepth 1 -not -name '.git' -exec rm -rf {} \; 2>/dev/null || true

# Extract our code
tar xzf /tmp/agentx_full.tar.gz
echo "Extracted $(find . -type f -not -path './.git/*' | wc -l) files"

# Show stats
git add -A
echo "=== STATS ==="
git diff --cached --stat | tail -20

# Commit
git commit -m "release: v0.6.2 — full-stack production (164), A2A v2 dual-chain, Gateway migration, MCP setup guide, AgentLoop ReAct engine

- Smart contracts: A2AProtocolRegistry v2 with getUserTasks (Sepolia + OxaChain L1)
- SDK: @agentxv2/sdk@0.6.2 (13 modules, CJS/ESM/DTS)
- Frontend: Next.js 16.2 Turbopack standalone (production: 43.156.225.164:3000)
- Gateway: Express TypeScript multi-tenant LLM proxy (production: 43.156.225.164:3090)
- PostgreSQL: 6-table schema with seed data
- Docs: README, INTEGRATION, DEPLOYMENT, MCP_SETUP, PROGRESS (all updated)
- Bug fixes: A2A page wrong contract, getUserTasks missing, PaymentGateway deprecated
" 2>&1

# Push
git push origin main 2>&1
echo "=== PUSH OK ==="

# Tag
git tag -a v0.6.2 -m "v0.6.2 — Full-stack production release on 43.156.225.164
- A2AProtocolRegistry v2 (Sepolia: 0x309C...7e9cB, OxaChain: 0xDF29...112B)
- Gateway migrated to 164 (Express + PostgreSQL)
- MCP remote tool setup guide
- AgentLoop ReAct engine
- Dual-chain support (Sepolia 11155111 + OxaChain L1 19505)
"

git push origin v0.6.2 2>&1
echo "=== TAG PUSHED ==="
'''

b64 = base64.b64encode(push_script.encode()).decode()
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username='ubuntu', password=PWD, timeout=30)

stdin, stdout, stderr = c.exec_command(
    f"echo '{b64}' | base64 -d > /tmp/full_push.sh && chmod +x /tmp/full_push.sh && bash /tmp/full_push.sh 2>&1"
)
out = stdout.read().decode()
err = stderr.read().decode()
print("\n=== RESULT ===")
print(out)
if err: print("E:", err[-500:])
c.close()
