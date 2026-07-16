import paramiko
import os, sys

host = '101.33.109.117'
user = 'ubuntu'
password = 'Asdf1234!'

gateway_src = r'c:\Users\apply\Downloads\code\agentx\extracted\Agentx\gateway'

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(host, username=user, password=password)

sftp = client.open_sftp()

def upload_dir(local_dir, remote_dir):
    for root, dirs, files in os.walk(local_dir):
        # Skip node_modules, dist, .git
        dirs[:] = [d for d in dirs if d not in ('node_modules', 'dist', '.git', '__pycache__', 'deploy')]
        
        rel_path = os.path.relpath(root, local_dir)
        remote_path = os.path.join(remote_dir, rel_path).replace('\\', '/')
        
        # Create remote directory
        try:
            sftp.stat(remote_path)
        except FileNotFoundError:
            try:
                sftp.mkdir(remote_path)
            except:
                pass
        
        for file in files:
            local_file = os.path.join(root, file)
            remote_file = os.path.join(remote_path, file).replace('\\', '/')
            print(f"  Uploading: {rel_path}/{file}")
            try:
                sftp.put(local_file, remote_file)
            except Exception as e:
                print(f"  ERROR: {e}")

print("Uploading gateway source code...")
remote_dir = '/home/ubuntu/agentx-gateway'
upload_dir(gateway_src, remote_dir)

sftp.close()

# Now run setup commands
def run(cmd):
    print(f"> {cmd}")
    stdin, stdout, stderr = client.exec_command(cmd)
    out = stdout.read().decode()
    err = stderr.read().decode()
    stdout.channel.recv_exit_status()
    if out: print(out)
    if err: print("ERR:", err[:300])
    return out

# Read secrets
print("\n=== Reading secrets ===")
stdin, stdout, stderr = client.exec_command("cat /tmp/jwt_secret.txt")
jwt_secret = stdout.read().decode().strip()
stdin, stdout, stderr = client.exec_command("cat /tmp/master_key.txt")
master_key = stdout.read().decode().strip()

# Create .env
env_content = f"""PORT=3090
NODE_ENV=production
DATABASE_URL=postgresql://agentx:AgentX2024!@localhost:5432/agentx_gateway
REDIS_URL=redis://localhost:6379
JWT_SECRET={jwt_secret}
MASTER_ENCRYPTION_KEY={master_key}
SESSION_TTL_SEC=86400
CORS_ORIGIN=*
"""
print("\n=== Writing .env ===")
stdin, stdout, stderr = client.exec_command(f"cat > ~/agentx-gateway/.env << 'ENVEOF'\n{env_content}\nENVEOF")
stdout.channel.recv_exit_status()
print("Done")

# Run migration
print("\n=== Running database migration ===")
run("sudo -u postgres psql -d agentx_gateway -f ~/agentx-gateway/db/migrations/001_init.sql")

# Install npm dependencies
print("\n=== Installing npm dependencies ===")
run("cd ~/agentx-gateway && npm install --production 2>&1")

# Build TypeScript
print("\n=== Building ===")
run("cd ~/agentx-gateway && npx tsc 2>&1")

# Create logs directory
run("mkdir -p ~/agentx-gateway/logs")

# Start with PM2
print("\n=== Starting with PM2 ===")
run("cd ~/agentx-gateway && pm2 start ecosystem.config.js 2>&1")
run("pm2 save 2>&1")

# Verify
print("\n=== Verifying ===")
run("sleep 2 && curl -s http://localhost:3090/api/v1/health 2>&1")
run("pm2 status 2>&1")

client.close()
print("\n=== Deployment Complete ===")
