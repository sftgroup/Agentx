import paramiko
import time

host_fe = '43.156.78.59'

# Use ONE connection for all commands
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(host_fe, username='ubuntu', password='Asdf1234!', timeout=30)

def run(cmd, desc=""):
    print(f"[{desc}] > {cmd[:120]}")
    stdin, stdout, stderr = client.exec_command(cmd, timeout=300)
    out = stdout.read().decode()
    err = stderr.read().decode()
    ec = stdout.channel.recv_exit_status()
    if out: print(out[-500:])
    if err and 'deprecat' not in err.lower() and 'warn' not in err.lower(): print("ERR:", err[-300:])
    return ec, out

# Step 1: npm install SDK
print("=== Step 1 ===")
run("cd /home/ubuntu/agentx-platform && npm install @agentxv2/sdk@0.6.1 2>&1 | tail -5", "sdk")

# Step 2: Write the chat page using bash heredoc
print("\n=== Step 2: Chat page ===")
with open(r'c:\Users\apply\Downloads\code\agentx\extracted\Agentx\frontend\app\user\chat\[agentId]\page.tsx', 'r', encoding='utf-8') as f:
    chat_content = f.read()
# Write file by piping from echo using base64
import base64
b64 = base64.b64encode(chat_content.encode()).decode()
target = r"/home/ubuntu/agentx-platform/app/user/chat/\[agentId\]/page.tsx"
run(f"echo '{b64}' | base64 -d > {target} && wc -c {target}", "write")

# Step 3: Gateway hook
print("\n=== Step 3: Gateway hook ===")
with open(r'c:\Users\apply\Downloads\code\agentx\extracted\Agentx\frontend\hooks\useGatewayAuth.ts', 'r', encoding='utf-8') as f:
    hook_content = f.read()
b64 = base64.b64encode(hook_content.encode()).decode()
target = "/home/ubuntu/agentx-platform/hooks/useGatewayAuth.ts"
run(f"echo '{b64}' | base64 -d > {target} && wc -c {target}", "write")

# Step 4: ToolCallBubble
print("\n=== Step 4: ToolCallBubble ===")
with open(r'c:\Users\apply\Downloads\code\agentx\extracted\Agentx\frontend\components\chat\ToolCallBubble.tsx', 'r', encoding='utf-8') as f:
    bubble_content = f.read()
b64 = base64.b64encode(bubble_content.encode()).decode()
run("mkdir -p /home/ubuntu/agentx-platform/components/chat", "mkdir")
target = "/home/ubuntu/agentx-platform/components/chat/ToolCallBubble.tsx"
run(f"echo '{b64}' | base64 -d > {target} && wc -c {target}", "write")

# Step 5: env files
print("\n=== Step 5: env files ===")
b64 = base64.b64encode(b'NEXT_PUBLIC_AGENTX_GATEWAY_URL=http://101.33.109.117:3090').decode()
run(f"echo '{b64}' | base64 -d > /home/ubuntu/agentx-platform/.env.local && echo 'env-local ok'", "env-local")

with open(r'c:\Users\apply\Downloads\code\agentx\extracted\Agentx\frontend\.env.production', 'r', encoding='utf-8') as f:
    env_content = f.read()
b64 = base64.b64encode(env_content.encode()).decode()
run(f"echo '{b64}' | base64 -d > /home/ubuntu/agentx-platform/.env.production && echo 'env-prod ok'", "env-prod")

# Step 6: Clean + Build
print("\n=== Step 6: Clean ===")
run("fuser -k 8080/tcp 2>/dev/null; pkill -f 'next' 2>/dev/null; sleep 1")
run("rm -rf /home/ubuntu/agentx-platform/.next && echo cleaned")

print("\n=== Step 7: BUILD (2-3 min) ===")
ec, out = run("cd /home/ubuntu/agentx-platform && NODE_OPTIONS='--max-old-space-size=1536' npx next build 2>&1 | tail -25", "build")
print(f"\nBuild exit code: {ec}")

if ec != 0:
    print("BUILD FAILED!")
    client.close()
    exit(1)

# Step 8: Start
print("\n=== Step 8: Start ===")
run("cd /home/ubuntu/agentx-platform && nohup npx next start -p 8080 > /tmp/fe-start.log 2>&1 &", "start")
time.sleep(5)
run("ss -tlnp | grep 8080", "port")
run("tail -3 /tmp/fe-start.log", "log")

client.close()
print("\n=== DONE ===")
