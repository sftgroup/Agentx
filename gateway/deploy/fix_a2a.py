import paramiko
import base64
import time

host_fe = '43.156.78.59'
password = 'Asdf1234!'

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(host_fe, username='ubuntu', password=password, timeout=30)

def run(cmd, desc=""):
    print(f"[{desc}] > {cmd[:120]}")
    stdin, stdout, stderr = client.exec_command(cmd, timeout=300)
    out = stdout.read().decode()
    err = stderr.read().decode()
    ec = stdout.channel.recv_exit_status()
    if out: print(out[-400:])
    if err and 'deprecat' not in err.lower() and 'warn' not in err.lower(): print("ERR:", err[-200:])
    return ec, out

# Upload fixed A2A page
print("=== Upload A2A page fix ===")
with open(r'c:\Users\apply\Downloads\code\agentx\extracted\Agentx\frontend\app\a2a\page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()
b64 = base64.b64encode(content.encode()).decode()
run(f"echo '{b64}' | base64 -d > /home/ubuntu/agentx-platform/app/a2a/page.tsx && wc -c /home/ubuntu/agentx-platform/app/a2a/page.tsx", "upload")

# Incremental rebuild (should be fast since only a2a page changed and .next cache exists)
print("\n=== Incremental rebuild ===")
run("fuser -k 8080/tcp 2>/dev/null; pkill -f 'next' 2>/dev/null; sleep 1; echo done")
ec, out = run("cd /home/ubuntu/agentx-platform && NODE_OPTIONS='--max-old-space-size=1536' npx next build 2>&1 | tail -20", "build")
print(f"Build exit: {ec}")

# Start
print("\n=== Start ===")
run("cd /home/ubuntu/agentx-platform && nohup npx next start -p 8080 > /tmp/fe-a2afix.log 2>&1 &", "start")
time.sleep(5)
run("ss -tlnp | grep 8080", "port check")
run("tail -3 /tmp/fe-a2afix.log", "log")

client.close()
print("\n=== DONE ===")
