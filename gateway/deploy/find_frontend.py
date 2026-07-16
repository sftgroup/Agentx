import paramiko
import os

host = '101.33.109.117'
user = 'ubuntu'
password = 'Asdf1234!'

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(host, username=user, password=password)

sftp = client.open_sftp()

def run(cmd):
    stdin, stdout, stderr = client.exec_command(cmd)
    out = stdout.read().decode()
    err = stderr.read().decode()
    stdout.channel.recv_exit_status()
    if out: print(out)
    if err: print("ERR:", err[:200])
    return out

# Find where the frontend is deployed
print("=== Finding frontend location ===")
run("ls -la ~/ 2>&1")
run("ls /home/ 2>&1")
run("find /home -name 'next.config.js' -maxdepth 4 2>/dev/null")
run("find /var -name 'next.config.js' -maxdepth 4 2>/dev/null")

# Check current processes
print("\n=== Checking existing processes ===")
run("ps aux | grep -E 'node|next|pm2' | grep -v grep | head -20")

# Check PM2 processes
print("\n=== PM2 list ===")
run("pm2 list 2>&1")

client.close()
