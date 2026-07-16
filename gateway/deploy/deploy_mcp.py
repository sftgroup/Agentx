import paramiko, tarfile, os, base64, time

HOST = '43.156.225.164'
PWD = 'Asdf1234!'
APP = '/home/ubuntu/agentx-gateway'

local = r'c:\Users\apply\Downloads\code\agentx\extracted\Agentx\gateway'
tarpath = r'c:\Users\apply\Downloads\code\agentx_gw_mcp.tar.gz'

# 1. Tar gateway files
print("=== Tar ===")
files_added = []
with tarfile.open(tarpath, 'w:gz') as tar:
    for root, dirs, files in os.walk(local):
        dirs[:] = [d for d in dirs if d not in ('node_modules','dist','.git')]
        for f in files:
            if f.endswith('.tar.gz') or f in ('.env',): continue
            full = os.path.join(root, f)
            arc = os.path.relpath(full, local).replace('\\', '/')
            tar.add(full, arcname=arc)
            files_added.append(arc)
print(f"{len(files_added)} files, {os.path.getsize(tarpath)//1024} KB")

# 2. Upload
print("Uploading...")
t = paramiko.Transport((HOST, 22))
t.connect(username='ubuntu', password=PWD)
s = paramiko.SFTPClient.from_transport(t)
s.put(tarpath, '/tmp/gw_mcp.tar.gz')
s.close()
t.close()

# 3. Deploy: extract, install, build, start
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username='ubuntu', password=PWD, timeout=30)

# Extract new files
stdin, stdout, stderr = c.exec_command(f"cd {APP} && tar xzf /tmp/gw_mcp.tar.gz --overwrite && echo 'EXTRACTED' && ls src/routes/mcp.ts")
print(stdout.read().decode().strip())

# Install deps (ethers is already in package.json)
print("\n=== npm install ===")
stdin, stdout, stderr = c.exec_command(f"cd {APP} && npm install 2>&1 | tail -5", timeout=120)
print(stdout.read().decode())

# Build
print("\n=== tsc ===")
stdin, stdout, stderr = c.exec_command(f"cd {APP} && ./node_modules/.bin/tsc 2>&1 | tail -10; echo 'EXIT='$?", timeout=120)
out = stdout.read().decode()
print(out[-500:])

# Check dist
stdin, stdout, stderr = c.exec_command(f"ls {APP}/dist/routes/mcp.js 2>/dev/null && echo BUILD_OK || echo BUILD_FAILED")
check = stdout.read().decode().strip()
print(f"Build: {check}")

if 'FAILED' in check:
    print("BUILD FAILED")
    c.close()
    exit(1)

# Read current .env
stdin, stdout, stderr = c.exec_command(f"cat {APP}/.env")
env = stdout.read().decode()

# Ensure MCP-related env vars exist
env_lines = env.split('\n')
has_rpc = any('RPC_URL' in l for l in env_lines)
has_chain = any('CHAIN_ID' in l for l in env_lines)

if not has_rpc:
    env_lines.append('RPC_URL=https://ethereum-sepolia-rpc.publicnode.com')
if not has_chain:
    env_lines.append('CHAIN_ID=11155111')

new_env = '\n'.join(env_lines)
b64 = base64.b64encode(new_env.encode()).decode()
c.exec_command(f"echo '{b64}' | base64 -d > {APP}/.env && echo 'ENV OK'")

# Kill old + start
print("\n=== Restart Gateway ===")
c.exec_command("fuser -k 3090/tcp 2>/dev/null; sleep 2", timeout=10)
c.exec_command(f"cd {APP} && nohup node dist/index.js > /tmp/gw.log 2>&1 & disown", timeout=5)
time.sleep(5)

# Verify health
stdin, stdout, stderr = c.exec_command("ss -tlnp | grep 3090 && echo '---' && curl -s http://localhost:3090/api/v1/health")
print(stdout.read().decode())

# Test MCP tools/list
print("\n=== Test MCP tools/list ===")
stdin, stdout, stderr = c.exec_command(
    'curl -s -X POST http://localhost:3090/mcp -H "Content-Type: application/json" '
    '-d \'{"jsonrpc":"2.0","id":1,"method":"tools/list"}\' 2>&1 | python3 -c "import sys,json; d=json.load(sys.stdin); tools=d.get(\"result\",{}).get(\"tools\",[]); print(f\\"Tools: {len(tools)}\\"); [print(f\\"  {t[\\"name\\"]}\\") for t in tools[:5]]; print(\\"  ...\\" if len(tools)>5 else \\"\\")"'
)
print(stdout.read().decode())

# Test MCP tools/call (read operation)
print("\n=== Test MCP tools/call ===")
stdin, stdout, stderr = c.exec_command(
    'curl -s -X POST http://localhost:3090/mcp -H "Content-Type: application/json" '
    '-d \'{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"agentx_gateway_health","arguments":{}}}\' 2>&1 | python3 -c "import sys,json; d=json.load(sys.stdin); r=d.get(\"result\",{}); c=r.get(\"content\",[]); print(json.loads(c[0][\"text\"]) if c else \\"no content\\" if not d.get(\\"error\\") else d.get(\\"error\\"))"'
)
print(stdout.read().decode())

c.close()
print("\n✅ MCP v0.1.0 deployed — http://43.156.225.164:3090/mcp")
