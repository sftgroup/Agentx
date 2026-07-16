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
    if err and 'ERR' not in cmd: print("ERR:", err[:300])
    return out, err

# Fix: ethers.randomBytes(16) -> crypto.randomBytes(16) in auth.ts
print("=== Fixing auth.ts ===")
run("cd ~/agentx-gateway && sed -i \"s/ethers.randomBytes(16)/crypto.randomBytes(16)/g\" src/middleware/auth.ts")
run("cd ~/agentx-gateway && sed -i \"1i import crypto from 'crypto'\" src/middleware/auth.ts")

# Also fix: .toString('hex') for Buffer
run("cd ~/agentx-gateway && sed -i \"s/crypto.randomBytes(16).toString('hex')/crypto.randomBytes(16).toString('hex')/g\" src/middleware/auth.ts")

# Rebuild
print("\n=== Rebuilding ===")
run("cd ~/agentx-gateway && ./node_modules/.bin/tsc 2>&1")

# Restart
print("\n=== Restarting PM2 ===")
run("pm2 restart agentx-gateway 2>&1")

# Verify again
import time
time.sleep(2)
print("\n=== Verify ===")
run("curl -s http://localhost:3090/api/v1/health")

# Test auth endpoint
print("\n=== Test Auth Challenge ===")
run("curl -s 'http://localhost:3090/api/v1/auth/challenge?address=0x1234567890123456789012345678901234567890'")

# Test tenant me (should return 401 without token)
print("\n=== Test Protected Route ===")
run("curl -s http://localhost:3090/api/v1/tenant/me")

# Also set up UFW to allow port 3090
print("\n=== Opening firewall port ===")
run("sudo ufw allow 3090/tcp 2>&1 || echo 'UFW not active'")

client.close()
print("\n=== Done ===")
