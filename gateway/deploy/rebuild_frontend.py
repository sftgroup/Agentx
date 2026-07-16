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
    if out: print(out[-800:] if len(out) > 800 else out)
    if err: print("ERR:", err[-300:] if len(err) > 300 else err)
    return out

# Full install with devDependencies for TailwindCSS etc
print("=== Full npm install (with devDeps) ===")
run("cd ~/agentx-platform && npm install 2>&1 | tail -5")

# Build
print("\n=== Building ===")
run("cd ~/agentx-platform && npx next build 2>&1 | tail -30")

# Kill old server and restart
print("\n=== Restarting ===")
run("pkill -f 'next-server' 2>/dev/null || true")
run("sleep 2")
run("cd ~/agentx-platform && nohup npx next start -p 8080 > /tmp/next.log 2>&1 &")

import time
time.sleep(5)

run("curl -s -o /dev/null -w 'HTTP %{http_code}\n' http://localhost:8080/")

# Check next.log for any errors
print("\n=== Next startup log ===")
run("tail -20 /tmp/next.log 2>/dev/null")

client.close()
