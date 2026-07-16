import paramiko
import os, sys

host = '101.33.109.117'
user = 'ubuntu'
password = 'Asdf1234!'

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(host, username=user, password=password)

def run(cmd):
    print(f"> {cmd}")
    stdin, stdout, stderr = client.exec_command(cmd)
    out = stdout.read().decode()
    err = stderr.read().decode()
    ec = stdout.channel.recv_exit_status()
    if out: print(out)
    if err: print("ERR:", err[:500])
    return ec, out, err

# 1. Install PM2
print("\n=== Installing PM2 ===")
run("sudo npm install -g pm2 2>&1")

# 2. Create PostgreSQL user + database
print("\n=== Setting up PostgreSQL ===")
run("sudo -u postgres psql -c \"CREATE USER agentx WITH PASSWORD 'AgentX2024!';\" 2>&1 || echo 'user may exist'")
run("sudo -u postgres psql -c \"CREATE DATABASE agentx_gateway OWNER agentx;\" 2>&1 || echo 'db may exist'")
run("sudo -u postgres psql -c \"GRANT ALL PRIVILEGES ON DATABASE agentx_gateway TO agentx;\" 2>&1")

# 3. Create app directory
print("\n=== Creating directories ===")
run("mkdir -p ~/agentx-gateway && echo ok")

# 4. Generate secrets
print("\n=== Generating secrets ===")
run("openssl rand -hex 32 > /tmp/jwt_secret.txt && openssl rand -hex 32 > /tmp/master_key.txt && echo 'Secrets generated'")

client.close()
print("\nDone. Server prepared.")
