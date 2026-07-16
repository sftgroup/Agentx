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
    if out: print(out)
    if err: print("ERR:", err[-300:] if len(err) > 300 else err)
    return out

# Kill ALL stuck processes
print("=== Force killing ===")
run("pkill -9 -f 'next' 2>/dev/null || true")
run("pkill -9 -f 'node' 2>/dev/null; sleep 2; echo done")

# Check if .next exists from old build
print("\n=== Checking old build ===")
run("ls -la ~/agentx-platform/.next/ 2>/dev/null | head -10")

# Restart with old build
print("\n=== Restarting production server ===")
run("cd ~/agentx-platform && nohup node node_modules/.bin/next start -p 8080 > /tmp/next-prod.log 2>&1 &")

import time
time.sleep(5)

run("ss -tlnp | grep 8080")
run("curl -s -o /dev/null -w 'HTTP %{http_code}\n' http://localhost:8080/")
run("tail -5 /tmp/next-prod.log 2>/dev/null")

client.close()
print("\nDone - old build restored")
