import paramiko, base64, time

HOST = '43.156.225.164'
PWD = 'Asdf1234!'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username='ubuntu', password=PWD, timeout=30)

# Upload fixed next.config.js
with open(r'c:\Users\apply\Downloads\code\agentx\extracted\Agentx\frontend\next.config.js', 'r') as f:
    content = f.read()
b64 = base64.b64encode(content.encode()).decode()
stdin, stdout, stderr = c.exec_command(
    f"echo '{b64}' | base64 -d > /home/ubuntu/agentx-platform/next.config.js && echo 'ok'"
)
print(stdout.read().decode().strip())

# Build
print("\n=== Build ===")
stdin, stdout, stderr = c.exec_command(
    "cd /home/ubuntu/agentx-platform && "
    "NODE_OPTIONS='--max-old-space-size=2560' ./node_modules/.bin/next build 2>&1 | tail -20",
    timeout=600
)
out = stdout.read().decode()
err = stderr.read().decode()
print(out)
if err: print("E:", err[-300:])

# Check
stdin2, stdout2, stderr2 = c.exec_command(
    "ls /home/ubuntu/agentx-platform/.next/BUILD_ID 2>/dev/null && echo BUILD_OK || echo FAILED"
)
check = stdout2.read().decode().strip()
print(f"Result: {check}")

if 'FAILED' in check:
    print("BUILD FAILED!")
    c.close()
    exit(1)

# Start
print("\n=== Start ===")
c.exec_command("fuser -k 3000/tcp 2>/dev/null; sleep 2", timeout=10)
channel = c.get_transport().open_session()
channel.exec_command(
    "cd /home/ubuntu/agentx-platform && "
    "nohup ./node_modules/.bin/next start -p 3000 > /tmp/agentx-run.log 2>&1 & disown"
)
time.sleep(6)

stdin3, stdout3, stderr3 = c.exec_command(
    "ss -tlnp | grep 3000 && echo '---' && curl -sI http://localhost:3000/ 2>&1 | head -5"
)
print(stdout3.read().decode())

c.close()
print("\n✅ http://43.156.225.164:3000")
