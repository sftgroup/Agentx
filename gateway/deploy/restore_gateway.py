import paramiko
import time

host_g = '101.33.109.117'
user = 'ubuntu'
password = 'Asdf1234!'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host_g, username=user, password=password, timeout=10)

def run(cmd):
    print(f"> {cmd}")
    stdin, stdout, stderr = c.exec_command(cmd)
    out = stdout.read().decode()
    err = stderr.read().decode()
    ec = stdout.channel.recv_exit_status()
    if out: print(out)
    if err: print("ERR:", err[:200])
    return ec

# Check and restart PM2 daemon if needed
print("=== Gateway Status ===")
print("1. Checking if PM2 daemon is alive...")
ec = run("pm2 ping 2>&1")
if ec != 0:
    print("PM2 daemon is dead, restarting...")
    run("pm2 resurrect 2>/dev/null || true")
    time.sleep(2)

run("pm2 list 2>&1")
run("curl -s http://localhost:3090/api/v1/health")

c.close()
