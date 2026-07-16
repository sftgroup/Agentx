import paramiko, time

HOST = '43.156.225.164'
PWD = 'Asdf1234!'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username='ubuntu', password=PWD, timeout=30)

# Run npm install directly (sync)
print("=== npm install ===")
stdin, stdout, stderr = c.exec_command(
    "cd /home/ubuntu/agentx-platform && npm install 2>&1 | tail -10",
    timeout=600
)
out = stdout.read().decode()
err = stderr.read().decode()
print(out)
if err: print("ERR:", err[-300:])

# Verify
stdin, stdout, stderr = c.exec_command(
    "ls /home/ubuntu/agentx-platform/node_modules/next/package.json 2>/dev/null && echo 'next installed' || echo 'MISSING'; "
    "ls /home/ubuntu/agentx-platform/app/page.tsx && echo 'app exists'"
)
print(stdout.read().decode())

# Build directly with the installed next (not npx)
print("\n=== next build ===")
stdin, stdout, stderr = c.exec_command(
    "cd /home/ubuntu/agentx-platform && "
    "NODE_OPTIONS='--max-old-space-size=2560' ./node_modules/.bin/next build 2>&1 | tail -25",
    timeout=600
)
out = stdout.read().decode()
err = stderr.read().decode()
print(out)
if err: print("ERR:", err[-300:])
ec = stdout.channel.recv_exit_status()
print(f"\nBuild exit: {ec}")

if ec != 0:
    print("BUILD FAILED")
    c.close()
    exit(1)

# Kill old + start
print("\n=== Start ===")
stdin, stdout, stderr = c.exec_command(
    "fuser -k 3000/tcp 2>/dev/null; sleep 2; "
    "cd /home/ubuntu/agentx-platform && "
    "nohup ./node_modules/.bin/next start -p 3000 > /tmp/agentx-run.log 2>&1 &",
    timeout=10
)
time.sleep(6)

stdin, stdout, stderr = c.exec_command("ss -tlnp | grep 3000 && echo '---' && curl -sI http://localhost:3000/ 2>&1 | head -5")
print(stdout.read().decode())

c.close()
print("\n✅ PROD deployed: http://43.156.225.164:3000")
