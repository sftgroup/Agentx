import paramiko, tarfile, os, base64

GIT_HOST = '43.156.78.59'
PWD = 'Asdf1234!'
ROOT = r'c:\Users\apply\Downloads\code\agentx\extracted\Agentx'
TARPATH = r'c:\Users\apply\Downloads\code\agentx_full_push.tar.gz'

EXCLUDE_DIRS = {'node_modules', '.next', '.git', 'dist', 'archive', '__pycache__', '.turbo'}
SECRET_FILES = {'git_push.py'}

print("=== Tar all files ===")
count = 0
with tarfile.open(TARPATH, 'w:gz') as tar:
    for root, dirs, files in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
        for f in files:
            if f in SECRET_FILES or f.endswith(('.tsbuildinfo', 'pnpm-lock.yaml', '.tar.gz', '.tgz')):
                continue
            full = os.path.join(root, f)
            arc = os.path.relpath(full, ROOT).replace('\\', '/')
            tar.add(full, arcname=arc)
            count += 1
print(f"{count} files, {os.path.getsize(TARPATH)//1024} KB")

# Upload
print("\n=== Upload ===")
t = paramiko.Transport((GIT_HOST, 22))
t.connect(username='ubuntu', password=PWD)
s = paramiko.SFTPClient.from_transport(t)
s.put(TARPATH, '/tmp/ax_full.tar.gz')
s.close()
t.close()

# Clone + overwrite + push + tag
push = '''#!/bin/bash
set -e
cd /tmp
rm -rf ax-final
git clone git@github.com:sftgroup/Agentx.git ax-final
cd ax-final
find . -mindepth 1 -maxdepth 1 -not -name '.git' -exec rm -rf {} \; 2>/dev/null || true
tar xzf /tmp/ax_full.tar.gz
echo "Files: $(find . -type f -not -path './.git/*' | wc -l)"

git add -A
echo "=== STATS ==="
git diff --cached --stat --stat=120 | tail -30
git commit -m "release: v0.6.4 — full-stack dual-chain, MCP server, platform tools, all docs

Smart Contracts (6 contracts, dual-chain):
- Sepolia (11155111) + OxaChain L1 (19505)
- A2AProtocolRegistry v2 with getUserTasks(address)

SDK @agentxv2/sdk@0.6.3:
- platform-tools.ts: 28 LLM tools exposing all 7 contract modules
- buildPlatformTools() / executePlatformTool() / wrapPlatformToolsAsSkills()

Gateway v0.2.0:
- POST /mcp — standard MCP JSON-RPC 2.0 server
- 29 tools, dual-chain support (chain: sepolia/oxachain)
- tools/list + tools/call + initialize + notifications/initialized

Docs (all updated with dual-chain):
- README.md: project overview, dual-chain architecture
- INTEGRATION.md: SDK/Gateway/Contract integration (v0.6.2+)
- DEPLOYMENT.md: production 164 full-stack + all 12 contract addresses
- MCP_SETUP.md: Claude Desktop/Cursor config, all 29 tools, dual-chain
- SDK README: v0.6.3 API reference
- AGENTX_PROGRESS.md: full development tracker

Production: 43.156.225.164 (Frontend :3000, Gateway :3090, PG :5432)
" 2>&1

git push origin main 2>&1
echo "PUSH_OK"

git tag -f v0.6.4 2>/dev/null
git push origin :refs/tags/v0.6.4 2>/dev/null
git tag -a v0.6.4 -m "v0.6.4 — Full-stack dual-chain release

Production: 43.156.225.164 (Frontend :3000, Gateway :3090, PG :5432)

Contracts (Dual-Chain):
  Sepolia (11155111): IdentityRegistry 0xe94a...96e5F
  OxaChain L1 (19505): IdentityRegistry 0xbf5F...E212
  A2AProtocolRegistry v2 with getUserTasks on both chains

SDK @agentxv2/sdk@0.6.3:
  platform-tools.ts: 28 LLM-callable tools (all 7 contract modules)
  AgentLoop ReAct engine with open/mcp/a2a skill execution

Gateway:
  POST /mcp — standard MCP JSON-RPC 2.0 server (29 tools)
  Dual-chain read: Sepolia + OxaChain L1
  Claude Desktop / Cursor compatible

Docs: README, INTEGRATION, DEPLOYMENT, MCP_SETUP, SDK README, PROGRESS
" 2>&1

git push origin v0.6.4 2>&1
echo "TAG_OK"
'''

pb = base64.b64encode(push.encode()).decode()
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(GIT_HOST, username='ubuntu', password=PWD, timeout=30)
stdin, stdout, stderr = c.exec_command(f"echo '{pb}' | base64 -d | bash 2>&1")
out = stdout.read().decode()
err = stderr.read().decode()
print("\n=== RESULT ===")
print(out)
if err: print("E:", err[-500:])
c.close()
