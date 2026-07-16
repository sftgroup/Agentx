import paramiko
import time

host_f = '43.156.78.59'
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host_f, username='ubuntu', password='Asdf1234!', timeout=10)

def run(cmd):
    print(f"> {cmd}")
    stdin, stdout, stderr = c.exec_command(cmd)
    out = stdout.read().decode()
    err = stderr.read().decode()
    stdout.channel.recv_exit_status()
    if out: print(out[-500:])
    if err and 'Warning' not in err: print("ERR:", err[-300:])

# Cleanup
run("fuser -k 8080/tcp 2>/dev/null; echo cleaned")

# Add 2GB swap
print("\n=== Adding 2GB swap ===")
run("sudo fallocate -l 2G /swapfile 2>/dev/null || sudo dd if=/dev/zero of=/swapfile bs=1M count=2048 2>&1 | tail -2")
run("sudo chmod 600 /swapfile && sudo mkswap /swapfile 2>&1 | tail -1")
run("sudo swapon /swapfile 2>&1 && free -h | head -2")
run("grep -q swapfile /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab")

# Production build
print("\n=== Production build ===")
run("cd ~/agentx-platform && NODE_OPTIONS='--max-old-space-size=1536' npx next build 2>&1 | tail -30")

# Verify build
print("\n=== Checking build ===")
run("ls ~/agentx-platform/.next/BUILD_ID 2>/dev/null && cat ~/agentx-platform/.next/BUILD_ID || echo 'BUILD FAILED'")

# Start production
if True:
    print("\n=== Starting production ===")
    run("fuser -k 8080/tcp 2>/dev/null")
    run("cd ~/agentx-platform && nohup npx next start -p 8080 > /tmp/prod-8080.log 2>&1 &")
    time.sleep(5)
    run("ss -tlnp | grep 8080")
    run("curl -sI http://localhost:8080/ 2>&1 | head -3")

c.close()
