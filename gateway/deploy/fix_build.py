import paramiko

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
    stdout.channel.recv_exit_status()
    if out: print(out)
    if err: print("ERR:", err[:500])
    return out, err

# Fix: install devDependencies for TypeScript compilation
print("=== Installing all dependencies (including dev) ===")
run("cd ~/agentx-gateway && npm install 2>&1")

# Build
print("\n=== Building TypeScript ===")
run("cd ~/agentx-gateway && ./node_modules/.bin/tsc 2>&1")

# Verify build output
print("\n=== Checking build output ===")
run("ls -la ~/agentx-gateway/dist/ 2>&1")

# Kill existing PM2 and restart
print("\n=== Restarting PM2 ===")
run("pm2 delete all 2>&1")
run("cd ~/agentx-gateway && pm2 start ecosystem.config.js 2>&1")
run("pm2 save --force 2>&1")

# Verify
print("\n=== Verifying Gateway ===")
import time
time.sleep(2)
run("curl -s http://localhost:3090/api/v1/health 2>&1")
run("pm2 status 2>&1")

# Also set PM2 to auto-start on boot
print("\n=== PM2 startup ===")
run("pm2 startup 2>&1")

client.close()
print("\n=== Done ===")
