import paramiko
import tarfile
import os
import base64
import time

HOST = '43.156.225.164'
PWD = 'Asdf1234!'
PORT = '3090'
APP = '/home/ubuntu/agentx-gateway'

# 1. Create tar of gateway source
local = r'c:\Users\apply\Downloads\code\agentx\extracted\Agentx\gateway'
tarpath = r'c:\Users\apply\Downloads\code\agentx_gw.tar.gz'

print("=== Tar ===")
with tarfile.open(tarpath, 'w:gz') as tar:
    for root, dirs, files in os.walk(local):
        dirs[:] = [d for d in dirs if d not in ('node_modules','dist','.git')]
        for f in files:
            if f.endswith('.tar.gz'): continue
            full = os.path.join(root, f)
            arc = os.path.relpath(full, local).replace('\\', '/')
            tar.add(full, arcname=arc)
print(f"{os.path.getsize(tarpath)//1024} KB")

# 2. Upload
print("Uploading...")
t = paramiko.Transport((HOST, 22))
t.connect(username='ubuntu', password=PWD)
s = paramiko.SFTPClient.from_transport(t)
s.put(tarpath, '/tmp/agentx_gw.tar.gz')
s.close()
t.close()

# 3. Extract + install + build + start
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username='ubuntu', password=PWD, timeout=30)

# Extract
stdin, stdout, stderr = c.exec_command(
    f"rm -rf {APP} && mkdir -p {APP} && cd {APP} && tar xzf /tmp/agentx_gw.tar.gz && ls src/index.ts && echo 'OK'",
    timeout=15
)
print(stdout.read().decode().strip())

# Read gateway .env.example from local
try:
    with open(local + r'\.env.example', 'r') as f:
        env = f.read()
except:
    env = ''
with open(local + r'\.env', 'r') as f:
    env = f.read()

# Write .env with PG on localhost
env_lines = []
for line in env.split('\n'):
    if line.startswith('DATABASE_URL='):
        env_lines.append('DATABASE_URL=postgresql://agentx:AgentX2024!Gateway@localhost:5432/agentx_gateway')
    elif line.startswith('PG'):
        continue
    else:
        env_lines.append(line)
# Make sure critical lines exist
new_env = '\n'.join(env_lines)
if 'DATABASE_URL' not in new_env:
    new_env += '\nDATABASE_URL=postgresql://agentx:AgentX2024!Gateway@localhost:5432/agentx_gateway'
if 'PORT=' not in new_env:
    new_env += f'\nPORT={PORT}'
if 'JWT_SECRET' not in new_env:
    new_env += '\nJWT_SECRET=agentx-prod-jwt-secret-key-2026'

b64 = base64.b64encode(new_env.encode()).decode()
stdin, stdout, stderr = c.exec_command(f"echo '{b64}' | base64 -d > {APP}/.env && echo 'env OK'")
print(stdout.read().decode().strip())

# Check if tsx is available, install deps
print("\n=== npm install ===")
stdin, stdout, stderr = c.exec_command(
    f"cd {APP} && npm install 2>&1 | tail -8",
    timeout=600
)
out = stdout.read().decode()
err = stderr.read().decode()
print(out)
if err: print("E:", err[-300:])

# Build TypeScript
print("\n=== tsc build ===")
stdin, stdout, stderr = c.exec_command(
    f"cd {APP} && ./node_modules/.bin/tsc 2>&1 | tail -10; echo 'EXIT='$?",
    timeout=120
)
out = stdout.read().decode()
print(out)

# Check if dist exists
stdin, stdout, stderr = c.exec_command(f"ls {APP}/dist/index.js 2>/dev/null && echo BUILD_OK || echo BUILD_FAILED")
check = stdout.read().decode().strip()
print(f"Build: {check}")

if 'FAILED' in check:
    stdin, stdout, stderr = c.exec_command(f"cat {APP}/package.json")
    print(stdout.read().decode()[:500])
    # Try with tsx instead of tsc
    print("Trying tsx...")
    stdin, stdout, stderr = c.exec_command(f"cd {APP} && npm install tsx typescript --save-dev 2>&1 | tail -3", timeout=60)
    print(stdout.read().decode())
    stdin, stdout, stderr = c.exec_command(f"cd {APP} && ./node_modules/.bin/tsc --noEmit 2>&1 | tail -5; ls {APP}/dist/index.js 2>/dev/null || echo NO_DIST", timeout=60)
    print(stdout.read().decode())

# Kill old + start
print(f"\n=== Start on {PORT} ===")
c.exec_command(f"fuser -k {PORT}/tcp 2>/dev/null; sleep 2", timeout=10)
c.exec_command(
    f"cd {APP} && nohup npx tsx src/index.ts > /tmp/gw.log 2>&1 & disown",
    timeout=5
)
time.sleep(4)

stdin, stdout, stderr = c.exec_command(f"ss -tlnp | grep {PORT} && echo '---' && curl -s http://localhost:{PORT}/api/v1/health 2>&1")
out = stdout.read().decode()
print(out)
if 'OK' in out or 'ok' in out.lower() or 'health' in out.lower():
    print("\n✅ Gateway running!")
else:
    # Check logs
    stdin, stdout, stderr = c.exec_command("tail -20 /tmp/gw.log")
    print("Log:", stdout.read().decode()[:500])

c.close()
