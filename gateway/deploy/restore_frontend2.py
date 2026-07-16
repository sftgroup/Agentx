import paramiko
import time

host_f = '43.156.78.59'
user = 'ubuntu'
password = 'Asdf1234!'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host_f, username=user, password=password, timeout=10)

def run(cmd):
    print(f"> {cmd}")
    stdin, stdout, stderr = c.exec_command(cmd)
    out = stdout.read().decode()
    err = stderr.read().decode()
    ec = stdout.channel.recv_exit_status()
    if out: print(out[-500:])
    if err: print("ERR:", err[-300:])
    return ec

# Kill anything still on 8080
run("fuser -k 8080/tcp 2>/dev/null; echo 'port freed'")
time.sleep(1)

# Start next dev (compiles on demand, uses existing node_modules)
print("\n=== Starting next dev ===")
run("cd ~/agentx-platform && NODE_OPTIONS='--max-old-space-size=512' nohup npx next dev -p 8080 -H 0.0.0.0 > /tmp/dev-8080.log 2>&1 &")
print("Waiting for Next.js to compile...")
time.sleep(15)

# Check status
run("ss -tlnp | grep 8080")
print("\n=== Startup log ===")
run("tail -15 /tmp/dev-8080.log 2>/dev/null")

# Try accessing
print("\n=== HTTP check ===")
run("curl -s -o /dev/null -w 'HTTP %{http_code}\n' http://localhost:8080/ 2>&1")

c.close()
