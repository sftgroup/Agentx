import paramiko

host = '43.156.78.59'
user = 'ubuntu'
password = 'Asdf1234!'

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(host, username=user, password=password, timeout=15)

def run(cmd):
    print(f"> {cmd}")
    stdin, stdout, stderr = client.exec_command(cmd)
    out = stdout.read().decode()
    err = stderr.read().decode()
    stdout.channel.recv_exit_status()
    if out: print(out[-500:] if len(out) > 500 else out)
    if err: print("ERR:", err[-300:] if len(err) > 300 else err)
    return out

# Kill everything on port 8080 and pending npm/next
print("=== Killing old processes ===")
run("pkill -f 'next-server' 2>/dev/null; pkill -f 'next build' 2>/dev/null; pkill -f 'next dev' 2>/dev/null; sleep 2; echo done")
run("fuser -k 8080/tcp 2>/dev/null; echo done")

# Ensure node_modules are there (full install without --production)
print("\n=== Checking node_modules ===")
run("ls ~/agentx-platform/node_modules/tailwindcss/package.json 2>/dev/null && echo 'tailwind OK' || echo 'MISSING tailwind'")

# Start with next dev on port 8080 (auto-compiles TSX and has hot reload)
# Use NODE_OPTIONS to limit memory
print("\n=== Starting Next.js dev server ===")
run("cd ~/agentx-platform && NODE_OPTIONS='--max-old-space-size=512' nohup npx next dev -p 8080 -H 0.0.0.0 > /tmp/next-dev.log 2>&1 &")

import time
time.sleep(8)

# Check if it started
print("\n=== Checking if dev server started ===")
run("ss -tlnp | grep 8080 2>/dev/null")
run("tail -20 /tmp/next-dev.log 2>/dev/null")

time.sleep(3)
run("curl -s -o /dev/null -w 'HTTP %{http_code}\n' http://localhost:8080/ 2>&1")

# Check for compile errors
print("\n=== Recent logs ===")
run("tail -30 /tmp/next-dev.log 2>/dev/null")

client.close()
print("\n=== Done ===")
