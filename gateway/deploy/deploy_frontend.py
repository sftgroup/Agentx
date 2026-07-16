import paramiko
import os

host = '43.156.78.59'
user = 'ubuntu'
password = 'Asdf1234!'

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(host, username=user, password=password, timeout=15)

sftp = client.open_sftp()

def run(cmd):
    print(f"> {cmd}")
    stdin, stdout, stderr = client.exec_command(cmd)
    out = stdout.read().decode()
    err = stderr.read().decode()
    ec = stdout.channel.recv_exit_status()
    if out: print(out)
    if err: print("ERR:", err[:400])
    return ec, out, err

def upload(local, remote):
    print(f"  Upload: {local} -> {remote}")
    try:
        sftp.put(local, remote)
        print("    OK")
    except Exception as e:
        print(f"    ERROR: {e}")
        # Ensure remote directory exists
        remote_dir = os.path.dirname(remote).replace('\\', '/')
        try:
            stdin, stdout, stderr = client.exec_command(f"mkdir -p {remote_dir}")
            stdout.channel.recv_exit_status()
            sftp.put(local, remote)
            print("    OK (retry)")
        except Exception as e2:
            print(f"    FAILED: {e2}")

# First, find the actual agentx-platform structure
print("=== AgentX Platform structure ===")
run("ls ~/agentx-platform/ 2>/dev/null")
run("ls ~/agentx-platform/app/ 2>/dev/null | head -20")
run("ls ~/agentx-platform/app/user/chat/ 2>/dev/null")
run("ls ~/agentx-platform/components/ 2>/dev/null | head -10")
run("ls ~/agentx-platform/hooks/ 2>/dev/null")
run("cat ~/agentx-platform/.env.local 2>/dev/null | grep GATEWAY || echo 'No GATEWAY in .env.local'")
run("cat ~/agentx-platform/.env.production 2>/dev/null | grep GATEWAY || echo 'No GATEWAY in .env.production'")

# Upload new files
source_dir = r'c:\Users\apply\Downloads\code\agentx\extracted\Agentx\frontend'
target_dir = '/home/ubuntu/agentx-platform'

print("\n=== Uploading new/updated files ===")

# 1. Chat page
upload(
    os.path.join(source_dir, 'app', 'user', 'chat', '[agentId]', 'page.tsx'),
    os.path.join(target_dir, 'app', 'user', 'chat', '[agentId]', 'page.tsx')
)

# 2. Gateway auth hook
upload(
    os.path.join(source_dir, 'hooks', 'useGatewayAuth.ts'),
    os.path.join(target_dir, 'hooks', 'useGatewayAuth.ts')
)

# 3. ToolCallBubble component
upload(
    os.path.join(source_dir, 'components', 'chat', 'ToolCallBubble.tsx'),
    os.path.join(target_dir, 'components', 'chat', 'ToolCallBubble.tsx')
)

# 4. Updated .env.production
upload(
    os.path.join(source_dir, '.env.production'),
    os.path.join(target_dir, '.env.production')
)

sftp.close()

# Also update .env.local with gateway URL
print("\n=== Updating .env.local with gateway URL ===")
run("cd ~/agentx-platform && grep -q 'AGENTX_GATEWAY_URL' .env.local 2>/dev/null && echo 'Already set' || echo 'NEXT_PUBLIC_AGENTX_GATEWAY_URL=http://101.33.109.117:3090' >> .env.local")
run("cat ~/agentx-platform/.env.local 2>/dev/null | grep GATEWAY")

# Rebuild and restart
print("\n=== Rebuilding frontend ===")
run("cd ~/agentx-platform && npm install --production 2>&1 | tail -5")
run("cd ~/agentx-platform && npx next build 2>&1 | tail -20")

# Find and restart the next process
print("\n=== Restarting frontend ===")
run("ps aux | grep 'next-server' | grep -v grep")
run("kill $(pgrep -f 'next-server' | head -1) 2>/dev/null; sleep 1")
run("cd ~/agentx-platform && nohup npx next start -p 8080 > /tmp/next.log 2>&1 &")
run("sleep 3 && curl -s -o /dev/null -w '%{http_code}' http://localhost:8080/ 2>&1")

# Verify
print("\n=== Final verification ===")
run("ss -tlnp | grep 8080")
run("curl -s -o /dev/null -w 'HTTP %{http_code}\n' http://localhost:8080/")

client.close()
print("\n=== Frontend deploy complete ===")
print("Gateway: http://101.33.109.117:3090")
print("Frontend: http://43.156.78.59:8080")
