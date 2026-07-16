import paramiko
import time

host_f = '43.156.78.59'  
host_g = '101.33.109.117'
user = 'ubuntu'
password = 'Asdf1234!'

# First restart gateway PM2
print("=== Restarting Gateway ===")
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host_g, username=user, password=password, timeout=10)

def run(client, cmd, desc=""):
    print(f"[{desc}] > {cmd[:80]}")
    stdin, stdout, stderr = client.exec_command(cmd)
    out = stdout.read().decode()
    err = stderr.read().decode()
    ec = stdout.channel.recv_exit_status()
    if out: print(out[-400:])
    return ec, out, err

run(c, "pm2 resurrect 2>/dev/null; pm2 restart all 2>/dev/null || (cd ~/agentx-gateway && pm2 start ecosystem.config.js)", "Gateway")
time.sleep(2)
run(c, "curl -s http://localhost:3090/api/v1/health", "Health check")
c.close()

# Now fix frontend - use next dev instead of build+start
print("\n=== Fixing Frontend ===")
c2 = paramiko.SSHClient()
c2.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c2.connect(host_f, username=user, password=password, timeout=10)

# Kill anything on 8080
run(c2, "fuser -k 8080/tcp 2>/dev/null; sleep 1; echo done")

# Ensure packages are available (full install)
run(c2, "cd ~/agentx-platform && ls node_modules/.package-lock.json 2>/dev/null && echo 'modules OK' || npm install 2>&1 | tail -3", "Check deps")

# Start next dev with memory limits
run(c2, "cd ~/agentx-platform && NODE_OPTIONS='--max-old-space-size=512' nohup npx next dev -p 8080 -H 0.0.0.0 > /tmp/next-8080.log 2>&1 &", "Start dev")

time.sleep(10)
ec, out, err = run(c2, "ss -tlnp | grep 8080", "Check port")
if ec != 0:
    run(c2, "tail -20 /tmp/next-8080.log 2>/dev/null", "Log")
    
time.sleep(5)
run(c2, "ss -tlnp | grep 8080", "Re-check")
run(c2, "tail -10 /tmp/next-8080.log 2>/dev/null", "Log")

c2.close()
print("\n=== Done ===")
