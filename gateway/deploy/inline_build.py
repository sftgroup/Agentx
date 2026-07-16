import paramiko
import time
import base64

host_fe = '43.156.78.59'
password = 'Asdf1234!'

def run(cmd, desc=""):
    c2 = paramiko.SSHClient()
    c2.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c2.connect(host_fe, username='ubuntu', password=password, timeout=20)
    print(f"[{desc}] > {cmd[:120]}")
    stdin, stdout, stderr = c2.exec_command(cmd)
    out = stdout.read().decode()
    err = stderr.read().decode()
    ec = stdout.channel.recv_exit_status()
    if out and len(out) > 0: print(out[-600:])
    if err: print("ERR:", err[-300:])
    c2.close()
    return ec, out

# Read local files as base64 and write them over SSH
def upload_content(remote_path, content):
    b64 = base64.b64encode(content.encode()).decode()
    # Write in chunks to avoid command length limits
    chunk_size = 4000
    # First truncate
    run(f"true > {remote_path}", "truncate")
    for i in range(0, len(b64), chunk_size):
        chunk = b64[i:i+chunk_size]
        run(f"printf '%s' '{chunk}' >> {remote_path}.b64", f"write chunk {i//chunk_size}")
    run(f"base64 -d {remote_path}.b64 > {remote_path} && rm {remote_path}.b64 && echo 'written'", "decode")

# Step 1: Update SDK
print("=== Step 1: Install SDK ===")
run("cd /home/ubuntu/agentx-platform && npm install @agentxv2/sdk@0.6.1 2>&1 | tail -5", "install SDK")

# Step 2: Upload changed files
print("\n=== Step 2: Upload source files ===")

# Read files
fe_base = r'c:\Users\apply\Downloads\code\agentx\extracted\Agentx\frontend'

with open(fe_base + r'\app\user\chat\[agentId]\page.tsx', 'r', encoding='utf-8') as f:
    chat_page = f.read()
with open(fe_base + r'\hooks\useGatewayAuth.ts', 'r', encoding='utf-8') as f:
    gateway_hook = f.read()
with open(fe_base + r'\components\chat\ToolCallBubble.tsx', 'r', encoding='utf-8') as f:
    tool_bubble = f.read()
with open(fe_base + r'\.env.local', 'r', encoding='utf-8') as f:
    env_local = f.read()
with open(fe_base + r'\.env.production', 'r', encoding='utf-8') as f:
    env_prod = f.read()
with open(fe_base + r'\package.json', 'r', encoding='utf-8') as f:
    pkg_json = f.read()

print(f"Chat page: {len(chat_page)} chars")
print(f"Gateway hook: {len(gateway_hook)} chars")
print(f"Tool bubble: {len(tool_bubble)} chars")

print("\n--- Uploading chat page ---")
upload_content('/home/ubuntu/agentx-platform/app/user/chat/[agentId]/page.tsx', chat_page)

print("\n--- Uploading gateway hook ---")
upload_content('/home/ubuntu/agentx-platform/hooks/useGatewayAuth.ts', gateway_hook)

print("\n--- Uploading tool bubble ---")
# Ensure dir exists
run("mkdir -p /home/ubuntu/agentx-platform/components/chat", "mkdir")
upload_content('/home/ubuntu/agentx-platform/components/chat/ToolCallBubble.tsx', tool_bubble)

print("\n--- Uploading env files ---")
upload_content('/home/ubuntu/agentx-platform/.env.local', env_local)
upload_content('/home/ubuntu/agentx-platform/.env.production', env_prod)
upload_content('/home/ubuntu/agentx-platform/package.json', pkg_json)

# Step 3: Clean + Build
print("\n=== Step 3: Build ===")
run("fuser -k 8080/tcp 2>/dev/null; pkill -f 'next' 2>/dev/null; sleep 1; echo cleaned")
run("rm -rf /home/ubuntu/agentx-platform/.next", "clean .next")

print("\n=== BUILDING (this takes 2-3 min) ===")
ec, out = run("cd /home/ubuntu/agentx-platform && NODE_OPTIONS='--max-old-space-size=1536' npx next build 2>&1", "build")
print(f"\nBUILD EXIT: {ec}")

# Check
ec, out = run("ls /home/ubuntu/agentx-platform/.next/BUILD_ID 2>/dev/null && echo 'BUILD OK!' || echo 'BUILD FAILED'")
if 'FAILED' in out:
    run("tail -20 /home/ubuntu/agentx-platform/.next/trace 2>/dev/null || echo 'no trace'")
    exit(1)

# Step 4: Start
print("\n=== Step 4: Start ===")
run("cd /home/ubuntu/agentx-platform && nohup npx next start -p 8080 > /tmp/fe-run.log 2>&1 &", "start")
time.sleep(5)
run("ss -tlnp | grep 8080", "check port")
run("tail -5 /tmp/fe-run.log", "check log")

print("\n=== ALL DONE ===")
