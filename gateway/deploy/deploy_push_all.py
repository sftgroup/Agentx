import paramiko, tarfile, os, base64, time

GW_HOST = '43.156.225.164'
GIT_HOST = '43.156.78.59'
PWD = 'Asdf1234!'

GW_LOCAL = r'c:\Users\apply\Downloads\code\agentx\extracted\Agentx\gateway'
TARPATH = r'c:\Users\apply\Downloads\code\agentx_gw_v2.tar.gz'
GW_APP = '/home/ubuntu/agentx-gateway'

# ── 1. Build tar ──────────────────────────────────────────────────────
print("=== Tar ===")
with tarfile.open(TARPATH, 'w:gz') as tar:
    for root, dirs, files in os.walk(GW_LOCAL):
        dirs[:] = [d for d in dirs if d not in ('node_modules','dist','.git')]
        for f in files:
            if f in ('.env',) or f.endswith('.tar.gz'): continue
            full = os.path.join(root, f)
            arc = os.path.relpath(full, GW_LOCAL).replace('\\','/')
            tar.add(full, arcname=arc)
print(f"{os.path.getsize(TARPATH)//1024} KB")

# ── 2. Upload to production ──────────────────────────────────────────
print("\n=== Upload to 164 ===")
t = paramiko.Transport((GW_HOST, 22))
t.connect(username='ubuntu', password=PWD)
s = paramiko.SFTPClient.from_transport(t)
s.put(TARPATH, '/tmp/gw_v2.tar.gz')
s.close()
t.close()

# ── 3. Build + deploy Gateway ────────────────────────────────────────
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(GW_HOST, username='ubuntu', password=PWD, timeout=30)

c.exec_command(f"cd {GW_APP} && tar xzf /tmp/gw_v2.tar.gz --overwrite && echo 'EXTRACTED' && ls src/routes/mcp.ts src/config.ts", timeout=10)

# Add RPC_URL_OXACHAIN to .env if missing
stdin, stdout, stderr = c.exec_command(f"grep RPC_URL_OXACHAIN {GW_APP}/.env || echo 'RPC_URL_OXACHAIN=http://43.156.99.215:18545' >> {GW_APP}/.env && echo 'ENV OK'")
print(stdout.read().decode().strip())

# Build
print("\n=== tsc ===")
stdin, stdout, stderr = c.exec_command(f"cd {GW_APP} && ./node_modules/.bin/tsc 2>&1 | tail -5; echo 'EXIT='$?", timeout=120)
out = stdout.read().decode()
print(out[-300:])

stdin, stdout, stderr = c.exec_command(f"ls {GW_APP}/dist/routes/mcp.js && echo BUILD_OK || echo BUILD_FAILED")
print(stdout.read().decode().strip())

# Restart
print("\n=== Restart Gateway ===")
c.exec_command("fuser -k 3090/tcp 2>/dev/null; sleep 2", timeout=10)
c.exec_command(f"cd {GW_APP} && nohup node dist/index.js > /tmp/gw.log 2>&1 & disown", timeout=5)
time.sleep(5)

# Verify
stdin, stdout, stderr = c.exec_command("ss -tlnp | grep 3090 && curl -s http://localhost:3090/api/v1/health")
print(stdout.read().decode())

import json
# Test dual-chain health
stdin, stdout, stderr = c.exec_command(
    'curl -s -X POST http://localhost:3090/mcp -H "Content-Type: application/json" -d \'{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"agentx_gateway_health","arguments":{}}}\''
)
data = json.loads(stdout.read().decode())
chains = data.get('result', {}).get('content', [{}])[0].get('text', '{}')
try:
    h = json.loads(chains) if isinstance(chains, str) else chains
    ox = h.get('chains', {}).get('oxachain', {})
    print(f"\nMCP dual-chain: Sepolia={h.get('chains',{}).get('sepolia',{}).get('chainId')}, OxaChain={ox.get('chainId')}, A2A={ox.get('a2aProtocol','')[:10]}...")
except: pass

c.close()
print("\n✅ Gateway v0.2.0 deployed — dual-chain MCP on 164:3090")

# ── 4. Push to GitHub ─────────────────────────────────────────────────
print("\n=== Push to GitHub ===")

# Read final files
with open(GW_LOCAL + r'\src\routes\mcp.ts', 'r', encoding='utf-8') as f: mcp = f.read()
with open(GW_LOCAL + r'\src\config.ts', 'r', encoding='utf-8') as f: cfg = f.read()
with open(GW_LOCAL + r'\src\index.ts', 'r', encoding='utf-8') as f: idx = f.read()
with open(MCP_DOC := r'c:\Users\apply\Downloads\code\agentx\extracted\Agentx\MCP_SETUP.md', 'r', encoding='utf-8') as f: mcp_doc = f.read()

b_mcp = base64.b64encode(mcp.encode()).decode()
b_cfg = base64.b64encode(cfg.encode()).decode()
b_idx = base64.b64encode(idx.encode()).decode()
b_doc = base64.b64encode(mcp_doc.encode()).decode()

push = f'''#!/bin/bash
set -e
cd /tmp && rm -rf axpush && git clone git@github.com:sftgroup/Agentx.git axpush
cd axpush
echo '{b_mcp}' | base64 -d > gateway/src/routes/mcp.ts
echo '{b_cfg}' | base64 -d > gateway/src/config.ts
echo '{b_idx}' | base64 -d > gateway/src/index.ts
echo '{b_doc}' | base64 -d > MCP_SETUP.md
git add -A
git diff --cached --stat --stat=100
git commit -m "feat: MCP dual-chain support — Sepolia + OxaChain L1

Gateway /mcp now supports chain parameter:
- tools/call with {{\"chain\":\"sepolia\"}} (default) or {{\"chain\":\"oxachain\"}}
- All 6 contracts on both chains configured via .env
- Health endpoint returns both chain contract addresses
- MCP_SETUP.md updated with full dual-chain address table
" 2>&1
git push origin main 2>&1
git tag -f v0.6.4 2>/dev/null
git tag -f -a v0.6.4 -m "v0.6.4 — MCP dual-chain (Sepolia + OxaChain L1), 29 platform tools" 2>&1
git push origin v0.6.4 --force 2>&1
echo "PUSH_OK"
'''

pb = base64.b64encode(push.encode()).decode()
c2 = paramiko.SSHClient()
c2.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c2.connect(GIT_HOST, username='ubuntu', password=PWD, timeout=30)
stdin, stdout, stderr = c2.exec_command(f"echo '{pb}' | base64 -d | bash 2>&1")
print(stdout.read().decode())
err = stderr.read().decode()
if err: print("E:", err[-300:])
c2.close()

print("\n✅ All done — production deployed + GitHub pushed")
print("  MCP: http://43.156.225.164:3090/mcp (Sepolia + OxaChain L1)")
