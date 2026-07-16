import paramiko, base64, time

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('43.156.78.59', username='ubuntu', password='Asdf1234!', timeout=30)

def run(cmd, timeout=600):
    print(f"> {cmd[:120]}")
    stdin, stdout, stderr = c.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode()
    err = stderr.read().decode()
    ec = stdout.channel.recv_exit_status()
    if out: print(out[-400:])
    if err: print("E:", err[-300:])
    return ec, out, err

# 1. Update package.json version to 0.6.2
with open(r'c:\Users\apply\Downloads\code\agentx\extracted\Agentx\frontend\package.json', 'r') as f:
    pkg = f.read()
b64 = base64.b64encode(pkg.encode()).decode()
run(f"echo '{b64}' | base64 -d > /home/ubuntu/agentx-platform/package.json && echo 'pkg updated'")

# 2. Kill current server
run("fuser -k 8080/tcp 2>/dev/null; pkill -f 'next' 2>/dev/null; sleep 2; echo cleaned")

# 3. Install updated SDK
print("\n=== npm install @agentxv2/sdk@0.6.2 ===")
run("cd /home/ubuntu/agentx-platform && npm install @agentxv2/sdk@0.6.2 2>&1 | tail -5", timeout=120)

# 4. Build
print("\n=== next build ===")
ec, out, err = run(
    "cd /home/ubuntu/agentx-platform && NODE_OPTIONS='--max-old-space-size=1536' npx next build 2>&1 | tail -20",
    timeout=600
)
print(f"\nBuild exit: {ec}")
if ec != 0:
    print("BUILD FAILED")
    c.close()
    exit(1)

# 5. Start
print("\n=== Start ===")
run("cd /home/ubuntu/agentx-platform && nohup npx next start -p 8080 > /tmp/fe-062.log 2>&1 &", timeout=5)
time.sleep(5)
run("ss -tlnp | grep 8080", timeout=10)
run("curl -sI http://localhost:8080/ 2>&1 | head -3", timeout=10)

c.close()
print("\n✅ Done")
