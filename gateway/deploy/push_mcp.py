import paramiko, base64

HOST = '43.156.78.59'
PWD = 'Asdf1234!'

# Read files
with open(r'c:\Users\apply\Downloads\code\agentx\extracted\Agentx\gateway\src\routes\mcp.ts', 'r', encoding='utf-8') as f:
    mcp = f.read()
with open(r'c:\Users\apply\Downloads\code\agentx\extracted\Agentx\gateway\src\index.ts', 'r', encoding='utf-8') as f:
    index = f.read()
with open(r'c:\Users\apply\Downloads\code\agentx\extracted\Agentx\gateway\src\config.ts', 'r', encoding='utf-8') as f:
    cfg = f.read()

b1 = base64.b64encode(mcp.encode()).decode()
b2 = base64.b64encode(index.encode()).decode()
b3 = base64.b64encode(cfg.encode()).decode()

push = f'''#!/bin/bash
set -e
cd /tmp
rm -rf agentx-mcp-push
git clone git@github.com:sftgroup/Agentx.git agentx-mcp-push
cd agentx-mcp-push
echo '{b1}' | base64 -d > gateway/src/routes/mcp.ts
echo '{b2}' | base64 -d > gateway/src/index.ts
echo '{b3}' | base64 -d > gateway/src/config.ts
git add -A
git diff --cached --stat
git commit -m "feat: Gateway MCP server — standard JSON-RPC 2.0 Model Context Protocol endpoint

POST /mcp — standard MCP JSON-RPC 2.0 endpoint
- tools/list → 29 AgentX platform tools
- tools/call  → execute read tools (on-chain via ethers), write tools return tx payload
- initialize / notifications/initialized → MCP lifecycle handshake

Compatible with: Claude Desktop, Cursor, any MCP client
Claude Desktop config:
  {{ \"mcpServers\": {{ \"agentx\": {{ \"url\": \"http://43.156.225.164:3090/mcp\" }} }} }}

Contract addresses configurable via .env (RPC_URL, IDENTITY_REGISTRY, etc.)
" 2>&1

git push origin main 2>&1
echo "PUSH_OK"

git tag -a v0.6.4 -m "v0.6.4 — Gateway MCP Server (standard JSON-RPC 2.0)
- POST /mcp endpoint with 29 platform tools
- tools/list + tools/call + initialize
- On-chain read via ethers.JsonRpcProvider
- Compatible with Claude Desktop, Cursor, any MCP client
" 2>&1

git push origin v0.6.4 2>&1
echo "TAG_OK"
'''

pb = base64.b64encode(push.encode()).decode()
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username='ubuntu', password=PWD, timeout=30)

stdin, stdout, stderr = c.exec_command(f"echo '{pb}' | base64 -d | bash 2>&1")
print(stdout.read().decode())
err = stderr.read().decode()
if err: print("E:", err[-500:])
c.close()
