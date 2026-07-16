import paramiko, base64, time

HOST = '43.156.225.164'
PWD = 'Asdf1234!'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username='ubuntu', password=PWD, timeout=30)

# Upload fixed page.tsx
with open(r'c:\Users\apply\Downloads\code\agentx\extracted\Agentx\frontend\app\user\chat\[agentId]\page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()
b64 = base64.b64encode(content.encode()).decode()

stdin, stdout, stderr = c.exec_command(
    f"echo '{b64}' | base64 -d > '/home/ubuntu/agentx-platform/app/user/chat/[agentId]/page.tsx' && wc -c '/home/ubuntu/agentx-platform/app/user/chat/[agentId]/page.tsx'",
    timeout=15
)
print(stdout.read().decode().strip())

# Install missing dep
print("\n=== npm install missing ===")
stdin, stdout, stderr = c.exec_command(
    "cd /home/ubuntu/agentx-platform && npm install --save-dev @react-native-async-storage/async-storage 2>&1 | tail -5",
    timeout=120
)
print(stdout.read().decode().strip())

# Build
print("\n=== Build ===")
stdin, stdout, stderr = c.exec_command(
    "cd /home/ubuntu/agentx-platform && "
    "NODE_OPTIONS='--max-old-space-size=2560' ./node_modules/.bin/next build 2>&1 | tail -15",
    timeout=600
)
out = stdout.read().decode()
err = stderr.read().decode()
ec = stdout.channel.recv_exit_status()

# Check if build succeeded by looking for BUILD_ID
stdin2, stdout2, stderr2 = c.exec_command(
    "ls /home/ubuntu/agentx-platform/.next/BUILD_ID 2>/dev/null && echo 'BUILD_OK' || echo 'BUILD_FAILED'"
)
check = stdout2.read().decode().strip()
print(out[-500:])
if err and 'warn' not in err.lower(): print("ERR:", err[-300:])
print(f"Check: {check}")

if 'FAILED' in check:
    # Show full error
    stdin3, stdout3, stderr3 = c.exec_command(
        "cd /home/ubuntu/agentx-platform && "
        "./node_modules/.bin/next build 2>&1 | grep -E 'error|Error|Module not found|Failed' | tail -10",
        timeout=120
    )
    print(stdout3.read().decode())
    c.close()
    exit(1)

# Start
print("\n=== Start ===")
c.exec_command("fuser -k 3000/tcp 2>/dev/null; sleep 2", timeout=10)
c.exec_command(
    "cd /home/ubuntu/agentx-platform && "
    "nohup ./node_modules/.bin/next start -p 3000 > /tmp/agentx-run.log 2>&1 & disown",
    timeout=5
)
time.sleep(6)

stdin4, stdout4, stderr4 = c.exec_command(
    "ss -tlnp | grep 3000 && echo '---' && "
    "curl -sI http://localhost:3000/ 2>&1 | head -3"
)
print(stdout4.read().decode())

c.close()
print("\n✅ DONE — http://43.156.225.164:3000")
